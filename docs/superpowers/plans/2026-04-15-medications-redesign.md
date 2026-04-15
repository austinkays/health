# Medications Page Redesign Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **v2 changelog vs original draft.** The original plan was written against an AI-generated WIP version of `profile.js` that never landed on `origin/main`. v2 targets the real `origin/main` at commit `a856c95`. Key differences: no new `src/utils/fda.js` file (helpers live in `profile.js` alongside the existing private `firstSentence`); `condenseFDA` expansion preserves all existing field budgets (unchanged from commit `5db1977`) and only adds new 180-char budgets for three new fields; verifier is a targeted new script `scripts/verify-condense-fda.mjs` instead of extending a non-existent `scripts/verify-profile.mjs`; `Medications.jsx` line numbers shift slightly to accommodate the `|| []` crash guards from commit `d0f4327`.

**Goal:** Reorganize the Medications page so meds are sorted/grouped, the wall of truncated FDA text is replaced by a compact "At a glance" block plus DailyMed deep-links, and reminders are promoted from a buried afterthought to a card-surface element — without losing any clinical context Sage has access to.

**Architecture:** A small set of new helpers (`fdaBullet`, `getNextDoseIn`, `formatTime`) are added in focused locations. `src/services/profile.js` gains `fdaBullet` alongside the existing private `firstSentence`, exports both plus `condenseFDA`, and extends `condenseFDA()` with three new FDA field branches. A new `src/utils/reminders.js` provides pure helpers for the card reminder row. The bulk of the work is inside `src/components/sections/Medications.jsx` — delete the FDA accordion and its two state hooks, add sort + grouping state, restructure `renderMedDetail()` order, move the reminders block up, promote it to the card surface with a next-dose minute-tick. Preserves the `|| []` crash guards from commit `d0f4327`.

**Tech Stack:** React 18 + Vite, Tailwind, lucide-react, Supabase (`medication_reminders` table from migration 028 is already in place — no migration needed), existing `src/services/push.js` for notification state. No unit test framework is configured; pure-function utilities are verified with standalone Node scripts, and UI changes are verified manually in `npm run dev`.

**Spec:** [`docs/superpowers/specs/2026-04-15-medications-redesign-design.md`](../specs/2026-04-15-medications-redesign-design.md)

---

## File Map

| File | Status | Purpose |
|---|---|---|
| `src/services/profile.js` | Modify | Add `fdaBullet(text, limit)` helper (strips FDA section headers, delegates to `firstSentence`). Export `firstSentence`, `fdaBullet`, `condenseFDA`. Expand `condenseFDA()` with three new branches (indications / dosage / precautions, 180 char budgets). Existing field budgets preserved. |
| `src/utils/reminders.js` | **Create** | `formatTime(hhmmss)`, `getNextDoseIn(reminders, now)` — pure helpers for the card reminder row. No React. |
| `src/components/sections/Medications.jsx` | Modify | Delete FDA accordion; add sort/group; new "At a glance" block with `fdaBullet`; card-surface reminders row with minute tick; move Schedule to top of detail pane. Preserves `|| []` crash guards. |
| `scripts/verify-condense-fda.mjs` | **Create** | Standalone Node verifier importing `condenseFDA`, `firstSentence`, `fdaBullet` from profile.js. Asserts FDA bullet extraction + header stripping + new field coverage. |
| `scripts/verify-reminders-util.mjs` | **Create** | Standalone Node verifier for `utils/reminders.js`. |
| `CLAUDE.md` | Modify | Add "Today's doses checklist" to Roadmap as a future to-do. Update the Medications.jsx file-tree docstring to reflect the redesign. |

No new React components. No new utils/ folder additions beyond `reminders.js`. No migrations. No API routes changed.

---

## Task 1: Add `fdaBullet` helper + export FDA helpers from `profile.js`

**Files:**
- Modify: `src/services/profile.js`
- Create: `scripts/verify-condense-fda.mjs`

This task only adds the helper and export statement. It does NOT yet modify `condenseFDA()` — that's Task 3. Splitting keeps each commit independently buildable and the verifier can be fleshed out incrementally.

- [ ] **Step 1: Write the failing verifier — header stripping only**

Create `scripts/verify-condense-fda.mjs`:

```js
/*
 * verify-condense-fda.mjs
 *
 * Standalone Node verifier for FDA text helpers and condenseFDA output.
 * Run with: node scripts/verify-condense-fda.mjs
 * Exits 0 on success, 1 on any assertion failure.
 */
import { firstSentence, fdaBullet, condenseFDA } from '../src/services/profile.js';

let failed = 0;
function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`\u2713 ${label}`);
  } else {
    console.error(`\u2717 ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}
function assertContains(label, haystack, needle) {
  if (String(haystack).includes(needle)) {
    console.log(`\u2713 ${label}`);
  } else {
    console.error(`\u2717 ${label} \u2014 missing substring: ${JSON.stringify(needle)}`);
    failed++;
  }
}
function assertExcludes(label, haystack, needle) {
  if (!String(haystack).includes(needle)) {
    console.log(`\u2713 ${label}`);
  } else {
    console.error(`\u2717 ${label} \u2014 unexpectedly found: ${JSON.stringify(needle)}`);
    failed++;
  }
}

// ── firstSentence (existing helper, imported) ───────────────────
// Sanity check that the import works.
assert('firstSentence empty string', firstSentence('', 100), '');
assert('firstSentence stops at first period', firstSentence('First. Second.', 100), 'First.');

// ── fdaBullet (new helper, Task 1 target) ───────────────────────
assert('fdaBullet empty', fdaBullet('', 100), '');
assert('fdaBullet null', fdaBullet(null, 100), '');

assert(
  'fdaBullet strips "1 INDICATIONS AND USAGE" prefix',
  fdaBullet('1 INDICATIONS AND USAGE ADDERALL XR is indicated for ADHD.', 200),
  'ADDERALL XR is indicated for ADHD.'
);

assert(
  'fdaBullet strips "2 DOSAGE AND ADMINISTRATION" prefix',
  fdaBullet('2 DOSAGE AND ADMINISTRATION Initiate with 25mg/day.', 200),
  'Initiate with 25mg/day.'
);

assert(
  'fdaBullet strips "ADVERSE REACTIONS:" unnumbered prefix',
  fdaBullet('ADVERSE REACTIONS: Most common are headache and nausea.', 200),
  'Most common are headache and nausea.'
);

assert(
  'fdaBullet does NOT strip short all-caps "MRI" from normal prose',
  fdaBullet('MRI showed lesions in the temporal lobe.', 200),
  'MRI showed lesions in the temporal lobe.'
);

assert(
  'fdaBullet does NOT strip short all-caps "HIV" from normal prose',
  fdaBullet('HIV positive patients should consult their provider.', 200),
  'HIV positive patients should consult their provider.'
);

assert(
  'fdaBullet truncates with ellipsis when longer than limit',
  fdaBullet('A'.repeat(300), 50).endsWith('\u2026'),
  true
);

assert(
  'fdaBullet respects limit param',
  fdaBullet('A'.repeat(300), 50).length,
  50
);

