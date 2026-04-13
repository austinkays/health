# Salve Beta Readiness Audit

> **Started:** 2026-04-12
> **Completed:** 2026-04-12
> **Auditor:** Claude (Opus 4.6)
> **Scope:** Pre-beta audit across 9 chunks: repo/deps/deploy, Supabase/auth/RLS, client security/PHI, AI surface, Stripe billing, wearables/imports, UX/voice, beta-specific, summary.

---

## Executive Summary (Chunk 9)

### Findings by severity

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 2 |
| Medium | 14 |
| Low | 6 |
| Nit | 4 |
| **Total findings** | **27** |
| Passing checks | 32 |

### Do not ship to beta without fixing these (Critical + High)

1. **[5.1] CRITICAL: Account deletion does not cancel Stripe subscriptions.** A deleted user's payment method continues to be charged. Fix: add Stripe subscription cancellation to `api/delete-account.js` before deleting the auth user.

2. **[2.6] HIGH: Sign-out does not clear wearable OAuth tokens.** If User A signs out and User B signs in on the same device, B could sync A's wearable health data into their own account. Fix: call `clearOuraTokens()`, `clearDexcomTokens()`, `clearWithingsTokens()`, `clearFitbitTokens()` in the `SIGNED_OUT` handler in `App.jsx`.

3. **[8.1] HIGH: PHI breach response plan is blank.** The launch checklist has a template but no filled-in plan. Before inviting real users with real health data, document who responds, how sessions are revoked, and how users are notified.

### Fix during beta (Medium)

| # | Finding | Effort |
|---|---------|--------|
| 1.2 | No `.env.example` file (45 env vars undocumented) | 30 min |
| 1.3 | CLAUDE.md env var table stale (6 missing vars) | 15 min |
| 1.4 | Migration file numbering collisions (6 pairs) | 30 min |
| 1.8 | Missing HSTS header | 2 min |
| 2.1 | `notification_log` table has no RLS | 5 min |
| 2.5 | OTP brute-force cooldown resets on refresh | 20 min |
| 3.1 | Wearable OAuth tokens in plaintext localStorage | 2 hr |
| 5.2 | `invoice.payment_failed` webhook not handled | 30 min |
| 5.10 | CLAUDE.md still documents Lemon Squeezy | 30 min |
| 6.1 | No server-side mutex on wearable token refresh | 1 hr |
| 7.1 | Em dashes in user-facing copy (8 instances) | 15 min |
| 7.2 | Medication name overflow | 2 min |
| 7.3 | NPI specialty overflow | 2 min |
| 7.5 | CrisisModal missing SAMHSA and Trevor Project | 15 min |
| 8.2 | No Sentry client-side rate limiting / dedup | 10 min |
| 8.4 | No feedback notification path | 30 min |
| 8.5 | Uptime monitor still unchecked | 15 min |

### Polish backlog (Low + Nit)

