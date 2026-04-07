# Salve: Complete Beta Readiness Implementation Plan

## Context

Salve is a health companion app (Vite + React 18 + Tailwind + Supabase, deployed on Vercel) approaching beta. A comprehensive audit identified 6 security blockers, 6 polish items, and 6 new features. This plan organizes the work into 10 sequential sessions, each 1-2 hours of implementation.

## What You (Austin) Must Do Separately (Not Code)

- [ ] **Sentry DSN** — Sign up at sentry.io, create React/Vite project, copy DSN, add `VITE_SENTRY_DSN` to Vercel env vars (Production + Preview), redeploy
- [ ] **AI spend caps** — Set monthly $ limit + alerts in Anthropic Console and Google Cloud Console
- [ ] **RLS verification** — Run the cross-contamination test script from `docs/LAUNCH_CHECKLIST.md` section 2
- [ ] **Google OAuth** — Create Google Cloud OAuth credentials, enable Google provider in Supabase Dashboard
- [ ] **VAPID keys** — Generate VAPID key pair for push notifications (`npx web-push generate-vapid-keys`)
- [ ] **Supabase Storage** — Create `user-documents` bucket (10MB limit, image/pdf MIME types)
- [ ] **Fresh-user walkthrough** — Sign up with clean email, tap through every section on iPhone Safari + Android Chrome

---

## Session 1: Security Blockers [CRITICAL] — Do First

### 1a. System Prompt Injection Fix

**Problem:** `api/chat.js` and `api/gemini.js` accept client-provided `system` param and pass it directly to AI providers. An attacker could override AI behavior.

**Fix:** Move prompt construction server-side. Client sends `prompt_key` + `profile_text` instead of raw system prompt.

**New file:** `api/_prompts.js`
- Export `PROMPTS` map (copy prompt strings from `src/services/ai.js` ~lines 99-182)
- Export `buildSystemPrompt(promptKey, profileText)` — validates key against allowlist, sanitizes profileText (strip `<>{}`, cap 12000 chars), assembles prompt

**Modify:** `api/chat.js`
- Change destructuring: `{ messages, prompt_key, profile_text, ... }` instead of `{ messages, system, ... }`
- Build system prompt server-side via `buildSystemPrompt()`
- Keep raw `system` accepted ONLY for admin tier (escape hatch)

**Modify:** `api/gemini.js` — Same changes as chat.js

**Modify:** `src/services/ai.js`
- `callAPI()` signature: `(messages, promptKey, profileText, ...)` instead of `(messages, system, ...)`
- Body sends `{ prompt_key, profile_text }` instead of `{ system }`
- Update all ~15 feature call sites (fetchInsight, fetchConnections, fetchNews, fetchLabInterpretation, fetchVitalsTrend, fetchAppointmentPrep, fetchCareGaps, fetchJournalPatterns, fetchCyclePatterns, fetchImmunizationSchedule, fetchAppealDraft, fetchCrossReactivity, fetchGeneticExplanation, fetchCostOptimization, fetchHouseConsultation)

### 1b. npm audit fix

- Run `npm audit fix` (safe fixes only, no `--force`)
- Fixes: lodash code injection, vite path traversal, serialize-javascript RCE
- Files affected: `package.json`, `package-lock.json`

### 1c. Legal contact — Already correct (`salveapp@proton.me` in Legal.jsx:164). No change needed.

---

## Session 2: Form Validation Foundation

### 2a. Enhanced Field.jsx

**Modify:** `src/components/ui/Field.jsx`
- Add props: `maxLength`, `min`, `max`, `hint`
- Render `hint` text below input in `text-salve-textFaint`
- Show character counter when `maxLength` set and value > 80% of limit
- Add `inputMode="decimal"` for `type="number"`
- Pass `maxLength` to `<textarea>` element too

### 2b. Validation Utility

**New file:** `src/utils/validate.js`

| Function | Purpose | Rules |
|----------|---------|-------|
| `validateVital(type, value, value2)` | Per-vital-type ranges | pain 0-10, hr 20-300, bp 40-300/20-200, temp 85-115, spo2 50-100, resp 4-60, sleep 0-24, weight 1-1500, glucose 10-1000 |
| `validateMedication(form)` | Med form validation | name required + maxLength 200, dose maxLength 100, notes maxLength 500 |
| `validateLab(form)` | Lab form validation | test_name required, numeric result if provided, unit maxLength 20 |
| `validateField(value, rules)` | Generic single-field | required, minLength, maxLength, min, max, pattern, patternMsg |

