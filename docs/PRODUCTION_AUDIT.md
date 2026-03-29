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

### 1.3 No rate limiting on `/api/chat.js`

**File:** `api/chat.js`
**Issue:** Any authenticated user can call the Anthropic API proxy unlimited times. This creates:
- Cost exposure (Anthropic bills per token)
- Potential abuse vector
- No protection against accidental infinite loops in client code

**Fix options:**
- **Quick:** In-memory counter per user ID with a sliding window (resets on cold start, but catches hot abuse)
- **Robust:** Vercel KV or Upstash Redis for persistent rate counters. Recommended: 20 requests/minute per user.

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

### 2.3 `eraseAll()` has no transaction boundary

**File:** `src/services/db.js`
**Issue:** `eraseAll()` runs ~16 `DELETE FROM table` operations in parallel via `Promise.all()`. If any one fails (network drop, RLS issue), some tables are wiped while others retain data — leaving the account in an inconsistent state with no way to recover.

**Fix:** Either:
- Run deletes sequentially and stop on first error (with a "partial erase" warning), or
- Wrap in a Supabase RPC function that uses a database transaction, or
- Before erasing, auto-create a backup export so the user can recover

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

### 4.1 Lab result interpretation

**Current state:** Labs section displays values and flags but provides zero interpretation.
**Opportunity:** When a user views an abnormal lab result, offer an "Explain this result" button that sends the result + their conditions/meds to the AI for contextual interpretation. Example: "Your TSH of 4.2 mIU/L is slightly elevated. Given your hypothyroidism diagnosis and current levothyroxine dose, this may suggest a dosage adjustment is needed. Discuss with your endocrinologist."

### 4.2 Medication-allergy cross-reference

**Current state:** Allergies and medications are completely siloed. Adding a new medication never checks against known allergies.
**Opportunity:** On medication add/edit, cross-reference the substance against the allergy list. For non-exact matches (e.g., "amoxicillin" added when "penicillin" allergy exists), use AI to identify drug-class cross-reactivity risks.

### 4.3 Vitals trend analysis

**Current state:** Vitals shows a raw chart with no interpretation.
**Opportunity:** Add a "Trends" button that sends the last 20 vitals readings to AI for analysis. Example: "Your systolic blood pressure has increased from an average of 125 to 138 over the past 3 months. This upward trend, combined with your CKD diagnosis, warrants discussion with your nephrologist."

### 4.4 Immunization schedule awareness

**Current state:** Immunizations is a simple record list. No schedule tracking, no overdue detection.
**Opportunity:** AI can analyze immunization records + patient age/conditions to flag: "You received your last Tdap booster 11 years ago. CDC recommends every 10 years. Consider scheduling with your PCP." Also flag contraindications: "Your egg allergy may affect flu vaccine selection."

### 4.5 Appointment preparation

**Current state:** Appointments have a "questions to ask" text field, but no AI assistance.
**Opportunity:** Before an upcoming appointment, offer "Prepare for this visit" which generates suggested questions based on: the provider's specialty, active conditions managed by that provider, recent vitals/labs, and current medications. Example: "For your rheumatology visit on 4/15, consider asking about: your rising ESR levels, whether methotrexate dose needs adjustment, and the new joint pain noted in your 3/20 journal entry."

### 4.6 Care gap auto-detection

**Current state:** Care gaps are 100% manually entered by the user.
**Opportunity:** Based on conditions, age, gender, and last procedure/lab dates, AI can suggest standard screening gaps. Example: "Based on your age (45) and family history of colon cancer, a colonoscopy is typically recommended. No colonoscopy found in your procedures." These would be AI-suggested care gaps the user can accept or dismiss.

### 4.7 Journal pattern recognition

**Current state:** Journal entries are listed chronologically with no analysis.
**Opportunity:** AI can analyze journal entries over time to identify patterns. Example: "You've mentioned 'fatigue' in 8 of your last 12 entries. This correlates with your pain scores above 6. Consider discussing chronic fatigue management with your provider."

---

## 5. High — UX Gaps by Section

### Dashboard (`Dashboard.jsx`)

| Issue | Details |
|-------|---------|
| Abnormal labs missing from alerts | Alerts card shows anesthesia flags + interactions + care gaps, but NOT abnormal lab results. A critical high or low lab value should appear here. |
| No immunization/procedure alerts | Overdue vaccines and recent procedures with pending follow-ups should show in alerts. |
| No "Refresh insight" button | AI insight loads once on mount. If it fails or the user wants a new tip, there's no way to retry without navigating away and back. |
| Timeline limited to 3 items | Users with many upcoming events see only 3. No "View all" or expansion. |
| No trend summary | Dashboard could show "BP trending ↑" or "Pain avg: 6.2 this week" as a mini-vitals summary. |

