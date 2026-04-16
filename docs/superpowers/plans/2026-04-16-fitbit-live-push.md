# Fitbit Live-Push — Webhook-Driven Sync

## Context

Fitbit is "connected" in the current build but data only reaches Salve when the user clicks "Sync last 30 days". The manual-sync UX works but misses the real point of connecting a wearable: ambient, hands-off freshness. Sleep you logged overnight should be in Salve by breakfast — not only when you remember to tap a button.

Fitbit exposes a Subscriber API that push-notifies our backend whenever a user's data changes. We already have the webhook endpoint mounted at `api/wearable.js?provider=fitbit&action=webhook` and Fitbit's verification challenge works — but the POST handler currently just logs the notification and returns 204 without ingesting anything. To make it actually live-push into Supabase (which the client then picks up via the existing Realtime subscription in `useRealtimeSync`), we have to solve three coupled problems:

1. **Tokens are in localStorage.** The webhook handler runs on Vercel and has no way to read the user's Fitbit access token. Tokens need to live in Supabase so the server can act on the user's behalf when a notification arrives.
2. **No subscription registered with Fitbit.** Even if we had server-side tokens, Fitbit doesn't send notifications until we call its subscription endpoint for each collection the user cares about.
3. **Webhook-to-data path doesn't exist.** The POST handler needs to resolve `ownerId` → Salve user, refresh the token if expired, pull fresh data from Fitbit for the `(collectionType, date)` pair, and upsert into `vitals`/`activities`.