// ── condenseFDA (existing helper, import sanity) ────────────────
// Task 3 will add new-field assertions. For Task 1 we just confirm
// the import works and the existing behavior is intact.
const existingFda = {
  boxed_warning: ['Risk of respiratory depression'],
  contraindications: ['Do not use with MAO inhibitors'],
};
const existingOut = condenseFDA(existingFda);
assertContains('condenseFDA still outputs boxed warning', existingOut, 'boxed warning');
assertContains('condenseFDA still outputs contraindications', existingOut, 'contraindications');

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll FDA helper assertions passed');
```

- [ ] **Step 2: Run verifier to confirm it fails**

```bash
node scripts/verify-condense-fda.mjs
```

Expected: `SyntaxError` or module-not-found because `profile.js` does not yet export `fdaBullet`, `firstSentence`, or `condenseFDA`.

- [ ] **Step 3: Modify `src/services/profile.js` — add `fdaBullet` and export helpers**

Open `src/services/profile.js`. Find the existing `firstSentence` helper (added by commit `5db1977`, currently private, around line 130 — use your editor's search for `function firstSentence`).

Directly **below** the `firstSentence` function definition, add the new `fdaBullet` helper:

```js
// Strip FDA label section headers ("1 INDICATIONS AND USAGE", "ADVERSE REACTIONS:",
// etc.) before extracting a first-sentence bullet. Used for indications / dosage /
// precautions fields where the raw FDA label starts with an all-caps section
// heading we don't want to feed to Sage or show the user.
// The regex requires the all-caps block to be at least 9 characters long so it
// doesn't accidentally strip short acronyms like "MRI" or "HIV" in legitimate prose.
function fdaBullet(text, limit = 180) {
  if (!text) return '';
  const unheaded = String(text)
    .replace(/^\s*\d*\.?\d*\s*[A-Z][A-Z &/,()-]{8,}(?::\s*|\s+)/, '')
    .trim();
  return firstSentence(unheaded, limit);
}
```

Then find the existing `condenseFDA` function definition. Directly **above** it, there may already be an export or no export. Regardless, at the bottom of the helpers cluster (just before the first `function summarizeVitals` or `function buildProfile` — wherever the "helpers are done, main profile builders start" transition happens), add the export block:

```js
// Exported so Medications.jsx can use fdaBullet in the At a glance block, and
// scripts/verify-condense-fda.mjs can verify condenseFDA output directly.
export { firstSentence, fdaBullet, condenseFDA };
```

If `condenseFDA`, `firstSentence`, or any other already-declared export conflicts (e.g. `condenseFDA` is already `export function condenseFDA` — unlikely based on our read, but possible), adjust the `export {}` block to not duplicate. The desired end state is that all three names are exported from the module.

- [ ] **Step 4: Run verifier to confirm the import works and existing assertions pass but new-field assertions don't exist yet**

```bash
node scripts/verify-condense-fda.mjs
```

Expected: all assertions from Step 1 pass (✓ lines for firstSentence, fdaBullet, and condenseFDA import sanity). Exit 0. If any ✗, fix before committing.

- [ ] **Step 5: Commit**

```bash
git add src/services/profile.js scripts/verify-condense-fda.mjs
git commit -m "feat(ai): add fdaBullet helper and export FDA helpers from profile.js"
```

---

## Task 2: Reminder helpers in `src/utils/reminders.js`

**Files:**
- Create: `src/utils/reminders.js`
- Create: `scripts/verify-reminders-util.mjs`

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-reminders-util.mjs`:

```js
/*
 * verify-reminders-util.mjs
 *
 * Standalone Node verifier for src/utils/reminders.js.
 * Run with: node scripts/verify-reminders-util.mjs
 * Exits 0 on success, 1 on any assertion failure.
 */
import { formatTime, getNextDoseIn } from '../src/utils/reminders.js';

let failed = 0;
function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`\u2713 ${label}`);
  } else {
    console.error(`\u2717 ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── formatTime ──────────────────────────────────────────────────
assert('formatTime 08:00:00 \u2192 8:00 AM', formatTime('08:00:00'), '8:00 AM');
assert('formatTime 08:00 \u2192 8:00 AM', formatTime('08:00'), '8:00 AM');
assert('formatTime 00:00:00 \u2192 12:00 AM', formatTime('00:00:00'), '12:00 AM');
assert('formatTime 12:00:00 \u2192 12:00 PM', formatTime('12:00:00'), '12:00 PM');
assert('formatTime 13:30:00 \u2192 1:30 PM', formatTime('13:30:00'), '1:30 PM');
assert('formatTime 23:45:00 \u2192 11:45 PM', formatTime('23:45:00'), '11:45 PM');
assert('formatTime empty \u2192 empty', formatTime(''), '');
assert('formatTime null \u2192 empty', formatTime(null), '');

// ── getNextDoseIn ───────────────────────────────────────────────
// Use a fixed reference time: 2026-04-15T10:30:00 local.
const ref = new Date(2026, 3, 15, 10, 30, 0);

assert(
  'next dose 2h later',
  getNextDoseIn([{ reminder_time: '12:30:00', enabled: true }], ref),
  '2h'
);

assert(
  'next dose 14 min later',
  getNextDoseIn([{ reminder_time: '10:44:00', enabled: true }], ref),
  '14m'
);

assert(
  'next dose 2h 14m later',
  getNextDoseIn([{ reminder_time: '12:44:00', enabled: true }], ref),
  '2h 14m'
);

assert(
  'next dose 1 min later is "now"',
  getNextDoseIn([{ reminder_time: '10:30:30', enabled: true }], ref),
  'now'
);

assert(
  'picks soonest of multiple reminders',
  getNextDoseIn([
    { reminder_time: '22:00:00', enabled: true },
    { reminder_time: '14:00:00', enabled: true },
    { reminder_time: '18:00:00', enabled: true },
  ], ref),
  '3h 30m'
);

assert(
  'skips disabled reminders',
  getNextDoseIn([
    { reminder_time: '11:00:00', enabled: false },
    { reminder_time: '15:00:00', enabled: true },
  ], ref),
  '4h 30m'
);

assert(
  'all reminders passed today \u2192 next is tomorrow morning',
  getNextDoseIn([{ reminder_time: '08:00:00', enabled: true }], ref),
  '21h 30m'
);

assert(
  'empty list returns null',
  getNextDoseIn([], ref),
  null
);

assert(
  'all disabled returns null',
  getNextDoseIn([{ reminder_time: '12:00:00', enabled: false }], ref),
  null
);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll reminder-util assertions passed');
```

- [ ] **Step 2: Run verifier to confirm it fails**

```bash
node scripts/verify-reminders-util.mjs
```

Expected: module-not-found error.

- [ ] **Step 3: Create `src/utils/reminders.js`**

```js
// src/utils/reminders.js
//
// Pure helpers for medication reminder display. No React, no DOM.
// Consumed by src/components/sections/Medications.jsx for the card-surface
// reminder row and the Schedule block inside the expanded detail pane.

/**
 * Format a time string from the medication_reminders table (stored as
 * Postgres `time`, which serializes to "HH:MM:SS" or "HH:MM") into a
 * human-readable 12-hour clock string like "8:00 AM".
 *
 * @param {string | null | undefined} hhmmss
 * @returns {string}
 */
