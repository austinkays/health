# Medications Page Redesign

**Date:** 2026-04-15
**Status:** v2 — approved, ready for implementation
**Scope:** `src/components/sections/Medications.jsx`, `src/services/profile.js`, `src/utils/reminders.js` (new), new `localStorage` key, small constant additions. No database migration.

> **v2 changelog vs the original draft.** The original spec was written against an AI-generated WIP version of `profile.js` that never landed on `origin/main`. The real `origin/main` has a monolithic `buildProfile(data)`, a private `firstSentence()` helper added by commit `5db1977`, and no `briefFdaFlag` / `opts.fullFdaDetail` architecture. v2 corrects these assumptions: we no longer add `src/utils/fda.js`, instead extending `profile.js` in place with an `fdaBullet()` helper and exporting the existing `firstSentence()` + `condenseFDA()`. Budgets for the new FDA fields are set at 180 chars each per explicit user direction (full clinical picture over context efficiency).

## Problem

Amber reports four concrete issues with the current Medications page:

1. **No organization.** Meds render in database insertion order. A user with 8 meds sees a random-feeling list.
2. **FDA text is a wall.** Expanded cards dump 8 truncated FDA sections (boxed warning, indications, side effects, dosage, contraindications, interactions, precautions, pregnancy, overdosage, storage) — each capped server-side to 300–800 chars by `api/drug.js:342-352`, then line-clamped client-side at ~500 chars behind "Show more" toggles. Even fully expanded, every section ends with `…` because the API already truncated it. The wall is unreadable, doesn't help the user, and the user specifically asked whether Sage can "understand all the FDA context without wasting all those characters."
3. **Truncation is broken.** The "Show more / Show less" affordance implies there's more to see, but the API has already chopped the text. The promise is false.
4. **Reminders feel like an afterthought.** The reminders block lives inside the expanded detail pane, below Journal Mentions, above Edit/Delete. Collapsed cards show no reminder info — you can't see when your next dose is without tapping. The controls are a bare `<input type="time">` with Save/Cancel pills.

## Context Sage already has

`src/services/profile.js:13-37` runs `condenseFDA()` unconditionally on every med with `fda_data`. Origin's (post-5db1977) budgets are: boxed warning 140, contraindications 100, drug interactions 100, first-sentence adverse reactions 120, pregnancy 80 — ~540 chars of condensed clinical signal per drug. Plus `pharm_class` and `pharm_class_moa` always.

So the card's FDA wall **is not what feeds Sage.** Sage reads `fda_data` JSONB directly from Supabase every call and condenses it fresh. We can strip the wall from the user-facing card without starving Sage.

**But there's a gap:** three fields the card shows today are *not* in `condenseFDA()`:

- `indications` ("Used for") — needed for "why am I on this?"
- `dosage` — needed for "with food?" / "can I split it?"
- `precautions` — needed for "be careful if you have X"

To kill the accordion without losing Sage coverage, we need to **expand `condenseFDA()`** to include those three fields. See § 4 below.

**Open question for a follow-up PR (flagged, not addressed here).** Commit `5db1977` on origin tightened existing condenseFDA budgets (200 → 140, 150 → 100, etc.). The stated product direction is "full clinical picture, not token-paranoid" — which suggests those tightened budgets may be worth re-loosening. This redesign PR intentionally leaves the existing budgets as-is and only sets budgets for the three new fields. A separate "FDA context budget audit" commit can revisit the tight budgets afterward if desired.

## Goals

1. **Sort + group** the med list into something scannable.
2. **Remove the FDA accordion** from the card and replace with a compact "At a glance" block + DailyMed deep-links. Preserve clinical signal (boxed warning, class, mechanism, one-line "Used for") inline; push full label prose to DailyMed where it's authoritative and readable.
3. **Promote reminders** from a buried afterthought to a card-surface element. Users should see their reminder times on the collapsed card without tapping.
4. **Ensure Sage's clinical context does not regress** — expand `condenseFDA()` to cover the gap.

Non-goals (explicit, on the roadmap for a follow-up):

- No database migration. Days-of-week reminders, push-driven dose logging, "Taken ✓" journal writes, and a "Today's doses" checklist at the top of the page are all deferred to a future "Today's doses" feature. See § 9.
- No change to the form for adding/editing medications.
- No change to the pharmacy/category filters, bulk link/enrich flow, NADAC pricing, interaction checker, PGx badges, or journal cross-references. Those all stay as-is.

## Design

### 1. Sort & grouping

Add two new state pieces:

```js
const [sortMode, setSortMode] = useState(() =>
  localStorage.getItem('salve:med-sort') || 'alpha'
);
const [showDiscontinued, setShowDiscontinued] = useState(false);
```

