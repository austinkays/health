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
**If you add Stripe payments → upgrade to Pro ($20/mo) before launch.**

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

### Stripe payments (already implemented)

Code is complete. Files:
- `api/stripe-checkout.js` — creates a Stripe hosted checkout session (auth-gated)
- `api/stripe-webhook.js` — signature-verified webhook handling:
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`
- `src/services/billing.js` — `startCheckout(plan)`, `openCustomerPortal()`
- `api/delete-account.js` — cancels active Stripe subscriptions before deletion

**Setup in Stripe dashboard:**
1. Create a Product: "Salve Premium" with monthly + annual Price objects
2. Create a webhook endpoint: `https://<your-domain>/api/stripe-webhook`
3. Subscribe to events: `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`
4. Copy the webhook signing secret

**Env vars needed (Vercel, server-only):**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PREMIUM_PRICE_ID` (monthly)
- `STRIPE_ANNUAL_PRICE_ID` (annual)

**Env vars needed (Vercel, client-side):**
- `VITE_BILLING_ENABLED=true` (shows upgrade CTAs)

**Testing:**
- Use Stripe test mode + test card numbers (`4242 4242 4242 4242`)
- Verify webhook flow: check Supabase `profiles` table for `tier = 'premium'`
  after a test subscription
- Test account deletion with active subscription: confirm sub is cancelled in
  Stripe dashboard before user is removed

### What NOT to build yet
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
| What's your PHI breach response plan? | See below |

### PHI Breach Response Plan

**Incident responder:** Austin (sole developer, `salveapp@proton.me`).

**Timeline:**
1. **Within 1 hour:** Assess scope (which tables, how many users, attack vector).
2. **Within 4 hours:** Contain the breach:
   - Revoke all active sessions: Supabase Dashboard > Authentication > Sessions
   - If the anon key is compromised: rotate it via Supabase Dashboard > Settings > API (this will break all existing client sessions; users must re-authenticate)
   - If a server secret is compromised: rotate it in Vercel env vars and redeploy immediately
   - If an API endpoint is the vector: disable it by returning 503 in the handler or removing it from `vercel.json`
3. **Within 24 hours:** Patch the vulnerability and deploy the fix.
4. **Within 72 hours:** Notify affected users via:
   - In-app toast/banner on next login (add a `breach_notice` flag to profiles, render a modal in App.jsx)
   - Direct email to affected accounts (query `auth.users` email via Supabase Dashboard)
   - If the app is down, use the support email `salveapp@proton.me` to contact users directly
5. **Within 1 week:** Publish a post-mortem: what happened, what data was exposed, what was fixed, what changed to prevent recurrence. Post to the app's public channel (Reddit thread, GitHub, etc.).

**Communication template:**
> "We discovered that [description of what was exposed] between [dates]. We
> immediately [containment steps taken]. Your [specific data type] may have been
> accessed. We have [fix applied]. We recommend [user action if any, e.g.,
> 'review your connected wearable devices']. We're sorry and are taking steps
> to prevent this from happening again."

**Key Supabase admin actions:**
- Force sign-out all users: `DELETE FROM auth.sessions;` (via SQL Editor with service role)
- Rotate anon key: Dashboard > Settings > API > Generate new anon key
- Rotate service role key: Dashboard > Settings > API > Generate new service role key (update all Vercel env vars immediately after)
- Check audit logs: Dashboard > Logs > Auth logs for suspicious activity

The PHI breach question matters even though Salve is not HIPAA-covered. If
users trust the app with medical data and it leaks, the reputational damage
is significant. This plan ensures a structured response under stress.

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