export function formatTime(hhmmss) {
  if (!hhmmss) return '';
  const [h, m] = String(hhmmss).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Compute a human-readable countdown to the next enabled reminder time,
 * considering wrap-around to tomorrow if all of today's times have passed.
 *
 * @param {Array<{reminder_time: string, enabled: boolean}>} reminders
 * @param {Date} [now]  Reference "now" — defaults to new Date(). Injectable for tests.
 * @returns {string | null}
 *          "now" if within 60 seconds, "14m" if under 1h, "2h" if whole hours,
 *          "2h 14m" otherwise. Returns null if no enabled reminder exists.
 */
export function getNextDoseIn(reminders, now = new Date()) {
  if (!Array.isArray(reminders) || reminders.length === 0) return null;
  const enabled = reminders.filter(r => r && r.enabled && r.reminder_time);
  if (enabled.length === 0) return null;

  const nowMs = now.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86_400_000;

  // Compute each reminder's next occurrence in ms-since-epoch.
  let soonest = Infinity;
  for (const r of enabled) {
    const [h, m, s = 0] = String(r.reminder_time).split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;
    let target = startOfToday + h * 3_600_000 + m * 60_000 + s * 1000;
    // If today's target already passed (with a 1-minute grace window so "just
    // fired" reminders don't immediately jump to tomorrow), roll to tomorrow.
    if (target < nowMs - 60_000) target += DAY;
    if (target < soonest) soonest = target;
  }
  if (!Number.isFinite(soonest)) return null;

  const diff = soonest - nowMs;
  if (diff <= 60_000) return 'now';
  const minutes = Math.round(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
```

- [ ] **Step 4: Run verifier to confirm it passes**

```bash
node scripts/verify-reminders-util.mjs
```

Expected: 17 `✓` lines and `All reminder-util assertions passed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/utils/reminders.js scripts/verify-reminders-util.mjs
git commit -m "feat(meds): add reminder formatting and next-dose helpers with verifier"
```

---

## Task 3: Expand `condenseFDA()` with new FDA fields

**Files:**
- Modify: `src/services/profile.js`
- Modify: `scripts/verify-condense-fda.mjs`

- [ ] **Step 1: Add failing assertions for the new condenseFDA fields**

Open `scripts/verify-condense-fda.mjs` from Task 1 and append the following block directly above the `if (failed > 0)` footer at the bottom:

```js
// ── condenseFDA expansion assertions (Task 3 target) ───────────
// Use a rich FDA fixture with all fields we care about to verify
// the new indications / dosage / precautions branches, header
// stripping, and that dropped-field hygiene (no overdosage / storage).
const richFda = {
  boxed_warning: ['Risk of respiratory depression with opioid use'],
  indications: ['1 INDICATIONS AND USAGE TRAMADOL is indicated for the management of moderate to moderately severe pain in adults.'],
  dosage: ['2 DOSAGE AND ADMINISTRATION Initiate treatment with 25 mg/day in the morning and titrate upward.'],
  contraindications: ['Do not use with MAO inhibitors'],
  precautions: ['5 WARNINGS AND PRECAUTIONS Serotonin syndrome may occur with concomitant serotonergic drug use.'],
  drug_interactions: ['Increased risk with SSRIs'],
  adverse_reactions: ['Most common adverse reactions are dizziness, nausea, constipation, headache, and somnolence.'],
  pregnancy: ['May cause neonatal opioid withdrawal syndrome.'],
  overdosage: ['Symptoms include respiratory depression'],
  storage: ['Store at room temperature'],
};
const richOut = condenseFDA(richFda);

// New branches must be present
assertContains('condenseFDA adds "used for" for indications field', richOut, 'used for:');
assertContains('condenseFDA adds "dosing" for dosage field', richOut, 'dosing:');
assertContains('condenseFDA adds "precautions" for precautions field', richOut, 'precautions:');

// Header stripping must apply via fdaBullet
assertContains(
  'condenseFDA strips "1 INDICATIONS AND USAGE" prefix from indications output',
  richOut,
  'TRAMADOL is indicated'
);
assertExcludes('condenseFDA drops the raw "1 INDICATIONS AND USAGE" prefix text', richOut, '1 INDICATIONS AND USAGE');
assertExcludes('condenseFDA drops the raw "2 DOSAGE AND ADMINISTRATION" prefix text', richOut, '2 DOSAGE AND ADMINISTRATION');
assertExcludes('condenseFDA drops the raw "5 WARNINGS AND PRECAUTIONS" prefix text', richOut, '5 WARNINGS AND PRECAUTIONS');

// Dropped fields — never fed to Sage
assertExcludes('condenseFDA does NOT include overdosage field', richOut, 'overdosage:');
assertExcludes('condenseFDA does NOT include storage field', richOut, 'storage:');

// Existing branches still present and untouched
assertContains('condenseFDA still includes boxed warning', richOut, 'boxed warning:');
assertContains('condenseFDA still includes contraindications', richOut, 'contraindications:');
assertContains('condenseFDA still includes interactions', richOut, 'interactions:');
assertContains('condenseFDA still includes side effects', richOut, 'side effects:');
assertContains('condenseFDA still includes pregnancy', richOut, 'pregnancy:');
```

- [ ] **Step 2: Run verifier to confirm the new assertions fail**

```bash
node scripts/verify-condense-fda.mjs
```

Expected: the Task 1 assertions still pass (✓), the new "used for / dosing / precautions" assertions fail (✗) because those branches don't exist yet in condenseFDA.

- [ ] **Step 3: Expand `condenseFDA()` in `src/services/profile.js`**

Find the existing `condenseFDA` function definition in `src/services/profile.js` (currently lines 13-37 on origin). Replace the entire function body with:

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

Existing budgets (140 / 100 / 100 / 120 / 80) are preserved **exactly**. New branches use 180-char budgets via `fdaBullet`. `overdosage` and `storage` are intentionally omitted — they were never in origin's condenseFDA either.

**Important:** `fdaBullet` must be defined and in scope before this function (Task 1 Step 3 put it directly below `firstSentence`, which is above `condenseFDA` in the file. Verify the ordering.)

- [ ] **Step 4: Run verifier to confirm all assertions now pass**

```bash
node scripts/verify-condense-fda.mjs
```

Expected: all previous assertions still ✓, plus the 12 new assertions for new-branch coverage, header stripping, dropped fields, and existing branches all ✓. Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/services/profile.js scripts/verify-condense-fda.mjs
git commit -m "feat(ai): expand condenseFDA with indications/dosage/precautions (180ch)"
```

---

## Task 4: Medications.jsx — sort state + grouped memo

**Files:**
- Modify: `src/components/sections/Medications.jsx`

This task only adds state and a memoized grouped list. The render loop still consumes a flat array; we wire sort into the render in Task 5. Two tasks instead of one so each commit produces an independently buildable state.

- [ ] **Step 1: Add sort state near the other `useState` calls**

In `src/components/sections/Medications.jsx`, directly after the existing `const [catFilter, setCatFilter] = useState('all');` line (~257), add:

```jsx
  const [sortMode, setSortMode] = useState(() => {
    try { return localStorage.getItem('salve:med-sort') || 'alpha'; }
    catch { return 'alpha'; }
  });
  const [showDiscontinued, setShowDiscontinued] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('salve:med-sort', sortMode); } catch {}
  }, [sortMode]);
```

- [ ] **Step 2: Replace `fl` with a memoized `{active, discontinued}` result**

Find this block around `Medications.jsx:262-267`:

```jsx
  const fl = (data.meds || []).filter(m => {
    const statusOk = filter === 'all' ? true : filter === 'active' ? m.active !== false : m.active === false;
    const pharmaOk = pharmacyFilter === 'all' ? true : (m.pharmacy?.trim() || '') === pharmacyFilter;
    const catOk = catFilter === 'all' ? true : (m.category || 'medication') === catFilter;
    return statusOk && pharmaOk && catOk;
  });
```

Replace with:

```jsx
  // Map a frequency string to a "primary bucket" ordinal for schedule sort.
  // Buckets: 0 morning, 1 midday, 2 evening, 3 bedtime, 4 PRN, 5 other.
  // Multi-dose regimens (BID/TID/QID) map to 0 (morning) because they start
  // their day there; within a bucket we fall back to alpha.
  const scheduleBucket = (frequency) => {
    const f = String(frequency || '').toLowerCase();
    if (/prn|as.?needed/.test(f)) return 4;
    if (/bedtime|qhs|evening|night/.test(f)) return 3;
    if (/morning|am\b|once.*day|daily|every.?day|bid|tid|qid|twice|three.*day|four.*day/.test(f)) return 0;
    if (/week|biweek|month/.test(f)) return 5;
    return 5;
  };

  const groupedMeds = useMemo(() => {
    const base = (data.meds || []).filter(m => {
      const pharmaOk = pharmacyFilter === 'all' ? true : (m.pharmacy?.trim() || '') === pharmacyFilter;
      const catOk = catFilter === 'all' ? true : (m.category || 'medication') === catFilter;
      return pharmaOk && catOk;
    });
    const nameKey = (m) => (m.display_name || m.name || '').toLowerCase();
    const cmpAlpha = (a, b) => nameKey(a).localeCompare(nameKey(b));
    const cmpSchedule = (a, b) => (scheduleBucket(a.frequency) - scheduleBucket(b.frequency)) || cmpAlpha(a, b);
    const cmpRefill = (a, b) => {
      const ad = a.refill_date ? new Date(a.refill_date).getTime() : Infinity;
      const bd = b.refill_date ? new Date(b.refill_date).getTime() : Infinity;
      return (ad - bd) || cmpAlpha(a, b);
    };
    const cmpCategory = (a, b) => {
      const ac = (a.category || 'medication');
      const bc = (b.category || 'medication');
      return ac.localeCompare(bc) || cmpAlpha(a, b);
    };
    const cmp = {
      alpha: cmpAlpha,
      schedule: cmpSchedule,
      refill: cmpRefill,
      category: cmpCategory,
    }[sortMode] || cmpAlpha;

    const active = base.filter(m => m.active !== false).slice().sort(cmp);
    const discontinued = base.filter(m => m.active === false).slice().sort(cmpAlpha);

    // Honor existing status filter: if user chose 'inactive', hide active entirely.
    if (filter === 'inactive') return { active: [], discontinued };
    if (filter === 'active') return { active, discontinued: [] };
    return { active, discontinued };
  }, [data.meds, pharmacyFilter, catFilter, sortMode, filter]);

  // Backwards-compat alias used by cross-reference logic still reading a flat list.
  const fl = useMemo(
    () => [...groupedMeds.active, ...groupedMeds.discontinued],
    [groupedMeds]
  );
```

Note: the existing `fl.find(m => m.id === expandedId)` and the `fl.map(m => m.id)` inside the arrow-key effect both continue to work unchanged because `fl` is still a flat array.

- [ ] **Step 3: Verify the build still compiles**

```bash
npm run build
```

Expected: build succeeds (no new render yet — sort and grouping are defined but unused in the JSX). Fix any syntax errors before committing.

- [ ] **Step 4: Commit**

```bash
git add src/components/sections/Medications.jsx
git commit -m "feat(meds): add sort mode state and grouped memo"
```

---

## Task 5: Medications.jsx — render sorted groups + sort dropdown UI

**Files:**
- Modify: `src/components/sections/Medications.jsx`

- [ ] **Step 1: Extract the existing `fl.map` card body into a `renderMedCardBody` helper**

Find the `fl.map(m => { ... })` render block inside `listContent` (around `Medications.jsx:890-955`). The JSX inside the `Card` element is large and will be reused across active and discontinued and category-grouped renders. Extract it into a helper.

Directly above the existing `renderMedDetail = (m) => (` definition (around `Medications.jsx:445`), add:

```jsx
  const DiscontinuedToggle = ({ count, open, onToggle, renderCards }) => (
    <div className="mt-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 text-[13px] font-montserrat text-salve-textFaint hover:text-salve-textMid bg-transparent border-none cursor-pointer py-1.5 px-1"
      >
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
        {count} discontinued {count === 1 ? 'med' : 'meds'}
      </button>
      {open && <div className="opacity-60">{renderCards()}</div>}
    </div>
  );

  const renderMedCardBody = (m, isExpanded) => (
    <div className="flex justify-between items-start">
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-salve-text mb-0.5 flex items-center gap-1.5">
          {m.display_name || m.name}
        </div>
        {m.display_name && m.display_name !== m.name && (
          <div className="text-[13px] text-salve-textFaint -mt-0.5 mb-0.5 truncate">{m.name}</div>
        )}
        <div className="text-[15px] text-salve-textMid">{[m.dose, m.frequency].filter(Boolean).join(' · ')}</div>

        {/* Card-surface reminder row — filled in by Task 8. Placeholder for now. */}
        {null}

        {m.category && m.category !== 'medication' && (
          <Badge label={MED_CATEGORIES.find(c => c.value === m.category)?.label || m.category} color={C.lav} bg={`${C.lav}15`} className="mt-1" />
        )}
        {m.active === false && (
          <Badge label="Discontinued" color={C.textFaint} bg="rgba(110,106,128,0.15)" className="mt-1" />
        )}
        {!isExpanded && (m.fda_data?.pharm_class?.length > 0 || m.fda_data?.boxed_warning?.length > 0) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {m.fda_data.pharm_class?.length > 0 && (
              <span className="inline-flex items-center py-0.5 px-1.5 rounded-full bg-salve-sage/10 border border-salve-sage/20 text-[9px] text-salve-sage font-medium truncate max-w-[200px]">
                {m.fda_data.pharm_class[0].replace(/ \[.*\]$/, '')}
              </span>
            )}
            {m.fda_data.boxed_warning?.length > 0 && (
              <span className="inline-flex items-center gap-0.5 py-0.5 px-1.5 rounded-full bg-salve-rose/10 border border-salve-rose/20 text-[9px] text-salve-rose font-medium">
                <AlertTriangle size={8} /> Boxed Warning
              </span>
            )}
          </div>
        )}
        {!isExpanded && (() => {
          const cycleLabel = getCycleRelatedLabel(m);
          const pgxMatches = findPgxMatches(m.display_name || m.name, data.genetic_results);
          if (!cycleLabel && pgxMatches.length === 0) return null;
          return (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {cycleLabel && (
                <span className="inline-flex items-center gap-0.5 py-0.5 px-1.5 rounded-full bg-salve-rose/10 border border-salve-rose/20 text-[9px] text-salve-rose font-medium">
                  <Heart size={8} /> {cycleLabel}
                </span>
              )}
              {pgxMatches.map((pm, i) => (
                <span key={i} className={`inline-flex items-center gap-0.5 py-0.5 px-1.5 rounded-full text-[9px] font-medium ${
                  pm.severity === 'danger' ? 'bg-salve-rose/10 border border-salve-rose/20 text-salve-rose'
                    : pm.severity === 'caution' ? 'bg-salve-amber/10 border border-salve-amber/20 text-salve-amber'
                    : 'bg-salve-lav/10 border border-salve-lav/20 text-salve-lav'
                }`}>
                  <Zap size={8} /> {pm.gene} {pm.phenotype.split(' ')[0]}
                </span>
              ))}
            </div>
          );
        })()}
      </div>
      <div className="flex items-center gap-1 ml-2">
        {m.refill_date && !isExpanded && <span className="text-[13px] text-salve-amber font-medium">{daysUntil(m.refill_date)}</span>}
        <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </div>
    </div>
  );
```

Verify that the helper matches the existing card body — if origin's Medications.jsx added anything new inside the card (not seen in the read so far), copy it into `renderMedCardBody` identically. The goal of this step is "no visible change" — just a mechanical extraction.

- [ ] **Step 2: Replace the `fl.map` render block with grouped rendering**

Find the `{fl.length === 0 ? ( <EmptyState ... /> ) : fl.map(m => { ... })}` block at the bottom of `listContent`. Replace the entire ternary body with:

```jsx
      {fl.length === 0 ? (
        <EmptyState
          icon={Pill}
          text="No medications yet"
          hint="Track your meds to get drug interaction checks, refill reminders, and Sage insights that factor in your current regimen."
          motif="leaf"
          actionLabel="Add your first medication"
          onAction={() => setSubView('form')}
        />
      ) : (() => {
        const renderCard = (m) => {
          const isExpanded = expandedId === m.id;
          return (
            <Card
              key={m.id}
              id={`record-${m.id}`}
              onClick={() => setExpandedId(isExpanded ? null : m.id)}
              className={`cursor-pointer transition-all${highlightId === m.id ? ' highlight-ring' : ''}${isDesktop && expandedId === m.id ? ' ring-2 ring-salve-lav/30' : ''}`}
            >
              {renderMedCardBody(m, isExpanded)}
              {!isDesktop && (
                <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                  {isExpanded && renderMedDetail(m)}
                </div></div>
              )}
              <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('medications', id))} onCancel={del.cancel} itemId={m.id} />
            </Card>
          );
        };

        if (sortMode === 'category' && groupedMeds.active.length > 0) {
          const byCat = groupedMeds.active.reduce((acc, m) => {
            const key = m.category || 'medication';
            (acc[key] = acc[key] || []).push(m);
            return acc;
          }, {});
          const catLabel = (k) => MED_CATEGORIES.find(c => c.value === k)?.label || k;
          return (
            <>
              {Object.entries(byCat).map(([k, meds]) => (
                <div key={k}>
                  <div className="text-[11px] font-semibold font-montserrat text-salve-textFaint uppercase tracking-wider mt-3 mb-1.5 px-1">
                    {catLabel(k)}
                  </div>
                  {meds.map(renderCard)}
                </div>
              ))}
              {groupedMeds.discontinued.length > 0 && (
                <DiscontinuedToggle
                  count={groupedMeds.discontinued.length}
                  open={showDiscontinued}
                  onToggle={() => setShowDiscontinued(o => !o)}
                  renderCards={() => groupedMeds.discontinued.map(renderCard)}
                />
              )}
            </>
          );
        }

        return (
          <>
            {groupedMeds.active.map(renderCard)}
            {groupedMeds.discontinued.length > 0 && (
              <DiscontinuedToggle
                count={groupedMeds.discontinued.length}
                open={showDiscontinued}
                onToggle={() => setShowDiscontinued(o => !o)}
                renderCards={() => groupedMeds.discontinued.map(renderCard)}
              />
            )}
          </>
        );
      })()}
```

- [ ] **Step 3: Add the sort dropdown UI next to the filter pills**

Find the existing filter pill row in `listContent` (around `Medications.jsx:732-744` — the `flex gap-1.5 mb-3.5` wrapper that maps `['active', 'inactive', 'all']`). Replace that block with:

```jsx
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div className="flex gap-1.5">
          {['active', 'inactive', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat capitalize ${
                filter === f ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-salve-textFaint font-montserrat">
          <span className="sr-only">Sort medications by</span>
          <span aria-hidden="true">Sort:</span>
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value)}
            className="bg-salve-card2 border border-salve-border rounded-lg text-xs text-salve-text font-montserrat py-1 px-2 cursor-pointer appearance-none pr-6 truncate max-w-[150px]"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236e6a80' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
          >
            <option value="alpha">A–Z</option>
            <option value="schedule">Schedule</option>
            <option value="refill">Refill date</option>
            <option value="category">Category</option>
          </select>
        </label>
      </div>
```

- [ ] **Step 4: Dev-server sanity check**

```bash
npm run dev
```

Open the Medications page. Expected:

1. Meds render in alphabetical order by default.
2. Switching "Sort" dropdown to Schedule/Refill/Category re-sorts correctly.
3. Category sort renders the small-caps section headers between groups.
4. Discontinued meds (if any) appear behind a `▸ N discontinued med(s)` toggle at the bottom, collapsed by default.
5. Refreshing the page preserves the sort mode.
6. Filter pills (active/inactive/all) still work.
7. Interaction warnings still render above the list.
8. Card body rendering is identical to before (just factored through `renderMedCardBody`).

Stop the dev server (Ctrl-C).

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/Medications.jsx
git commit -m "feat(meds): render sorted/grouped list with sort dropdown"
```

---

## Task 6: Medications.jsx — delete the FDA accordion

**Files:**
- Modify: `src/components/sections/Medications.jsx`

This task only removes code. The expanded detail pane will look bare-ish until Task 7 adds the "At a glance" block. That's intentional: small commits, each buildable.

- [ ] **Step 1: Remove the FDA detail state and `stripFdaHeader` helper**

Delete these lines from `Medications.jsx`:

1. The `const [fdaDetailId, setFdaDetailId] = useState(null);` line
2. The `const [fdaExpanded, setFdaExpanded] = useState({});` line
3. The `stripFdaHeader` function definition and its JSDoc comment:

```jsx
  /** Strip leading FDA section headers like "ADVERSE REACTIONS" or "Pregnancy:" from label text */
  const stripFdaHeader = (text) => {
    if (!text) return text;
    return text.replace(/^[A-Z][A-Z &/,()-]+(?::\s*|\s+)/,'').replace(/^\s+/,'');
  };
```

- [ ] **Step 2: Remove the boxed warning "Show more/less" toggle**

Find the `{/* ── Boxed warning (expandable) ── */}` block inside `renderMedDetail` (was around `Medications.jsx:506-519`). Replace the entire block with a minimal render using `fdaBullet` — we'll upgrade it into a proper banner in Task 7:

```jsx
          {/* Boxed warning — compact render, replaced with proper banner in Task 7 */}
          {m.fda_data.boxed_warning?.length > 0 && (
            <div className="mt-1.5">
              <div className="flex items-center gap-1 text-[12px] text-salve-rose font-medium">
                <AlertTriangle size={10} /> FDA Black Box Warning
              </div>
              <div className="mt-1 text-[12px] text-salve-rose/80 leading-relaxed">
                {fdaBullet(m.fda_data.boxed_warning[0], 180)}
              </div>
            </div>
          )}
```

- [ ] **Step 3: Remove the indications "Show more/less" toggle**

Find the `{/* ── Indications (always visible when available) ── */}` block (was around `Medications.jsx:520-530`). Delete it entirely. "Used for" comes back through the At a glance block in Task 7.

- [ ] **Step 4: Remove the 8-section "More drug details" accordion**

Find the `{/* ── Drug Details toggle ── */}` block (was around `Medications.jsx:531-577`) — the entire `<>…</>` fragment containing the button, the conditional, and the `.map` over 8 FDA fields. Delete it entirely.

After this deletion, the inline FDA summary chip row (generic/brand/mfr/class/how it works, roughly `Medications.jsx:488-505`) still renders. Keep that — Task 7 restructures it into the At a glance block.

- [ ] **Step 5: Add the `fdaBullet` import**

At the top of `src/components/sections/Medications.jsx`, add to the existing imports:

```jsx
import { fdaBullet } from '../../services/profile';
```

- [ ] **Step 6: Dev-server sanity check**

```bash
npm run dev
```

Open a med that has FDA data. Expected:

1. Expanded detail shows the chip row (generic/brand/class/MOA/mfr) — unchanged.
2. Boxed warning shows as a compact 1-sentence block rendered by `fdaBullet`, no "Show more" button.
3. The 8-section accordion and "More drug details" button are gone.
4. "Used for" line is gone (temporarily — comes back in Task 7).
5. No console errors.

Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/sections/Medications.jsx
git commit -m "refactor(meds): delete FDA section accordion and show-more togglers"
```

---

## Task 7: Medications.jsx — "At a glance" block + DailyMed chips

**Files:**
- Modify: `src/components/sections/Medications.jsx`

- [ ] **Step 1: Replace the inline FDA summary chip row with the stacked "At a glance" block**

Find the `{/* ── Inline FDA summary ── */}` block in `renderMedDetail`. It opens the `<div className="mt-2 p-2.5 rounded-lg bg-salve-sage/5 border border-salve-sage/15">` container and renders the chip row with a `flex flex-wrap gap-x-4 gap-y-1 text-[13px]` wrapper.

Replace the entire chip row wrapper (the `<div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]"> ... </div>` and its children) with a stacked rows layout plus a new "Used for" row:

```jsx
          <div className="text-[11px] font-semibold font-montserrat text-salve-sage uppercase tracking-wider mb-1.5">At a glance</div>
          <dl className="space-y-1 text-[13px]">
            {m.fda_data.generic_name && m.fda_data.generic_name.toLowerCase() !== m.name.toLowerCase() && (
              <div className="flex gap-2">
                <dt className="text-salve-textFaint w-24 flex-shrink-0">Generic</dt>
                <dd className="text-salve-textMid flex-1">{m.fda_data.generic_name}</dd>
              </div>
            )}
            {m.fda_data.brand_name && m.fda_data.brand_name.toLowerCase() !== m.name.toLowerCase() && (
              <div className="flex gap-2">
                <dt className="text-salve-textFaint w-24 flex-shrink-0">Brand</dt>
                <dd className="text-salve-textMid flex-1">{m.fda_data.brand_name}</dd>
              </div>
            )}
            {m.fda_data.pharm_class?.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-salve-textFaint w-24 flex-shrink-0">Class</dt>
                <dd className="text-salve-textMid flex-1">{m.fda_data.pharm_class.map(c => c.replace(/ \[.*\]$/, '')).join(', ')}</dd>
              </div>
            )}
            {m.fda_data.pharm_class_moa?.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-salve-textFaint w-24 flex-shrink-0">How it works</dt>
                <dd className="text-salve-textMid flex-1">{m.fda_data.pharm_class_moa.map(c => c.replace(/ \[.*\]$/, '')).join(', ')}</dd>
              </div>
            )}
            {m.fda_data.indications?.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-salve-textFaint w-24 flex-shrink-0">Used for</dt>
                <dd className="text-salve-textMid flex-1">{fdaBullet(m.fda_data.indications[0], 160)}</dd>
              </div>
            )}
            {m.fda_data.manufacturer && (
              <div className="flex gap-2">
                <dt className="text-salve-textFaint w-24 flex-shrink-0">Mfr</dt>
                <dd className="text-salve-textMid flex-1">{m.fda_data.manufacturer}</dd>
              </div>
            )}
          </dl>
```

This replaces only the chip row's content. Do NOT close the outer `<div className="mt-2 p-2.5 rounded-lg bg-salve-sage/5 border border-salve-sage/15">` — the boxed warning banner and DailyMed chips in the next steps live inside it.

- [ ] **Step 2: Upgrade the boxed warning banner with DailyMed link**

The placeholder from Task 6 Step 2 currently renders right after the chip row. Find it and replace with:

```jsx
          {m.fda_data.boxed_warning?.length > 0 && (
            <div className="mt-2.5 p-2 rounded-lg bg-salve-rose/5 border border-salve-rose/20">
              <div className="flex items-center gap-1 text-[12px] text-salve-rose font-semibold mb-0.5">
                <AlertTriangle size={11} aria-hidden="true" /> FDA Black Box Warning
              </div>
              <div className="text-[12px] text-salve-rose/85 leading-relaxed">
                {fdaBullet(m.fda_data.boxed_warning[0], 180)}
              </div>
              <a
                href={dailyMedUrl(m.fda_data?.brand_name || m.fda_data?.generic_name || m.display_name || m.name, m.rxcui, m.fda_data?.spl_set_id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 mt-1 text-[11px] text-salve-rose/90 font-medium no-underline hover:underline"
              >
                Read full FDA label on DailyMed <ExternalLink size={9} aria-hidden="true" />
              </a>
            </div>
          )}
```

- [ ] **Step 3: Add the three DailyMed quick-link chips**

Directly after the boxed warning block, still inside the At a glance container, add:

```jsx
          {/* DailyMed deep-link chips */}
          <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-salve-sage/15">
            {['Side effects', 'Dosage', 'Interactions'].map(label => (
              <a
                key={label}
                href={dailyMedUrl(m.fda_data?.brand_name || m.fda_data?.generic_name || m.display_name || m.name, m.rxcui, m.fda_data?.spl_set_id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 py-1 px-2 rounded-full bg-salve-card2 border border-salve-border text-[11px] text-salve-textMid font-montserrat no-underline hover:border-salve-sage/30 hover:text-salve-sage transition-colors"
                aria-label={`View ${label.toLowerCase()} for ${m.display_name || m.name} on DailyMed`}
              >
                {label} <ExternalLink size={9} aria-hidden="true" />
              </a>
            ))}
          </div>
```

The existing `</div>` that closes the At a glance container stays where it is (it was already in the original inline FDA summary block from the file).

- [ ] **Step 4: Dev-server sanity check**

```bash
npm run dev
```

Open a med that has FDA data (for example one with `fda_data.indications`). Expected:

1. An "AT A GLANCE" small-caps header above a stacked rows layout.
2. "Used for" row renders one clean sentence without a leading section number or all-caps prefix.
3. Boxed warning (if present) renders as a compact banner with a "Read full FDA label on DailyMed" link.
4. Three chips `[Side effects ↗] [Dosage ↗] [Interactions ↗]` at the bottom of the At a glance block.
5. Clicking a chip opens DailyMed in a new tab and does NOT collapse the card (because of `stopPropagation`).

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/Medications.jsx
git commit -m "feat(meds): replace FDA accordion with At a glance block and DailyMed chips"
```

---

## Task 8: Medications.jsx — card-surface reminder row

**Files:**
- Modify: `src/components/sections/Medications.jsx`

- [ ] **Step 1: Add imports and a minute-tick hook**

At the top of the file, extend the lucide-react import to include `Clock`:

```jsx
import { Plus, Check, Edit, Trash2, Pill, AlertTriangle, Sparkles, Loader, ChevronDown, Search, MapPin, ExternalLink, Unlink, Download, RefreshCw, Info, DollarSign, Heart, Zap, Clock } from 'lucide-react';
```

Add the reminders util import next to the other util imports:

```jsx
import { formatTime, getNextDoseIn } from '../../utils/reminders';
```

Inside the `Medications` component body, directly after the `const del = useConfirmDelete();` line, add a minute-tick so `getNextDoseIn()` recomputes each minute:

```jsx
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
```

- [ ] **Step 2: Fill the card-surface reminder row placeholder**

In `renderMedCardBody` (added in Task 5 Step 1), find the placeholder:

```jsx
        {/* Card-surface reminder row — filled in by Task 8. Placeholder for now. */}
        {null}
```

Replace with:

```jsx
        {(() => {
          if (m.active === false) return null;
          const reminders = (data.medication_reminders || [])
            .filter(r => r.medication_id === m.id)
            .sort((a, b) => (a.reminder_time || '').localeCompare(b.reminder_time || ''));
          const enabled = reminders.filter(r => r.enabled);
          if (enabled.length === 0) {
            return (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setExpandedId(m.id); setReminderAddId(m.id); setReminderTime('08:00'); }}
                className="inline-flex items-center gap-1 mt-1 text-[12px] text-salve-lav bg-transparent border-none cursor-pointer p-0 hover:underline font-montserrat"
                aria-label={`Set a reminder for ${m.display_name || m.name}`}
              >
                <Clock size={11} aria-hidden="true" /> Set reminder
              </button>
            );
          }
          const timeLabels = enabled.map(r => formatTime(r.reminder_time)).join(' · ');
          const nextIn = getNextDoseIn(enabled, nowTick);
          const aria = nextIn
            ? `Scheduled at ${timeLabels}, next dose in ${nextIn}`
            : `Scheduled at ${timeLabels}`;
          return (
            <div className="flex items-center gap-2 mt-1 text-[12px] text-salve-textMid" aria-label={aria}>
              <Clock size={11} className="text-salve-lav flex-shrink-0" aria-hidden="true" />
              <span className="font-montserrat">{timeLabels}</span>
              {nextIn && <span className="text-salve-textFaint font-montserrat">· Next in {nextIn}</span>}
            </div>
          );
        })()}
```

- [ ] **Step 3: Dev-server sanity check**

```bash
npm run dev
```

Open the Medications page. Expected:

1. A med with no reminders shows a `⏰ Set reminder` lavender inline button on the collapsed card.
2. Clicking "Set reminder" expands the card and surfaces the existing time picker.
3. A med with one or more enabled reminders shows `⏰ 8:00 AM` (or whatever times) with `· Next in Xh Ym` next to it.
4. Next-dose countdown ticks down once a minute (leave dev server open for >60 seconds on a relevant card to confirm).
5. Discontinued meds do not show the reminder row.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/sections/Medications.jsx
git commit -m "feat(meds): show reminder times and next-dose countdown on card surface"
```

---

## Task 9: Medications.jsx — move Schedule block to top of detail pane + polish

**Files:**
- Modify: `src/components/sections/Medications.jsx`

- [ ] **Step 1: Import push state**

Add at the top of the file alongside other service imports:

```jsx
import { isSubscribed as isPushSubscribed } from '../../services/push';
```

Inside the `Medications` component body, add a one-time state read next to the other state:

```jsx
  const [pushOn, setPushOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    isPushSubscribed().then(v => { if (!cancelled) setPushOn(!!v); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 2: Extract the reminders block into a helper**

Inside the component, above `renderMedDetail`, add:

```jsx
  const renderScheduleBlock = (m) => {
    const medReminders = (data.medication_reminders || [])
      .filter(r => r.medication_id === m.id)
      .sort((a, b) => (a.reminder_time || '').localeCompare(b.reminder_time || ''));
    const isAdding = reminderAddId === m.id;
    return (
      <div className="mt-2 p-2.5 rounded-lg bg-salve-lav/5 border border-salve-lav/15">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold font-montserrat text-salve-lav uppercase tracking-wider">Schedule</span>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-montserrat ${pushOn ? 'text-salve-sage' : 'text-salve-textFaint'}`}>
              {pushOn ? '🔔 Notifications on' : (
                <a
                  href="#"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); onNav?.('settings'); }}
                  className="text-salve-textFaint no-underline hover:text-salve-lav hover:underline"
                >
                  Set up notifications →
                </a>
              )}
            </span>
            {!isAdding && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setReminderAddId(m.id); setReminderTime('08:00'); }}
                className="inline-flex items-center gap-0.5 text-[12px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer p-0 hover:underline"
              >
                <Plus size={11} aria-hidden="true" /> Add time
              </button>
            )}
          </div>
        </div>

        {isAdding && (
          <div className="flex items-center gap-2 mb-2 px-1 py-1.5 rounded-lg bg-salve-card border border-salve-lav/30">
            <input
              type="time"
              value={reminderTime}
              onChange={e => setReminderTime(e.target.value)}
              onClick={e => e.stopPropagation()}
              autoFocus
              className="bg-salve-card2 border border-salve-border rounded-lg px-2 py-1 text-xs text-salve-text font-montserrat focus:outline-none focus:ring-1 focus:ring-salve-lav/40"
            />
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                if (reminderTime) {
                  addItem('medication_reminders', { medication_id: m.id, reminder_time: reminderTime + ':00', enabled: true });
                  setReminderAddId(null);
                }
              }}
              className="text-[13px] px-2.5 py-1 rounded-full bg-salve-lav/20 border border-salve-lav/30 text-salve-lav font-montserrat font-medium cursor-pointer hover:bg-salve-lav/30 transition-colors"
            >Save</button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setReminderAddId(null); }}
              className="text-[13px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-text"
            >Cancel</button>
          </div>
        )}

        {medReminders.length === 0 && !isAdding && (
          <p className="text-[12px] text-salve-textFaint/70 font-montserrat italic">No reminders set. Tap "Add time" to schedule one.</p>
        )}

        {medReminders.map(r => (
          <div key={r.id} className="flex items-center justify-between py-1 first:pt-0">
            <div className="flex items-center gap-2">
              <Clock size={11} className={r.enabled ? 'text-salve-lav' : 'text-salve-textFaint'} aria-hidden="true" />
              <span className={`text-[13px] font-montserrat ${r.enabled ? 'text-salve-text' : 'text-salve-textFaint line-through'}`}>
                {formatTime(r.reminder_time)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); updateItem('medication_reminders', r.id, { enabled: !r.enabled }); }}
                className="text-[12px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-lav"
              >{r.enabled ? 'Pause' : 'Enable'}</button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeItem('medication_reminders', r.id); }}
                className="text-[12px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-rose"
              >Remove</button>
            </div>
          </div>
        ))}
      </div>
    );
  };
