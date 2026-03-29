# Salve — Production Readiness Audit

> **Date:** 2026-03-29
> **Scope:** Full codebase audit — security, data integrity, AI utilization, UX, accessibility, PWA, performance, build/deploy
> **Status:** Findings documented. Prioritized by severity for implementation.

---

## Table of Contents

1. [Critical — Security](#1-critical--security)
2. [Critical — Data Integrity](#2-critical--data-integrity)
3. [Critical — AI Profile Incomplete](#3-critical--ai-profile-incomplete)
4. [High — AI/API Underutilization](#4-high--aiapi-underutilization)
5. [High — UX Gaps by Section](#5-high--ux-gaps-by-section)
6. [High — Accessibility](#6-high--accessibility)
7. [Medium — PWA & Performance](#7-medium--pwa--performance)
8. [Medium — Auth Flow](#8-medium--auth-flow)
9. [Low — Component Inconsistencies](#9-low--component-inconsistencies)
10. [Implementation Priority](#10-implementation-priority)

---

## 1. Critical — Security

These must be fixed before any production deployment.

### 1.1 CSP allows `'unsafe-inline'` and `'unsafe-eval'` in `script-src`

**File:** `vercel.json` (line 16)
**Issue:** The Content-Security-Policy header currently includes:
```
script-src 'self' 'unsafe-inline' 'unsafe-eval'
```
This completely defeats XSS protection. Any injected script will execute.

**Fix:** Remove both directives:
```
script-src 'self'
```
> Note: Vite's production build does not require `unsafe-inline` or `unsafe-eval`. If Tailwind's runtime requires inline styles, `style-src 'unsafe-inline'` is acceptable but `script-src` must never allow it.

### 1.2 CSP `connect-src` allows direct Anthropic access

**File:** `vercel.json` (line 16)
**Issue:** `connect-src` includes `https://api.anthropic.com`, but all Anthropic calls are proxied through `/api/chat.js`. The client should never connect directly to Anthropic.

**Fix:** Remove `https://api.anthropic.com` from `connect-src`:
```
connect-src 'self' https://*.supabase.co wss://*.supabase.co
```

### 1.3 No rate limiting on `/api/chat.js` — ✅ FIXED 2026-03-29

**File:** `api/chat.js`
**Issue:** Any authenticated user can call the Anthropic API proxy unlimited times. This creates:
- Cost exposure (Anthropic bills per token)
- Potential abuse vector
- No protection against accidental infinite loops in client code

**Fix applied:** In-memory sliding window rate limiter — 20 requests/minute per user ID. Extracts user ID from the Supabase auth verification response. Returns HTTP 429 when exceeded. Stale buckets auto-cleaned every 5 minutes.

### 1.4 Missing `Permissions-Policy` header

**File:** `vercel.json`
**Issue:** No `Permissions-Policy` header restricts browser features. A health app should explicitly deny access to camera, microphone, geolocation, and payment APIs unless needed.

**Fix:** Add to headers array:
```json
{ "key": "Permissions-Policy", "value": "geolocation=(), microphone=(), camera=(), payment=()" }
```

### 1.5 CSP missing `form-action` and `worker-src`

**File:** `vercel.json`
**Issue:** No `form-action` directive (form submissions could be hijacked). No `worker-src` directive (if service worker is added later, CSP would block it without this).

**Fix:** Add to CSP value:
```
form-action 'self'; worker-src 'self'; manifest-src 'self'
```

---

## 2. Critical — Data Integrity

### 2.1 `setupOfflineSync()` is defined but never called

**File:** `src/services/cache.js` (line 88) — function defined
**Not called in:** `src/App.jsx`, `src/hooks/useHealthData.js`, or anywhere else

**Issue:** The offline write queue (`hc:pending`) accumulates operations when the user is offline, but `setupOfflineSync()` is never initialized. Pending writes are queued to localStorage but **never flushed back to Supabase** when connectivity returns. Users who make changes offline will lose them permanently.

**Fix:** Call `setupOfflineSync(flushCallback)` in `App.jsx` on mount, passing a callback that processes each pending operation through `db.js`. Clean up the listener on unmount.

### 2.2 Optimistic state updates without rollback

**File:** `src/hooks/useHealthData.js`
**Issue:** CRUD operations update React state **before** the Supabase response arrives. If the insert/update fails (network error, RLS violation, constraint error), the UI shows phantom records that don't exist in the database. Subsequent operations on these phantom records will fail silently.

**Fix:** Move state updates to after the Supabase promise resolves. For perceived performance, show a brief loading indicator on the affected card rather than optimistically inserting.

### 2.3 `eraseAll()` has no transaction boundary — ✅ FIXED 2026-03-29

**File:** `src/services/db.js`
**Issue:** `eraseAll()` runs ~16 `DELETE FROM table` operations in parallel via `Promise.all()`. If any one fails (network drop, RLS issue), some tables are wiped while others retain data — leaving the account in an inconsistent state with no way to recover.

**Fix applied:** Replaced parallel `Promise.all()` with sequential per-table deletes. Each table delete is individually try/caught. On partial failure, throws a descriptive error listing which tables failed instead of silently leaving inconsistent state.

### 2.4 `importRestore()` erase-then-insert is non-atomic

**File:** `src/services/storage.js`
**Issue:** `importRestore()` calls `eraseAll()` first, then bulk-inserts from the import file. If the insert fails midway (malformed record, network loss, quota exceeded), the user's data is already gone.

**Fix:** Before `eraseAll()`, silently create an in-memory backup of the current state. If the import fails, re-insert the backup. Alternatively, run via Supabase RPC with transaction semantics.

---

## 3. Critical — AI Profile Incomplete

### 3.1 `buildProfile()` missing 7 data sections

**File:** `src/services/profile.js`

**Currently included (7):**
- Active medications
- Discontinued medications
- Conditions & diagnoses
- Allergies
- Recent vitals (last 10)
- Recent journal entries (last 5)
- Insurance + health background

**Missing entirely (7):**
- Labs (especially abnormal flags — critical for AI reasoning)
- Procedures (recent surgeries affect treatment decisions)
- Immunizations (vaccination status affects recommendations)
- Care gaps (AI should know what screenings are overdue)
- Anesthesia flags (safety-critical for surgical AI advice)
- Appeals (insurance context for coverage recommendations)
- Surgical planning (pre/post-op context)

**Impact:** The AI only sees half the user's health data. Recommendations about labs, procedures, vaccines, and surgical planning are made without context. This is the single biggest AI improvement opportunity.

**Fix:** Append formatted sections for each missing data type to `buildProfile()`, following the same pattern as existing sections:
```js
// Labs (abnormal flagged)
const labs = data.labs || [];
if (labs.length) {
  p += '\n— LAB RESULTS —\n';
  const abnormal = labs.filter(l => l.flag && l.flag !== 'normal');
  if (abnormal.length) {
    p += 'ABNORMAL:\n';
    abnormal.forEach(l => { /* format */ });
  }
  // last 5 normal
}
// ... repeat for procedures, immunizations, care_gaps, anesthesia_flags, surgical_planning, appeals
```

---

## 4. High — AI/API Underutilization

The AI proxy currently powers 5 features: dashboard insight, health connections, news, resources, and chat. These are the biggest opportunities for deeper AI integration:

### 4.1 Lab result interpretation — ✅ FIXED 2026-03-29

**Current state:** Labs section displays values and flags but provides zero interpretation.
**Fix applied:** AI "Explain this result" button on abnormal labs sends result + patient profile for contextual interpretation via `/api/chat` proxy.

### 4.2 Medication-allergy cross-reference — ✅ FIXED 2026-03-29

**Current state:** Basic string-matching allergy warnings added in Phase 2.
**Fix applied:** Added AI cross-reactivity check button in medication form. When a med name doesn't exact-match an allergy but allergies exist, user can click "Check AI cross-reactivity" to analyze drug-class relationships (e.g., penicillin→cephalosporin). Uses dedicated `crossReactivity` prompt via `/api/chat` proxy.

### 4.3 Vitals trend analysis — ✅ FIXED 2026-03-29

**Current state:** Vitals shows a raw chart with no interpretation.
**Fix applied:** Added "Analyze Trends with AI" button below the vitals chart. Sends last 20 vitals readings to AI for trend analysis. Requires ≥3 entries and AI consent. Results displayed in expandable card.

### 4.4 Immunization schedule awareness — ✅ FIXED 2026-03-29

**Current state:** Immunizations is a simple record list. No schedule tracking, no overdue detection.
**Fix applied:** Added "Review Schedule with AI" button in Immunizations section. AI analyzes immunization records + patient conditions/allergies against CDC/ACIP schedules. Flags overdue boosters, condition-specific recommendations, and allergy contraindications.

### 4.5 Appointment preparation — ✅ FIXED 2026-03-29

**Current state:** Appointments have a "questions to ask" text field, but no AI assistance.
**Fix applied:** Added "Prepare" button on each upcoming appointment card. AI generates 4-6 personalized questions based on provider specialty, active conditions, recent vitals/labs, current medications, and journal entries. Includes preparation tips.

### 4.6 Care gap auto-detection — ✅ FIXED 2026-03-29

**Current state:** Care gaps are 100% manually entered by the user.
**Fix applied:** Added "Suggest Care Gaps with AI" button in CareGaps section. AI analyzes patient profile (conditions, medications, procedures, immunizations, existing gaps) against clinical guidelines (USPSTF, CDC) to suggest 3-6 missing preventive screenings. Does not duplicate existing gaps.

### 4.7 Journal pattern recognition — ✅ FIXED 2026-03-29

**Current state:** Journal entries are listed chronologically with no analysis.
**Fix applied:** Added "Analyze Patterns with AI" button in Journal section. Sends last 30 entries to AI for pattern analysis: recurring symptoms, mood-severity correlations, trigger identification, and actionable insights. Requires ≥3 entries and AI consent.

---

## 5. High — UX Gaps by Section

### Dashboard (`Dashboard.jsx`)

| Issue | Details |
|-------|---------|
| ~~Abnormal labs missing from alerts~~ | ✅ FIXED 2026-03-29 — Abnormal labs now appear in Dashboard alerts card with count and link to Labs section. |
| No immunization/procedure alerts | Overdue vaccines and recent procedures with pending follow-ups should show in alerts. |
| No "Refresh insight" button | AI insight loads once on mount. If it fails or the user wants a new tip, there's no way to retry without navigating away and back. |
| Timeline limited to 3 items | Users with many upcoming events see only 3. No "View all" or expansion. |
| No trend summary | Dashboard could show "BP trending ↑" or "Pain avg: 6.2 this week" as a mini-vitals summary. |

### Medications (`Medications.jsx`)

| Issue | Details |
|-------|---------|
| ~~No allergy cross-check~~ | ✅ FIXED 2026-03-29 — Medication form now shows allergy warnings when med name matches a known allergy substance. |
| No refill reminder system | Refill dates are displayed but there's no reminder, countdown, or "due soon" urgency indicator. |
| Dose/date validation missing | `dose` field accepts any string ("banana"). `start_date` can be after `refill_date`. No numeric validation. |
| Frequency abbreviations unexplained | Dropdown shows BID, TID, PRN, QHS without tooltips explaining what they mean. |
| No interaction warning at add time | Interactions are only checked on the list view and in the standalone Interactions section. Adding a new med should immediately warn if it conflicts with existing meds. |

### Vitals (`Vitals.jsx`)

| Issue | Details |
|-------|---------|
| ~~No reference ranges~~ | ✅ FIXED 2026-03-29 — Charts now show reference range lines; normal range displayed below chart. |
| ~~No abnormal value flags~~ | ✅ FIXED 2026-03-29 — Entries show colored flag indicators (High/Low/Critical) with border accents for abnormal values. |
| ~~No trend interpretation~~ | ✅ FIXED 2026-03-29 — AI "Analyze Trends" button sends last 20 vitals for AI trend analysis. |
| ~~Numeric validation missing~~ | ✅ FIXED 2026-03-29 — Save requires valid numeric values; BP form validates both systolic and diastolic. |

### Labs (`Labs.jsx`)

| Issue | Details |
|-------|---------|
| ~~No result interpretation~~ | ✅ FIXED 2026-03-29 — AI "Explain this result" button on abnormal labs sends result + patient profile for contextual interpretation. |
| No historical comparison | Cannot compare current result to previous results for the same test. "Your hemoglobin was 11.2 last time, now 10.8 — declining" would be invaluable. |
| No file upload | Users can't attach actual lab report PDFs. The "result" is a text field. |
| ~~Dashboard integration missing~~ | ✅ FIXED 2026-03-29 — Abnormal labs now appear in Dashboard alerts card. |

### Conditions (`Conditions.jsx`)

| Issue | Details |
|-------|---------|
| ~~No status filter~~ | ✅ FIXED 2026-03-29 — Filter tabs added: All / Active / Managed / Remission / Resolved. |
| `linked_meds` is free text | Should be a multi-select or autocomplete from the user's medication list. Typos make links useless. |
| No status history | Changing from "active" to "remission" overwrites the previous status. No timeline of progression. |
| No provider linkage | Which provider manages this condition? Free text, not linked to Providers list. |

### Allergies (`Allergies.jsx`)

| Issue | Details |
|-------|---------|
| ~~Not integrated with Medications~~ | ✅ FIXED 2026-03-29 — Medication form now cross-checks allergy list and shows warnings. |
| Severe allergies not on Dashboard | A "severe — anaphylaxis" allergy should appear in the Dashboard alerts card. |
| No cross-sensitivity info | Penicillin allergy doesn't suggest documenting cephalosporin risk. |

### Appointments (`Appointments.jsx`)

| Issue | Details |
|-------|---------|
| No calendar export | No iCal/Google Calendar link. Users must manually add appointments to their phone calendar. |
| Past appointments hard-limited to 10 | No pagination or "Load more" for past visits. History is inaccessible beyond the last 10. |
| No post-visit follow-up prompts | After an appointment date passes, no prompt to "Add notes from this visit." |
| ~~No appointment prep~~ | ✅ FIXED 2026-03-29 — AI "Prepare" button generates personalized questions based on provider, conditions, recent vitals/labs, and journal. |

### Journal (`Journal.jsx`)

| Issue | Details |
|-------|---------|
| No search | Cannot search across journal entries for a keyword like "fatigue" or "flare." |
| No tag-based filtering | Tags are displayed as pills but clicking them does nothing. |
| Severity accepts non-numeric | Field accepts "banana" as severity. Should be constrained to 1-10 or a slider. |
| ~~No pattern analysis~~ | ✅ FIXED 2026-03-29 — AI "Analyze Patterns" button identifies recurring symptoms, triggers, and mood patterns across entries. |

### Providers (`Providers.jsx`)

| Issue | Details |
|-------|---------|
| ~~Portal URL not clickable~~ | ✅ FIXED 2026-03-29 — Portal URL now renders as clickable link opening in new tab. |
| ~~Phone not a `tel:` link~~ | ✅ FIXED 2026-03-29 — Phone number now renders as `tel:` link for tap-to-call. |
| No linked conditions | No indication of which conditions each provider manages. |
| No sorting | Providers are in insertion order. No alphabetical, specialty, or "recently visited" sort. |

### AIPanel (`AIPanel.jsx`)

| Issue | Details |
|-------|---------|
| Chat doesn't auto-scroll | New messages appear below the fold. User must manually scroll down. |
| No conversation persistence | Refreshing the page loses the entire chat history (conversations save to DB but don't reload on mount). |
| No suggested follow-ups | After an AI response, no suggested next questions appear. |
| News/Resources show plain text | Web search results display as plain text paragraphs. Should show structured results with clickable source links. |

### Immunizations (`Immunizations.jsx`)

| Issue | Details |
|-------|---------|
| ~~No schedule tracking~~ | ✅ FIXED 2026-03-29 — AI "Review Schedule" button analyzes immunization records against CDC/ACIP schedules for overdue boosters. |
| ~~No contraindication warnings~~ | ✅ FIXED 2026-03-29 — AI schedule review cross-references allergies with vaccine contraindications. |
| No adverse reaction tracking | No way to record a reaction to a vaccine separately from notes. |

### Procedures (`Procedures.jsx`)

| Issue | Details |
|-------|---------|
| No pre/post-op checklists | No structured way to track preparation steps or recovery milestones. |
| No recovery tracking | No post-procedure pain scale, activity restrictions, or follow-up tracking. |
| No linked labs/imaging | Cannot associate pre-op labs or post-op imaging with a procedure. |

### CareGaps (`CareGaps.jsx`)

| Issue | Details |
|-------|---------|
| ~~100% manual entry~~ | ✅ FIXED 2026-03-29 — AI "Suggest Care Gaps" button analyzes profile against clinical guidelines to suggest missing screenings. |
| No linked follow-up actions | Cannot create an appointment reminder directly from a care gap. |

### Insurance (`Insurance.jsx`)

| Issue | Details |
|-------|---------|
| No claims tracking | Users can't record individual claims, EOBs, or out-of-pocket spending. |

### SurgicalPlanning (`SurgicalPlanning.jsx`)

| Issue | Details |
|-------|---------|
| No medication adjustment tracking | Surgery often requires stopping/adjusting meds. No integration with medication list. |

### AnesthesiaFlags (`AnesthesiaFlags.jsx`)

| Issue | Details |
|-------|---------|
| Working as intended | Properly integrated with Dashboard alerts. No critical gaps. |

### Appeals (`Appeals.jsx`)

| Issue | Details |
|-------|---------|
| ~~No AI assistance for drafting~~ | ✅ FIXED 2026-03-29 — AI "Draft Appeal Letter" button generates professional appeal letters using patient health profile and appeal details. |
| No deadline tracking | Appeals have deadlines. No urgency/countdown display. |

### Interactions (`Interactions.jsx`)

| Issue | Details |
|-------|---------|
| Static database only | Client-side interaction database covers common combos but can't detect novel interactions. |
| Exact name matching only | If med name doesn't exactly match the database key, the interaction is silently missed. |

### Settings (`Settings.jsx`)

| Issue | Details |
|-------|---------|
| Working well overall | Profile fields save on change. Import/export functional. AI consent revocable. |
| Consider adding: data usage stats | Show how much data is stored (record counts per section). |

---

## 6. High — Accessibility

### 6.1 Missing ARIA labels — ✅ FIXED 2026-03-29

**Affected files:** `Header.jsx`, `FormWrap.jsx`, `BottomNav.jsx`, all section edit/delete buttons, `Motif.jsx`

- [x] Back button (`<ChevronLeft>`) — added `aria-label="Go back"` to Header.jsx and FormWrap.jsx
- [x] BottomNav icons — added `aria-current="page"` on active tab + `aria-label` on every tab button
- [x] Edit/Delete icon buttons — added `aria-label="Edit [item type]"` / `aria-label="Delete [item type]"` to all 15 section files (27 buttons total)
- [x] Decorative motifs — added `aria-hidden="true"` to Motif.jsx
- [x] Send button in AIPanel — added `aria-label="Send message"`
- [x] Loading spinner — added `role="status"` + `aria-live="polite"` region + `sr-only` fallback text

### 6.2 Color-only status indication — ✅ FIXED 2026-03-29

**Affected files:** `Badge.jsx`, `ConfirmBar.jsx`, all sections using severity/urgency badges

- Severity badges (mild/moderate/severe) now include icon prefixes: ✓ Mild, ◆ Moderate, ⚠ Severe
- Urgency levels in CareGaps now include icon prefixes: ⚠ Urgent, ◆ Needs Prompt Attention, ↗ Next Appointment, ✓ Completed, · Routine
- Condition status badges now include icon prefixes: ⚠ Active, ✓ Managed, ✦ Remission, ✓ Resolved
- Lab flag badges now include icon prefixes: ✓ Normal, ⚠ Abnormal/High/Low, ◆ Mild Abnormal, ✓ Completed
- Interaction severity in SevBadge already had icon prefixes: ✦ Critical, ✧ Caution, · Info
- **WCAG 1.4.1 (Level A):** Information is no longer conveyed through color alone

### 6.3 Form labels not associated with inputs — ✅ FIXED 2026-03-29

**File:** `src/components/ui/Field.jsx`
**Issue:** `<label>` elements exist but are not linked to their inputs via `htmlFor` / `id` attributes. Screen readers cannot associate labels with form controls.

**Fix applied:** Field.jsx now auto-generates `id` from label text (`field-{label-slug}`) and links `<label htmlFor={id}>` to input/select/textarea. Also accepts optional `id` prop for override.

### 6.4 No keyboard support in ConfirmBar — ✅ FIXED 2026-03-29

**File:** `src/components/ui/ConfirmBar.jsx`
**Issue:** Delete confirmation requires mouse click on "Yes, delete" / "Cancel" buttons. No `onKeyDown` handler for Enter (confirm) or Escape (cancel).

**Fix applied:** Added `role="alertdialog"`, `aria-label`, and `onKeyDown` handler (Escape → cancel, Enter → confirm) to the ConfirmBar container.

### 6.5 No semantic HTML structure — ✅ FIXED 2026-03-29

**Issue:** The app uses `<div>` for everything. Should use:
- [x] `<nav>` for BottomNav — BottomNav.jsx now uses `<nav aria-label="Main navigation">`
- [x] `<main>` for the primary content area in App.jsx — content div changed to `<main>`
- [x] `<header>` for Header — Header.jsx now uses `<header>` element
- [x] `<section>` for each dashboard card — Dashboard.jsx greeting, alerts, insight, timeline, journal, and quick access sections now use `<section>` with `aria-label`
- [x] `<article>` for chat messages — AIPanel.jsx chat messages now use `<article>` elements
- [ ] Heading hierarchy (`<h1>` for page title, `<h2>` for section headings) — already correct

### 6.6 Chart accessibility — ✅ FIXED 2026-03-29

**Files:** `Vitals.jsx` (Recharts)
**Issue:** Charts are mouse-only with no keyboard navigation. Tooltips require hover. No `aria-label` on the chart container. Screen readers get nothing from the chart.

**Fix applied:** Added `role="img"` with descriptive `aria-label` on chart container (includes vital type, reading count, and date range). Added a visually-hidden (`sr-only`) data table as an accessible alternative for screen readers, containing all chart data points.

---

## 7. Medium — PWA & Performance

### 7.1 No service worker — ✅ FIXED 2026-03-29

**Issue:** `manifest.json` and meta tags declare PWA capabilities, but no service worker is registered. Without a service worker:
- The app cannot work offline
- Install prompts won't appear on most browsers
- No background sync capability
- No push notifications (future feature)

**Fix applied:** Added `vite-plugin-pwa` with Workbox. Cache-first for static assets and Google Fonts (1-year TTL). Network-first for Supabase API calls (10s timeout, 5-min cache). NetworkOnly for `/api/*` (AI proxy — never cached). Service worker auto-registers and updates in production build (`dist/sw.js`).

### 7.2 No code splitting — ✅ FIXED 2026-03-29

**Issue:** All 19 section components were bundled into `main.js`.

**Fix applied:** All 19 section components wrapped in `React.lazy()` with `<Suspense fallback={<LoadingSpinner />}>`. Initial JS bundle reduced from ~1MB+ to the core shell + data hooks. Each section only loads when first visited. Recharts (401 kB) is now in the Vitals chunk and not loaded on app start.

### 7.3 No font preloading — ✅ FIXED 2026-03-29

**Fix applied:** Added `<link rel="preload" as="style">` hint for Google Fonts stylesheet in `index.html`. This begins fetching the CSS in parallel with page parse rather than waiting for `index.css` import.

### 7.4 Missing SEO / social meta tags — ✅ FIXED 2026-03-29

**Fix applied:** Added `description`, `og:title`, `og:description`, `og:type`, and `robots: noindex, nofollow` to `index.html`.

### 7.5 Recharts loaded eagerly — ✅ FIXED 2026-03-29

**Fix applied:** `Vitals.jsx` is now lazy-loaded (code splitting §7.2). Recharts (401 kB gzipped chunk) only loads when the user first navigates to the Vitals tab.

### 7.6 Manifest.json incomplete — ✅ FIXED 2026-03-29

**Fix applied:** Added `scope: "/"`, `categories: ["health", "medical"]`, and updated `description` to remove personal name.

---

## 8. Medium — Auth Flow

### 8.1 No session expiry handling — ✅ FIXED 2026-03-29

**Fix applied:** `onAuthChange()` in `auth.js` now passes `(event, session)` to its callback. `App.jsx` listens for `SIGNED_OUT` and `TOKEN_REFRESHED` events — when session is null after either, sets `sessionExpired` state. `Auth.jsx` accepts `sessionExpired` prop and displays a rose-tinted "Your session expired. Please sign in again." banner above the sign-in form.

### 8.2 OTP expiry not communicated — ✅ FIXED 2026-03-29

**Fix applied:** `Auth.jsx` now starts a 600-second countdown when a code is sent. Displays "Code expires in X:XX" below the email address. Text turns rose/red when ≤60 seconds remain. Shows "Code expired — please request a new one" when timer hits zero. Timer resets on resend.

### 8.3 Auth code exchange race condition

**File:** `src/App.jsx`
**Issue:** If the URL contains an auth code parameter AND `getSession()` returns a stale session, both paths fire state updates. The second update could overwrite the first.

**Fix:** Process code exchange first, and only fall back to `getSession()` if no code is present. This is likely already the intent but should be explicit with early returns.

---

## 9. Low — Component Inconsistencies

### 9.1 z-index collision — ✅ FIXED 2026-03-29

**Fix applied:** ConfirmBar's confirmation bar raised from `z-50` to `z-[60]`, ensuring it always renders above the BottomNav (`z-50`). The backdrop overlay remains at `z-40`.

### 9.2 Field.jsx has no error state — ✅ FIXED 2026-03-29

**Fix applied:** Added `error` prop to `Field`. When provided, the input border turns rose (`border-salve-rose`) and a red error message appears below the input. Sections can now use `<Field error="Please enter a valid number" />` instead of reimplementing error displays.

### 9.3 ErrorBoundary only catches render errors — ✅ FIXED 2026-03-29

**Fix applied:** Added `window.addEventListener('unhandledrejection', handler)` in `App.jsx` on mount. Logs unhandled promise rejections with `console.error` for observability. Cleans up listener on unmount.

### 9.4 CLAUDE.md CSP documentation is outdated — ✅ FIXED 2026-03-29

**File:** `CLAUDE.md`
**Issue:** The CSP section in CLAUDE.md didn't match `vercel.json`. Both have been updated to reflect the hardened CSP (no `unsafe-inline`/`unsafe-eval` in `script-src`, no direct Anthropic in `connect-src`, `form-action`/`worker-src`/`manifest-src` added, `Permissions-Policy` header added).

---

## 10. Implementation Priority

### Phase 1 — Ship Blockers (fix before production) ✅ COMPLETED 2026-03-29
1. [x] Fix CSP: remove `unsafe-inline`/`unsafe-eval` from `script-src`, remove Anthropic from `connect-src` (§1.1, §1.2)
2. [x] Add `Permissions-Policy` header (§1.4)
3. [x] Add `form-action`, `worker-src`, `manifest-src` to CSP (§1.5)
4. [x] Wire up `setupOfflineSync()` in `App.jsx` (§2.1)
5. [x] Fix optimistic updates — update state after Supabase confirms (§2.2)
6. [x] Add pre-erase backup to `importRestore()` (§2.4)
7. [x] Complete `buildProfile()` with all 7 missing sections (§3.1)
8. [x] Make `eraseAll()` sequential with error handling (§2.3) — ✅ 2026-03-29

### Phase 2 — High-Impact UX (first sprint post-launch) ✅ COMPLETED 2026-03-29
8. [x] Add abnormal labs to Dashboard alerts card (§5 Dashboard) — ✅ 2026-03-29
9. [x] Add allergy cross-check on medication add/edit (§5 Medications) — ✅ 2026-03-29
10. [x] Add AI lab interpretation button (§4.1) — ✅ 2026-03-29
11. [x] Add reference ranges and abnormal flags to Vitals (§5 Vitals) — ✅ 2026-03-29
12. [x] Add status filter tabs to Conditions (§5 Conditions) — ✅ 2026-03-29
13. [x] Make Provider phone/portal clickable links (§5 Providers) — ✅ 2026-03-29
14. [x] Add rate limiting to `/api/chat.js` (§1.3) — ✅ 2026-03-29
15. [x] Fix form validation: numeric vitals, date ranges, severity constraints (§5 Vitals, Journal) — ✅ 2026-03-29

### Phase 3 — AI Expansion (second sprint) ✅ COMPLETED 2026-03-29
16. [x] AI vitals trend analysis (§4.3) — ✅ 2026-03-29
17. [x] AI appointment preparation (§4.5) — ✅ 2026-03-29
18. [x] AI care gap auto-detection (§4.6) — ✅ 2026-03-29
19. [x] AI journal pattern recognition (§4.7) — ✅ 2026-03-29
20. [x] AI immunization schedule awareness (§4.4) — ✅ 2026-03-29
21. [x] AI appeal letter drafting (§5 Appeals) — ✅ 2026-03-29
22. [x] Medication-allergy AI cross-reactivity check (§4.2) — ✅ 2026-03-29

### Phase 4 — Polish & Accessibility ✅ COMPLETED 2026-03-29
23. [x] Add ARIA labels to all interactive elements (§6.1) — ✅ 2026-03-29 (all 27 icon-only buttons across 15 section files + AIPanel send button)
24. [x] Fix color-only status indication with icons (§6.2) — ✅ 2026-03-29 (icon prefixes on severity/urgency/status/flag badges)
25. [x] Link form labels to inputs in Field.jsx (§6.3) — ✅ 2026-03-29
26. [x] Add keyboard support to ConfirmBar (§6.4) — ✅ 2026-03-29
27. [x] Semantic HTML structure (§6.5) — ✅ 2026-03-29 (Dashboard `<section>` elements, AIPanel `<article>` for chat messages)
28. [x] Chart accessibility (§6.6) — ✅ 2026-03-29 (aria-label + sr-only data table on Vitals chart)

### Phase 5 — Performance & PWA ✅ COMPLETED 2026-03-29
29. [x] Add service worker via `vite-plugin-pwa` (§7.1) — ✅ 2026-03-29
30. [x] Code splitting with `React.lazy()` (§7.2) — ✅ 2026-03-29
31. [x] Font preloading (§7.3) — ✅ 2026-03-29
32. [x] Add meta tags (§7.4) — ✅ 2026-03-29
33. [x] Lazy-load recharts via code splitting (§7.5) — ✅ 2026-03-29
34. [x] Complete manifest.json (§7.6) — ✅ 2026-03-29

### Phase 6 — Remaining ✅ COMPLETED 2026-03-29
35. [x] Session expiry handling (§8.1) — ✅ 2026-03-29
36. [x] OTP expiry indicator (§8.2) — ✅ 2026-03-29
37. [x] Fix z-index collision (§9.1) — ✅ 2026-03-29
38. [x] Add error prop to Field.jsx (§9.2) — ✅ 2026-03-29
39. [x] Global unhandled rejection handler (§9.3) — ✅ 2026-03-29
40. [x] Update CLAUDE.md to match reality (§9.4) — ✅ 2026-03-29