Oura will follow the same pattern next. Oura v2 webhook support is unclear — [the preliminary research](https://cloud.ouraring.com/v2/docs) suggests it's pull-only, which would make Oura a polling job rather than a true push. Resolve at the start of Oura phase; we design the table shape provider-generically so adding a second provider doesn't require schema churn.

The closest existing precedent in the codebase is Terra ([api/terra.js:145-258](api/terra.js:145)) — server-side token row in `terra_connections`, HMAC-verified webhook, service-role Supabase REST calls, provider-specific event parsers that write `vitals`/`activities` rows tagged with `source`. This plan mirrors that architecture for Fitbit rather than inventing a new one.

## Approach

**Five-phase rollout, each independently testable.** Stop at any phase if something's wrong; each one leaves the app in a coherent state.

### Phase 1 — Supabase schema for server-side OAuth state

New migration: `050_wearable_connections.sql`. Single table (not per-provider) so Oura can reuse it:

```sql
create table wearable_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('fitbit','oura')),  -- extend as needed
  provider_user_id text not null,                                -- Fitbit encoded user id, Oura user uuid
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  subscription_ids jsonb default '[]'::jsonb,                    -- Fitbit subscriptions we've created, for clean teardown
  status text default 'connected',                               -- connected | disconnected | error
  last_webhook_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  connected_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index on wearable_connections (user_id, provider);
create index on wearable_connections (provider, provider_user_id);

-- RLS: users can read/delete their own row; webhook uses service-role.
alter table wearable_connections enable row level security;
create policy "own wearable connections: select"
  on wearable_connections for select using (auth.uid() = user_id);
create policy "own wearable connections: delete"
  on wearable_connections for delete using (auth.uid() = user_id);
-- No insert/update policies: tokens only written via service-role (api routes).

-- updated_at trigger — inline function, matches the terra_connections pattern
create or replace function public.handle_wearable_connection_updated()
returns trigger as $$ begin new.updated_at := now(); return new; end; $$ language plpgsql;
create trigger wearable_connections_updated_at
  before update on wearable_connections
  for each row execute function public.handle_wearable_connection_updated();
```

**Token encryption:** plaintext. Terra's precedent at [supabase/migrations/036_terra_connections.sql] stores `terra_user_id` unencrypted. Fitbit access tokens aren't credentials to our app — they're user-scoped API keys to Fitbit. RLS + service-role isolation is the right threat model; adding pgcrypto column encryption introduces complexity without meaningfully raising the bar (SUPABASE_SERVICE_ROLE_KEY leakage compromises both encrypted and plain paths). Document the decision in the migration comment.

### Phase 2 — Server-side OAuth exchange + subscription registration

Extend [api/wearable.js](api/wearable.js) Fitbit handler:

- **New action `status`** (GET): `SELECT provider_user_id, status, last_webhook_at, last_sync_at FROM wearable_connections WHERE user_id = ? AND provider = 'fitbit'`. Replaces the client-side `isFitbitConnected()` localStorage check.
- **Change `token` action** (POST): Today it exchanges the code and returns tokens to the client. New behavior:
  1. Exchange code with Fitbit → `{access_token, refresh_token, expires_in, user_id, scope}`.
  2. Upsert `wearable_connections` with `provider='fitbit'`, `user_id = req auth user`, `provider_user_id = fitbit user_id`, tokens, `expires_at = now() + expires_in * 1000`, `status='connected'`.
  3. Call Fitbit subscription API for each collection in `['activities', 'sleep', 'body']`: `POST https://api.fitbit.com/1/user/-/<collection>/apiSubscriptions/<subscriptionId>.json` with `Authorization: Bearer <access_token>` and header `X-Fitbit-Subscriber-Id: <FITBIT_SUBSCRIBER_ID>`. Use the Salve connection row `id` as `subscriptionId` so Fitbit → Salve lookup is trivial.
  4. Record the subscription IDs in `subscription_ids` jsonb.
  5. Return `{connected: true}` to the client. **Do not return tokens.** The client never touches them again.
- **New action `disconnect`** (POST): iterate `subscription_ids`, `DELETE /1/user/-/<collection>/apiSubscriptions/<subscriptionId>.json`, revoke the token via `POST https://api.fitbit.com/oauth2/revoke`, then `DELETE FROM wearable_connections WHERE id = ?`.
- **`refresh` action stays server-only** — never called from the client. Used internally by webhook + sync handlers (helper: `getValidAccessToken(userId, provider)` that checks `expires_at`, refreshes if needed, persists new refresh_token back).

### Phase 3 — Webhook → data write

Rewrite `fitbitWebhookHandle()` POST branch in [api/wearable.js:553](api/wearable.js:553):

1. **Respond 204 immediately** (before any async work) so Fitbit's 5s timeout is never in play. Fitbit's webhook body is small; we can kick off the data-fetch promise without awaiting it. Vercel Functions hold the process open for up to `maxDuration: 30` for `api/wearable.js`, so in-flight fetches complete after the 204.
2. For each notification `{collectionType, date, ownerId, ownerType, subscriptionId}`:
   - Lookup: `SELECT * FROM wearable_connections WHERE provider='fitbit' AND provider_user_id=ownerId`. Skip silently if no row (deleted account + stale subscription).
   - `token = await getValidAccessToken(conn)`.
   - Fetch the relevant endpoint for `(collectionType, date)`:
     - `activities` → `/1/user/-/activities/date/<date>.json` + `/1/user/-/activities/heart/date/<date>/1d.json`
     - `sleep` → `/1.2/user/-/sleep/date/<date>.json`
     - `body` → `/1/user/-/body/log/weight/date/<date>.json`
   - Transform to `vitals` / `activities` rows tagged `source='fitbit'`, using the same field map already in [src/services/fitbit.js](src/services/fitbit.js) (move the transform logic server-side to a new `api/_wearableFitbitTransforms.js`; the client stops using it after Phase 4).
   - Upsert via service-role REST. Terra precedent: [api/terra.js] `bulkInsertVitals`/`bulkInsertActivities` — copy that pattern. Include existing-row dedup (DEDUP_KEYS per table: vitals on `date|type|time|value`).
   - Update `last_webhook_at` on the connection row.
3. No HMAC — Fitbit webhooks don't sign. The authenticity check is "do we have an active subscription for this ownerId + subscriptionId". Fitbit's docs allow IP whitelisting as an extra layer; skip for v1, note as hardening in the follow-up section.

### Phase 4 — Client simplification

Update [src/services/fitbit.js](src/services/fitbit.js):

- Delete: `getFitbitTokens`, `setFitbitTokens`, `clearFitbitTokens`, the refresh mutex, localStorage key, direct API-call helpers. All replaced by server endpoints.
- Keep: `getFitbitAuthUrl` (unchanged — still builds the Fitbit authorize URL with our client_id and redirect_uri).
- Change: `exchangeFitbitCode(code)` posts to `/api/wearable?provider=fitbit&action=token`, reads `{connected: true}`, dispatches an `'salve:fitbit-connected'` event.
- Change: `isFitbitConnected()` becomes async — calls `/api/wearable?provider=fitbit&action=status` with the user's Supabase JWT and returns `{connected, lastWebhookAt, lastSyncAt}`. Cache result in a module-level state with a 30-second TTL so Wearables.jsx rendering doesn't fetch every re-render.
- `syncFitbitData()` stays for now as a "backfill last 30 days" button — but have it call a new `?action=sync` server endpoint instead of running in the browser. Webhook handles day-to-day; this button covers "I just connected" + "I was offline for a week."
- Delete `salve:fitbit` localStorage cleanup in [src/App.jsx:467](src/App.jsx:467) `SIGNED_OUT` handler — no longer has anything to clean.

Update [src/components/settings/Wearables.jsx](src/components/settings/Wearables.jsx) Fitbit card:

- `fitbitConnected` state now derives from the async `isFitbitConnected()` result on mount + on the `salve:fitbit-connected` event.
- Show "Last push: 2 hours ago" pulled from `last_webhook_at` to make live-push visible.
- Disconnect button calls the new server `disconnect` action.

### Phase 5 — Oura (scoped for later, blocked on verification)

Before starting: confirm whether Oura v2 supports webhooks. Search [Oura API docs](https://cloud.ouraring.com/v2/docs) and the Oura developer portal — the preliminary signal is pull-only, but agent research isn't authoritative.

- **If webhooks exist:** mirror Phase 2-3 exactly. Same `wearable_connections` table, `provider='oura'`, different subscription API calls.
- **If poll-only:** add a Vercel cron job (`api/cron-wearable-poll.js`) that runs every 15 minutes, iterates `wearable_connections WHERE provider='oura'`, refreshes tokens, pulls last-24h of data, upserts. Still delivers "live-ish" UX (15-min lag) without a manual button, and the client-side realtime subscription picks it up the same way.

Oura is out of scope for this plan — flagged here so the table design accommodates it without migration churn.

## Files to modify / create

### New
- [supabase/migrations/050_wearable_connections.sql](supabase/migrations/050_wearable_connections.sql) — table + RLS + trigger
- `api/_wearableFitbitTransforms.js` — server-side copies of the `syncFitbitData` field mappings, shared between webhook + `?action=sync`

### Modified
- [api/wearable.js](api/wearable.js) — Fitbit handler: `token` writes to Supabase + registers subscriptions; new `status`, `disconnect`, `sync` actions; webhook POST branch ingests data; service-role REST helper at top of file (copy Terra's pattern)
- [src/services/fitbit.js](src/services/fitbit.js) — thin shim; drop localStorage, drop refresh mutex
- [src/components/settings/Wearables.jsx](src/components/settings/Wearables.jsx) — Fitbit card uses async status, shows last-push timestamp
- [src/App.jsx](src/App.jsx) — remove Fitbit localStorage cleanup from SIGNED_OUT branch (no longer needed)
- [CLAUDE.md](CLAUDE.md) — update the Fitbit section of the architecture table, env-var table (`FITBIT_SUBSCRIBER_ID` added — the header value Fitbit sends back with notifications), and migration list

### Env vars (new)
- **None required for Phase 2.** The earlier plan mentioned `FITBIT_SUBSCRIBER_ID` but it turned out not to be needed — Fitbit's subscription POST uses the default subscriber endpoint when no `X-Fitbit-Subscriber-Id` header is sent, which is correct since we have exactly one subscriber endpoint configured. Add this header + env var later if we ever configure multiple subscriber endpoints.

### Fitbit dev dashboard (manual, one-time)
1. Add subscriber at `dev.fitbit.com → your app → Subscriber Endpoints`.
2. Endpoint URL: `https://salve.today/api/wearable?provider=fitbit&action=webhook`.
3. Subscriber ID: same value as `FITBIT_SUBSCRIBER_ID` env var.
4. Verification code: already set as `FITBIT_SUBSCRIBER_VERIFY`. Fitbit will hit the endpoint with `?verify=<code>` — our handler at [api/wearable.js:557-562](api/wearable.js:557) already answers that correctly.

## Verification

### Phase 1 — schema only
- `supabase db push` applies migration. `SELECT * FROM wearable_connections LIMIT 0;` from SQL editor.
- As an authed user: `INSERT` fails (no insert policy); `SELECT` returns only own rows.
- As service-role: full CRUD works.

### Phase 2 — server-side connect
- Click "Connect Fitbit" in Connections. Complete OAuth on fitbit.com → land back on `/connections`.
- Check Supabase: `SELECT provider_user_id, status, subscription_ids FROM wearable_connections WHERE user_id = '<me>'` — row exists with 3 subscription IDs in the array.
- Check Fitbit dev dashboard → your app → Subscriber Endpoints → view active subscriptions — you should see the Salve user's 3 subscriptions listed.
- Click disconnect → row is gone from Supabase, subscriptions are gone from Fitbit.
- Tokens never appear in localStorage (`Application → Local Storage → no salve:fitbit key`).

### Phase 3 — live push end-to-end
- With Fitbit connected, go for a walk (or log a manual activity via the Fitbit app).
- Within ~60 seconds: Vercel runtime logs for `api/wearable.js` show a POST with the notification. `last_webhook_at` on the connection row updates. A new row appears in `vitals` or `activities` tagged `source='fitbit'`.
- Refresh Vitals / Activities in Salve without clicking sync — the new record is there.
- Because `useRealtimeSync` is subscribed, leaving Salve open should show the new row appearing **without a refresh**. (This is the "excitement" moment — worth explicitly testing.)

### Phase 4 — client simplification
- Fresh browser, no localStorage. Sign in. `isFitbitConnected()` resolves via `/api/wearable?provider=fitbit&action=status` and returns true. Fitbit card reflects connected state with last-push timestamp.
- Sign out — `salve:fitbit` localStorage key is NOT created (doesn't exist) and server-side connection remains. Sign back in — still connected, webhook deliveries still arrive.
- Across two browsers (phone + desktop) signed into the same account: both see the same connected state and both receive realtime row inserts when a webhook fires.

### Edge cases to confirm
- **Expired token during webhook** — `getValidAccessToken` refreshes before the Fitbit API call succeeds. Simulate by manually setting `expires_at` to the past in SQL; trigger a notification (walk + log); observe Vercel logs showing the refresh call.
- **User revokes from Fitbit side** — Fitbit sends a `userRevokedAccess` collection notification; webhook handler marks connection `status='disconnected'`; UI shows "Reconnect Fitbit" on next page load.
- **Single-use refresh token race** — if two webhook deliveries hit simultaneously and both try to refresh, one will win and the other's refresh call will 401. Handle by re-reading the row after a refresh failure and retrying with the new token. Precedent: Dexcom's single-in-flight mutex in [src/services/dexcom.js] — port to the server-side helper.

## Out of scope (follow-ups)

- IP whitelisting on the webhook endpoint.
- Oura pull-polling cron (Phase 5 above, pending webhook-support verification).
- Moving Dexcom/Withings/Whoop to the same pattern. They're manual-sync-only today and have no push API (Dexcom's retail CGM API doesn't push; Withings does have a webhook API but that's a separate migration).
- Background backfill job that runs on first connect to pull the last 30 days, so webhook-based ongoing sync isn't the only way data lands.
