# Cycle Tracker Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the 5 remaining Cycle Tracker features: shared utility extraction, vitals/journal cycle phase correlation, AI cycle pattern analysis, medication cycle awareness, and Dashboard quick-log.

**Architecture:** All features build on a shared `getCyclePhaseForDate()` utility extracted from CycleTracker.jsx. Every correlation is computed on-the-fly at render time from existing cycle data — no schema changes, no new tables. The AI feature adds a new entry in AIPanel's FEATURES array with a dedicated prompt and chart.

**Tech Stack:** React 18, Recharts (already installed), Tailwind CSS, Supabase (existing), Anthropic API (existing proxy)

**Spec:** `docs/superpowers/specs/2026-04-01-cycle-tracker-completion-design.md`

---

## Task 1: Extract Shared Cycle Utility

**Files:**
- Create: `src/utils/cycles.js`
- Modify: `src/components/sections/CycleTracker.jsx`

- [ ] **Step 1: Create `src/utils/cycles.js` with extracted functions + new `getCyclePhaseForDate`**

```js
// src/utils/cycles.js
import { C } from '../constants/colors';

export function getCyclePhase(dayOfCycle, avgLen) {
  if (dayOfCycle <= 0) return null;
  if (dayOfCycle <= 5) return { name: 'Menstrual', color: C.rose };
  const ovDay = Math.round(avgLen - 14);
  if (dayOfCycle < ovDay - 4) return { name: 'Follicular', color: C.sage };
  if (dayOfCycle <= ovDay + 1) return { name: 'Ovulatory', color: C.amber };
  return { name: 'Luteal', color: C.lav };
}

export function computeCycleStats(cycles) {
  const periods = cycles
    .filter(c => c.type === 'period')
    .map(c => c.date)
    .sort();

  if (periods.length < 2) return { avgLength: 28, lastPeriod: periods[0] || null, periodStarts: [] };

  const starts = [];
  let prev = null;
  for (const d of periods) {
    const dt = new Date(d + 'T00:00:00');
    if (!prev || (dt - prev) > 2 * 86400000) starts.push(d);
    prev = dt;
  }

  const lengths = [];
  for (let i = 1; i < starts.length; i++) {
    const diff = Math.round((new Date(starts[i] + 'T00:00:00') - new Date(starts[i - 1] + 'T00:00:00')) / 86400000);
    if (diff >= 18 && diff <= 45) lengths.push(diff);
  }

  const avgLength = lengths.length > 0 ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 28;
  return { avgLength, lastPeriod: starts[starts.length - 1] || null, periodStarts: starts };
}

export function predictNextPeriod(stats) {
  if (!stats.lastPeriod) return null;
  const next = new Date(stats.lastPeriod + 'T00:00:00');
  next.setDate(next.getDate() + stats.avgLength);
  return next.toISOString().slice(0, 10);
}

export function getDayOfCycle(stats) {
  if (!stats.lastPeriod) return 0;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const last = new Date(stats.lastPeriod + 'T00:00:00');
  return Math.floor((now - last) / 86400000) + 1;
}

/**
 * Given a date string and cycles array, returns the cycle phase for that date.
 * Returns { phase: 'Luteal', dayOfCycle: 22, color: '#b8a9e8' } or null.
 */
export function getCyclePhaseForDate(date, cycles) {
  if (!cycles || cycles.length === 0 || !date) return null;

  const stats = computeCycleStats(cycles);
  if (!stats.periodStarts.length) return null;

  // Find the most recent period start <= date
  const target = new Date(date + 'T00:00:00');
  let startDate = null;
  for (let i = stats.periodStarts.length - 1; i >= 0; i--) {
    const s = new Date(stats.periodStarts[i] + 'T00:00:00');
    if (s <= target) { startDate = s; break; }
  }
  if (!startDate) return null;

  const dayOfCycle = Math.floor((target - startDate) / 86400000) + 1;
  // Skip if the day is beyond 2x avg length (likely between tracked cycles)
  if (dayOfCycle > stats.avgLength * 2) return null;

  const phase = getCyclePhase(dayOfCycle, stats.avgLength);
  if (!phase) return null;

  return { phase: phase.name, dayOfCycle, color: phase.color };
}
```

- [ ] **Step 2: Update CycleTracker.jsx to import from utils/cycles.js**

In `src/components/sections/CycleTracker.jsx`:

Replace the import block (lines 1-14) with:

```js
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Check, Edit, Trash2, Heart, Calendar, ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { fmtDate } from '../../utils/dates';
import { C } from '../../constants/colors';
import { EMPTY_CYCLE, FLOW_LEVELS, CYCLE_SYMPTOMS, FERTILITY_MARKERS } from '../../constants/defaults';
import { detectFloFormat, parseFloExport } from '../../services/flo';
import { computeCycleStats, getCyclePhase, predictNextPeriod, getDayOfCycle } from '../../utils/cycles';
```