### 2c. Wire validation into sections

**Modify:** `src/components/sections/Vitals.jsx`
- Add `errors` state, call `validateVital()` before save, show error on Field, add range hints per type

**Modify:** `src/components/sections/Medications.jsx`
- Add `errors` state, call `validateMedication()` before save, show errors + maxLength props

**Modify:** `src/components/sections/Labs.jsx`
- Same pattern with `validateLab()`

---

## Session 3: Tool Validation + OTP Protection

### 3a. AI Tool-Use Input Validation

**Modify:** `src/services/toolExecutor.js`
- Add `validateToolInput(toolName, input)` function
- Validate: required fields, numeric ranges (delegate to `validateVital()` for vitals), date format (YYYY-MM-DD), enum values (route, status, severity, priority, category, etc.), boolean coercion
- Call before add/update operations (before line 117 for add, before line 132 for update)
- Return `{ tool_use_id, content: 'Validation error: {details}', is_error: true }` if invalid — AI can self-correct
- Reference tool schemas from `constants/tools.js`

### 3b. OTP Brute Force UI

**Modify:** `src/components/Auth.jsx`
- Add state: `attempts` (number), `cooldownUntil` (timestamp)
- Cooldown schedule: 3 fails → 30s, 5 → 120s, 7 → 300s
- Show countdown timer during cooldown ("Try again in X:XX"), disable verify button
- Persist attempts in `sessionStorage` keyed by email hash to survive accidental refresh
- Reset on successful verify or resend

---

## Session 4: Offline Indicator + Skeleton Loaders

### 4a. Offline Banner

**New file:** `src/components/ui/OfflineBanner.jsx`
- Uses `navigator.onLine` + `online`/`offline` window events
- Offline: amber banner "You're offline — changes will sync when you reconnect" with pending write count
- Back online: brief "Back online — syncing..." auto-dismisses after 3s
- Style: `bg-salve-amber/10 border-salve-amber/30` (matches existing alert patterns)

**Modify:** `src/services/cache.js` — Add `getPendingCount()` method (parse `hc:pending` localStorage)
**Modify:** `src/App.jsx` — Render `<OfflineBanner />` above main content

### 4b. Skeleton Loaders

**New file:** `src/components/ui/SkeletonCard.jsx`
- `SkeletonCard` with shimmer animation (`animate-pulse bg-salve-card2 rounded`)
- Props: `lines` (default 3), `hasTitle`, `hasAction`
- `SkeletonList({ count })` renders N skeleton cards
- Follows Card styling: `bg-salve-card rounded-xl border border-salve-border p-4`

**Modify:** `src/App.jsx` — Replace `<LoadingSpinner />` in Suspense fallbacks with `<SkeletonList count={3} />`

### 4c. Bundle Check

- Run `npx vite build`, verify Recharts is in section chunks (not vendor). Likely no changes needed since 19 sections are already lazy-loaded via `lazyWithRetry()`.

---

## Session 5: Changelog / What's New

**New file:** `src/constants/changelog.js`
- `CHANGELOG` array: `[{ version, date, title, items: string[] }]`
- `CURRENT_VERSION` string constant

**New file:** `src/components/ui/WhatsNewModal.jsx`
- Card overlay with version entries, "Got it" button
- Auto-opens when `CURRENT_VERSION !== localStorage.getItem('salve:last-seen-version')`
- Shows latest version changes, expandable older versions

**Modify:** `src/components/sections/Dashboard.jsx` — Render WhatsNewModal on mount
**Modify:** `src/components/sections/Settings.jsx` — "What's New" button with unseen dot badge

---

## Session 6: Google Sign-In

`signInWithGoogle()` already exists in `src/services/auth.js`. Auth.jsx already renders the Google button.

**Code changes:** Likely none — just Supabase/Google Cloud configuration (see "What You Must Do Separately" above).
**If needed:** Update `vercel.json` CSP `connect-src` for `accounts.google.com`.

---

## Session 7: Push Notifications [XL]