**Sort modes (dropdown, top-right of filter row):**

- `alpha` — `(a.display_name || a.name).localeCompare(...)` (default)
- `schedule` — parse `frequency` into a single primary bucket ordinal (the earliest time of day the med is taken), then alpha within the same bucket. Mapping: "Every morning" / "Once daily" / "Every day" → 0 (morning), "Twice daily (BID)" / "Three times daily (TID)" / "Four times daily (QID)" → 0 (morning — they start in the morning), "Every evening/bedtime (QHS)" → 3 (evening), "As needed (PRN)" → 4 (PRN). Weekly/biweekly/monthly → 5 (other).
- `refill` — `refill_date` ascending; meds without refill_date fall to the end
- `category` — groups become section headers rendered between cards

Persisted to `localStorage:salve:med-sort`.

**Grouping:**

- Always render Active meds first.
- Discontinued meds collapse behind a single toggle row: `"▸ 3 discontinued meds"` → expands to show them. When the global `filter` state is `'inactive'` or `'all'`, the toggle starts open.
- When `sortMode === 'category'`, render a small caps header (`PRESCRIPTIONS`, `SUPPLEMENTS`, `OTC`, `AS NEEDED`, `OTHER`) above each category group. Uses existing `MED_CATEGORIES` from `constants/defaults.js`.

**Implementation location:** replace the `const fl = (data.meds || []).filter(...)` block at `Medications.jsx:262` with a `useMemo` that returns `{ active: sortedActiveMeds, discontinued: sortedDiscontinuedMeds }`. Render the list section from those two arrays.

### 2. Card "at a glance" FDA block (replaces accordion)

**Delete entirely:**

- The `fdaDetailId` state
- The `fdaExpanded` state
- The `stripFdaHeader` helper
- The "More drug details" toggle button
- The 8-section FDA accordion loop at `Medications.jsx:532-577`

**Replace with a compact "At a glance" block** rendered in the expanded detail (mobile) or detail pane (desktop):

```
┌─ At a glance ───────────────────────────┐
│ What it is · Generic: dextroamphetamine │
│ How it works · CNS stimulant            │
│ Class · Schedule II stimulant           │
│ Used for · ADHD in adults and children  │
│ Mfr · Takeda                            │
└─────────────────────────────────────────┘
```

Data sources:

| Row | Source | Max length |
|---|---|---|
| What it is | `fda_data.generic_name`, `fda_data.brand_name` | one line each, dedup against `m.name` |
| How it works | `fda_data.pharm_class_moa[0]` (strip `[.*]` tail) | one line |
| Class | `fda_data.pharm_class[0]` (strip `[.*]` tail) | one line |
| Used for | `fda_data.indications[0]` — first sentence only, max 160 chars, trim trailing punctuation | one line, ellipsis if clipped |
| Mfr | `fda_data.manufacturer` | one line |

Rows are omitted when the underlying field is missing.

For the "Used for" row we need to strip FDA section headers — raw `indications[0]` typically starts with `"1 INDICATIONS AND USAGE ADDERALL XR…"`, which nobody wants to read. Origin's profile.js already has a private `firstSentence(text, limit=140)` helper (added by commit `5db1977`), but it does **not** strip those headers. We'll add a sibling helper `fdaBullet(text, limit)` in `profile.js` that strips the header first, then delegates to `firstSentence`. Both are exported so Medications.jsx can import them. No new util file; the helpers live alongside `condenseFDA` where they belong. See § 4.

**Plus — a compact boxed warning banner** (only if `fda_data.boxed_warning?.length`):

```
┌─ ⚠ FDA Black Box Warning ───────────────┐
│ High potential for abuse and misuse;   │
│ may lead to substance use disorder.    │
│ Read full FDA label on DailyMed →      │
└─────────────────────────────────────────┘
```

Shows first 180 chars of `boxed_warning[0]` after stripping the section header prefix. No "Show more" toggle. The "Read full FDA label on DailyMed →" link opens the existing `dailyMedUrl(...)` target. This is 180 chars of safety signal, not 500 chars of truncated legal prose.

**Plus — three DailyMed quick-links** (rendered as small chips):

```
[Side effects ↗]  [Dosage ↗]  [Interactions ↗]
```

All three link to the same DailyMed URL the existing `DailyMed` link uses. Ideally with a section anchor, but DailyMed's anchor scheme isn't stable enough to rely on — so all three just open DailyMed and let the user scroll. That's still better than inline truncated prose, because DailyMed is readable and authoritative. We note in the spec that adding anchor targets is a later polish if DailyMed publishes a stable anchor schema.