### Medications (`Medications.jsx`)

| Issue | Details |
|-------|---------|
| No allergy cross-check | Adding a medication never checks against the user's allergy list. This is a patient-safety gap. |
| No refill reminder system | Refill dates are displayed but there's no reminder, countdown, or "due soon" urgency indicator. |
| Dose/date validation missing | `dose` field accepts any string ("banana"). `start_date` can be after `refill_date`. No numeric validation. |
| Frequency abbreviations unexplained | Dropdown shows BID, TID, PRN, QHS without tooltips explaining what they mean. |
| No interaction warning at add time | Interactions are only checked on the list view and in the standalone Interactions section. Adding a new med should immediately warn if it conflicts with existing meds. |

### Vitals (`Vitals.jsx`)

| Issue | Details |
|-------|---------|
| No reference ranges | Chart shows raw values but never displays what "normal" is. User can't tell if 138/88 is concerning. |
| No abnormal value flags | Entering BP 180/120 looks the same as 120/80. No visual urgency for dangerous values. |
| No trend interpretation | Chart exists but there's no text analysis of the trend direction. |
| Numeric validation missing | Value field accepts non-numeric input. BP form allows save with one field empty. |

### Labs (`Labs.jsx`)

| Issue | Details |
|-------|---------|
| No result interpretation | Biggest UX gap. Abnormal flags are shown but never explained. What does "high TSH" mean for __this__ user? |
| No historical comparison | Cannot compare current result to previous results for the same test. "Your hemoglobin was 11.2 last time, now 10.8 — declining" would be invaluable. |
| No file upload | Users can't attach actual lab report PDFs. The "result" is a text field. |
| Dashboard integration missing | Abnormal lab results don't appear in Dashboard alerts card. |

### Conditions (`Conditions.jsx`)

| Issue | Details |
|-------|---------|
| No status filter | User must scroll through all conditions. Should have tabs: Active / Managed / Resolved / All. |
| `linked_meds` is free text | Should be a multi-select or autocomplete from the user's medication list. Typos make links useless. |
| No status history | Changing from "active" to "remission" overwrites the previous status. No timeline of progression. |
| No provider linkage | Which provider manages this condition? Free text, not linked to Providers list. |

### Allergies (`Allergies.jsx`)

| Issue | Details |
|-------|---------|
| Not integrated with Medications | Adding a med that conflicts with a known allergy produces no warning. |
| Severe allergies not on Dashboard | A "severe — anaphylaxis" allergy should appear in the Dashboard alerts card. |
| No cross-sensitivity info | Penicillin allergy doesn't suggest documenting cephalosporin risk. |

### Appointments (`Appointments.jsx`)

| Issue | Details |
|-------|---------|
| No calendar export | No iCal/Google Calendar link. Users must manually add appointments to their phone calendar. |
| Past appointments hard-limited to 10 | No pagination or "Load more" for past visits. History is inaccessible beyond the last 10. |
| No post-visit follow-up prompts | After an appointment date passes, no prompt to "Add notes from this visit." |
| No appointment prep | AI could generate suggested questions based on provider specialty + active conditions. |

### Journal (`Journal.jsx`)

| Issue | Details |
|-------|---------|
| No search | Cannot search across journal entries for a keyword like "fatigue" or "flare." |
| No tag-based filtering | Tags are displayed as pills but clicking them does nothing. |
| Severity accepts non-numeric | Field accepts "banana" as severity. Should be constrained to 1-10 or a slider. |
| No pattern analysis | AI could identify recurring symptoms, triggers, or mood patterns over time. |

### Providers (`Providers.jsx`)

| Issue | Details |
|-------|---------|
| Portal URL not clickable | URL is displayed as plain text. Should be an `<a href>` link. |
| Phone not a `tel:` link | Phone number displayed as text. Should be `<a href="tel:...">` for tap-to-call. |
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
| No schedule tracking | No indication of which boosters are due or overdue. |
| No contraindication warnings | Doesn't cross-reference allergies (e.g., egg allergy + flu shot). |
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
| 100% manual entry | All care gaps must be manually created. AI should suggest gaps based on age, conditions, and clinical guidelines. |
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
| No AI assistance for drafting | AI could help draft appeal letters based on the diagnosis, procedure, and denial reason. |
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

### 6.1 Missing ARIA labels

**Affected files:** `Header.jsx`, `FormWrap.jsx`, `BottomNav.jsx`, all section edit/delete buttons, `Motif.jsx`