### 7a. Client Subscription

**New file:** `src/services/push.js`
- `requestPermission()` — prompts browser notification permission
- `subscribeToPush(registration)` — subscribes with VAPID public key
- `savePushSubscription(sub)` — stores endpoint + keys in Supabase
- `unsubscribeFromPush()` — removes subscription
- Uses `VITE_VAPID_PUBLIC_KEY` env var

### 7b. Database

**New file:** `supabase/migrations/023_push_subscriptions.sql`
```sql
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL,
  keys_p256dh text NOT NULL,
  keys_auth text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);
```

### 7c. Server-Side Sender

**New file:** `api/notify.js` — Vercel Cron handler
- Queries medications with `refill_date` within 3 days
- Queries appointments within 24 hours
- Queries overdue incomplete todos
- Sends Web Push via `web-push` npm package (new server-only dependency)
- Verifies `CRON_SECRET` header

**Modify:** `vercel.json` — Add cron config:
```json
"crons": [{ "path": "/api/notify", "schedule": "0 9 * * *" }]
```

**New env vars:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

### 7d. Settings UI

**Modify:** `src/components/sections/Settings.jsx`
- "Notifications" collapsible Card (follows Oura Ring pattern)
- Permission state display (granted/denied/default)
- Enable/disable toggle
- Per-category toggles: Medication refills, Appointments, Overdue todos

---

## Session 8: Med Refill Reminders

**Modify:** `src/components/sections/Dashboard.jsx`
- Enhance existing refill detection (currently context-line text) into prominent alert cards
- Show: days-until-refill, pharmacy name, medication dose
- Auto-create todo for approaching refills (deduplicate by med ID + refill date)

**Modify:** `src/components/sections/Medications.jsx`
- Refill badge on collapsed cards: "Refill in 3 days" (sage) / "Refill overdue" (rose)

Push notifications handled by Session 7 cron job querying `refill_date`.

---

## Session 9: Document Upload [XL]

### 9a. Schema

**New file:** `supabase/migrations/024_documents.sql`
```sql
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  record_type text NOT NULL,  -- 'medication', 'insurance', 'lab', 'general'
  record_id uuid,             -- nullable FK to specific record
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,    -- MIME type
  file_size int NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own documents" ON documents
  FOR ALL USING (auth.uid() = user_id);
```

Requires Supabase Storage bucket `user-documents` (10MB limit, image/pdf MIME types).

### 9b. Service

**New file:** `src/services/documents.js`
- `uploadDocument(file, recordType, recordId)` — uploads to Supabase Storage, inserts documents row
- `getDocuments(recordType, recordId)` — list documents for a record
- `deleteDocument(id)` — remove from storage + DB
- `getSignedUrl(path)` — temporary access URL (60-minute expiry)

### 9c. UI Component

**New file:** `src/components/ui/FileUpload.jsx`
- Reuses `DropZone.jsx` pattern (drag-and-drop + click-to-browse)
- Progress indicator via `onUploadProgress`
- Thumbnail preview for images, file icon for PDFs
- Delete button with ConfirmBar confirmation

### 9d. Integration Points

| Section | Feature | Button Text |
|---------|---------|-------------|
| `Medications.jsx` | Prescription photos | "Add prescription photo" |
| `Insurance.jsx` | Insurance card photos | "Upload insurance card" |
| `Labs.jsx` | Lab report PDFs | "Attach lab report" |
| `Settings.jsx` | General documents | "Upload document" |

**Also modify:**
- `src/hooks/useHealthData.js` — Add documents to data shape + loadAll
- `src/services/db.js` — Add `documents` CRUD via factory
- `src/services/storage.js` — Add documents to TABLE_MAP for export/import (URLs only, not file bytes)
- `vercel.json` — Update CSP `img-src` to include Supabase Storage domain

---

## Session 10: Provider Sharing

### 10a. Schema

**New file:** `supabase/migrations/025_share_links.sql`
```sql
CREATE TABLE share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  sections jsonb NOT NULL,  -- e.g. ["medications", "conditions", "allergies"]
  created_at timestamptz DEFAULT now()
);
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own share links" ON share_links
  FOR ALL USING (auth.uid() = user_id);
```

### 10b. API

