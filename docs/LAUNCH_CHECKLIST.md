# Launch Checklist — Sharing Salve Publicly

Pre-launch actions for going from private beta to sharing the app with strangers
(e.g., on Reddit). Focused, actionable, ordered by priority. Does not duplicate
`PRODUCTION_AUDIT.md` — that's a deeper architectural review.

---

## 1. Operational setup (do first, ~30 minutes)

### 1a. Sentry error monitoring

Code is already wired (`src/services/sentry.js`, `ErrorBoundary.jsx`, `main.jsx`).
You need to:

1. Create a free Sentry account at [sentry.io](https://sentry.io) (developer plan, 5K events/month free).
2. Create a new project: **Platform: React, Framework: Vite**.
3. Copy the DSN from Project Settings → Client Keys (DSN).
4. Add env var in Vercel:
   - Project → Settings → Environment Variables
   - Key: `VITE_SENTRY_DSN`
   - Value: `https://<pubkey>@<org>.ingest.sentry.io/<project>`
   - Environments: Production + Preview
5. Redeploy (Vercel → Deployments → latest → Redeploy).

**Verify it works:** load the production app, open DevTools console, run
`throw new Error('Sentry test — ' + Date.now())`. Within ~30 seconds the error
should appear in Sentry's Issues list. If not, check the DSN format and that
the CSP isn't blocking the ingest URL (browser console will show a CSP error).

### 1b. AI provider cost ceilings

**Anthropic Console** (if you're using Claude for premium):
1. Visit [console.anthropic.com](https://console.anthropic.com) → Billing
2. Set **Monthly spend limit** — recommend starting at $20–50/month
3. Set **Email alerts** at 50%, 75%, 90% of limit
4. If limit is hit, API returns 429 errors — users see "Daily AI limit reached"
   (already handled gracefully in `src/services/ai.js`)

**Google AI Studio / Gemini** (free tier):
1. Visit [aistudio.google.com](https://aistudio.google.com) → API keys
2. Gemini free tier has per-minute + daily rate limits built in (no billing)
3. If you later upgrade to paid Gemini, set similar monthly caps in
   [Google Cloud Console](https://console.cloud.google.com) → Billing → Budgets

**Current per-user protection** (already in code):
- In-memory + persistent rate limit: 15 req/min (Gemini), 20 req/min (Claude)
- Daily limit for free tier: 10 calls/day per user (Gemini only)
- See `api/_rateLimit.js` and `api/gemini.js`

### 1c. Vercel plan

Hobby tier (free) limits that matter at Reddit scale:
- 100 GB/month bandwidth
- 100 GB-hours serverless compute
- Commercial use prohibited (if you charge money, you must upgrade)

**If you don't charge money and stay under quotas → Hobby is fine.**
**If you add Stripe / Lemon Squeezy → upgrade to Pro ($20/mo) before launch.**

Monitor usage at Vercel → Project → Usage. Set up email alerts.

### 1d. Uptime + basic monitoring

Free options:
- [UptimeRobot](https://uptimerobot.com) — 50 monitors free, 5-min intervals
- [BetterStack](https://betterstack.com) — 10 monitors free, 3-min intervals

Monitor these URLs:
- `https://<your-domain>/` (home page loads)
- `https://<your-domain>/api/chat` (with POST, expect 401 without auth — that
  still means the function is reachable)

Send alerts to your email.

---

## 2. RLS end-to-end verification (do before sharing)

Critical to verify that User A genuinely cannot see User B's data. Supabase
RLS is configured, but policies only help if they're actually enforced on every
table. Run this once:

### Test script (manual, ~10 minutes)

1. Create two test accounts via the app's magic-link flow:
   - `rls-test-a@<your-email-domain>` → sign in, add a medication named
     "LEAK-TEST-DRUG-A-xyz123"
   - `rls-test-b@<your-email-domain>` → sign in, add a medication named
     "LEAK-TEST-DRUG-B-xyz456"
2. From account B's browser, open DevTools Console and run:

   ```js
   // Grab B's access token from the current session
   const { data: { session } } = await window.supabase?.auth?.getSession() ?? {};
   // If window.supabase isn't exposed, paste your session token from Application →
   // Local Storage → sb-<ref>-auth-token
   const token = session?.access_token;

   // Try to list ALL medications via the Supabase REST API with B's token
   const res = await fetch(
     'https://<YOUR-PROJECT>.supabase.co/rest/v1/medications?select=id,name',
     { headers: {
         apikey: '<YOUR_ANON_KEY>',
         Authorization: `Bearer ${token}`,
     }}
   );
   const rows = await res.json();
   console.log('rows returned:', rows.length);
   console.log('any A leakage?', rows.some(r => r.name?.includes('LEAK-TEST-DRUG-A')));
   ```

3. **Expected:** you see only B's medications. No rows containing
   "LEAK-TEST-DRUG-A" should appear. `any A leakage?` should log `false`.

4. **Repeat for every sensitive table**: `medications`, `conditions`,
   `allergies`, `vitals`, `journal_entries`, `labs`, `providers`, `insurance_claims`,
   `cycles`, `genetic_results`, `profiles`.

5. If ANY test returns rows belonging to the other user, stop and review the
   RLS policy for that table in `supabase/migrations/`. Every policy should be
   `using (auth.uid() = user_id)`.

6. Delete both test accounts afterward (use the new Delete Account flow).

### Automated version (nice-to-have)

You could write a one-off Node script using `@supabase/supabase-js` that signs
in as both users, queries every table with each session, and asserts no
cross-contamination. See `tests/rls-verify.js` as a future task.

---

## 3. Payments stack (when ready)

Your tier infrastructure is already in place — `profiles.tier` column
(free/premium), server-side gate in `api/chat.js` (blocks free from Claude),
client-side `isFeatureLocked()`. Payment integration is roughly 3–5 hours of
work.

### Recommendation: **Lemon Squeezy** (Merchant of Record)

**Why Lemon Squeezy over Stripe for your situation:**
- They handle sales tax, VAT, and international compliance as the merchant of
  record. You don't file tax returns for 50 US states + EU VAT.
- Flat 5% + $0.50 per transaction, no monthly fee.
- Hosted checkout + subscription management portal — no PCI scope for you.
- Webhook model is very similar to Stripe's.
- Solo-dev friendly; explicitly targets indie SaaS.

**Stripe is better if:** you're already in the Stripe ecosystem, you want the
absolute lowest fees (2.9% + $0.30), you have capacity to handle tax filings,
or you need Stripe-specific features (Issuing, Connect, etc.).

### Implementation plan (Lemon Squeezy path, ~4 hours)

**Setup in Lemon Squeezy dashboard:**
1. Create account, create a store
2. Create a Product: "Salve Premium" with a subscription variant
   (monthly + annual prices, e.g., $5/mo or $48/yr)
3. Create an API key (Settings → API → Create new key)
4. Configure webhook URL: `https://<your-domain>/api/lemon-webhook`
5. Set webhook signing secret (random string), save it
6. Enable events: `subscription_created`, `subscription_updated`,
   `subscription_cancelled`, `subscription_resumed`, `subscription_expired`

**Code to add:**

*`api/lemon-checkout.js`* — creates a checkout session for the current user
- Verifies user auth token
- Calls Lemon Squeezy API to create a checkout with `custom_data.user_id`
- Returns the hosted checkout URL for the client to redirect to

*`api/lemon-webhook.js`* — listens for subscription events
- Verifies webhook signature using HMAC-SHA256 against the signing secret
- On `subscription_created/updated/resumed`: sets `profiles.tier = 'premium'`
  (looking up the user via `custom_data.user_id`)
- On `subscription_cancelled/expired`: sets `profiles.tier = 'free'`
- Uses Supabase service role key to bypass RLS

*`src/services/billing.js`* — client helpers
- `startCheckout()` → hits `/api/lemon-checkout`, redirects to returned URL
- `openCustomerPortal()` → redirects to Lemon Squeezy customer portal

*Settings.jsx* — upgrade UI
- "Upgrade to Premium" button (only when tier === 'free')
- "Manage Subscription" button (only when tier === 'premium')

**Env vars needed:**
- `LEMON_API_KEY` — server-only
- `LEMON_STORE_ID` — server-only
- `LEMON_PREMIUM_VARIANT_ID` — server-only (the subscription plan variant ID)
- `LEMON_WEBHOOK_SECRET` — server-only

**Testing:**
- Lemon Squeezy has test mode (toggle in dashboard)
- Use test mode + test card numbers until you verify the webhook flow works
- Check your Supabase `profiles` table after a test subscription to confirm
  `tier` flipped to 'premium'

### What NOT to build yet
- Upgrade prompts embedded in the app (cards/banners pushing premium)
- Trial periods (Lemon Squeezy supports them natively when you're ready)
- Coupon codes / promo flows
- Team / family plans

Launch free, add premium after you know what people want to pay for.

---

## 4. Pre-launch UX polish

Things to verify before sharing:

- [ ] Sign up with a fresh email, walk through as a first-time user
- [ ] Every section should have an empty state (no crashes when tables are blank)
- [ ] Try erasing all data → confirm UI handles empty data gracefully
- [ ] Try deleting account → confirm redirect + sign-out works
- [ ] Test on iPhone Safari + Chrome Android (most Reddit users are mobile)
- [ ] Check PWA install flow: iOS Add to Home Screen, Android Install App
- [ ] Test offline: airplane mode → verify cached data loads, pending writes queue
- [ ] Verify Legal links (Privacy/Terms/HIPAA) all render from Settings → Legal
- [ ] Replace `support@salve.health` placeholder in `src/components/sections/Legal.jsx`
      with a real email address you own

---

## 5. Post-launch support workflow

Decide these BEFORE sharing publicly so you aren't scrambling:

| Question | Your answer |
|---|---|
| Where do users email for help? | _________________ |
| Where do they report bugs? | GitHub issues (already linked) |
| Who owns the support inbox? | _________________ |
| How fast do you commit to responding? | _________________ |
| What's your PHI breach response plan? | _________________ |

The PHI breach question matters even though you're not HIPAA-covered — if
users trust you with medical data and you leak it, the reputational damage
is significant. Have a plan: (1) assess scope, (2) revoke affected tokens,
(3) notify affected users within 72 hours, (4) patch the vulnerability,
(5) post-mortem publicly.

---

## Launch readiness summary

You are ready to share when ALL of these are true:

- [ ] Sentry DSN wired + verified
- [ ] AI provider spend caps set
- [ ] Vercel Pro upgraded (if monetizing)
- [ ] Uptime monitor configured
- [ ] RLS verification passed on every sensitive table
- [ ] Account deletion flow tested end-to-end
- [ ] Real support email in Legal.jsx
- [ ] First-time-user walkthrough done on a clean account
- [ ] Mobile iOS + Android tested
- [ ] Offline mode verified
- [ ] Response plan documented for PHI breach

Payments can wait. Launch free, iterate, then monetize.