```

- [ ] **Step 3: Delete the old reminders block and call the helper at the top of `renderMedDetail`**

Find the old reminders render inside `renderMedDetail` — the `{/* Reminders */}` IIFE (was around `Medications.jsx:602-669`). It starts with `{/* Reminders */}` and ends at the closing `})()` of the IIFE. Delete the entire block.

Then, at the very start of `renderMedDetail`'s returned JSX — directly inside the top-level wrapper, before the existing content — add:

```jsx
      {renderScheduleBlock(m)}
```

The new `renderMedDetail` JSX order becomes:

1. Schedule block (new, top)
2. Cycle/PGx chips (existing)
3. Generic/brand badge (existing)
4. At a glance block (from Task 7)
5. Journal mentions (existing, moved down because reminders used to be here)
6. Edit/Delete/DailyMed/Compare Prices action row (existing)

- [ ] **Step 4: Dev-server sanity check**

```bash
npm run dev
```

Open the Medications page.

1. Expand a med with no reminders. Schedule block renders at the top of the detail, says "No reminders set. Tap 'Add time' to schedule one."
2. Tap "Add time", set a time, Save. Reminder appears in the list immediately with a Pause + Remove action.
3. Tap Pause. The time row goes faint + strikethrough, button label becomes "Enable".
4. Tap Enable. Reverts.
5. Tap Remove. Reminder disappears.
6. Notification status chip: if push is subscribed, shows "🔔 Notifications on"; otherwise shows a "Set up notifications →" link that navigates to Settings.
7. From Task 8, the card-surface "Set reminder" button on a med with no reminders still expands the card and surfaces the Add time picker.
8. Journal mentions (if any) still render below At a glance, not below Schedule.

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/Medications.jsx
git commit -m "feat(meds): promote Schedule block to top of detail pane with push status"
```