**New file:** `api/share.js`
- **POST** (auth required): Create share link — generates crypto token, stores with TTL + selected sections
- **GET** `?token=xxx`: Validates token, checks expiry, fetches user data for selected sections, returns read-only HTML summary page (server-rendered, no auth required for viewer)

### 10c. UI

**New file:** `src/components/ui/ShareModal.jsx`
- Section checkboxes: medications, conditions, allergies, vitals, labs, immunizations, providers
- Duration selector: 24 hours, 7 days, 30 days
- Generate link → copy-to-clipboard button
- Active shares list with revoke button (deletes share_links row)

**Modify:** `src/components/sections/HealthSummary.jsx`
- Add "Share with Provider" button alongside existing Print button (desktop only)

---

## Execution Order & Dependencies

```
Session 1 (Security)         ←── DO FIRST, no deps
Session 2 (Validation)       ←── no deps, can parallel Session 1
Session 3 (Tool Val + OTP)   ←── depends on Session 2 (validate.js)
Session 4 (Offline + Skel)   ←── no deps
Session 5 (Changelog)        ←── no deps
Session 6 (Google Sign-In)   ←── config only, no deps
Session 7 (Push Notifs)      ←── no deps
Session 8 (Refill Reminders) ←── after Session 7 (uses cron)
Session 9 (Doc Upload)       ←── no deps
Session 10 (Provider Share)  ←── no deps
```

**Can parallelize:** Sessions 1+2, Sessions 4+5, Sessions 6+9

---

## New Files Summary

| File | Session | Purpose |
|------|---------|---------|
| `api/_prompts.js` | 1 | Server-side prompt allowlist |
| `src/utils/validate.js` | 2 | Form validation utilities |
| `src/components/ui/OfflineBanner.jsx` | 4 | Offline status indicator |
| `src/components/ui/SkeletonCard.jsx` | 4 | Loading skeleton components |
| `src/constants/changelog.js` | 5 | Version changelog data |
| `src/components/ui/WhatsNewModal.jsx` | 5 | What's new modal |
| `src/services/push.js` | 7 | Push notification client |
| `supabase/migrations/023_push_subscriptions.sql` | 7 | Push subscription schema |
| `api/notify.js` | 7 | Push notification cron handler |
| `src/services/documents.js` | 9 | Document upload service |
| `src/components/ui/FileUpload.jsx` | 9 | File upload component |
| `supabase/migrations/024_documents.sql` | 9 | Documents schema |
| `api/share.js` | 10 | Provider share link API |
| `src/components/ui/ShareModal.jsx` | 10 | Share link UI |
| `supabase/migrations/025_share_links.sql` | 10 | Share links schema |

## New Dependencies

| Package | Session | Scope | Purpose |
|---------|---------|-------|---------|
| `web-push` | 7 | Server-only (api/) | Web Push protocol sender |

## New Environment Variables

| Variable | Session | Where |
|----------|---------|-------|
| `VAPID_PUBLIC_KEY` | 7 | Vercel env vars |
| `VAPID_PRIVATE_KEY` | 7 | Vercel env vars |
| `VAPID_SUBJECT` | 7 | Vercel env vars |
| `VITE_VAPID_PUBLIC_KEY` | 7 | `.env.local` + Vercel |

---

## Verification Checklist

### After Each Session
- [ ] `npm run build` — no errors or new warnings
- [ ] `npm run dev` — affected sections render without crashes
- [ ] Manual test each changed feature in browser
- [ ] Check console for errors

### After All Sessions Complete
- [ ] Fresh-account walkthrough (sign up → add data → test all features)
- [ ] Offline test (airplane mode → verify banner + cached data + pending queue)
- [ ] Mobile test (375px width in DevTools, iPhone Safari, Android Chrome)
- [ ] Push notification test (grant permission → trigger `/api/notify` manually → verify notification)
- [ ] Document upload test (upload image + PDF → verify thumbnails in records → verify in export)
- [ ] Share link test (generate → open in incognito → verify data shown → test expiry)
- [ ] OTP brute force test (enter wrong code 3x → verify 30s cooldown appears)
- [ ] AI prompt injection test (try to send custom system prompt via browser DevTools → verify 400 response)
- [ ] Form validation test (enter "abc" for heart rate → verify error shown, save blocked)