### 3. Reminders on the card surface

This is the biggest structural change to the card layout.

**On the collapsed card**, under the dose/frequency line, add a reminders row:

```
Adderall XR
20mg · Once daily (morning)
⏰ 8:00 AM       · Next in 2h 14m
```

Or when no reminders exist:

```
Adderall XR
20mg · Once daily (morning)
⏰ Set reminder        ← inline button, no expand required
```

Implementation:

```jsx
{(() => {
  const reminders = (data.medication_reminders || [])
    .filter(r => r.medication_id === m.id && r.enabled)
    .sort((a, b) => (a.reminder_time || '').localeCompare(b.reminder_time || ''));
  if (reminders.length === 0) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setReminderAddId(m.id); }}
        className="…inline 'Set reminder' chip…"
      >
        <Clock size={11} /> Set reminder
      </button>
    );
  }
  const next = getNextDoseIn(reminders);
  return (
    <div className="flex items-center gap-2 text-[13px] text-salve-textMid">
      <Clock size={11} className="text-salve-lav" />
      <span>{reminders.map(r => formatTime(r.reminder_time)).join(' · ')}</span>
      {next && <span className="text-salve-textFaint">· Next in {next}</span>}
    </div>
  );
})()}
```

`getNextDoseIn(reminders)` is a new pure helper that takes the reminder time strings and returns `"2h 14m"` / `"14m"` / `"now"` relative to `new Date()`. Updates via a minute-tick (lightweight `useEffect` in the parent component with `setInterval(60_000)`). Lives in a new `src/utils/reminders.js` alongside `formatTime`.

**On the expanded detail**, the reminders block moves from its current spot (below Journal Mentions) to the **top of the detail pane**, above At a glance. The heading becomes "Schedule" instead of "Reminders". The new layout order in the expanded detail is:

1. **Schedule** — list of reminder times, toggle each on/off, edit pencil, remove. "Add time" button. Notification status indicator that reads from the existing `Push.js` subscription state (`isSubscribed()`): if enabled → small `🔔 Notifications on` chip; if not → `Set up notifications in Settings →` inline link to `/settings#push`. No new push infra is created by this spec.
2. **At a glance** — compact FDA block from § 2.
3. **Boxed warning** — if present.
4. **DailyMed quick-links** — three chips from § 2.
5. **Pharmacy / refill** — existing map + refill info.
6. **Price / cost** — existing NADAC section.
7. **Journal Mentions** — existing cross-refs.
8. **Edit / Delete / DailyMed / Compare Prices** — existing action row.

The time picker inside "Schedule" is the existing `<input type="time">` from `Medications.jsx:622-627`, but reframed inside a proper card block with a "Add time" button to open it. Same CRUD wiring to `medication_reminders` table — no schema changes.

**Why this is still the "lighter" version:** we're not building push delivery, we're not writing "taken" events to journal, we're not building a dose checklist at the top of the page. Those all go into § 9. But the user can now *see* their schedule on the card without tapping, which is the core UX win.

### 4. Sage FDA context expansion (profile.js)

Goal: ensure killing the card accordion doesn't lose clinical info Sage could catch.

**The origin baseline.** `src/services/profile.js:13-37` currently runs `condenseFDA()` unconditionally on every med with `fda_data`. Existing budgets (post-5db1977): boxed 140, contraindications 100, drug interactions 100, adverse reactions 120, pregnancy 80. No gating, no `opts.fullFdaDetail` mode, no `briefFdaFlag` sibling. The changes here are additive — existing budgets are preserved exactly.

**Three changes to `src/services/profile.js`:**

1. Add a new `fdaBullet(text, limit)` helper next to the existing `firstSentence()` (just below `san()`, around line 10):

```js
// Strip FDA label section headers ("1 INDICATIONS AND USAGE", "ADVERSE REACTIONS:", etc.)
// before extracting a first-sentence bullet. Used for indications / dosage / precautions
// fields where the raw FDA label starts with an all-caps section heading we don't want to
// feed to Sage or show the user.
function fdaBullet(text, limit = 180) {
  if (!text) return '';
  const unheaded = String(text)
    .replace(/^\s*\d*\.?\d*\s*[A-Z][A-Z &/,()-]{8,}(?::\s*|\s+)/, '')
    .trim();
  return firstSentence(unheaded, limit);
}
```

The regex requires the all-caps block to be at least 9 characters long so it doesn't accidentally strip short acronyms in legitimate prose ("MRI showed lesions" is safe — "MRI" is only 3 chars). All the FDA section headers we care about — "INDICATIONS AND USAGE", "ADVERSE REACTIONS", "CONTRAINDICATIONS", "DOSAGE AND ADMINISTRATION", "WARNINGS AND PRECAUTIONS", "DRUG INTERACTIONS" — are comfortably above 9 chars.

