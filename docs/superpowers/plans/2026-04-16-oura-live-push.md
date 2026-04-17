# Oura Ring Live-Push — Webhook-Driven Sync

**Status (2026-04-16):** Phases 1, 2, and 3 deployed. End-to-end live-push pipeline is fully wired: app-level webhook subscriptions registered with Oura, server-side OAuth state in `wearable_connections`, webhook handler ingests notifications → fetches records → upserts into `vitals`/`activities` tagged `source='oura'`. Phase 4 (client simplification: drop localStorage mirror, async `isOuraConnected` via `?action=status`, "Last push: 2h ago" UI indicator) is pending. Renewal cron for app subscriptions (Phase 5 in original draft) also pending — Oura subs expire and need periodic refresh.

**Lessons learned during implementation** (worth retaining):
- Oura strips query strings from callback URLs during the verification challenge → callback URL must be a clean path. Solved via `vercel.json` rewrite from `/api/oura-webhook` → `/api/wearable?provider=oura&action=webhook`.
- Oura's `event_type` is the CRUD op (`create | update | delete`), not the data category. The data category is `data_type`. v1 subscribes to `event_type='create'` only.
- Oura's verification handshake can use either GET or POST — and expects an HTTP 200 specifically (returning 204 fails the check). Webhook handler responds 200 to both methods regardless.
- Oura subscription IDs only need to be unique within a single subscription, not across collections. (Fitbit needs per-collection unique IDs — opposite constraint.)
- Verification challenge fires synchronously *during* create-subscription POST, so any "set status='active' after the row inserts" logic races the row insert. Solved by writing `status='active'` immediately on POST success since Oura only returns 2xx after the challenge passed.

## Context

Oura is already connected in Salve but data only reaches the app when the user presses "Sync All Data". Same ambient-freshness gap we're solving for Fitbit: if you wake up and your sleep score is sitting on your wrist, it should be in Salve before you open the app, not only when you remember to sync.