Delete the local function definitions (lines 16-67 — the `getCyclePhase`, `computeCycleStats`, `predictNextPeriod`, `getDayOfCycle` functions and the `/* ── Cycle helpers */` comment block). Keep the `/* ── Calendar helpers */` section and everything after.

- [ ] **Step 3: Verify CycleTracker still works**

Run: `npm run dev`
Navigate to the Cycles section. Verify:
- Stats card shows current cycle day, avg length, days until next
- Calendar renders with period days, predicted overlay, fertile window
- Adding/editing/deleting entries works
- Flo import button works

- [ ] **Step 4: Commit**

```bash
git add src/utils/cycles.js src/components/sections/CycleTracker.jsx
git commit -m "refactor: extract cycle utilities to src/utils/cycles.js

Move computeCycleStats, getCyclePhase, predictNextPeriod, getDayOfCycle
from CycleTracker.jsx to shared utility. Add getCyclePhaseForDate for
cross-feature cycle phase lookups."
```

---

## Task 2: Vitals — Cycle Phase Badges on Cards

**Files:**
- Modify: `src/components/sections/Vitals.jsx`

- [ ] **Step 1: Add import for cycle utility and Badge**

At the top of `src/components/sections/Vitals.jsx`, add these imports (Badge is not currently imported):

```js
import Badge from '../ui/Badge';
import { getCyclePhaseForDate } from '../../utils/cycles';
```

- [ ] **Step 2: Add phase badge to vitals card rendering**

Find the vitals list section. Search for the line that renders each vital's date (grep for `fmtDate` in Vitals.jsx). In the card rendering for each vital entry, after the date display, add:

```jsx
{data.cycles?.length > 0 && (() => {
  const cp = getCyclePhaseForDate(v.date, data.cycles);
  return cp ? (
    <span className="text-[10px] font-montserrat ml-1" style={{ color: cp.color }}>
      · {cp.phase} day {cp.dayOfCycle}
    </span>
  ) : null;
})()}
```

This renders inline next to the date text, e.g., `Mar 15 · Luteal day 22`.

- [ ] **Step 3: Verify badges appear**

Run: `npm run dev`
Navigate to Vitals. If the user has cycle data, each vitals card should show the phase badge next to the date. Cards for dates without cycle coverage show no badge.

- [ ] **Step 4: Commit**

```bash
git add src/components/sections/Vitals.jsx
git commit -m "feat: add cycle phase badges to vitals cards

Shows phase name and day next to date on each vitals card when
cycle data exists. Uses getCyclePhaseForDate for render-time lookup."
```

---

## Task 3: Vitals — Chart Cycle Phase Overlay

**Files:**
- Modify: `src/components/sections/Vitals.jsx`

- [ ] **Step 1: Add ReferenceArea import and overlay state**

In `src/components/sections/Vitals.jsx`, update the Recharts import to include `ReferenceArea`:

```js
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
```

Add `useMemo` to the React import if not already there.

Inside the component function, add state for the toggle:

```js
const [cycleOverlay, setCycleOverlay] = useState(() => localStorage.getItem('salve:vitals-cycle-overlay') === 'true');
```

- [ ] **Step 2: Compute phase bands for the chart date range**

After the `cd` (chart data) variable, add:

```js
const phaseBands = useMemo(() => {
  if (!cycleOverlay || !data.cycles?.length || cd.length < 2) return [];
  const bands = [];
  let currentPhase = null;
  let bandStart = null;

  for (const point of cd) {
    // cd uses formatted dates from fmtDate, but we need raw dates for lookup
    // Find the original vital for this data point to get the raw date
    const origVital = data.vitals.filter(v => v.type === ct).find(v => fmtDate(v.date) === point.date);
    if (!origVital) continue;

    const cp = getCyclePhaseForDate(origVital.date, data.cycles);
    const phaseName = cp?.phase || null;

    if (phaseName !== currentPhase) {
      if (currentPhase && bandStart) {
        bands.push({ phase: currentPhase, color: bands.length > 0 ? bands[bands.length - 1].color : getCyclePhaseForDate(origVital.date, data.cycles)?.color, x1: bandStart, x2: point.date });
      }
      currentPhase = phaseName;
      bandStart = point.date;
      if (cp) bands.push({ phase: cp.phase, color: cp.color, x1: point.date, x2: point.date });
    } else if (bands.length > 0) {
      bands[bands.length - 1].x2 = point.date;
    }
  }
  return bands;
}, [cycleOverlay, data.cycles, cd, ct, data.vitals]);
```