---

## Task 10: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Medications.jsx docstring in the file tree**

In `CLAUDE.md`, find the existing `Medications.jsx` entry in the file tree (a long paragraph starting `│       ├── Medications.jsx │ Med list …`). Replace it with:

```
│       ├── Medications.jsx     # Med list with sort modes (A-Z / Schedule / Refill date / Category, persisted to `salve:med-sort`), active+discontinued grouping with collapsed "N discontinued" toggle. Card surface shows reminder times + next-dose countdown (minute-tick) or inline "Set reminder" button. Expanded detail renders Schedule block at the top (with push notification status read from Push.js), then At a glance (stacked rows: generic/brand/class/MOA/used-for/mfr), then compact boxed warning banner with "Read full FDA label on DailyMed" link, then three DailyMed deep-link chips (Side effects / Dosage / Interactions), then pharmacy+refill, cost, journal mentions, action row. 8-section FDA accordion has been removed — Sage still gets FDA clinical context via expanded condenseFDA() in profile.js (indications/dosage/precautions via the new fdaBullet helper, plus existing boxed warning/contraindications/interactions/adverse reactions/pregnancy with budgets from commit 5db1977 preserved). Also: RxNorm autocomplete, OpenFDA drug info, bulk RxCUI linking, bulk FDA enrichment, pharmacy picker/filter, GoodRx price links, NADAC price lookup + sparklines + history + compare prices, interaction warnings on add, monthly wholesale cost estimate, PGx drug-gene badges, cycle-related badges, Desktop SplitView via renderMedDetail() extracted function, lavender selection ring on active card.
```