- Back button (`<ChevronLeft>`) has no `aria-label="Go back"`
- BottomNav icons have no `aria-current="page"` on active tab
- Edit/Delete icon buttons lack `aria-label="Edit [item]"` / `aria-label="Delete [item]"`
- Decorative SVG motifs lack `aria-hidden="true"`
- Send button in AIPanel lacks `aria-label="Send message"`
- Loading spinner has no `aria-live="polite"` region

### 6.2 Color-only status indication

**Affected files:** `Badge.jsx`, `ConfirmBar.jsx`, all sections using severity/urgency badges

- Severity badges (mild/moderate/severe) use only color to convey meaning
- Urgency levels in CareGaps use only color
- Interaction severity in Medications uses only color
- **WCAG 1.4.1 (Level A):** Information must not be conveyed through color alone

**Fix:** Add icons or text labels alongside color. Example: severe = red + ⚠️ icon, mild = green + ✓ icon.

### 6.3 Form labels not associated with inputs

**File:** `src/components/ui/Field.jsx`
**Issue:** `<label>` elements exist but are not linked to their inputs via `htmlFor` / `id` attributes. Screen readers cannot associate labels with form controls.

**Fix:** Generate consistent IDs in Field.jsx:
```jsx
const inputId = id || `field-${label?.toLowerCase().replace(/\s+/g, '-')}`;
```

### 6.4 No keyboard support in ConfirmBar

**File:** `src/components/ui/ConfirmBar.jsx`
**Issue:** Delete confirmation requires mouse click on "Yes, delete" / "Cancel" buttons. No `onKeyDown` handler for Enter (confirm) or Escape (cancel).

### 6.5 No semantic HTML structure

**Issue:** The app uses `<div>` for everything. Should use:
- `<nav>` for BottomNav
- `<main>` for the primary content area in App.jsx
- `<section>` for each dashboard card
- `<article>` for journal entries, chat messages
- Heading hierarchy (`<h1>` for page title, `<h2>` for section headings)

### 6.6 Chart accessibility

**Files:** `Vitals.jsx`, `Labs.jsx` (Recharts)
**Issue:** Charts are mouse-only with no keyboard navigation. Tooltips require hover. No `aria-label` on the chart container. Screen readers get nothing from the chart.

**Fix:** Add an `aria-label` describing the chart data summary. Consider a visually-hidden data table as an accessible alternative.

---

## 7. Medium — PWA & Performance

### 7.1 No service worker

**Issue:** `manifest.json` and meta tags declare PWA capabilities, but no service worker is registered. Without a service worker:
- The app cannot work offline
- Install prompts won't appear on most browsers
- No background sync capability
- No push notifications (future feature)

**Fix:** Add `vite-plugin-pwa` to auto-generate a service worker with Workbox:
```bash
npm install -D vite-plugin-pwa
```
Configuration should use:
- **Cache-first** for static assets (JS, CSS, fonts, images)
- **Network-first** for API calls (Supabase, `/api/chat`)
- **Stale-while-revalidate** for the app shell

### 7.2 No code splitting

**Issue:** All 19 section components are bundled into `main.js`. Users loading the app download code for all sections even if they only visit Dashboard.

**Fix:** Wrap section components in `React.lazy()`:
```jsx
const Labs = React.lazy(() => import('./components/sections/Labs'));
```
With `<Suspense fallback={<LoadingSpinner />}>` wrapper.

Estimated bundle reduction: ~30-40% for initial load (recharts alone is ~50KB gzipped).

### 7.3 No font preloading

**Issue:** Google Fonts are loaded via `@import` in `index.css`, which blocks rendering until the CSS is fetched and parsed. This causes a Flash of Unstyled Text (FOUT).

**Fix:** Add preload hints in `index.html`:
```html
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Montserrat:wght@300;400;500;600&display=swap" />
```

### 7.4 Missing SEO / social meta tags

**File:** `index.html`
**Missing:**
```html
<meta name="description" content="Salve — Personal health companion. Track medications, vitals, conditions, and get AI-powered health insights." />
<meta property="og:title" content="Salve — Your Health Companion" />
<meta property="og:description" content="Track your health, manage medications, and get AI-powered insights." />
<meta property="og:type" content="website" />
<meta name="robots" content="noindex, nofollow" />
```
> Note: For a personal health app, `noindex, nofollow` is recommended to prevent indexing of the auth-gated app shell.

### 7.5 Recharts loaded eagerly

**Issue:** `recharts` is imported at the top of `Vitals.jsx` and `Labs.jsx`. This ~50KB (gzipped) library loads even when the user never visits those sections.

**Fix:** Dynamic import:
```jsx
const { LineChart, Line, ... } = await import('recharts');
```
Or wrap the chart component itself in `React.lazy()`.