- [ ] **Step 3: Add toggle pill above the chart**

Above the `<Card>` that wraps the chart (around line 111 in original), add:

```jsx
{data.cycles?.length > 0 && cd.length > 1 && (
  <div className="flex justify-end mb-1.5">
    <button
      onClick={() => {
        const next = !cycleOverlay;
        setCycleOverlay(next);
        localStorage.setItem('salve:vitals-cycle-overlay', String(next));
      }}
      className={`py-1 px-3 rounded-full text-[10px] font-medium border cursor-pointer font-montserrat transition-colors ${
        cycleOverlay ? 'border-salve-rose bg-salve-rose/15 text-salve-rose' : 'border-salve-border bg-transparent text-salve-textFaint'
      }`}
    >
      Color by cycle phase
    </button>
  </div>
)}
```

- [ ] **Step 4: Render ReferenceArea bands inside the AreaChart**

Inside the `<AreaChart>` component, after the existing `<ReferenceLine>` elements and before the closing `</AreaChart>`, add:

```jsx
{phaseBands.map((band, i) => (
  <ReferenceArea
    key={`phase-${i}`}
    x1={band.x1}
    x2={band.x2}
    fill={band.color}
    fillOpacity={0.1}
    stroke="none"
  />
))}
```

- [ ] **Step 5: Verify chart overlay**

Run: `npm run dev`
Navigate to Vitals with cycle data present:
- Toggle pill appears above chart
- Clicking toggle shows colored phase bands behind the chart data
- Toggle state persists after navigating away and back
- Toggle is hidden when no cycle data exists

- [ ] **Step 6: Commit**

```bash
git add src/components/sections/Vitals.jsx
git commit -m "feat: add cycle phase overlay toggle to vitals chart

Adds 'Color by cycle phase' toggle that renders ReferenceArea bands
behind chart data showing menstrual/follicular/ovulatory/luteal phases.
Toggle persisted in localStorage."
```

---

## Task 4: Journal — Cycle Phase Badges + Form Info

**Files:**
- Modify: `src/components/sections/Journal.jsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/sections/Journal.jsx`, add:

```js
import { getCyclePhaseForDate } from '../../utils/cycles';
```

(Badge is already imported in Journal.jsx.)

- [ ] **Step 2: Add phase badge to journal entry cards**

In the journal entry card rendering, find where the date is displayed (search for `fmtDate` in the card). After the date text, add:

```jsx
{data.cycles?.length > 0 && (() => {
  const cp = getCyclePhaseForDate(e.date, data.cycles);
  return cp ? (
    <Badge style={{ color: cp.color, backgroundColor: `${cp.color}22` }} className="ml-1.5">
      {cp.phase} day {cp.dayOfCycle}
    </Badge>
  ) : null;
})()}
```

- [ ] **Step 3: Add phase info line in the form**

In the form view (the `if (subView === 'form')` block), after the Date `<Field>` component (line 65 in original), add:

```jsx
{data.cycles?.length > 0 && form.date && (() => {
  const cp = getCyclePhaseForDate(form.date, data.cycles);
  return cp ? (
    <div className="text-xs font-montserrat -mt-1 mb-1 pl-1" style={{ color: cp.color }}>
      Cycle day {cp.dayOfCycle} · {cp.phase} phase
    </div>
  ) : null;
})()}
```

- [ ] **Step 4: Verify**

Run: `npm run dev`
- Navigate to Journal with cycle data present
- Entry cards show phase badge next to date
- Open add/edit form, pick a date within a tracked cycle — phase info line appears below date field
- Pick a date outside cycle data — no phase info shown

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/Journal.jsx
git commit -m "feat: add cycle phase badges to journal entries + form