Research (against [Oura API v2 docs](https://cloud.ouraring.com/v2/docs) and the public webhook-subscription endpoints) confirms Oura v2 has full webhook support. Notifications fire within minutes of cloud-side processing. So Oura can use the same "push → server fetches by record id → upsert to Supabase → Realtime inserts into open browser tab" pipeline we're building for Fitbit.

**Two architectural differences from Fitbit** worth naming up-front:

1. **Subscriptions are app-scoped, not per-user.** For Fitbit, we POST a separate subscription per user per collection. For Oura, a subscription is app-level (authenticated with `client_id + client_secret`, no user token), and Oura routes notifications for *all* our users to the same webhook endpoint. The payload tells us which Oura user fired the event. Practically this means: one-time setup when we deploy, not at every user connect.
2. **Oura subscriptions expire and need to be renewed.** Fitbit subscriptions persist until deleted. Oura's return an `expiration_time`, and missing the renewal window means silent loss of notifications. A weekly Vercel cron handles this.

Shared infrastructure from the Fitbit work carries over:
- [migration 050](supabase/migrations/050_wearable_connections.sql) — the `wearable_connections` table has `provider IN ('fitbit','oura')` in its CHECK constraint; Oura rows slot in with no schema change.
- `supabaseConfig()` / `upsertWearableConnection()` / `getWearableConnection()` / `deleteWearableConnection()` in [api/wearable.js](api/wearable.js) — reusable for any provider.
- [useRealtimeSync](src/hooks/useRealtimeSync.js) already subscribes to `vitals`/`activities`/`cycles` inserts, so webhook → Supabase write → live UI update works out of the box.

## Approach

Four phases. Two of them (1 and 2) have no dependency on a tester — they're entirely the developer's own Oura ring — so work can start immediately even while Fitbit Phase 3 waits for its tester.

### Phase 1 — App-level subscription bootstrap

Oura subscriptions aren't tied to a user token, so we can't create them as a side effect of OAuth connect (like we do for Fitbit). Instead, an admin-gated bootstrap endpoint registers them once per event type we care about:

**Important correction from the original plan:** Oura's `event_type` is `create | update | delete` (CRUD operation), **not** the data category. The data category is a separate `data_type` field (`sleep`, `daily_readiness`, `workout`, etc.). Subscriptions index on `(event_type, data_type)` pairs. v1 subscribes to `event_type='create'` only across 7 data types; `update` subscriptions can be added later.

- **New action in [api/wearable.js](api/wearable.js) Oura handler: `bootstrap_subscriptions`** (POST, admin-only gate via new server-side `isAdminUser(userId)` helper that checks `profiles.tier = 'admin'` via service-role).
  - For each `(event_type, data_type)` pair in `OURA_SUBSCRIBE_MATRIX` (create × 7 data types in v1):
    - Check whether we already have a non-expired, non-errored row in `oura_app_subscriptions` for this pair → skip if so.
    - POST `https://api.ouraring.com/v2/webhook/subscription` with headers `x-client-id` + `x-client-secret` (NOT OAuth bearer — subscription management is app-scoped) and body `{callback_url, verification_token, event_type, data_type}`. Verification token is a random UUID we generate and store.
    - On success, upsert the returned `id` + `expiration_time` + `verification_token` on the registry row. Status `pending_verification` until Phase 3 wires the verification handler.
  - Oura sends a verification challenge to our webhook URL — we echo back the `verification_token`. That's covered in Phase 3 of this plan.

- **New migration: `051_oura_app_subscriptions.sql`**. Single app-level table with RLS enabled but no policies (defense-in-depth; only service-role can touch). Columns: `id text PRIMARY KEY` (Oura's subscription id), `event_type text CHECK IN ('create','update','delete')`, `data_type text`, `callback_url text`, `verification_token text`, `expiration_time timestamptz`, `status text`, `last_error text`, `created_at`, `updated_at`. UNIQUE index on `(event_type, data_type)` — one active subscription per pair. Trigger for `updated_at`.

- **Renewal cron: `api/cron-oura-renew-subscriptions.js`** (new, runs weekly per `vercel.json` schedule). Reads `oura_app_subscriptions`, for each row where `expiration_time < now() + 7 days` issues the renewal API call, updates `expiration_time` in place. CRON_SECRET-gated like other cron endpoints.

- **Env vars**: `OURA_WEBHOOK_VERIFICATION_TOKEN` NOT needed (we generate per-subscription and store on the row). `OURA_CLIENT_ID` + `OURA_CLIENT_SECRET` already exist.

This phase ends with: visit admin-only URL (`POST /api/wearable?provider=oura&action=bootstrap_subscriptions`) → check logs show 8 subscriptions created → check Oura's dev dashboard and see them listed → `SELECT * FROM oura_app_subscriptions` shows 8 rows.

### Phase 2 — Server-side OAuth state (mirrors Fitbit Phase 2)

Extend the Oura section of [api/wearable.js](api/wearable.js):

- **Modify `token` action**: after successful Oura token exchange, fetch the Oura user's `/v2/usercollection/personal_info` to get `id`, then `upsertWearableConnection({ user_id, provider: 'oura', provider_user_id, access_token, refresh_token, expires_at, scope, status: 'connected' })`. No per-user subscription registration (subscriptions are app-level). Keep returning tokens to the client for now (dual-write, same pattern as Fitbit).
- **New `status` action**: returns `{connected, last_webhook_at, last_sync_at, expires_at, last_error}`.
- **New `disconnect` action**: deletes the `wearable_connections` row. Skip per-user subscription teardown (there's nothing user-scoped to remove on Oura's side). Token revocation: POST `https://api.ouraring.com/oauth/revoke` — best-effort.
- **Update `refresh` action**: after refreshing, also PATCH the stored tokens in `wearable_connections` via service-role. Fitbit's Phase 2 intentionally skipped this; adding it here because Oura's `refresh_token` is also single-use and we need the server copy to stay fresh for webhook-driven fetches.

Client: add `disconnectOura()` to [src/services/oura.js](src/services/oura.js) mirroring `disconnectFitbit()` — server call first, then localStorage clear. Wire it to the existing Disconnect button in [Wearables.jsx](src/components/settings/Wearables.jsx).

### Phase 3 — Webhook → data ingestion

New action `webhook` (GET|POST, no user auth — Oura's servers):

- **GET verification challenge**: Oura sends `?verification_token=...&challenge=...&event_type=...` when a new subscription is registered. Look up the matching `oura_app_subscriptions` row by `verification_token`, mark `status='active'`, respond `200 { verification: <challenge> }`.
- **POST notification**:
  - Body shape: `{ event_type, event_time, user_id (Oura's), data_type, object_id }`.
  - Respond 204 **immediately** (keep the Fitbit pattern — avoid Oura's 5s webhook timeout). Heavy work continues in-function up to `maxDuration: 30`.
  - Look up `wearable_connections` by `provider='oura' AND provider_user_id=<payload user_id>`. Skip silently if not found.
  - `getValidAccessToken(conn)` — refresh if expired, persist new tokens.
  - Fetch the specific record: `GET https://api.ouraring.com/v2/usercollection/<endpoint>/<object_id>` where `<endpoint>` maps from `event_type`:
    - `sleep` | `daily_sleep` → sleep duration/score → `vitals` with `type='sleep'`
    - `daily_readiness` → readiness score → `vitals` with `type='readiness'` (may need new vital type; decide during implementation)
    - `daily_activity` → steps + active calories → `vitals` (`steps`, `active_energy`) or `activities`
    - `daily_spo2` → `vitals` with `type='spo2'`
    - `workout` → `activities` row
    - `daily_stress` → `vitals` with `type='stress'` (new type, decide during implementation)
    - `tag`, `enhanced_tag` → `journal_entries` or `vitals` (undecided — likely skip in v1, add once the data shape is clearer)
  - Upsert using service-role REST, tagged `source='oura'`.
  - Update `last_webhook_at` on the `wearable_connections` row.
- **Signature verification**: Oura webhook payload should include a header that the verification-token + secret enables us to verify. Specific header name isn't fully nailed down in the public docs summary — confirm against the live docs when implementing, then verify with constant-time compare like Terra does.

### Phase 4 — Client simplification

Mirror Fitbit Phase 4 work:

- Replace sync-oriented localStorage with status-check pattern: [src/services/oura.js](src/services/oura.js) `isOuraConnected()` goes async and hits `/api/wearable?provider=oura&action=status`, with a 30-second in-memory cache to avoid per-render refetch.
- Remove `syncAllOuraData` button once webhook push is proven stable — or keep as "backfill last 30 days" that calls a new `?action=sync` server endpoint.
- `isOuraConnected` signature change cascades to [Wearables.jsx](src/components/settings/Wearables.jsx) and [App.jsx](src/App.jsx). Do these in lockstep so the UI doesn't flicker through a disconnected state during the migration.
- Drop `salve:oura` localStorage key.

## Files to modify / create

### New
- [supabase/migrations/051_oura_app_subscriptions.sql](supabase/migrations/051_oura_app_subscriptions.sql) — app-level subscription registry
- [api/cron-oura-renew-subscriptions.js](api/cron-oura-renew-subscriptions.js) — weekly renewal cron, CRON_SECRET-gated

### Modified
- [api/wearable.js](api/wearable.js) — Oura handler gets `bootstrap_subscriptions`, `status`, `disconnect` actions; `token` writes to `wearable_connections`; `refresh` persists back; new `webhook` action (GET verification + POST ingestion)
- [src/services/oura.js](src/services/oura.js) — add `disconnectOura()` async helper, shift `isOuraConnected` to async status check (Phase 4)
- [src/components/settings/Wearables.jsx](src/components/settings/Wearables.jsx) — Disconnect button calls new `disconnectOura`, show "Last push: 2h ago" from status response
- [vercel.json](vercel.json) — register new cron schedule: `api/cron-oura-renew-subscriptions.js` weekly (Sunday 03:00 UTC works well with existing weekly patterns)
- [CLAUDE.md](CLAUDE.md) — document new migration, cron, Oura section expansions mirroring the Fitbit writeup

### Env vars
- None new. Uses existing `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

### Vercel function count
We're at the Hobby tier 12-function ceiling already. Options:
- **Fold `cron-oura-renew-subscriptions.js` into `api/wearable.js`** as another query-string route (`?route=cron-renew`), CRON_SECRET-gated. Saves a function. Matches the Fitbit webhook-in-wearable.js precedent.
- OR: upgrade to Pro. Worth it anyway once we ship a paid plan; revisit at that boundary.

**Default: fold into api/wearable.js.** Note it explicitly in the implementation so nobody accidentally splits it back out.

## Verification

### Phase 1 — bootstrap
- Migration 051 applies cleanly.
- Admin posts `/api/wearable?provider=oura&action=bootstrap_subscriptions`. Runtime logs show 8 subscription POST calls, each either new (201) or already-existing (200). `SELECT status, event_type FROM oura_app_subscriptions` shows all 8 with `status='active'` after the verification handshake completes in Phase 3 (until then they'll be `pending_verification`).
- Oura developer dashboard shows 8 subscriptions pointing at `https://salve.today/api/wearable?provider=oura&action=webhook`.

### Phase 2 — server-side OAuth
- Disconnect current Oura in Connections; reconnect via OAuth.
- `SELECT user_id, provider_user_id, expires_at FROM wearable_connections WHERE provider='oura'` shows the row.
- Hit `GET /api/wearable?provider=oura&action=status` from the browser — returns `{connected: true}`.
- Click Disconnect — row is gone; Oura localStorage cleared.

### Phase 3 — end-to-end push
- Wake up with your Oura ring on. Sleep score processes to the cloud. Within a few minutes of processing, Vercel runtime logs show a POST `[oura:webhook] Received sleep event for user=<oura_id>`, `last_webhook_at` on the connection row updates, and a new `vitals` row with `source='oura'` appears in Supabase.
- With Salve open in another tab, the new sleep row appears without a page reload (Realtime firing). This is the ambient-freshness moment.
- Go for a walk → logs show a workout event → `activities` row appears.

### Edge cases
- **Subscription about to expire** (manually set `expiration_time` to tomorrow): hit the renewal endpoint (cron or manual trigger), confirm `expiration_time` moves forward and Oura dashboard reflects the renewal.
- **Unknown Oura user webhook** (simulate by sending a payload with a made-up `user_id`): handler returns 204, logs a skip, no crash.
- **Expired access token at notification time** (set `expires_at` to past): webhook handler's `getValidAccessToken` refreshes before the data fetch succeeds.

## Out of scope

- Backfill job on first connect — webhook only covers new data after connect. If desired, add a "pull last 30 days" button that hits a new `?action=sync` server endpoint. Mirrors what we'll do for Fitbit.
- Oura tags / enhanced_tag routing — unclear shape; add after the rest is stable.
- Session/rest_mode_period/ring_configuration event types — subscribe later if we find use cases.