### 7.6 Manifest.json incomplete

**File:** `public/manifest.json`
**Missing fields:**
- `scope` (should be `/`)
- `categories` (should be `["health", "medical"]`)
- More icon sizes (64, 96, 128, 256) for better install UX across devices

---

## 8. Medium — Auth Flow

### 8.1 No session expiry handling

**Files:** `src/services/auth.js`, `src/App.jsx`
**Issue:** If the Supabase access token expires mid-session (typically 1 hour), API calls silently fail. The user sees generic errors rather than a "Session expired — please sign in again" message.

**Fix:** In `onAuthChange()`, listen for `TOKEN_REFRESHED` and `SIGNED_OUT` events. If token refresh fails, clear state and redirect to auth screen with a message.

### 8.2 OTP expiry not communicated

**File:** `src/components/Auth.jsx`
**Issue:** Supabase OTPs expire after ~10 minutes. If the user takes longer, they get a generic "Invalid code" error. Should show a countdown or "Code expires in X minutes" message.

### 8.3 Auth code exchange race condition

**File:** `src/App.jsx`
**Issue:** If the URL contains an auth code parameter AND `getSession()` returns a stale session, both paths fire state updates. The second update could overwrite the first.

**Fix:** Process code exchange first, and only fall back to `getSession()` if no code is present. This is likely already the intent but should be explicit with early returns.

---

## 9. Low — Component Inconsistencies

### 9.1 z-index collision

**Files:** `BottomNav.jsx` (`z-50`), `ConfirmBar.jsx` (`z-50`)
**Fix:** ConfirmBar should use `z-40`.

### 9.2 Field.jsx has no error state

**File:** `src/components/ui/Field.jsx`
**Issue:** No `error` / `errorMessage` prop. Every section re-implements inline error display with its own styling.
**Fix:** Add `error` prop to Field that shows a red message below the input.

### 9.3 ErrorBoundary only catches render errors

**File:** `src/components/ui/ErrorBoundary.jsx`
**Issue:** React Error Boundaries don't catch errors in event handlers, async code, or `useEffect`. Data loading errors in `useHealthData` won't be caught.
**Fix:** Add a global `window.addEventListener('unhandledrejection', ...)` handler that triggers a user-visible error toast.

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

### Phase 2 — High-Impact UX (first sprint post-launch)
8. [ ] Add abnormal labs to Dashboard alerts card (§5 Dashboard)
9. [ ] Add allergy cross-check on medication add/edit (§5 Medications)
10. [ ] Add AI lab interpretation button (§4.1)
11. [ ] Add reference ranges and abnormal flags to Vitals (§5 Vitals)
12. [ ] Add status filter tabs to Conditions (§5 Conditions)
13. [ ] Make Provider phone/portal clickable links (§5 Providers)
14. [ ] Add rate limiting to `/api/chat.js` (§1.3)
15. [ ] Fix form validation: numeric vitals, date ranges, severity constraints (§5 Vitals, Journal)

### Phase 3 — AI Expansion (second sprint)
16. [ ] AI vitals trend analysis (§4.3)
17. [ ] AI appointment preparation (§4.5)
18. [ ] AI care gap auto-detection (§4.6)
19. [ ] AI journal pattern recognition (§4.7)
20. [ ] AI immunization schedule awareness (§4.4)
21. [ ] AI appeal letter drafting (§5 Appeals)
22. [ ] Medication-allergy AI cross-reactivity check (§4.2)

### Phase 4 — Polish & Accessibility
23. [ ] Add ARIA labels to all interactive elements (§6.1)
24. [ ] Fix color-only status indication with icons (§6.2)
25. [ ] Link form labels to inputs in Field.jsx (§6.3)
26. [ ] Add keyboard support to ConfirmBar (§6.4)
27. [ ] Semantic HTML structure (§6.5)
28. [ ] Chart accessibility (§6.6)

### Phase 5 — Performance & PWA
29. [ ] Add service worker via `vite-plugin-pwa` (§7.1)
30. [ ] Code splitting with `React.lazy()` (§7.2)
31. [ ] Font preloading (§7.3)
32. [ ] Add meta tags (§7.4)
33. [ ] Lazy-load recharts (§7.5)
34. [ ] Complete manifest.json (§7.6)

### Phase 6 — Remaining
35. [ ] Session expiry handling (§8.1)
36. [ ] OTP expiry indicator (§8.2)
37. [ ] Fix z-index collision (§9.1)
38. [ ] Add error prop to Field.jsx (§9.2)
39. [ ] Global unhandled rejection handler (§9.3)
40. [x] Update CLAUDE.md to match reality (§9.4) — ✅ 2026-03-29