2. Export `firstSentence`, `fdaBullet`, and `condenseFDA` from profile.js so Medications.jsx can use `fdaBullet` and the new verifier script can test `condenseFDA` directly:

```js
export { firstSentence, fdaBullet, condenseFDA };
```

3. Expand `condenseFDA()` with three new branches. Existing branches stay **exactly as origin has them** — budgets unchanged:

```js
function condenseFDA(fda) {
  if (!fda) return '';
  let out = '';
  if (fda.boxed_warning?.length) {
    out += ' ⚠ boxed warning: ' + san(fda.boxed_warning[0], 140);
  }
  if (fda.indications?.length) {
    out += ' | used for: ' + fdaBullet(fda.indications[0], 180);
  }
  if (fda.dosage?.length) {
    out += ' | dosing: ' + fdaBullet(fda.dosage[0], 180);
  }
  if (fda.contraindications?.length) {
    out += ' | contraindications: ' + san(fda.contraindications[0], 100);
  }
  if (fda.precautions?.length) {
    out += ' | precautions: ' + fdaBullet(fda.precautions[0], 180);
  }
  if (fda.drug_interactions?.length) {
    out += ' | interactions: ' + san(fda.drug_interactions[0], 100);
  }
  if (fda.adverse_reactions?.length) {
    // Extract just the first sentence or 100 chars of side effects
    const raw = san(fda.adverse_reactions[0], 120);
    const first = raw.split(/\.\s/)[0];
    out += ' | side effects: ' + (first.length < raw.length ? first + '.' : raw);
  }
  if (fda.pregnancy?.length) {
    const raw = san(fda.pregnancy[0], 80);
    out += ' | pregnancy: ' + raw;
  }
  return out;
}
```

The card's "Used for" row uses `fdaBullet` on `fda_data.indications[0]` directly (see § 2).

**Dropped everywhere** (not in condenseFDA, not in card, not in Sage): `overdosage`, `storage`. Overdosage: if this is ever real, the user needs poison control, not Sage. Storage: read the bottle. Low clinical value per context byte. (These were never in origin's condenseFDA either — they were only ever in the card accordion which we're deleting.)

**Context budget math:**

- Origin condenseFDA worst case: 140 + 100 + 100 + 120 + 80 = 540 chars/drug
- New condenseFDA worst case: 140 + 180 + 180 + 100 + 180 + 100 + 120 + 80 = 1,080 chars/drug
- 5-med user on a Sage chat turn: ~5,400 chars = ~1,350 tokens of FDA context. Well under the 40k free-tier whole-profile cap enforced by `api/_prompts.js`.

### 5. Helper location

All FDA text helpers live in `profile.js` alongside `san()` and `condenseFDA()`. That's where the existing private `firstSentence()` was added by commit `5db1977` and it's the right home for this family of helpers — they're all called by `condenseFDA` and its callers. `Medications.jsx` imports `fdaBullet` from there. No new `utils/fda.js` file.

### 6. What gets deleted

In `Medications.jsx`:

- `fdaDetailId` state (line 61)
- `fdaExpanded` state (line 62)
- `stripFdaHeader` function (lines 65-68)
- The "More drug details" button + 8-section accordion (lines 532-577)
- The "Show more / Show less" logic on boxed_warning and indications (lines 513-517, 524-528)

Replaced with the At a glance block + compact boxed warning + DailyMed chips described in § 2.

### 7. Files touched

| File | Change |
|---|---|
| `src/components/sections/Medications.jsx` | Remove FDA accordion; add sort/group state + memoized list; add card-surface reminders row; add next-dose tick hook; move Schedule block to top of detail pane; new At a glance block. Preserves the `\|\| []` crash guards from commit `d0f4327`. Net: roughly −120 / +160 lines. |
| `src/services/profile.js` | Add `fdaBullet(text, limit)` helper. Export `firstSentence`, `fdaBullet`, `condenseFDA`. Expand `condenseFDA()` with three new branches (indications / dosage / precautions), all using `fdaBullet` with 180-char budgets. Existing field budgets unchanged. |
| `src/utils/reminders.js` | **New file.** Exports `formatTime(hhmmss)`, `getNextDoseIn(reminders, now)`. |
| `scripts/verify-condense-fda.mjs` | **New file.** Standalone Node verifier that imports `condenseFDA`, `firstSentence`, and `fdaBullet` from `profile.js` and asserts on their output against hand-crafted FDA fixture data. Exits 0 on pass, 1 on fail. |
| `scripts/verify-reminders-util.mjs` | **New file.** Standalone Node verifier for `utils/reminders.js`. |
| `CLAUDE.md` | Add "Today's doses" to the Roadmap section as the "heavier reminders version". Update Medications.jsx docstring to reflect the redesign. |