Shows cycle phase and day on journal cards. Form shows phase context
when editing a date covered by cycle data."
```

---

## Task 5: Journal — Mood-Phase Summary Card

**Files:**
- Modify: `src/components/sections/Journal.jsx`

- [ ] **Step 1: Add state for collapse toggle**

Inside the Journal component function, add:

```js
const [moodPhaseOpen, setMoodPhaseOpen] = useState(() => localStorage.getItem('salve:journal-mood-phase') !== 'false');
```

- [ ] **Step 2: Compute mood-phase data**

Add a `useMemo` computation:

```js
const moodByPhase = useMemo(() => {
  if (!data.cycles?.length) return null;
  const phases = {};
  for (const e of data.journal) {
    if (!e.mood) continue;
    const cp = getCyclePhaseForDate(e.date, data.cycles);
    if (!cp) continue;
    if (!phases[cp.phase]) phases[cp.phase] = { total: 0, count: 0, color: cp.color };
    const moodVal = typeof e.mood === 'number' ? e.mood : Number(e.mood);
    if (isNaN(moodVal)) continue;
    phases[cp.phase].total += moodVal;
    phases[cp.phase].count += 1;
  }
  // Need 2+ phases with 2+ entries each, and 5+ total entries
  const qualified = Object.entries(phases).filter(([, v]) => v.count >= 2);
  const totalEntries = qualified.reduce((sum, [, v]) => sum + v.count, 0);
  if (qualified.length < 2 || totalEntries < 5) return null;
  return qualified.map(([phase, v]) => ({
    phase,
    avg: Math.round((v.total / v.count) * 10) / 10,
    count: v.count,
    color: v.color,
  })).sort((a, b) => {
    const order = ['Menstrual', 'Follicular', 'Ovulatory', 'Luteal'];
    return order.indexOf(a.phase) - order.indexOf(b.phase);
  });
}, [data.journal, data.cycles]);
```

- [ ] **Step 3: Render the summary card**

In the main return (the non-form view), right after the `<SectionTitle>` and before the tag filter pills or entry list, add:

```jsx
{moodByPhase && (
  <Card className="mb-3">
    <button
      onClick={() => {
        const next = !moodPhaseOpen;
        setMoodPhaseOpen(next);
        localStorage.setItem('salve:journal-mood-phase', String(next));
      }}
      className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0"
    >
      <span className="text-xs font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Mood by Cycle Phase</span>
      <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${moodPhaseOpen ? 'rotate-180' : ''}`} />
    </button>
    {moodPhaseOpen && (
      <div className="mt-2.5 space-y-2">
        {moodByPhase.map(p => {
          const maxMood = 10;
          const pct = Math.round((p.avg / maxMood) * 100);
          return (
            <div key={p.phase} className="flex items-center gap-2.5">
              <span className="text-[11px] font-medium font-montserrat w-20 text-right" style={{ color: p.color }}>{p.phase}</span>
              <div className="flex-1 h-2 rounded-full bg-salve-card2 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: p.color + '66' }} />
              </div>
              <span className="text-[11px] font-montserrat text-salve-textMid w-8">{p.avg}</span>
            </div>
          );
        })}
        <div className="text-[9px] text-salve-textFaint font-montserrat text-center pt-1">
          Based on {moodByPhase.reduce((s, p) => s + p.count, 0)} journal entries with mood ratings
        </div>
      </div>
    )}
  </Card>
)}
```

- [ ] **Step 4: Verify**

Run: `npm run dev`
- Journal section shows mood-phase summary card when sufficient data exists
- Card is collapsible, collapse state persists
- Phase bars show correct averages
- Card hidden when insufficient data (fewer than 5 entries or fewer than 2 phases)

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/Journal.jsx
git commit -m "feat: add mood-by-cycle-phase summary card to Journal

Shows average mood per cycle phase with horizontal bars. Collapsible,
persisted. Requires 5+ mood entries across 2+ phases to appear."
```

---

## Task 6: Medication Cycle Awareness — Detection + Badges

**Files:**
- Modify: `src/constants/defaults.js`
- Modify: `src/components/sections/Medications.jsx`

- [ ] **Step 1: Add CYCLE_RELATED_KEYWORDS to defaults.js**

At the end of `src/constants/defaults.js`, add:

```js
export const CYCLE_RELATED_KEYWORDS = [
  'birth control', 'contraceptive', 'oral contraceptive',
  'estrogen', 'progestin', 'progesterone', 'levonorgestrel',
  'ethinyl estradiol', 'norethindrone', 'desogestrel',
  'drospirenone', 'etonogestrel', 'medroxyprogesterone',
  'hormonal', 'hrt', 'hormone replacement',
  'iron supplement', 'ferrous', 'iron',
  'spironolactone', 'clomiphene', 'letrozole',
  'gonadotropin', 'lupron', 'leuprolide',
];

export function getCycleRelatedLabel(med) {
  const check = (text) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return CYCLE_RELATED_KEYWORDS.some(kw => lower.includes(kw));
  };

  // Check FDA pharmacological classes first
  const moa = med.fda_data?.pharm_class_moa?.join(' ') || '';
  const pe = med.fda_data?.pharm_class_pe?.join(' ') || '';
  const pharmMatch = check(moa) || check(pe);

  // Check drug name
  const nameMatch = check(med.name);

  if (!pharmMatch && !nameMatch) return null;

  // Determine specific label
  const allText = `${moa} ${pe} ${(med.name || '').toLowerCase()}`;
  if (/contraceptive|birth control/.test(allText)) return 'Birth control';
  if (/estrogen|progestin|progesterone|hrt|hormone replacement/.test(allText)) return 'Hormonal';
  if (/iron|ferrous/.test(allText)) return 'Iron supplement';
  return 'Cycle-related';
}
```

- [ ] **Step 2: Add cycle-related badge to Medications.jsx**

In `src/components/sections/Medications.jsx`, add import:

```js
import { getCycleRelatedLabel } from '../../constants/defaults';
```

Find the collapsed card badges area (around line 554, where `pharm_class` and `boxed_warning` badges render). After the boxed warning badge `</span>`, add:

```jsx
{(() => {
  const cycleLabel = getCycleRelatedLabel(m);
  return cycleLabel ? (
    <span className="inline-flex items-center gap-0.5 py-0.5 px-1.5 rounded-full bg-salve-rose/10 border border-salve-rose/20 text-[9px] text-salve-rose font-medium">
      <Heart size={8} /> {cycleLabel}
    </span>
  ) : null;
})()}
```

Add `Heart` to the lucide-react import if not already there.

- [ ] **Step 3: Verify**

Run: `npm run dev`
- Navigate to Medications
- Medications containing cycle-related keywords show a rose "Birth control" / "Hormonal" / "Iron supplement" / "Cycle-related" badge
- Non-matching medications show no badge

- [ ] **Step 4: Commit**

```bash
git add src/constants/defaults.js src/components/sections/Medications.jsx
git commit -m "feat: add cycle-related badges to medication cards

Detects hormonal, birth control, and iron meds via keyword matching
against FDA pharmacological classes and drug names. Shows rose badge."
```

---

## Task 7: AI Profile — Cycle-Related Medications

**Files:**
- Modify: `src/services/profile.js`

- [ ] **Step 1: Add import and enrich profile**

At the top of `src/services/profile.js`, add:

```js
import { getCycleRelatedLabel } from '../constants/defaults';
```

Find the cycle section in `buildProfile()` (around line 426, the `// Cycle & fertility data` comment). After the existing cycle symptoms block (around line 459, before the closing `}` of `if (cycles.length)`), add:

```js
    // Cycle-related medications
    const activeMeds = (data.meds || []).filter(m => m.active !== false);
    const cycleMeds = activeMeds.map(m => {
      const label = getCycleRelatedLabel(m);
      return label ? `${san(m.name)} (${label})` : null;
    }).filter(Boolean);
    if (cycleMeds.length) {
      p += 'Cycle-related medications: ' + cycleMeds.join(', ') + '\n';
    }
```

- [ ] **Step 2: Verify**

Run: `npm run dev`
Navigate to AIPanel → "What AI Sees" preview. The cycle section should now include a "Cycle-related medications:" line listing any matching meds.

- [ ] **Step 3: Commit**

```bash
git add src/services/profile.js
git commit -m "feat: include cycle-related medications in AI profile

Lists birth control, hormonal, and iron supplement meds in the cycle
section of the AI health profile for cycle-aware AI suggestions."
```

---

## Task 8: AI Cycle Pattern Analysis — Service Function

**Files:**
- Modify: `src/services/ai.js`

- [ ] **Step 1: Add `fetchCyclePatterns` function**

At the end of the export functions in `src/services/ai.js` (after `fetchCrossReactivity`), add:

```js
export async function fetchCyclePatterns(cycleProfileText) {
  return callAPI(
    [{ role: 'user', content: 'Analyze my cycle-correlated health patterns from the data below.' }],
    `You are a health data analyst examining cycle-correlated patterns. Analyze the provided vitals and journal data tagged by menstrual cycle phase.

Your analysis should cover:
1. Phase-correlated symptom patterns — cite specific averages (e.g., "Pain averages 6.2 during luteal vs 2.1 during follicular")
2. Mood and energy trends by phase
3. Medication timing insights if hormonal or cycle-related medications are detected
4. Data gaps — suggest specific tracking improvements
5. Actionable recommendations

Use markdown formatting. Be specific with numbers. If data is insufficient for a category, say so briefly and move on.

IMPORTANT: You are not a doctor. Include the disclaimer: "This analysis is based on self-reported data patterns. Always discuss cycle-related health concerns with your healthcare provider."

Patient cycle data:
${cycleProfileText}`
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ai.js
git commit -m "feat: add fetchCyclePatterns AI service function

Sends cycle-tagged vitals and journal data to Claude for phase-correlated
pattern analysis with specific averages and recommendations."
```

---

## Task 9: AI Cycle Pattern Analysis — AIPanel Feature

**Files:**
- Modify: `src/components/sections/AIPanel.jsx`

- [ ] **Step 1: Add imports**

In `src/components/sections/AIPanel.jsx`, add to existing imports:

```js
import { Heart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { computeCycleStats, getCyclePhaseForDate } from '../../utils/cycles';
```

Add `fetchCyclePatterns` to the import from `../../services/ai`:

```js
import { fetchInsight, fetchConnections, fetchNews, fetchResources, fetchCostOptimization, fetchCyclePatterns, sendChat, sendChatWithTools } from '../../services/ai';
```

- [ ] **Step 2: Add to FEATURES array**

In the `FEATURES` array (around line 18), add a new entry after the costs entry:

```js
{ id: 'cycle_patterns', label: 'Cycle Patterns', desc: 'Phase-correlated health trends', icon: Heart, color: C.rose },
```

- [ ] **Step 3: Build the cycle pattern data + chart component**

Add a helper component above the main `AIPanel` export (or inline within the component). This should be added somewhere before the `export default function AIPanel`:

```jsx
function CyclePatternChart({ data }) {
  const PHASE_ORDER = ['Menstrual', 'Follicular', 'Ovulatory', 'Luteal'];
  const PHASE_COLORS = { Menstrual: C.rose, Follicular: C.sage, Ovulatory: C.amber, Luteal: C.lav };
  const VITAL_TYPES_FOR_CHART = ['pain', 'mood', 'energy', 'sleep'];
  const VITAL_LABELS = { pain: 'Pain', mood: 'Mood', energy: 'Energy', sleep: 'Sleep' };

  const chartData = useMemo(() => {
    const phaseData = {};
    for (const phase of PHASE_ORDER) phaseData[phase] = {};

    // Tag each vital with its cycle phase
    for (const v of (data.vitals || [])) {
      if (!VITAL_TYPES_FOR_CHART.includes(v.type)) continue;
      const cp = getCyclePhaseForDate(v.date, data.cycles);
      if (!cp) continue;
      if (!phaseData[cp.phase][v.type]) phaseData[cp.phase][v.type] = [];
      phaseData[cp.phase][v.type].push(Number(v.value));
    }

    // Build chart rows — one per phase
    return PHASE_ORDER.map(phase => {
      const row = { phase };
      let hasData = false;
      for (const type of VITAL_TYPES_FOR_CHART) {
        const vals = phaseData[phase][type] || [];
        if (vals.length >= 3) {
          row[type] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
          hasData = true;
        }
      }
      row._hasData = hasData;
      row._color = PHASE_COLORS[phase];
      return row;
    }).filter(r => r._hasData);
  }, [data.vitals, data.cycles]);

  const vitalKeys = VITAL_TYPES_FOR_CHART.filter(type =>
    chartData.some(row => row[type] !== undefined)
  );

  if (chartData.length < 2 || vitalKeys.length === 0) {
    return (
      <div className="text-xs text-salve-textFaint font-montserrat text-center py-3">
        Not enough data for chart visualization yet. Keep tracking vitals across your cycle.
      </div>
    );
  }

  const barColors = { pain: C.rose, mood: C.lav, energy: C.amber, sleep: C.sage };

  return (
    <Card className="mb-3">
      <div className="text-xs font-medium font-montserrat text-salve-textFaint uppercase tracking-wider mb-2">Average by Cycle Phase</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey="phase" tick={{ fontSize: 10, fill: C.textFaint }} />
          <YAxis tick={{ fontSize: 10, fill: C.textFaint }} domain={[0, 10]} />
          <Tooltip contentStyle={{ fontFamily: 'Montserrat', fontSize: 11, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card }} />
          {vitalKeys.map(type => (
            <Bar key={type} dataKey={type} name={VITAL_LABELS[type]} fill={barColors[type]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-3 mt-1.5">
        {vitalKeys.map(type => (
          <div key={type} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: barColors[type] }} />
            <span className="text-[9px] text-salve-textFaint font-montserrat">{VITAL_LABELS[type]}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Handle 'cycle_patterns' in the feature dispatch**

Find the feature dispatch logic (around line 792-796 where `const fn = { insight: fetchInsight, ...}[id]`). This needs special handling because `cycle_patterns` uses a different data flow. Replace or extend the dispatch block:

```js
if (id === 'cycle_patterns') {
  // Check data gate
  const stats = computeCycleStats(data.cycles || []);
  if (stats.periodStarts.length < 2) {
    setResult('Log more cycle and vitals data to unlock pattern analysis. Aim for at least one full cycle with regular vitals tracking.');
    setLoading(false);
    return;
  }
  const totalEntries = (data.vitals?.length || 0) + (data.journal?.length || 0);
  if (totalEntries < 10) {
    setResult('Log more vitals or journal entries alongside your cycle data. Aim for at least 10 entries for meaningful pattern analysis.');
    setLoading(false);
    return;
  }

  // Build focused cycle profile
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const cutoff = threeMonthsAgo.toISOString().slice(0, 10);

  const recentVitals = (data.vitals || [])
    .filter(v => v.date >= cutoff && ['pain', 'mood', 'energy', 'sleep'].includes(v.type))
    .map(v => {
      const cp = getCyclePhaseForDate(v.date, data.cycles);
      return `${v.date} | ${v.type}: ${v.value} | ${cp ? `${cp.phase} day ${cp.dayOfCycle}` : 'no cycle data'}`;
    });

  const recentJournal = (data.journal || [])
    .filter(e => e.date >= cutoff)
    .map(e => {
      const cp = getCyclePhaseForDate(e.date, data.cycles);
      return `${e.date} | mood: ${e.mood || '?'} severity: ${e.severity || '?'} | ${cp ? `${cp.phase} day ${cp.dayOfCycle}` : 'no cycle data'} | ${(e.content || '').slice(0, 100)}`;
    });

  const activeMeds = (data.meds || []).filter(m => m.active !== false).map(m => m.name).join(', ');

  const cycleProfile = `Cycle stats: avg length ${stats.avgLength} days, last period ${stats.lastPeriod}, ${stats.periodStarts.length} tracked cycles

Recent vitals (last 3 months, tagged by cycle phase):
${recentVitals.join('\n') || 'No recent vitals'}

Recent journal entries (last 3 months, tagged by cycle phase):
${recentJournal.join('\n') || 'No recent journal entries'}

Active medications: ${activeMeds || 'None'}`;

  const r = await fetchCyclePatterns(cycleProfile);
  setResult(r);
} else {
  const fn = { insight: fetchInsight, connections: fetchConnections, news: fetchNews, resources: fetchResources, costs: fetchCostOptimization }[id];
  const r = await fn(profile);
  setResult(r);
}
```

**Important:** The existing `try/catch/finally` block around this dispatch should wrap the new `if/else` — don't duplicate it.

- [ ] **Step 5: Render chart above result for cycle_patterns**

In the result rendering area (where result text is displayed after loading), add the chart component above the AI text when mode is `cycle_patterns`:

```jsx
{mode === 'cycle_patterns' && <CyclePatternChart data={data} />}
```

Place this right before the existing result rendering (the `AIMarkdown` or result card).

- [ ] **Step 6: Verify**

Run: `npm run dev`
- Navigate to AI panel → "Cycle Patterns" button visible in the feature grid
- Click with insufficient data → shows gate message
- Click with sufficient data → chart renders immediately, AI text streams below
- Rose accent on the result card
- Medical disclaimer present in AI response

- [ ] **Step 7: Commit**

```bash
git add src/components/sections/AIPanel.jsx src/services/ai.js
git commit -m "feat: add AI Cycle Patterns analysis to AIPanel

New feature button shows phase-by-vital bar chart alongside AI analysis
of cycle-correlated patterns. Data-gated, sends focused 3-month profile."
```

---

## Task 10: Dashboard — Quick-Log Button + Start Tracking CTA

**Files:**
- Modify: `src/components/sections/Dashboard.jsx`
- Modify: `src/components/sections/CycleTracker.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Add `quickLog` prop to CycleTracker.jsx**

In `src/components/sections/CycleTracker.jsx`, update the component signature:

```js
export default function CycleTracker({ data, addItem, updateItem, removeItem, highlightId, quickLog }) {
```

Add a `useEffect` to handle auto-opening the form:

```js
useEffect(() => {
  if (quickLog && !subView) {
    const today = new Date().toISOString().slice(0, 10);
    setForm({ ...EMPTY_CYCLE, date: today, type: 'period', value: 'Medium' });
    setSubView('form');
  }
}, [quickLog]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Pass `quickLog` prop from App.jsx**

In `src/App.jsx`, find the case for cycles (line 234):

```js
case 'cycles':     return <CycleTracker {...shared} />;
```

Replace with:

```js
case 'cycles':     return <CycleTracker {...shared} quickLog={navOpts?.quickLog} />;
```

Also ensure `navOpts` is available. Find how `onNav` is defined. It should already pass through options — check that the `navOpts` state is used. If `onNav` already supports `opts` parameter (which it does per CLAUDE.md: `onNav(tab, opts)`), then you just need to make sure the opts are accessible. Look for the existing pattern — `highlightId` is already passed via `navOpts` or similar state. Extend the same pattern for `quickLog`.

- [ ] **Step 3: Add "Log today" button to Dashboard timeline**

In `src/components/sections/Dashboard.jsx`, find the timeline rendering (around line 620-635, where `isPeriod` is checked). In the period entry row, add a small button. After the date/label text in the period timeline item, add:

```jsx
{isPeriod && (
  <button
    onClick={(e) => { e.stopPropagation(); onNav('cycles', { quickLog: true }); }}
    className="ml-auto py-1 px-2.5 rounded-full text-[10px] font-medium font-montserrat cursor-pointer border border-salve-rose/30 bg-salve-rose/10 text-salve-rose hover:bg-salve-rose/20 transition-colors"
    aria-label="Log period for today"
  >
    <Heart size={10} className="inline mr-0.5 -mt-px" /> Log today
  </button>
)}
```

- [ ] **Step 4: Add "Start tracking" CTA when no cycle data**

In Dashboard.jsx, find the timeline section render area. After the timeline list (after the closing of the `timeline.map`), add:

```jsx
{!data.cycles?.length && data.meds?.length > 0 && !localStorage.getItem('salve:dismiss-cycle-cta') && (
  <Card className="mb-3 !bg-salve-rose/5 !border-salve-rose/15">
    <div className="flex items-center justify-between">
      <button
        onClick={() => onNav('cycles')}
        className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 flex-1"
      >
        <Heart size={16} className="text-salve-rose" />
        <div className="text-left">
          <div className="text-[13px] font-medium text-salve-text font-montserrat">Start tracking your cycle</div>
          <div className="text-[10px] text-salve-textFaint font-montserrat">Correlate with vitals, mood & meds</div>
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); localStorage.setItem('salve:dismiss-cycle-cta', '1'); /* force re-render */ }}
        className="text-salve-textFaint bg-transparent border-none cursor-pointer p-1 text-xs"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  </Card>
)}
```

Note: the dismiss button needs to trigger a re-render. The simplest way is to add a state variable:

```js
const [cycleCTADismissed, setCycleCTADismissed] = useState(() => !!localStorage.getItem('salve:dismiss-cycle-cta'));
```

Then use `cycleCTADismissed` instead of `localStorage.getItem(...)` in the condition, and the dismiss handler becomes:

```js
onClick={(e) => { e.stopPropagation(); localStorage.setItem('salve:dismiss-cycle-cta', '1'); setCycleCTADismissed(true); }}
```

- [ ] **Step 5: Verify**

Run: `npm run dev`
- Dashboard with cycle data: "Log today" button appears on predicted period timeline entry
- Clicking "Log today" navigates to CycleTracker with form pre-opened for today
- Dashboard without cycle data but with other health data: "Start tracking your cycle" CTA appears
- Dismissing CTA hides it permanently
- Empty account (no data at all): CTA does not appear

- [ ] **Step 6: Commit**

```bash
git add src/components/sections/Dashboard.jsx src/components/sections/CycleTracker.jsx src/App.jsx
git commit -m "feat: add Dashboard quick-log button and cycle tracking CTA