- [ ] **Step 2: Add "Today's doses checklist" to the Roadmap**

Find the `## To Do` section in `CLAUDE.md`. Add a new bullet at the end of the unchecked items:

```markdown
- [ ] **Today's doses checklist (heavier reminders version)** — Surface a top-of-page "Today" block in Medications that lists every reminder firing today (sorted by time), with a "Taken ✓" button per dose that writes a lightweight adherence record and optionally a journal entry tagged with the med and timestamp. Requires: `medication_reminders.days_of_week` column (new migration) so users can say "weekdays only", a new `dose_logs` table (or a journal-entry convention) to record taken/missed events, extension of the existing `/api/cron-reminders.js` + `Push.js` flow to per-reminder-time delivery with action buttons (Take / Snooze / Skip), and Dashboard quick-access integration. Turns Medications from a reference page into an active daily tool. Deferred from the 2026-04-15 Medications redesign — the lighter version landed with that redesign.
```

- [ ] **Step 3: Update the Testing Checklist**

Find the `### Medical API Integration Tests` section in the Testing Checklist. Under `Medications:`, add these new entries alongside the existing ones:

```markdown
- [ ] Medications: sort dropdown defaults to A–Z, persists to localStorage `salve:med-sort`
- [ ] Medications: Schedule sort buckets morning → midday → evening → bedtime → PRN
- [ ] Medications: Refill date sort puts meds without refill_date last
- [ ] Medications: Category sort renders small-caps section headers
- [ ] Medications: Discontinued meds collapse behind a "N discontinued" toggle
- [ ] Medications: Collapsed card shows reminder times + "Next in Xh Ym" when reminders exist
- [ ] Medications: Collapsed card shows "⏰ Set reminder" inline button when no reminders
- [ ] Medications: Schedule block renders at the top of the expanded detail with push status chip
- [ ] Medications: At a glance block renders clean "Used for" sentence (no "1 INDICATIONS AND USAGE" prefix)
- [ ] Medications: DailyMed deep-link chips (Side effects / Dosage / Interactions) open DailyMed without collapsing card
- [ ] Medications: Boxed warning banner shows ≤180 chars via fdaBullet with "Read full FDA label on DailyMed →" link
- [ ] Medications: 8-section FDA accordion is gone from the codebase (grep for fdaDetailId / fdaExpanded returns nothing)
- [ ] Sage: condenseFDA includes "used for / dosing / precautions" for meds with those FDA fields
- [ ] Sage: fdaBullet strips "1 INDICATIONS AND USAGE" prefixes without touching short acronyms like "MRI"
- [ ] Sage: existing condenseFDA field budgets from commit 5db1977 (140/100/100/120/80) are preserved
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update Medications docstring and roadmap for redesign"
```