No migration. No API change. No new dependencies.

### 8. Testing checklist additions

- [ ] Medications: sort dropdown defaults to A-Z, persists choice to localStorage
- [ ] Medications: "Schedule" sort buckets morning → midday → evening → bedtime → PRN, alpha within buckets
- [ ] Medications: "Refill date" sort puts meds without refill_date at the end
- [ ] Medications: "Category" sort renders small-caps section headers between groups
- [ ] Medications: discontinued meds collapse behind a "▸ N discontinued" toggle; open when filter === 'inactive'
- [ ] Medications: collapsed card shows reminder times + "Next in Xh Ym" when reminders exist
- [ ] Medications: collapsed card shows "⏰ Set reminder" inline button when no reminders exist
- [ ] Medications: tapping "Set reminder" opens the schedule block without expanding the whole card (or expands directly to schedule)
- [ ] Medications: next-dose countdown updates once per minute
- [ ] Medications: expanded detail renders Schedule at the top, above At a glance
- [ ] Medications: At a glance block shows Used for as one clean sentence with no "1 INDICATIONS AND USAGE" prefix
- [ ] Medications: boxed warning card shows ≤180 chars with "Read full FDA label on DailyMed →" link
- [ ] Medications: 8-section FDA accordion is gone; no fdaDetailId or fdaExpanded in state
- [ ] Sage: `condenseFDA` output for a med with FDA data now includes "used for", "dosing", "precautions" strings
- [ ] Sage: `fdaBullet` strips "1 INDICATIONS AND USAGE ADDERALL XR..." prefix and returns only the usable sentence
- [ ] Sage: `fdaBullet` does NOT strip short all-caps acronyms like "MRI" or "ADHD" from normal prose
- [ ] Sage: `condenseFDA` existing field budgets (boxed 140, contraindications 100, interactions 100, adverse 120, pregnancy 80) are unchanged from commit `5db1977`
- [ ] Sage: 5-med user FDA context budget measurable at ~1,080 chars/drug worst case

### 9. Future to-do (heavier reminders version)

To add to `CLAUDE.md` Roadmap section as a deferred item:

> **Today's doses checklist** — Surface a top-of-page "Today" block in Medications that lists every reminder firing today (sorted by time), with a "Taken ✓" button per dose that writes a lightweight adherence record and optionally a journal entry tagged with the med and timestamp. Requires: `medication_reminders.days_of_week` column (new migration) so users can say "weekdays only", a new `dose_logs` table (or a journal-entry convention) to record taken/missed events, extension of the existing `/api/cron-reminders.js` + `Push.js` flow to per-reminder-time delivery with action buttons (Take / Snooze / Skip), and Dashboard quick-access integration. Turns Medications from a reference page into an active daily tool.

## Risks & open questions

1. **DailyMed deep-link anchors.** The three section chips (Side effects / Dosage / Interactions) all go to the same DailyMed URL today. If we want true section jumps we'd need a stable anchor schema from DailyMed, which isn't published. **Decision:** ship as-is (all three open DailyMed); add anchors as polish if DailyMed publishes a scheme. The user value is "one tap to a properly-formatted authoritative label" — that's already delivered.

2. **Sort stability on rapid filter changes.** The `useMemo` needs to include `sortMode`, `filter`, `pharmacyFilter`, `catFilter`, and `data.meds` in its dep array. Straightforward.

3. **Reminder card-surface row adds vertical density.** The collapsed card gets one more line. Mitigation: the line is only rendered when the med has reminders OR no reminders (but we want the Set-reminder CTA visible). Net effect: +1 row always. Cards stay readable but the list is denser. **Accepted trade-off** — reminders being visible is the whole point.

4. **Next-dose countdown tick.** A single parent-level `setInterval(60_000)` updates a `now` ref. Cheap. Clean up on unmount.

5. **Accessibility.** The sort dropdown needs a proper label (`<label htmlFor>` → hidden label, visible dropdown). The reminder row on the collapsed card needs `aria-label="Scheduled at 8:00 AM, next dose in 2 hours 14 minutes"`.

6. **No regression on the `useHealthData` contract.** All reminder CRUD continues to use the existing `addItem('medication_reminders', …)` / `updateItem(...)` / `removeItem(...)` calls. No hook changes.