Adds 'Log today' button on predicted period timeline entry that opens
CycleTracker form pre-filled for today. Shows 'Start tracking' CTA
when no cycle data exists (dismissible)."
```

---

## Task 11: Final Verification

- [ ] **Step 1: Full smoke test**

Run: `npm run dev` and verify all features:

1. **Shared utility:** CycleTracker works identically to before
2. **Vitals badges:** Phase badges appear on vitals cards
3. **Vitals chart overlay:** Toggle shows phase bands on chart
4. **Journal badges:** Phase badges on journal entry cards
5. **Journal form:** Phase info line appears when date has cycle coverage
6. **Journal mood summary:** Summary card appears with sufficient data
7. **Medication badges:** Cycle-related badges on matching med cards
8. **AI profile:** "What AI Sees" shows cycle-related medications
9. **AI Cycle Patterns:** Feature button works, chart + AI text render
10. **Dashboard quick-log:** "Log today" button on timeline period entry
11. **Dashboard CTA:** "Start tracking" CTA when no cycle data

- [ ] **Step 2: Build check**

Run: `npm run build`
Verify no build errors or warnings.

- [ ] **Step 3: Commit build verification**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: address build issues from cycle tracker features"
```

---

## Summary

| Task | Feature | Files |
|------|---------|-------|
| 1 | Shared utility extraction | `utils/cycles.js` (new), `CycleTracker.jsx` |
| 2 | Vitals phase badges | `Vitals.jsx` |
| 3 | Vitals chart overlay | `Vitals.jsx` |
| 4 | Journal phase badges + form | `Journal.jsx` |
| 5 | Journal mood-phase summary | `Journal.jsx` |
| 6 | Medication cycle badges | `defaults.js`, `Medications.jsx` |
| 7 | AI profile enrichment | `profile.js` |
| 8 | AI cycle patterns service | `ai.js` |
| 9 | AI cycle patterns UI | `AIPanel.jsx` |
| 10 | Dashboard quick-log + CTA | `Dashboard.jsx`, `CycleTracker.jsx`, `App.jsx` |
| 11 | Final verification | All |
