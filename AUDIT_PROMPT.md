# Salve App — Deep Audit Prompt

> **Usage:** Give this entire file to Claude as a prompt. It will perform a comprehensive audit of the Salve health app and output its findings to `AUDIT_PLAN.md` in the repo root.

---

## Prompt

You are performing a **comprehensive audit** of the Salve health companion app. Read `CLAUDE.md` first for full project context, then systematically analyze every file in the codebase. Your job is to find every bug, gap, inconsistency, UX problem, performance issue, and missed best practice — then produce a prioritized action plan.

**Output your findings to `/AUDIT_PLAN.md`** in the repo root. This file will be read by future Claude agents to know exactly what to fix. Be specific — include file paths, line numbers, and concrete fix descriptions. No vague suggestions.

---

### 1. CRITICAL — Data Integrity & Safety

These could cause data loss, incorrect medical information, or security issues:

- [ ] **Profile builder completeness:** Read `src/services/profile.js` and `src/services/db.js`. Verify that `buildProfile()` references every single key returned by `db.loadAll()`. List any table or field that is loaded but not included in the AI profile. This is safety-critical — missing data could mean the AI misses a drug interaction or allergy.
- [ ] **Import/export round-trip:** Read `src/services/storage.js`. Trace `exportAll()` → `validateImport()` → `importRestore()`/`importMerge()`. Verify every table in `TABLE_MAP` is exported AND can be imported back. Check if any fields are silently dropped during `stripMeta()`. Verify `normalizeImportData()` handles all 15 data tables for every supported format (Salve v1, MCP sync, MCP sync comprehensive, legacy v2, legacy v3).
- [ ] **Apple Health parser:** Read `src/services/appleHealth.js`. Check for edge cases: empty ZIP files, XML with no records, malformed dates, NaN values after unit conversion, sleep sessions spanning midnight, BP readings without a paired systolic/diastolic. Verify the deduplication logic doesn't silently drop the wrong reading.
- [ ] **Erase all data:** Read the `eraseAll()` in `db.js`. Verify it resets ALL profile fields (including the new enriched ones: dob, sex, height, blood_type, emergency_*, primary_provider) and deletes from ALL 15+ tables.
- [ ] **RLS policies:** Read all migration files in `supabase/migrations/`. Verify every table has RLS enabled and a policy scoped to `auth.uid()`. Check that new tables from `003_comprehensive_schema.sql` have the same security as original tables.
- [ ] **Field mismatches:** Compare `EMPTY_*` constants in `src/constants/defaults.js` against the actual database columns in the migration SQL files. Flag any field that exists in the DB but not in the default shape (would be undefined in forms), or vice versa (would fail on insert).
- [ ] **Supabase insert safety:** In `db.js` `crud.add()`, check if extra fields from the form (like `id` from editing) could accidentally be sent to Supabase and cause conflicts. Verify `stripMeta()` in storage.js handles all metadata fields.

### 2. HIGH — Functional Bugs & Logic Errors

- [ ] **Form state leaks:** In every section component (Medications, Conditions, Allergies, Providers, Appointments, Journal, Labs, Procedures, Immunizations, CareGaps, AnesthesiaFlags, Appeals, SurgicalPlanning, Insurance), verify that:
  - Editing an item populates ALL form fields (including new enriched fields)
  - Canceling edit resets form to `EMPTY_*` (not stale data)
  - The `setForm(item)` call when clicking Edit includes new fields that might not exist on old records (backward compat with records created before enrichment)
- [ ] **ConfirmBar placement:** Read every section that uses `useConfirmDelete` and `ConfirmBar`. Verify the ConfirmBar renders correctly inside the Card for the specific item, not globally. Check that `del.pending` correctly matches `itemId` so only one item shows the confirm bar at a time.
- [ ] **Date handling:** Search for all date comparisons (appointment upcoming/past filtering, vital trends, journal sorting). Verify timezone handling — `new Date().toISOString().slice(0,10)` gives UTC date which may differ from local date near midnight. Check if this causes appointments to appear in wrong section.
- [ ] **Vital trends math:** In `buildProfile()`, verify the trend calculation handles edge cases: all identical values (division by zero in pct), only 1-3 readings (should skip trend), BP readings (which use value + value2, not a single number).
- [ ] **SurgicalPlanning JSONB arrays:** The surgical_planning table has JSONB array columns (procedures, constraints, outstanding_items). Verify the form component handles these as arrays, not strings. Check that import/export preserves them correctly.
- [ ] **Realtime subscriptions:** Check if `subscribeToChanges()` in `db.js` is actually used anywhere. If not, flag it. If it is, verify it triggers data refresh correctly without race conditions.
- [ ] **Session/auth edge cases:** In `App.jsx`, check what happens when the auth token expires mid-session. Does the app gracefully redirect to login or crash? Does the cache handle expired tokens?

### 3. HIGH — UX & Usability Problems

