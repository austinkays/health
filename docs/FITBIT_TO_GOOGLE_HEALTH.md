# Fitbit → Google Health API Migration

**Status:** Planning — awaiting cutover-vs-dual-mode decision (see § Decision).
**Owner:** Austin.
**Deadlines:**
- **End of May 2026** — Google recommends waiting until this date to *launch* any Google Health API integration. Breaking changes are possible in the API before then.
- **September 2026** — Legacy Fitbit Web API sunsets. Current `api/wearable.js` Fitbit section stops working.

**Last API doc check:** 2026-04-16.

---

## 1. What's changing, concretely

| Thing | Legacy Fitbit (today) | Google Health API (target) |
|---|---|---|
| Base URL | `https://api.fitbit.com` | `https://health.googleapis.com` |
| Endpoint pattern | `/1/user/-/activities/heart/date/...` (100+ unique endpoints) | `/v4/users/me/dataTypes/{dataType}/dataPoints` (unified) |
| OAuth authorize | `https://www.fitbit.com/oauth2/authorize` | `https://accounts.google.com/o/oauth2/v2/auth` |
| OAuth token | `https://api.fitbit.com/oauth2/token` | `https://oauth2.googleapis.com/token` |
| Client credentials from | dev.fitbit.com app | Google Cloud Console project |
| Scope format | `activity heartrate sleep` | `https://www.googleapis.com/auth/googlehealth.activity_and_fitness` |
| Tokens | Fitbit access/refresh | Google access/refresh — **cannot be migrated; users must re-auth** |
| Webhooks | Fitbit Subscription API (per-resource verify) | Auto-subscribing webhooks (built in) |
| Protocol | HTTP/JSON | HTTP/JSON + gRPC |
| Status | Sunsets Sept 2026 | Active development, potential breaking changes through May 2026 |

**Data-type name mapping** (confirmed in Google docs):

| Fitbit | Google Health API |
|---|---|
| `/1/user/-/activities/steps/…` | `dataTypes/steps/dataPoints` |
| `/1.2/user/-/sleep/…` | `dataTypes/sleep/dataPoints` |
| `/1/user/-/activities/heart/…` | `dataTypes/heart-rate/dataPoints` |
| `/1/user/-/hrv/…` | `dataTypes/heart-rate-variability/dataPoints` |
| `/1/user/-/body/weight/…` | `dataTypes/weight/dataPoints` |
| SpO2 / breathing rate / temp / AZM / VO2 max / workouts | Need to verify each against Google's data-type bundle reference |