---

## Final verification

- [ ] **Step 1: Run both verifiers**

```bash
node scripts/verify-condense-fda.mjs
node scripts/verify-reminders-util.mjs
```

Expected: both exit 0 with all assertions passing.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: build succeeds with no errors. Warnings are acceptable if they already existed on main.

- [ ] **Step 3: Manual UI walkthrough**

```bash
npm run dev
```

Go through every item from the testing checklist added to `CLAUDE.md` in Task 10 Step 3.

- [ ] **Step 4: Git log sanity**

```bash
git log --oneline origin/main..HEAD
```

Expected: 10 commits, each with a clear `feat(meds)` / `feat(ai)` / `refactor(meds)` / `docs:` prefix.

---

## Self-review

**1. Spec coverage:**
- § 1 Sort & grouping → Task 4 (state + memo) + Task 5 (render + dropdown UI). ✓
- § 2 "At a glance" block → Task 7. ✓
- § 2 DailyMed chips → Task 7 Step 3. ✓
- § 2 Compact boxed warning → Task 7 Step 2 (using fdaBullet). ✓
- § 3 Card-surface reminders row → Task 8. ✓
- § 3 Schedule block at top of detail pane → Task 9. ✓
- § 4 condenseFDA expansion with fdaBullet + existing budgets preserved → Tasks 1 + 3. ✓
- § 5 Helpers in profile.js (not utils/fda.js) → Task 1. ✓
- § 6 Delete list (fdaDetailId, fdaExpanded, stripFdaHeader, accordion) → Task 6. ✓
- § 7 Files touched → all six covered (profile.js, reminders.js, Medications.jsx, verify-condense-fda.mjs, verify-reminders-util.mjs, CLAUDE.md). ✓
- § 8 Testing checklist additions → Task 10 Step 3. ✓
- § 9 "Today's doses" future to-do → Task 10 Step 2. ✓

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "similar to task N", "add error handling" language. Every code-changing step shows the exact code. ✓

**3. Type consistency:** `fdaBullet(text, limit)` matches Task 1 definition, Task 3 use in condenseFDA, Task 6/7 uses in Medications.jsx. `getNextDoseIn(reminders, now)` matches Task 2 definition, Task 8 call site. `formatTime(hhmmss)` matches Task 2 definition, Task 8 and Task 9 call sites. `groupedMeds.active / .discontinued` shape matches Tasks 4 and 5. `renderMedCardBody(m, isExpanded)` and `renderScheduleBlock(m)` signatures consistent between their Task 5/9 definitions and Task 8's placeholder fill-in. ✓