- [ ] **Form field overflow:** With all the new enriched fields, check if forms are uncomfortably long on mobile (375px). Identify forms that should use collapsible "Advanced" sections or tabs to keep the common case simple.
- [ ] **Empty state handling:** For each of the 8 new sections (Labs, Procedures, Immunizations, CareGaps, AnesthesiaFlags, Appeals, SurgicalPlanning, Insurance), verify they have proper EmptyState components with helpful text, not just blank space.
- [ ] **Navigation to new sections:** Verify all 8 new sections are reachable from the Quick Access grid. Check that the grid isn't overcrowded — consider if it needs reorganization or categories.
- [ ] **Drag-and-drop mobile:** The new import drop zone in Settings — does drag-and-drop even work on iOS Safari? On mobile, the primary interaction should be tap-to-browse, with drag-and-drop as a desktop bonus. Verify the tap target is large enough and the hidden file input works on all mobile browsers.
- [ ] **Apple Health import feedback:** After importing Apple Health data, the user sees record counts. But do they know WHERE to find the imported data? Consider adding links or a summary of what sections were populated.
- [ ] **Settings page length:** With Profile, Emergency Contact, AI, Pharmacy, Insurance, Health Background, Import, Data Management, and Download Backup — Settings is very long. Audit scroll depth on mobile and consider if it needs sub-navigation.
- [ ] **Loading states:** Check every component that calls an async function (save, delete, import, export, AI calls). Verify there's a loading indicator and the button is disabled during the operation. Flag any that allow double-submission.
- [ ] **Error states:** Check every `try/catch` in the app. Are errors displayed to the user or silently swallowed with `console.error`? Flag any silent failures.
- [ ] **Keyboard UX:** On mobile, does tapping a date field open the native date picker? Do tel fields open the phone keypad? Do email fields show the email keyboard? Verify `type` props on all Field inputs.
- [ ] **Appointment telehealth URL:** The telehealth_url field only shows when visit_type is 'telehealth'. But what if the user sets it, then changes visit_type? Does the URL get cleared or preserved invisibly?

### 4. MEDIUM — Performance & Optimization

- [ ] **Bundle size:** The main JS chunk is ~896KB (248KB gzipped). Identify the largest contributors. Check if Recharts is tree-shaken properly. Consider if any section components can be lazy-loaded with `React.lazy()`.
- [ ] **loadAll() parallelism:** `db.loadAll()` fetches 16 tables in parallel. On slow connections, this could be 16 simultaneous requests. Check if Supabase has connection pooling limits. Consider if less-used tables (surgical_planning, anesthesia_flags) should lazy-load on demand.
- [ ] **Profile builder on every render:** `buildProfile()` is called in Dashboard and AIPanel. For Dashboard, it's called inside a `useEffect` which is fine. But verify it's not being called on every re-render. If the data hasn't changed, the profile string should be memoized.
- [ ] **Apple Health XML parsing:** Large Apple Health exports can be 100MB+. The current parser uses `DOMParser` which loads the entire XML into memory. Flag this as a potential memory issue and note that streaming XML parsing (SAX) would be better for large files.
- [ ] **localStorage cache size:** The encrypted cache stores all data in `hc:cache`. With 15 tables of data, this could exceed localStorage limits (5-10MB depending on browser). Check if there's size-aware eviction or an error handler for `QuotaExceededError`.
- [ ] **Supabase query efficiency:** Check if any table queries use `select('*')` when they could use `select('id, name')` for list views. Check if indexes exist for common query patterns (e.g., medications filtered by active, vitals ordered by date).

### 5. MEDIUM — Code Quality & Consistency

- [ ] **Duplicate SectionTitle:** `Settings.jsx` defines its own local `SectionTitle` function that shadows the one imported from `FormWrap.jsx`. Check if they're identical or divergent. Consolidate if possible.
- [ ] **Component prop consistency:** Compare how different section components receive their props. Do they all use the same pattern (`data`, `addItem`, `updateItem`, `removeItem`)? Flag any inconsistencies.
- [ ] **Missing TypeScript / prop validation:** The app has no type checking. Identify the 5 most complex components where adding PropTypes or JSDoc @typedef would prevent the most bugs.
- [ ] **CSS class inconsistencies:** Check if any components still use inline `style={{}}` instead of Tailwind classes. Check for hardcoded color values that should reference `salve-*` tokens.
- [ ] **Dead code:** Search for unused imports, unreferenced functions, and commented-out code blocks. Check `uid.js` — is it still used anywhere or fully replaced by Supabase UUIDs?

### 6. LOW — Polish & Best Practices

- [ ] **PWA completeness:** Check `public/manifest.json` — does it have all required fields for installability? Is there a service worker for offline support? Does the app work offline with the cache?
- [ ] **Accessibility:** Check for missing `aria-label` on icon-only buttons (Edit, Delete, navigation). Check color contrast ratios for `textFaint` on `bg`/`card` backgrounds. Check if the app is navigable by keyboard alone.
- [ ] **SEO / meta tags:** Check `index.html` for proper meta tags (description, viewport, theme-color, og:tags).
- [ ] **Error boundaries:** Is there a React error boundary wrapping the app? If one section crashes, does it take down the whole app?
- [ ] **CSP compatibility:** The Vercel CSP header in `vercel.json` — verify it allows the Google Fonts import, Supabase WebSocket connections, and any other external resources the app uses. Check if `'unsafe-inline'` for styles is actually needed or can be removed.

---

### Output Format

Structure `AUDIT_PLAN.md` as follows:

```markdown
# Salve App — Audit Plan

> Generated by Claude audit on [date]
> Based on commit [hash]

## Summary
[2-3 sentence overview of app health + most critical findings]

## Critical (fix immediately)
### C1. [Title]
**File:** `path/to/file.js:line`
**Issue:** [specific description]
**Fix:** [concrete steps]

## High Priority
### H1. [Title]
...

## Medium Priority
### M1. [Title]
...

## Low Priority / Polish
### L1. [Title]
...

## Architecture Recommendations
[Any structural changes that would improve maintainability]
```

Number every item so future agents can reference them as "fix C1" or "implement M3". Be ruthlessly specific — every item should be actionable without additional research.