**⚠️ Unknowns to verify before coding** (data types we currently sync that aren't in the confirmed mapping):
- `spo2`, `br` (breathing rate), `temp/core/skin`, `active-zone-minutes`, `cardioscore` (VO2 max)
- Workout/exercise session shape
- Intraday vs. daily rollup semantics — Google has `.list`, `.rollup`, `.dailyRollup`, `.patch`, `.batchDelete` methods per data type

---

## 2. Decision: dual-mode vs. hard cutover

**Google's official recommendation** is **dual-mode** — run legacy Fitbit + Google Health side-by-side, track per-user with an `oauth_type` flag in the DB, show a dismissible re-auth banner to existing users, then make it mandatory close to the sunset date, then revoke legacy tokens. This is designed for apps with thousands of Fitbit users where even 5% churn on re-auth matters.

**Salve is in closed beta** with low-double-digit users. The dual-mode cost is meaningful:

### Option A — Dual-mode (Google's way)

**What it adds:**
- `profiles.fitbit_oauth_type` column (`legacy` | `google_health`) — new migration.
- Per-user routing in `src/services/fitbit.js` → calls either legacy or google_health endpoints.
- Both `FITBIT_*` and new `GOOGLE_HEALTH_*` env vars maintained for 4+ months.
- Both OAuth apps maintained (dev.fitbit.com AND Google Cloud Console).
- Banner UX: "Reconnect Fitbit — we're moving to Google's new API" (dismissible), then mandatory close to deadline.
- Legacy token revocation script for after migration.

**Upside:** faithful to Google's guidance, zero breakage for existing users on day one.

**Downside:** 2–3× the code, two code paths to maintain through the transition, complexity in UX.

### Option B — Hard cutover (recommended for Salve)

**What it is:**
- End of May 2026: ship the Google Health integration as a **replacement**, not a parallel track.
- Delete the Fitbit section of `api/wearable.js` and `FITBIT_*` env vars at the same time.
- Existing Fitbit users see a one-time in-app prompt on next launch: *"We've upgraded to Google's new Health API. Please reconnect Fitbit to keep syncing your data."*
- Scope expansion: if the Google Health scope list includes anything we don't need yet, opt *out* — request only what we use.

**Upside:** ~60% less code, one clean integration, one env var set, easier to reason about.

**Downside:** every existing Fitbit user sees a one-time re-auth screen. Given user count and that Settings → Connections re-auth is 2 taps, this is a non-issue.

### Recommendation

**Option B — hard cutover.** Ship early June 2026 (post Google's end-of-May recommendation). Approximately:
- ~3 days to write the new `api/wearable.js` `google_health` section + `src/services/googleHealth.js` client (replacing fitbit.js).
- ~1 day to update `FitbitPage.jsx` → `GoogleHealthPage.jsx` (or rename the file, since naming it Fitbit is semantically wrong once we're using Google).
- ~0.5 days for the re-auth prompt UX + migration guidance copy in Settings.
- ~0.5 days for user-side Google Cloud setup (see § User action items).

**Total: ~5 days of work + Google Cloud setup time.**

---

## 3. User action items (Austin)

These must happen before any code is testable. None of them can be automated from my side.

### 3a. Google Cloud project

1. Go to https://console.cloud.google.com/ and create a new project named `salve-health` (or reuse an existing Salve project if one exists).
2. Enable the Google Health API on the project: APIs & Services → Library → search "Google Health API" → Enable.
3. Note the **project ID** (e.g., `salve-health-abc123`).

### 3b. OAuth consent screen

1. APIs & Services → OAuth consent screen.
2. User type: **External**. (Required for a public app.)
3. App name: `Salve`.
4. User support email: `salveapp@proton.me`.
5. App logo: upload `public/icon-512.png`.
6. Authorized domains: `salveapp.com` (or whatever production domain is).
7. Developer contact: `austinkays@gmail.com`.
8. **Scopes to add** (confirm final list against Google Health data-type reference before submitting):
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness`
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements`
   - (Plus any additional data-type-specific scopes confirmed by the Google Health docs)
9. **Verification:** the Google Health API is in the "sensitive scopes" category and likely requires Google OAuth verification before public use. Budget **2–4 weeks** for Google to review. Start this process by mid-May at the latest.

### 3c. OAuth client credentials

1. APIs & Services → Credentials → Create credentials → OAuth client ID.
2. Application type: **Web application**.
3. Authorized JavaScript origins:
   - `https://salveapp.com` (prod)
   - `https://*.vercel.app` (Vercel preview deploys — see note below)
   - `http://localhost:5173` (Vite dev)
4. Authorized redirect URIs:
   - `https://salveapp.com/` (Salve uses the same page as the redirect target, with `?code=` URL param)
   - `http://localhost:5173/` (dev)
5. Copy the **client ID** and **client secret**.

**Note on wildcards:** Google doesn't allow wildcard authorized origins. For preview deploys you'll either (a) add each preview URL manually each time, (b) restrict this OAuth client to prod only and not test it in previews, or (c) create a second "dev" OAuth client for `*.vercel.app`. Option (c) is probably right.

### 3d. Vercel env vars

Add to Vercel project env vars (Production + Preview):

| Name | Value | Scope |
|---|---|---|
| `GOOGLE_HEALTH_CLIENT_ID` | client ID from 3c | Production + Preview |
| `GOOGLE_HEALTH_CLIENT_SECRET` | client secret from 3c | Production + Preview (encrypted) |
| `VITE_GOOGLE_HEALTH_ENABLED` | `'false'` initially; flip to `'true'` at launch | Production + Preview |

**Do not delete `FITBIT_*` env vars yet** — even in Option B, we'll keep the legacy section running until cutover day so the prod app doesn't break between now and June.

---

## 4. Code changes (Option B plan)

### Files to create

| File | Purpose |
|---|---|
| `src/services/googleHealth.js` | Replaces `fitbit.js`. OAuth helpers (`getGoogleHealthAuthUrl`, `exchangeGoogleHealthCode`), token storage in localStorage (`salve:google-health`), `syncGoogleHealthData(existingVitals, addItem, days)`. Maps Google Health dataType responses → Salve `vitals` / `activities` row shape. Tag `source: 'google_health'`. |
| `src/components/sections/GoogleHealthPage.jsx` | Replaces `FitbitPage.jsx`. Same chart layout + stat cards, different branding. |
| `src/components/ui/GoogleHealthIcon.jsx` | New brand mark. |
| `supabase/migrations/050_fitbit_to_google_health.sql` | No schema change — source tag is a string column. This migration just documents the cutover for history. Optional. |

### Files to modify

| File | Change |
|---|---|
| `api/wearable.js` | Replace the `fitbit` section (lines 405–end of Fitbit block) with a new `google_health` section. New endpoints: `token`, `refresh`, `data` proxy to `health.googleapis.com/v4`, `config`. Remove Fitbit subscription webhook handler (Google Health has auto-subscribing webhooks — separate endpoint, see below). |
| `api/wearable.js` | Add `google_health` webhook handler for auto-subscribed events. Google pushes events to whatever URL we register in the OAuth app — likely `/api/wearable?provider=google_health&action=webhook`. |
| `src/services/fitbit.js` | **Delete** at cutover. |
| `src/components/sections/FitbitPage.jsx` | **Delete** at cutover. Rename all `'fitbit'` section references to `'google_health'` in `App.jsx`, `router.js`, `Header.jsx`, `Hub.jsx`, `Dashboard.jsx`, `Settings.jsx`. |
| `src/components/settings/Wearables.jsx` | Replace Fitbit card with Google Health card. `VITE_FITBIT_ENABLED` → `VITE_GOOGLE_HEALTH_ENABLED`. |
| `src/constants/defaults.js` | Keep `steps`, `hrv`, `vo2max`, `azm` vital types (already added for Fitbit). Source label: add `'google_health'`. |
| `src/components/sections/Activities.jsx` | Add `google_health` source filter pill + icon. |
| `src/components/sections/Vitals.jsx` | Same source-pill update. |
| `CLAUDE.md` | Rewrite the Fitbit wearable paragraph to describe Google Health. Drop the September 2026 sunset warning. Document new env vars. Update `VITE_FITBIT_ENABLED` → `VITE_GOOGLE_HEALTH_ENABLED`. |
| `vercel.json` CSP | Add `https://health.googleapis.com` to `connect-src`, `https://accounts.google.com` for OAuth. |

### Re-auth prompt (one-time, for existing Fitbit users)

On App mount, if `localStorage.getItem('salve:fitbit')` exists AND `localStorage.getItem('salve:google-health')` does not:
1. Show a one-time toast/banner: *"Fitbit moved to Google's Health API. Tap to reconnect — takes 10 seconds."*
2. Dismiss button stores `salve:fitbit-migration-dismissed` with a re-show in 7 days.
3. Tapping it calls `getGoogleHealthAuthUrl()` and redirects to Google.
4. After successful callback + first sync, delete `salve:fitbit` from localStorage.

**Total added UI:** one banner + one callback handler. Not complicated.

---

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Google Health API has breaking changes before our launch | Wait until end of May 2026 per Google's guidance. Don't flip `VITE_GOOGLE_HEALTH_ENABLED=true` in prod until we've tested against the final API. |
| OAuth verification takes > 4 weeks and we miss the window | Start verification by early May 2026. Fallback: if verification isn't done by Sept 1, 2026 (Fitbit sunset ~= 1 month later), accept the "unverified app" warning screen for existing beta users — it's a click-through, not a block. Push for verification after launch. |
| Google changes scope names between now and May | The scopes listed in § 3b are from the April 2026 migration docs. Re-verify the week before launch. |
| Existing Fitbit users don't see the re-auth banner | Cover with a mass email when we cut over. Re-auth banner is the in-app prompt; email is the push. |
| Preview deploys can't OAuth | Use a separate "dev" Google OAuth client per § 3c note. |
| Data type X (e.g., VO2 max) isn't available in Google Health | Document as a dropped feature on cutover. Most of what we sync (sleep, HR, HRV, steps, weight, SpO2) is confirmed supported. |

---

## 6. Timeline

| Week of | Action | Owner |
|---|---|---|
| **2026-04-20** | Create Google Cloud project + OAuth consent screen + OAuth client credentials (sections 3a–3c). | Austin |
| 2026-04-20 | Add `GOOGLE_HEALTH_*` env vars to Vercel (section 3d). | Austin |
| 2026-04-27 | Submit Google OAuth verification application. | Austin |
| 2026-04-27 | Scaffold `src/services/googleHealth.js` + `api/wearable.js` google_health section in a feature branch. Disabled behind `VITE_GOOGLE_HEALTH_ENABLED=false`. Re-verify Google Health scope list against latest docs. | Claude/Austin |
| 2026-05-11 | Smoke-test OAuth flow + first successful sync against Austin's real Fitbit data using the new integration (Google Health API is available now for testing even though GA is end of May). | Austin |
| 2026-05-25 | Re-auth banner UI + routing updates + CLAUDE.md rewrite. | Claude/Austin |
| **2026-06-01** | Flip `VITE_GOOGLE_HEALTH_ENABLED=true` in prod. Delete `fitbit.js`, `FitbitPage.jsx`, legacy `api/wearable.js` Fitbit section. Mass email to all Fitbit-connected beta users. | Austin |
| 2026-07-01 | Remove `FITBIT_*` env vars from Vercel after confirming all users have re-authed. | Austin |
| ~2026-09-01 | Fitbit legacy API sunsets — anyone who hasn't re-authed and dismissed the banner sees sync errors. Final email reminder two weeks out. | — |

---

## 7. Open questions

1. **Is Salve's production domain set up?** (`salveapp.com` vs. a Vercel-managed domain?) Needed for OAuth consent screen.
2. **Do we keep the name "Fitbit" in the UI** (since users recognize it) or rebrand to "Google Health" (more accurate, matches consent screen)? Recommend rebrand.
3. **Apple Health, Oura, Whoop users aren't affected** — this migration is Fitbit-specific. Confirm this is how we want to communicate it in the banner.
4. **VO2 max, AZM, cardioscore** — verify these specific data types are available in the new API before promising them in the UI.

## Appendix: key doc links

- Google Health API overview: https://developers.google.com/health
- Migration guide: https://developers.google.com/health/migration
- Data type reference (verify scopes + field names here before coding): https://developers.google.com/health — see "Data Types Reference" link on that page
- OAuth consent screen guide: https://support.google.com/cloud/answer/10311615