| # | Finding |
|---|---------|
| 1.1 | No Node version declared |
| 1.6 | Main bundle regression (366KB vs 344KB baseline) |
| 1.7 | `pdfjs-dist` adds 1.6MB to bundle |
| 1.11 | `Permissions-Policy` allows `geolocation=(self)` unnecessarily |
| 2.2 | `feedback` table missing UPDATE policy |
| 3.6 | 24 console statements in production build |
| 6.4 | HealthKit import has no file size cap |
| 6.5 | Flo import has no file size cap |
| 7.4 | Pharmacy medication name overflow |
| 7.9 | Skeleton loading incomplete (finding #13 confirmed) |
| 7.12 | Non-verb button labels ("Unfavorite", "Preferred") |
| 1.5 | `serialize-javascript` vulnerability (build toolchain) |
| 1.9 | CSP Sentry ingest regional assumption |
| 1.12 | `.gitignore` minor style |
| 2.4 | Beta invite timing side-channel (impractical) |
| 2.7 | `_rateLimit.js` stale doc comment |
| 3.3 | AIMarkdown `javascript:` href (browser-mitigated) |
| 8.7 | LAUNCH_CHECKLIST.md still recommends Lemon Squeezy |

### CLAUDE.md drift list

The following claims in CLAUDE.md no longer match the codebase:

1. **Billing is Stripe, not Lemon Squeezy.** CLAUDE.md documents `api/lemon-checkout.js`, `api/lemon-webhook.js`, `LEMON_*` env vars, and `services/billing.js` as LS helpers. Actual code: `api/stripe-checkout.js`, `api/stripe-webhook.js`, `STRIPE_*` env vars.
2. **Env var table missing 7 variables:** `CRON_SECRET`, `VAPID_EMAIL`, `VAPID_PRIVATE_KEY`, `VITE_VAPID_PUBLIC_KEY`, `STRIPE_ANNUAL_PRICE_ID`, `SENTRY_AUTH_TOKEN`, `VERCEL_URL`.
3. **`vercel.json` section in CLAUDE.md is stale.** Shows old function list (includes `lemon-checkout`, `lemon-webhook`; missing `stripe-checkout`, `stripe-webhook`). CSP header shown is outdated (missing SHA256 hash, Sentry ingest domains, Nominatim).
4. **Main bundle size baseline.** CLAUDE.md says "344KB main + vendor chunks". Actual: 366KB main. `pdfjs-dist` (451KB + 1.19MB worker) not documented.
5. **LAUNCH_CHECKLIST.md Section 3** recommends Lemon Squeezy; Stripe is already implemented.
6. **Migration numbering.** CLAUDE.md lists clean sequential migrations but actual `supabase/migrations/` has 6 numbering collisions.

### Suggested beta tester onboarding checklist

Based on audit findings, tell beta testers:

- **Rock-solid sections (use freely):** Medications (with RxNorm + FDA enrichment), Conditions, Allergies, Providers (with NPI lookup), Vitals, Appointments, Journal, Labs, Todos, Dashboard, Search, News, Cycle Tracker
- **Rough edges (expect polish gaps):** Skeleton loading flickers on slow connections, some long medication names may overflow on small screens, em dashes in a few places
- **Watch for bug reports on:** Wearable connections (Oura, Dexcom, Withings, Fitbit, Whoop) after signing out and back in (finding 2.6), Stripe checkout/cancellation flow, AI daily limit behavior near midnight PT, offline mode after extended use
- **Do not test yet:** Account deletion with active Stripe subscription (until 5.1 is fixed)

### Suggested beta feedback questions

1. Did the magic link / OTP sign-in work on your first try? Which email provider?
2. After using Sage (AI chat), did the medical disclaimer feel clear, or did you miss it?
3. Did you connect any wearable devices? If so, which one and was the OAuth flow smooth?
4. Did you try the Scribe (form filler)? Were the sensitive-question flags (amber borders) helpful or confusing?
5. On mobile (375px), did any text overflow or get cut off in medication/provider cards?
6. Did the Getting Started tips help you discover features, or did you dismiss them immediately?
7. What's the first thing you'd want to add or change?
8. Did you encounter any error messages? If so, were they understandable?

---

## Progress

| Chunk | Name | Status |
|-------|------|--------|
| 1 | Repo, dependencies, deploy config | Done |
| 2 | Supabase, auth, and RLS | Done |
| 3 | Client-side security and PHI hygiene | Done |
| 4 | AI surface: consent, prompt safety, cost control | Done |
| 5 | Stripe billing and account lifecycle | Done |
| 6 | Wearables and imports (trust boundary surface) | Done |
| 7 | UX polish and voice pass | Done |
| 8 | Beta-specific concerns | Done |
| 9 | Final summary | Done |

---

## Chunk 1: Repo, dependencies, deploy config

### 1.1 No Node version declared

- **Severity:** Medium
- **File:** (missing `.nvmrc`, `.node-version`, or `engines` field in `package.json`)
- **What:** The project runs on Node 24.13.1 locally but declares no version constraint anywhere. Vercel defaults to Node 20.x for new deployments.
- **Why it matters:** A contributor (or Vercel) using a different Node version could hit subtle runtime differences. Node 24 is very new; Vercel Hobby may not support it.
- **Fix:** Add `"engines": { "node": ">=20" }` to `package.json` and a `.nvmrc` with `20` (or whatever matches Vercel's runtime).

### 1.2 No `.env.example` file

- **Severity:** Medium
- **File:** (missing)
- **What:** The project has 45 environment variables (13 client-side `VITE_*`, 32 server-side `process.env.*`) but no `.env.example` documenting them. A new contributor or deployment must reverse-engineer the list from `CLAUDE.md` or source code.
- **Why it matters:** Missing a single env var (e.g., `CRON_SECRET`, `VAPID_EMAIL`) causes silent runtime failures. Beta ops depend on correct env setup.
- **Fix:** Create `.env.example` with every variable, grouped by purpose, with placeholder values and comments. Include `CRON_SECRET`, `VAPID_EMAIL`, `VAPID_PRIVATE_KEY`, `VERCEL_URL`, `SENTRY_AUTH_TOKEN`, `STRIPE_ANNUAL_PRICE_ID` which are not in the `CLAUDE.md` env var table.

### 1.3 CLAUDE.md env var table is stale (6 variables undocumented)

- **Severity:** Medium
- **File:** `CLAUDE.md` (Environment Variables section)
- **What:** The following env vars are referenced in code but missing from the CLAUDE.md table:
  - `CRON_SECRET` (api/cron-reminders.js)
  - `VAPID_EMAIL` (api/push-send.js)
  - `VAPID_PRIVATE_KEY` (api/push-send.js)
  - `VITE_VAPID_PUBLIC_KEY` (src/services/push.js, api/push-send.js)
  - `STRIPE_ANNUAL_PRICE_ID` (api/stripe-checkout.js)
  - `SENTRY_AUTH_TOKEN` (vite.config.js, build-time only)
  - `VERCEL_URL` (multiple api/ files)
- **Why it matters:** Incomplete docs mean missed config during deployment.
- **Fix:** Add all 7 to the CLAUDE.md env var table. Also update the Stripe vars (the table still shows `LEMON_*` vars).

### 1.4 Supabase migration file numbering collisions

- **Severity:** Medium
- **File:** `supabase/migrations/`
- **What:** Multiple migration files share the same number prefix:
  - `018_vitals_source.sql` and `018_api_usage.sql`
  - `021_feedback.sql` and `021_admin_tier.sql`
  - `022_vitals_time.sql` and `022_load_all_rpc.sql`
  - `023_about_me_and_med_category.sql`, `023_feedback_response.sql`, and `023_push_notifications.sql`
  - `026_insight_ratings.sql` and `026_usage_events.sql`
  - `031_cycles_add_bbt_mucus_types.sql` and `031_stripe_ids.sql`
- **Why it matters:** If migrations are applied by sorted filename order, the execution sequence is ambiguous. Two migrations touching the same table could collide depending on OS sort. This also makes the migration history hard to audit.
- **Fix:** Renumber colliding migrations to sequential unique prefixes before beta. This is a docs/ops concern (Supabase local dev CLI uses the filename as the version).

### 1.5 `serialize-javascript` high-severity vulnerability (4 findings)

- **Severity:** High
- **File:** `package-lock.json` (transitive via `vite-plugin-pwa` -> `workbox-build` -> `@rollup/plugin-terser` -> `serialize-javascript`)
- **What:** `serialize-javascript <=7.0.4` has two high-severity CVEs: RCE via `RegExp.flags`/`Date.prototype.toISOString()` (GHSA-5c6j-r48x-rmvq) and CPU exhaustion DoS (GHSA-qj8w-gfj5-8c6v).
- **Why it matters:** This is in the build toolchain, not the runtime bundle, so exploitation requires a malicious build input. Risk is lower than a runtime dep vulnerability, but `npm audit` will alarm beta contributors.
- **Fix:** Run `npm audit fix --force` to upgrade `vite-plugin-pwa` to 0.19.8+ (breaking change, test the SW after). Alternatively, document the finding as build-only and accept the risk for beta.

### 1.6 Main bundle size regression: 366KB (was 344KB)

- **Severity:** Low
- **File:** `dist/assets/index-DdKOIyPq.js` (366KB, gzip 115KB)
- **What:** The main JS bundle grew from the documented 344KB baseline to 366KB (+22KB / +6.4%). Not critical, but crosses the documented number.
- **Why it matters:** Progressive growth. The gzip size (115KB) is still reasonable for a health app. More concerning are the new large chunks: `pdf.min` (451KB) and `pdf.worker.min` (1.19MB) which were not in the original baseline.
- **Fix:** Update the CLAUDE.md baseline. Investigate whether `pdfjs-dist` is code-split (only loaded when needed) or in the initial bundle. If it's always loaded, it should be dynamic-imported. The `vendor-recharts` chunk (652KB) is known and acceptable since it's code-split per section.

### 1.7 `pdfjs-dist` adds 1.6MB to the bundle

- **Severity:** Medium
- **File:** `package.json` (`pdfjs-dist: ^5.6.205`), build output (`pdf.min` 451KB + `pdf.worker.min` 1.19MB)
- **What:** `pdfjs-dist` is a runtime dependency that adds 1.64MB (raw) / 509KB (gzip) across two chunks. It was not in the `CLAUDE.md` documented architecture.
- **Why it matters:** If these chunks are eagerly loaded, they double the initial download. Even if lazy-loaded, the worker file (1.19MB) is large for a PWA on mobile networks.
- **Fix:** Verify `pdfjs-dist` is only imported via dynamic `import()` in the code path that actually needs it (PDF viewing in Apple Health import?). If it's in the main import tree, move it behind a lazy boundary. Consider whether this dependency is actually needed for beta.

### 1.8 Missing HSTS header

- **Severity:** Medium
- **File:** `vercel.json` (headers section)
- **What:** No `Strict-Transport-Security` header configured. While Vercel serves HTTPS by default, HSTS tells browsers to never attempt HTTP, preventing downgrade attacks.
- **Why it matters:** A health app handling PHI should enforce HSTS. Without it, a network-level attacker could theoretically intercept the first HTTP request before the HTTPS redirect.
- **Fix:** Add to the headers array: `{ "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }`.

### 1.9 CSP `connect-src` missing Sentry ingest for some regions

- **Severity:** Low
- **File:** `vercel.json` (CSP header)
- **What:** CSP allows `https://*.ingest.sentry.io` and `https://*.ingest.us.sentry.io` but not `https://*.ingest.de.sentry.io` (EU) or other regional variants. If the Sentry project is in the US region, this is fine. But if the org is ever moved to EU, error reporting will silently break.
- **Why it matters:** Sentry errors would be silently blocked by CSP with no user-visible symptom.
- **Fix:** No action needed if the Sentry project is confirmed US-region. Document the assumption.

### 1.10 CSP `connect-src` missing `newsinhealth.nih.gov` and `fda.gov` for RSS

- **Severity:** Low
- **File:** `vercel.json` (CSP header), `api/discover.js`
- **What:** The RSS feeds (`newsinhealth.nih.gov`, `fda.gov`) are fetched server-side in `api/discover.js`, NOT from the client. So CSP `connect-src` does not need to list them. Confirmed: no client-side direct fetches to these domains.
- **Why it matters:** N/A; this is a non-finding. Documenting to confirm the check was done.
- **Fix:** None needed.

### 1.11 `Permissions-Policy` allows `geolocation=(self)` but no geolocation feature exists

- **Severity:** Nit
- **File:** `vercel.json` line 80
- **What:** The header says `geolocation=(self)` which allows the app itself to request geolocation. But the app has no geolocation feature (it uses address strings for maps, not GPS).
- **Why it matters:** Minor attack surface. If an XSS somehow bypasses CSP, it could request geolocation.
- **Fix:** Tighten to `geolocation=()` (deny all) unless geolocation is planned.

### 1.12 `.gitignore` covers essentials but missing `.vercel/` wildcard

- **Severity:** Nit
- **File:** `.gitignore`
- **What:** `.vercel` is listed (without trailing `/`). Git treats this as matching both a file named `.vercel` and a directory. This works, but `.vercel/` is the conventional form. Also missing: `*.tgz` (npm pack artifacts).
- **Why it matters:** Minor hygiene.
- **Fix:** No action needed for beta.

### 1.13 No secrets found in git history

- **Severity:** N/A (pass)
- **What:** Checked `git log --all --diff-filter=A -- '.env*'` for committed env files. No results. No `.env` or `.env.local` was ever committed.

### 1.14 Clean build: PASS

- **Severity:** N/A (pass)
- **What:** `npm run build` succeeds in 16.6s with no errors. Two Vite chunk-size warnings (recharts 652KB, pdf.worker 1.19MB) are expected for code-split chunks.

### 1.15 Package manager consistency: PASS

- **Severity:** N/A (pass)
- **What:** Only `package-lock.json` exists (npm). No `pnpm-lock.yaml` or `yarn.lock` present.

### 1.16 12-function ceiling: PASS

- **Severity:** N/A (pass)
- **What:** `vercel.json` declares exactly 12 functions: `chat`, `gemini`, `drug`, `provider`, `wearable`, `terra`, `discover`, `cron-reminders`, `push-send`, `delete-account`, `stripe-checkout`, `stripe-webhook`. Matches the Hobby tier limit.

### 1.17 Security headers present: MOSTLY PASS

- **Severity:** N/A (see 1.8 for HSTS gap)
- **What:** CSP (with `sha256` nonce for inline script, no `unsafe-eval`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` all present. `script-src` no longer has `unsafe-inline` or `unsafe-eval` (Production Audit finding 1.1 was fixed). Cache-Control immutable on `/assets/`.

### Cross-reference with existing docs

- **PRODUCTION_AUDIT.md (2026-03-29):** CSP `unsafe-inline`/`unsafe-eval` (1.1) is fixed. Direct Anthropic `connect-src` (1.2) is fixed (no longer in CSP). Rate limiting (1.3) is fixed. `Permissions-Policy` (1.4) is present. `form-action`/`worker-src` (1.5) present in CSP. All 5 critical security findings from the prior audit are resolved.
- **LAUNCH_CHECKLIST.md:** Sentry (1a) marked done. AI cost ceilings (1b) marked done. Vercel plan (1c) still needs decision if charging money. Uptime monitor (1d) still unchecked. RLS verification (2) marked done.

---

## Chunk 2: Supabase, auth, and RLS

### RLS Coverage Summary

Reviewed all 38 migration files. **30 tables total.**

| Coverage | Count | Tables |
|----------|-------|--------|
| Complete RLS (all 4 ops) | 26 | profiles, medications, conditions, allergies, providers, vitals, appointments, journal_entries, ai_conversations, labs, procedures, immunizations, care_gaps, anesthesia_flags, appeals_and_disputes, surgical_planning, insurance, pharmacies, insurance_claims, todos, cycles, activities, genetic_results, drug_prices, insight_ratings, push_subscriptions, medication_reminders |
| Intentional partial RLS | 3 | usage_events (append-only: SELECT+INSERT only), terra_connections (SELECT+DELETE only, webhook writes via service role), api_usage (SELECT only, service role inserts) |
| Missing UPDATE | 1 | feedback |
| RLS not enabled | 1 | notification_log |

### 2.1 `notification_log` table has no RLS enabled

- **Severity:** Medium
- **File:** `supabase/migrations/023_push_notifications.sql`
- **What:** The `notification_log` table is created without `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and has zero policies. Any authenticated user could theoretically read all users' notification logs via the Supabase REST API.
- **Why it matters:** Notification logs contain `user_id`, notification `type`, and `reference_id` (linking to meds/appointments). While not direct PHI, it reveals which users exist and what types of health records they have.
- **Fix:** Add `ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;` plus a SELECT policy scoped to `auth.uid() = user_id`. If the table is truly server-only, also add `REVOKE SELECT ON notification_log FROM authenticated;`.

### 2.2 `feedback` table missing UPDATE policy

- **Severity:** Low
- **File:** `supabase/migrations/021_feedback.sql`
- **What:** The `feedback` table has SELECT, INSERT, and DELETE policies but no UPDATE policy. Users cannot edit submitted feedback.
- **Why it matters:** Not a security issue (the table has RLS enabled, so UPDATE is denied by default). It's a UX gap: if the user wants to correct a typo in submitted feedback, they must delete and re-create.
- **Fix:** Add `CREATE POLICY "Users update own feedback" ON feedback FOR UPDATE USING (auth.uid() = user_id);` if editing is desired.

### 2.3 `load_all_data()` RPC is secure

- **Severity:** N/A (pass)
- **File:** `supabase/migrations/022_load_all_rpc.sql`
- **What:** The `SECURITY DEFINER` function correctly: (a) sets `uid := auth.uid()`, (b) raises exception if `uid IS NULL`, (c) filters every subquery by `user_id = uid`. No cross-user data leakage possible.

### 2.4 `check_beta_invite()` has minor timing side-channel

- **Severity:** Low
- **File:** `supabase/migrations/028_beta_invites.sql`
- **What:** Invalid codes return faster (~5ms, SELECT miss) than valid codes (~30ms, SELECT + UPDATE). An attacker measuring response times could distinguish valid from invalid codes.
- **Why it matters:** At beta scale (few hundred codes), exploitation requires ~1M probes x 25ms = ~7 hours of sustained hammering. Practical risk is very low, especially since the invite gate is temporary.
- **Fix:** No action needed for beta. Post-beta, add a constant-time delay or remove the invite gate entirely.

### 2.5 OTP brute-force cooldown resets on page refresh

- **Severity:** Medium
- **File:** `src/components/Auth.jsx:34-36`
- **What:** The escalating cooldown (3 attempts -> 30s, 5 -> 120s, 7 -> 300s) is stored entirely in React state (`attempts`, `cooldownUntil`). Refreshing the page resets both counters to zero, allowing unlimited retries.
- **Why it matters:** The 8-digit OTP has 10^8 combinations, making pure brute-force infeasible even without client-side rate limiting. Supabase's server-side OTP verification likely has its own rate limit. But the documented protection is theater if it resets on refresh.
- **Fix:** Persist `cooldownUntil` and `attempts` in `localStorage` with the email as key. Restore on component mount. Clear on successful verification.

### 2.6 Sign-out does not clear wearable OAuth tokens

- **Severity:** High
- **File:** `src/App.jsx:332-341` (SIGNED_OUT handler)
- **What:** On sign-out, the app clears the encrypted health cache (`cache.clearToken()`) and token cache (`clearTokenCache()`), but does NOT clear wearable OAuth tokens stored in localStorage: `salve:oura`, `salve:dexcom`, `salve:withings`, `salve:fitbit`, `salve:whoop`. Each service has a `clearXxxTokens()` function that exists but is never called on sign-out.
- **Why it matters:** If User A signs out and User B signs in on the same device, B could trigger a wearable sync that pulls A's health data (from A's still-connected wearable account) into B's Salve profile. This is a cross-user data contamination vector.
- **Fix:** In the `SIGNED_OUT` handler in `App.jsx`, call `clearOuraTokens()`, `clearDexcomTokens()`, `clearWithingsTokens()`, `clearFitbitTokens()`, and any Whoop equivalent. Also clear `salve:oura-baseline`.

### 2.7 `_rateLimit.js` doc comment contradicts implementation

- **Severity:** Nit
- **File:** `api/_rateLimit.js:18`
- **What:** Comment says "On error... returns true (fail-open)" but lines 44 and 49-52 actually return `false` (fail-closed) on 5xx and network errors. The code is correct per the CLAUDE.md design; the comment is stale.
- **Why it matters:** A developer trusting the comment might misunderstand the security posture.
- **Fix:** Update comment to: "On 5xx or network error, returns false (fail-closed). On 4xx (e.g., RPC missing), returns true (fail-open with in-memory backstop)."

### 2.8 Server-only secrets: PASS

- **Severity:** N/A (pass)
- **What:** Grep of entire `src/` found zero `process.env.*` references. All server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, etc.) are confined to `api/` files. Client code only uses `import.meta.env.VITE_*` variables.

### 2.9 Serverless function auth: PASS

- **Severity:** N/A (pass)
- **What:** All `api/` handlers verify the Supabase auth token before processing, except for intentionally anonymous endpoints: `stripe-webhook.js` (signature-verified), `terra.js?route=webhook` (HMAC-verified), and `cron-reminders.js` (uses `CRON_SECRET`). The `check_beta_invite` RPC is anon-callable by design.

### Cross-reference with existing docs

- **PRODUCTION_AUDIT.md:** Finding 2.1 (`setupOfflineSync` not called) is marked as fixed in CLAUDE.md ("Fixed" in the known bugs list). Finding 2.2 (optimistic state without rollback) appears to still be the pattern. Not a beta-blocker since Supabase is reliable, but noted.
- **LAUNCH_CHECKLIST.md:** RLS verification (section 2) is marked done with two test accounts confirming zero cross-contamination.

---

## Chunk 3: Client-side security and PHI hygiene

### 3.1 Wearable OAuth tokens stored in plaintext localStorage

- **Severity:** Medium
- **Files:** `src/services/oura.js:8,28,37`, `src/services/dexcom.js:10,34,43`, `src/services/withings.js:9,63,73`, `src/services/fitbit.js:7,28,38`, `src/services/whoop.js:14,37,46`
- **What:** All five wearable OAuth integrations store `{ access_token, refresh_token, expires_at, connected_at }` as plaintext JSON in localStorage under keys `salve:oura`, `salve:dexcom`, `salve:withings`, `salve:fitbit`, `salve:whoop`. The main health data cache (`hc:cache`) is AES-GCM encrypted, but these tokens are not.
- **Why it matters:** A browser extension, XSS (low risk given CSP), or physical device access could read these tokens. Refresh tokens are long-lived and grant access to health device data.
- **Fix:** Move wearable tokens into the encrypted `hc:cache` envelope, or encrypt them independently using the same PBKDF2-derived key. For beta, document as a known limitation and ensure sign-out clears them (see finding 2.6).

### 3.2 No `dangerouslySetInnerHTML` usage: PASS

- **Severity:** N/A (pass)
- **What:** Zero occurrences of `dangerouslySetInnerHTML`, `innerHTML`, or `insertAdjacentHTML` in `src/`.

### 3.3 AIMarkdown `javascript:` href: Negligible risk

- **Severity:** Nit
- **File:** `src/components/ui/AIMarkdown.jsx:25`
- **What:** The custom `a` component renders `href={href}` without sanitizing against `javascript:` protocol. If AI output contained `[click](javascript:alert(1))`, the link would render. However: (a) `react-markdown` with `remarkGfm` does not enable raw HTML by default, (b) modern browsers block `javascript:` in React-rendered `<a>` tags, (c) AI output is server-generated not user-controlled.
- **Why it matters:** Defense-in-depth. If a prompt injection attack manipulated the AI response to include a `javascript:` link, browsers would still block it.
- **Fix:** Optional: add `href={href?.startsWith('javascript:') ? '#' : href}` to the `a` component for defense-in-depth.

### 3.4 Sentry PHI scrubbing: PASS (excellent)

- **Severity:** N/A (pass)
- **File:** `src/services/sentry.js`
- **What:** `beforeSend()` recursively scrubs 26+ PHI field names (name, dose, frequency, prescriber, pharmacy, condition, glucose, gene, phenotype, etc.) from `event.contexts`, `event.extra`, `event.tags`. Deletes `event.request.data` and `event.request.cookies` entirely. `beforeBreadcrumb()` drops console.log breadcrumbs. `sendDefaultPii: false`. Session replay and tracing disabled.

### 3.5 Analytics double-allowlist: PASS

- **Severity:** N/A (pass)
- **File:** `src/services/analytics.js`
- **What:** `EVENTS` constant defines an exhaustive allowlist of base event names. `SUFFIX_ALLOWLIST` enforces per-event suffix whitelisting. `validate()` rejects any event not in both lists. Event names are enum-only (e.g., `medication_added`, `vital_logged`) with no PHI possible. Schema backstop: `CHECK (length(event) <= 80)` in the database.

### 3.6 Console statements: 24 total, no PHI exposure

- **Severity:** Low
- **Files:** Various (App.jsx, db.js, storage.js, analytics.js, etc.)
- **What:** 24 `console.log/warn/error` statements remain in `src/`. All are in error handlers or dev-only debug paths. None log medication names, condition names, journal content, or lab values. Examples: `console.warn('[db] load_all_data RPC unavailable')`, `console.error('[storage] import error', err)`.
- **Why it matters:** In a production health app, even generic error logs could include stack traces with health data in variable names. The current statements are safe but verbose.
- **Fix:** Consider wrapping in `import.meta.env.DEV &&` guards or removing entirely for production. Not a beta-blocker.

### 3.7 `hc:settings` sidecar contains no PHI: PASS

- **Severity:** N/A (pass)
- **What:** The unencrypted `hc:settings` sidecar stores only profile metadata (name, ai_mode, theme preferences). Health background, conditions, medications, and other medical data are in the encrypted `hc:cache` envelope.

### 3.8 Service worker user isolation: PASS

- **Severity:** N/A (pass)
- **File:** `vite.config.js:36-66`
- **What:** Supabase API and `/api/*` routes are configured as `NetworkOnly`, meaning no API responses are cached in the service worker. No cross-user data leakage possible through the SW cache. Precache limited to HTML + CSS (6 entries, 112KB).

### 3.9 Clipboard usage: PASS (all user-initiated)

- **Severity:** N/A (pass)
- **What:** 6 clipboard operations found: `Appeals.jsx:158`, `AIPanel.jsx:112`, `Dashboard.jsx:1315`, `FormHelper.jsx:130,762,772`, `Settings.jsx:59`. All behind `onClick` handlers. No auto-copy on mount.

### 3.10 CSP inline script compliance: PASS

- **Severity:** N/A (pass)
- **File:** `index.html`
- **What:** One inline `<script>` in `<head>` (theme preload IIFE) is whitelisted via SHA256 hash in the CSP `script-src`. One `<script type="module" src="/src/main.jsx">` is an external source. No other inline scripts.

### 3.11 Third-party origin calls: PASS

- **Severity:** N/A (pass)
- **What:** All `fetch()` calls in `src/` target same-origin `/api/*` paths. External service calls (Anthropic, Gemini, Stripe, FDA, etc.) are server-side only. Client-side external calls are limited to: Supabase SDK (in CSP), Sentry ingest (in CSP), and Google Fonts (in CSP). No undocumented analytics, CDN, or tracking calls.

### 3.12 PWA stale chunk recovery: PASS

- **Severity:** N/A (pass)
- **File:** `src/App.jsx:30-53`
- **What:** `lazyWithRetry()` uses `sessionStorage` guard key `salve:chunk-retry`. First failure: sets flag, reloads. Second failure: clears flag, throws error. Maximum 1 automatic reload per session. Cannot get stuck in a loop.

---

## Chunk 4: AI surface: consent, prompt safety, cost control

### 4.1 AIConsentGate coverage: PASS

- **Severity:** N/A (pass)
- **What:** All AI-calling surfaces are consent-gated. `SagePopup.jsx` checks `hasAIConsent()` before rendering input. `AIPanel.jsx` uses three `<AIConsentGate>` wrappers covering all feature sections. Consent stored in `localStorage('salve:ai-consent')`, revocable via `revokeAIConsent()`.

### 4.2 Server-side prompt allowlist: PASS

- **Severity:** N/A (pass)
- **File:** `api/_prompts.js`
- **What:** 28 validated prompt keys in the `PROMPTS` object. `isValidPromptKey()` rejects anything not in the set. Both `api/gemini.js` and `api/chat.js` validate the key and return 400 for invalid keys. `sanProfile()` strips `<>{}` characters and enforces a 12,000-character limit. Raw `system` prompts only accepted for admin tier.

### 4.3 Tool-use safety: PASS

- **Severity:** N/A (pass)
- **Files:** `src/constants/tools.js:445-453`, `src/services/toolExecutor.js`, `src/services/ai.js:731`
- **What:** 7 destructive tools (`remove_medication`, `remove_condition`, `remove_allergy`, `remove_appointment`, `remove_provider`, `remove_cycle_entry`, `remove_todo`) all require inline Confirm/Cancel before execution. The `sendChatWithTools()` agentic loop is capped at 10 iterations (`maxLoops=10`), with a clear user message if the cap is hit.

### 4.4 Rate limiting: PASS (all AI handlers covered)

- **Severity:** N/A (pass)
- **What:** All AI API handlers have dual-layer rate limiting: in-memory sliding window + persistent `checkPersistentRateLimit()`. Gemini: 15/min. Claude: 20/min. Drug: 40/min. Provider: 30/min. Wearable: 30/min per provider. Persistent layer fails closed on 5xx/network errors.

### 4.5 Cost ceiling: PASS

- **Severity:** N/A (pass)
- **Files:** `api/gemini.js:60-87`, `api/chat.js:89-117`
- **What:** Free tier: 10 Gemini calls/day (server-side enforcement via `api_usage` count since midnight PT). Premium gate: `chat.js` checks `profiles.tier === 'premium'` or `'admin'` before any Claude call. Free-tier users get 403 regardless of client-side state. Trial expiry `NaN` guard confirmed on both server and client.

### 4.6 Medical disclaimer: PASS

- **Severity:** N/A (pass)
- **File:** `src/services/ai.js:194`
- **What:** `DISCLAIMER` constant appended to every AI response path: demo responses, web search results, regular chat, and tool-use chain final messages. Additionally displayed in the AIConsentGate itself and rendered by `AIMarkdown.jsx` as a styled footer.

---

## Chunk 5: Stripe billing and account lifecycle

### 5.1 Account deletion does NOT cancel Stripe subscriptions

- **Severity:** Critical
- **File:** `api/delete-account.js`
- **What:** The deletion endpoint verifies auth, then deletes the user via Supabase admin API with `ON DELETE CASCADE` for all tables. But it **never calls Stripe** to cancel the user's active subscription. After deletion, the user no longer exists in the app, but their Stripe subscription continues billing.
- **Why it matters:** A beta tester who deletes their account will continue to be charged. This is a billing-disaster scenario and likely violates consumer protection expectations.
- **Fix:** Before deleting the auth user, look up the user's `stripe_customer_id` from profiles, call `DELETE https://api.stripe.com/v1/subscriptions/{id}` for all active/trialing/past_due subscriptions, then proceed with account deletion. Require `STRIPE_SECRET_KEY` in the handler.

### 5.2 Webhook does not handle `invoice.payment_failed`

- **Severity:** Medium
- **File:** `api/stripe-webhook.js`
- **What:** The webhook handles 3 events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. It does NOT handle `invoice.payment_failed`. If a payment fails, the user remains marked as premium until Stripe's retry cycle eventually triggers `customer.subscription.deleted` (which could take 1-4 weeks depending on retry settings).
- **Why it matters:** During the retry period, the user has premium access but isn't paying. Not catastrophic for beta (low volume), but should be handled before scale.
- **Fix:** Add `invoice.payment_failed` handler that either downgrades immediately, shows a "payment failed" banner in-app, or accepts Stripe's built-in dunning flow. For beta, accept as-is if Stripe dunning emails are configured.

### 5.3 Webhook signature verification: PASS (excellent)

- **Severity:** N/A (pass)
- **File:** `api/stripe-webhook.js:23-64`
- **What:** Signature verified with `timingSafeEqual` BEFORE any JSON parsing or database writes. Replay protection enforces 5-minute window. Unsigned/forged payloads rejected with 401.

### 5.4 Webhook idempotency: PASS

- **Severity:** N/A (pass)
- **What:** All tier updates are idempotent overwrites (not incremental). Replaying the same event produces the same database state. No deduplication mechanism exists (no event ID tracking), but this is acceptable given the overwrite pattern.

### 5.5 Client-side tier enforcement: PASS

- **Severity:** N/A (pass)
- **What:** No client-side code writes to `profiles.tier` in Supabase. The `tierOverride` in Settings is localStorage-only (dev tool). Server-side `chat.js` verifies tier from the database, not from client headers.

### 5.6 Checkout flow: PASS

- **Severity:** N/A (pass)
- **What:** Success URL: `{appUrl}/?checkout=success` (no sensitive data). Cancel URL: `{appUrl}/?checkout=cancelled`. Success handler in `App.jsx` replaces history and shows toast.

### 5.7 Customer portal: PASS

- **Severity:** N/A (pass)
- **What:** Portal URL generated from the authenticated user's `stripe_customer_id` (resolved from their profile via auth token). One user cannot access another's portal.

### 5.8 Data export/delete alignment: PASS

- **Severity:** N/A (pass)
- **What:** `storage.js exportAll()` covers 23 tables + settings. `delete-account.js` uses `ON DELETE CASCADE` on `auth.users`, which cascades to all 23+ tables via FK relationships. `usage_events` and `feedback` are intentionally excluded from export (non-PHI) but are deleted via cascade.

### 5.9 No Lemon Squeezy code remnants: PASS

- **Severity:** N/A (pass)
- **What:** No `lemon-*.js` files exist. No code references to `lemon` or `lemonsqueezy` outside of `CLAUDE.md` and `docs/LAUNCH_CHECKLIST.md`.

### 5.10 CLAUDE.md still documents Lemon Squeezy billing

- **Severity:** Medium
- **File:** `CLAUDE.md`
- **What:** The CLAUDE.md billing section still describes Lemon Squeezy: `api/lemon-checkout.js`, `api/lemon-webhook.js`, `LEMON_*` env vars, and `services/billing.js` as LS helpers. The actual codebase uses Stripe (`api/stripe-checkout.js`, `api/stripe-webhook.js`, `STRIPE_*` env vars). This drift is confusing for any contributor reading the docs.
- **Why it matters:** A developer following CLAUDE.md would look for files that don't exist and miss the actual Stripe integration.
- **Fix:** Update the billing sections of CLAUDE.md to reflect the Stripe migration: file names, env vars, webhook events, checkout flow.

### Cross-reference with existing docs

- **LAUNCH_CHECKLIST.md:** Section about "Lemon Squeezy payments" describes LS setup steps that are now moot. Should be updated to Stripe equivalent.

---

## Chunk 6: Wearables and imports (trust boundary surface)

### 6.1 No server-side mutex on concurrent wearable token refresh

- **Severity:** Medium
- **File:** `api/wearable.js` (lines 120-145 Oura, 226-251 Dexcom, 344-375 Withings, 492-520 Fitbit, 598-623 Whoop)
- **What:** All five provider `refresh` action handlers execute the refresh flow without a mutex/guard. If two simultaneous requests arrive with the same expired access token, both will call the provider's token endpoint with the same refresh token. Most OAuth providers invalidate the refresh token on first use, so the second call fails, leaving one caller with an invalid token.
- **Why it matters:** The client-side code (`oura.js`, `dexcom.js`, etc.) has a single-in-flight mutex to prevent concurrent refreshes from the same browser tab. But the server-side proxy has no such guard, and a user with multiple tabs could trigger concurrent refreshes.
- **Fix:** Add a per-user+provider in-memory `Map` keyed by `userId:provider` that queues concurrent refresh requests behind the first one. For beta, this is low risk since concurrent refreshes from multiple tabs is an edge case, and the client-side mutex prevents the common case.

### 6.2 `api/wearable.js` action and endpoint validation: PASS

- **Severity:** N/A (pass)
- **What:** All five providers validate `action` against implicit allowlists (config/token/refresh/data). Unknown actions return 400. All `endpoint` parameters are validated against strict allowlists (Oura: 13 endpoints, Dexcom: 4, Withings: 2, Fitbit: 6 path prefixes, Whoop: 5). No path traversal possible.

### 6.3 `api/terra.js` webhook: PASS (excellent)

- **Severity:** N/A (pass)
- **File:** `api/terra.js`
- **What:** HMAC-SHA256 signature verification uses `crypto.timingSafeEqual`. Raw body read before JSON parsing. 5-minute replay window enforced. `?route=webhook` required. Widget route requires Bearer token auth (401 on missing/invalid).

### 6.4 HealthKit import: no file size cap

- **Severity:** Low
- **File:** `src/services/healthkit.js`
- **What:** The parser accepts arbitrarily large ArrayBuffer input. Apple Health exports can exceed 100MB. The parser uses chunked regex (2MB per iteration) with progress callbacks, which is good for UI responsiveness, but a malicious or corrupt 500MB file could exhaust memory.
- **Why it matters:** Browser tab crash, not a security issue. The chunked processing prevents main-thread blocking.
- **Fix:** Add `if (input.byteLength > 500_000_000) throw new Error('File too large')` at the entry point. Not a beta-blocker.

### 6.5 Flo import: no file size cap

- **Severity:** Low
- **File:** `src/services/flo.js`
- **What:** No size cap on Flo JSON uploads. Same memory concern as HealthKit, though Flo exports are much smaller (typically <1MB).
- **Fix:** Add a reasonable cap (50MB). Not a beta-blocker.

### 6.6 Import dedup correctness: PASS

- **Severity:** N/A (pass)
- **What:** HealthKit dedup key: `${date}|${type}|${time}|${value}`. Flo dedup key: `${date}|${type}|${value}|${symptom}`. Re-importing the same file produces zero new rows. Cross-source imports (Apple Health + manual entry for same day) correctly coexist due to different dedup key components.

### 6.7 Export does not leak tokens or secrets: PASS

- **Severity:** N/A (pass)
- **File:** `src/services/storage.js`
- **What:** `exportAll()` only exports rows from the 23 user-data tables in `TABLE_MAP`. Wearable tokens (`salve:oura`, etc.) are in localStorage, not in any exported table. No Stripe customer IDs, no server secrets in the export.

---

## Chunk 7: UX polish and voice pass

### 7.1 Em dashes in user-facing copy (8 instances)

- **Severity:** Medium (per voice rules)
- **Files and instances:**
  - `src/components/sections/Legal.jsx:27` - "Salve also records a small amount of anonymous usage information — short event names..."
  - `src/components/sections/AIPanel.jsx:1165` - "...so Sage stays free for everyone — your allowance resets at midnight Pacific."
  - `src/components/sections/AIPanel.jsx:1171` - "Premium isn't open yet — we'll let you know when it is."
  - `src/components/sections/OnboardingWizard.jsx:210` - "Pick what fits your situation — you can change anything later."
  - `src/components/sections/Settings.jsx:1431` - "...for dysautonomia, POTS, and reactive hypoglycemia."
  - `src/components/sections/Settings.jsx:1626` - "...dysautonomia and POTS — HRV is the key marker"
  - `src/components/sections/Settings.jsx:1739` - "Demo mode — sign up to connect your own devices."
- **Fix:** Replace each em dash with a period, comma, or colon as appropriate. Example: "Premium isn't open yet. We'll let you know when it is."

### 7.2 Medication name overflow in Medications.jsx

- **Severity:** Medium
- **File:** `src/components/sections/Medications.jsx:900`
- **What:** When `display_name` is set and differs from `name`, the official drug name is rendered without `truncate` or `overflow-hidden`. FDA brand+generic concatenations can be very long (e.g., "Escitalopram Oxalate / Lexapro 10mg Tablets"). At 375px width, this overflows the card.
- **Fix:** Add `truncate` class to the `{m.name}` div.

### 7.3 NPI specialty overflow in Providers.jsx

- **Severity:** Medium
- **File:** `src/components/sections/Providers.jsx:233`
- **What:** NPI search result specialty strings (e.g., "Orthopedic Surgery, Sports Medicine, Arthroscopic Surgery") render without truncation in the dropdown. Can overflow at narrow widths.
- **Fix:** Add `truncate` class.

### 7.4 Pharmacy medication name overflow

- **Severity:** Low
- **File:** `src/components/sections/Pharmacies.jsx:239`
- **What:** Medication names shown within pharmacy detail cards lack truncation.
- **Fix:** Add `truncate` class.

### 7.5 CrisisModal missing SAMHSA and Trevor Project

- **Severity:** Medium
- **File:** `src/components/ui/CrisisModal.jsx`
- **What:** The crisis modal shows 988 Suicide & Crisis Lifeline, Crisis Text Line (741741), National DV Hotline, and Poison Control. It does NOT include SAMHSA (1-800-662-4357) for substance abuse or The Trevor Project (1-866-488-7386) for LGBTQ+ crisis support.
- **Why it matters:** The app targets chronically ill users, some of whom may have co-occurring substance use or be LGBTQ+. These are standard crisis resources that should be included.
- **Fix:** Add SAMHSA and Trevor Project entries to the modal.

### 7.6 Crisis keyword detection: PASS (well-designed)

- **Severity:** N/A (pass)
- **File:** `src/utils/crisis.js`
- **What:** Phrase-level regex patterns with negative lookaheads (e.g., `/\bkill\s+my\s*self\b(?!\s+(laughing|with))/i`) prevent false positives. Four categories: suicide/self-harm, self-harm behaviors, medical emergencies, domestic violence. Smart quote normalization. Reasonable coverage.

### 7.7 CrisisModal accessibility: PASS

- **Severity:** N/A (pass)
- **What:** `role="alertdialog"`, `aria-modal="true"`, focus trap with Tab/Shift+Tab cycling, Escape intentionally blocked (safety decision), close button auto-focused on mount.

### 7.8 Scribe sensitive-question flagger: PASS (AI-driven)

- **Severity:** N/A (pass)
- **File:** `src/components/sections/FormHelper.jsx:173,304`
- **What:** Sensitive question detection is AI-driven, not client-side regex. The server-side prompt instructs Sage to prefix sensitive answers with `⚠`. The client detects `⚠` in answers and renders them with amber border, "answer this personally" guidance, and a count badge. This approach is more nuanced than regex because the AI understands context.

### 7.9 Skeleton loading: still incomplete (CLAUDE.md finding #13 confirmed)

- **Severity:** Low
- **Files:** Multiple section files in `src/components/sections/`
- **What:** `SkeletonCard` and `SkeletonList` exist in `src/components/ui/` and are used as Suspense fallbacks in App.jsx for code-split sections. However, individual sections do NOT render skeletons during `dataLoading`. They show either EmptyState or the data list immediately, with no intermediate skeleton state.
- **Why it matters:** On first load or slow connections, sections flash from blank to populated. Not a crash, but a polish gap.
- **Fix:** Add `if (dataLoading) return <SkeletonList count={3} />;` guard at the top of each section's render. Not a beta-blocker but visually noticeable.

### 7.10 Empty states: PASS (all sections covered)

- **Severity:** N/A (pass)
- **What:** All major list sections (Medications, Conditions, Allergies, Providers, Vitals, Appointments, Journal, Labs, Procedures, Immunizations, Care Gaps, Anesthesia Flags, Appeals, Surgical Planning, Insurance, Pharmacies, Todos, Activities, Genetics, Cycles) render `<EmptyState>` with helpful text and an action button when the data list is empty.

### 7.11 No lorem ipsum, TODO strings, or stale branding: PASS

- **Severity:** N/A (pass)
- **What:** No "lorem ipsum", no "TODO" in user-facing strings, no "Amber's Remedy" in user-facing surfaces. The protected tagline "made with love for my best friend & soulmate" is present in BottomNav (mobile) and Dashboard footer (desktop) as intended.

### 7.12 Non-verb button labels (minor)

- **Severity:** Nit
- **Files:** `src/components/sections/Providers.jsx:200` ("Unfavorite" / "Favorite"), `src/components/sections/Pharmacies.jsx:268` ("Preferred" / "Set preferred")
- **What:** "Unfavorite" and "Preferred" are not verb forms. The `aria-label` on these buttons uses proper verb forms ("Remove from favorites" / "Add to favorites") but the visible text doesn't match.
- **Fix:** Change visible text to match the aria-labels, or use toggle icons with sr-only labels.

---

## Chunk 8: Beta-specific concerns

### 8.1 PHI breach response plan is a blank template

- **Severity:** High
- **File:** `docs/LAUNCH_CHECKLIST.md:238-244`
- **What:** The breach response plan is a set of blank fields: "What's your PHI breach response plan? _________". The outline (assess scope, revoke tokens, notify within 72h, patch, post-mortem) is documented as guidance but no concrete plan exists. Key questions unanswered: Who owns incident response? What's the communication channel? How do you force-revoke all sessions? How do you rotate the Supabase anon key?
- **Why it matters:** If a data breach occurs during beta, there's no documented procedure to follow under stress.
- **Fix:** Fill in the blank fields. At minimum document: (1) Austin is sole incident responder, (2) revoke sessions via Supabase Dashboard > Authentication > Sessions, (3) rotate anon key via Supabase Dashboard > Settings > API, (4) notify users via the in-app toast system or direct email, (5) timeline: assess within 1h, contain within 4h, notify within 72h.

### 8.2 No Sentry client-side rate limiting

- **Severity:** Medium
- **File:** `src/services/sentry.js:51-91`
- **What:** Sentry is initialized with no `sampleRate` (defaults to 1.0, meaning 100% of events sent), no `maxBreadcrumbs` limit, and no event deduplication. A beta tester triggering a render loop (e.g., ErrorBoundary fallback with a bad component) could generate thousands of identical events in minutes, exhausting the free Sentry quota (5K events/month).
- **Why it matters:** Once the quota is burnt, error monitoring goes dark for all users for the rest of the month.
- **Fix:** Add `sampleRate: 1.0` (explicit, fine for beta volume), `maxBreadcrumbs: 50`, and consider adding `@sentry/browser`'s `Dedupe` integration to suppress duplicate consecutive errors. For beta, 5K events/month should be sufficient if dedup is active.

### 8.3 Closed beta invite gate: PASS (adequate for beta)

- **Severity:** N/A (pass)
- **File:** `supabase/migrations/028_beta_invites.sql`, `src/components/Auth.jsx`
- **What:** The invite gate uses `check_beta_invite(code, email)` and `claim_beta_invite(code)` RPCs. Error responses do not distinguish "invalid code" from "already claimed" (both return `false`), preventing code enumeration. The 30-minute email reservation prevents grief-locking. The minor timing side-channel (finding 2.4) is impractical at beta scale. `VITE_BETA_INVITE_REQUIRED` env var can disable the gate entirely.

### 8.4 Feedback submissions reach Supabase but no notification path

- **Severity:** Medium
- **File:** `src/components/sections/Feedback.jsx`, Supabase `feedback` table
- **What:** User feedback (type + message) is written to the `feedback` Supabase table. But there's no notification mechanism: no email alert when feedback is submitted, no Slack integration, no dashboard view. The developer must manually check the Supabase table to see feedback.
- **Why it matters:** A beta tester reports a critical bug via in-app feedback, but nobody sees it for days.
- **Fix:** Set up a Supabase Database Webhook or a simple Vercel cron that emails new feedback rows to `salveapp@proton.me`. Alternatively, check the table daily during beta. Not a code fix, an ops fix.

### 8.5 Uptime monitor: still unchecked

- **Severity:** Medium
- **File:** `docs/LAUNCH_CHECKLIST.md` (section 1d)
- **What:** The uptime monitor task remains unchecked. No external ping is monitoring whether `salve.today` is accessible.
- **Why it matters:** If Vercel has an outage or a bad deploy takes the site down, there's no alert.
- **Fix:** Set up UptimeRobot or BetterStack (free tier, 5-min intervals) pinging the production URL before inviting beta testers.

### 8.6 RLS end-to-end verification: trusting the checkbox

- **Severity:** N/A (noted)
- **What:** The LAUNCH_CHECKLIST.md marks RLS verification as done (two test accounts, zero cross-contamination). This audit's migration review (Chunk 2) confirmed RLS policies on all PHI tables and correct `auth.uid()` filtering in `load_all_data()`. Trusting the checkbox and moving on.

### 8.7 LAUNCH_CHECKLIST.md still recommends Lemon Squeezy

- **Severity:** Low
- **File:** `docs/LAUNCH_CHECKLIST.md:141-207`
- **What:** Section 3 ("Payments stack") recommends Lemon Squeezy over Stripe and includes a full LS implementation plan. The app has since migrated to Stripe. The checklist is now misleading.
- **Fix:** Update section 3 to document the Stripe setup that actually exists (env vars, webhook URL, test mode verification steps).
