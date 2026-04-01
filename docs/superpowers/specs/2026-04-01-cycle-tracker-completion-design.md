# Cycle Tracker Completion — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Scope:** Complete the 5 missing features from the Cycle Tracker roadmap item (#3 in CLAUDE.md)

---

## Context

The Cycle Tracker has a solid working foundation:
- DB schema (`015_cycles.sql`) with RLS, CRUD via `db.cycles`
- Full UI: calendar view, stats card, filter pills, record list, add/edit form
- Flo GDPR import (`flo.js` parser + dedup)
- Cycle predictions (next period, fertile window, ovulation)
- Phase detection (menstrual/follicular/ovulatory/luteal)
- AI profile integration (`profile.js` includes cycle stats + symptoms)
- Dashboard integration (predicted period in timeline, late period alert)
- Search integration, AI tool-use (add/remove via chat), deep-link support

This spec covers the **5 remaining gaps** that make cycle data useful across the rest of Salve.

---

## Feature 0: Shared Utility — `src/utils/cycles.js`

**Purpose:** Extract cycle computation logic from `CycleTracker.jsx` into a reusable module so Vitals, Journal, Dashboard, and AI features can all compute cycle phase for any date.

### Functions

| Function | Source | Description |
|----------|--------|-------------|
| `computeCycleStats(cycles)` | Extract from CycleTracker.jsx | Groups consecutive period days into starts, calculates avg cycle length |
| `getCyclePhase(dayOfCycle, avgLen)` | Extract from CycleTracker.jsx | Returns `{ name, color }` for a given cycle day |
| `predictNextPeriod(stats)` | Extract from CycleTracker.jsx | Returns next predicted period date string |
| `getDayOfCycle(stats)` | Extract from CycleTracker.jsx | Returns current day of cycle (1-based) |
| `getCyclePhaseForDate(date, cycles)` | **New** | Given a date string and cycles array, returns `{ phase, dayOfCycle, color }` or `null` |

### `getCyclePhaseForDate` logic

1. Call `computeCycleStats(cycles)` to get period starts + avg length
2. Find which cycle the given date falls in (find the most recent period start <= date)
3. Calculate day of cycle relative to that start
4. Call `getCyclePhase(dayOfCycle, avgLen)` for phase/color
5. Return `{ phase: 'Luteal', dayOfCycle: 22, color: '#b8a9e8' }` or `null` if date is before first tracked period

### Phase color mapping (consistent everywhere)

| Phase | Color constant | Hex |
|-------|---------------|-----|
| Menstrual | `C.rose` | `#e88a9a` |
| Follicular | `C.sage` | `#8fbfa0` |
| Ovulatory | `C.amber` | `#e8c88a` |
| Luteal | `C.lav` | `#b8a9e8` |

### CycleTracker.jsx changes

- Import all 5 functions from `utils/cycles.js` instead of defining locally
- Delete the local function definitions
- No behavior change

---

## Feature 1: Vitals Correlation

**Goal:** Show cycle phase context on vitals entries and optionally color the vitals chart by cycle phase.

### Vitals cards (list view)

- Each vitals card shows date + type + value
- When `data.cycles.length > 0`, add a phase badge next to the date
- Format: `Mar 15 · Luteal day 22` — small text, colored in phase color
- Uses `getCyclePhaseForDate(vital.date, data.cycles)`
- No badge when no cycle data exists

### Vitals chart (Recharts)

- **Toggle pill** above the chart: "Color by cycle phase" (off by default)
- Persisted in `localStorage` under `salve:vitals-cycle-overlay`
- When enabled: add Recharts `ReferenceArea` bands behind chart data
  - Each band spans the date range of a cycle phase at ~10% opacity
  - Phase colors match the standard mapping above
  - Bands computed from cycle data for the visible chart date range
- Chart legend gets 4 additional entries (phase names + colors) when overlay is on
- Toggle hidden when `data.cycles.length === 0`

### Data flow

- `Vitals.jsx` already receives `data` prop which includes `data.cycles`
- No new props, API calls, or schema changes needed

---

## Feature 2: Journal Correlation

**Goal:** Show cycle phase context on journal entries + mood-phase summary card.

### Journal entry cards

- Each card shows date, title, mood, severity
- When `data.cycles.length > 0`, add a phase badge below the date
- Format: `Luteal day 22` as a small Badge in phase color
- Uses `getCyclePhaseForDate(entry.date, data.cycles)`

### Journal form (add/edit)

- When user picks a date and cycle data covers that date, show a read-only info line below the date field
- Format: "Cycle day 22 · Luteal phase" — styled as `text-xs text-salve-textMid`
- Disappears if date has no cycle coverage

### Mood-Phase Summary Card

- Appears at top of Journal section (before the entry list)
- **Visibility gate:** requires both:
  - `data.cycles.length > 0` (cycle tracking active)
  - At least 5 journal entries with mood values across 2+ distinct phases
- Shows a compact grid:
  - Rows: cycle phases (Menstrual / Follicular / Ovulatory / Luteal)
  - Each row: phase name (colored) + average mood value + small horizontal bar
  - Only shows phases that have 2+ entries
- Computed client-side: iterate journal entries → tag with phase → group → average mood
- Collapsible card (default expanded), collapse state persisted in `localStorage` under `salve:journal-mood-phase`

### Data flow

- `Journal.jsx` already receives `data` prop with `data.cycles`
- No schema changes

---

## Feature 3: AI Cycle Pattern Analysis

**Goal:** AI-powered analysis of cycle-correlated patterns across vitals, journal, and medication data, with a visual chart.

### Entry point

- New button in AIPanel's main menu alongside Insight, Connections, News, etc.
- Label: **"Cycle Patterns"**
- Icon: `Heart` (from lucide-react)
- Color: rose (`C.rose`)

### Minimum data gate

Requires:
- At least 1 full cycle (period entries spanning 2+ distinct start dates)
- At least 10 vitals OR journal entries

Below threshold → show message: "Log more cycle and vitals data to unlock pattern analysis. Aim for at least one full cycle with regular vitals tracking."

### Phase-by-vital chart (renders immediately, before AI)

- **Recharts `BarChart`** showing average vitals values by cycle phase
- X-axis: 4 phases (colored by phase colors)
- Y-axis: average value (0-10 scale)
- Grouped bars: one bar per vitals type (mood, energy, pain, sleep) that has 3+ entries per phase
- Falls back to a simple text table if only 1-2 vitals types have sufficient data
- Computed client-side using `getCyclePhaseForDate` — renders immediately while AI streams

### Data sent to Claude

A **focused sub-profile** (not the full health profile) containing:
- Cycle stats: avg length, current day, phase, last period date
- Last 3 months of vitals (mood, energy, pain, sleep) tagged with cycle phase
- Last 3 months of journal entries tagged with cycle phase + mood
- Active medications (for hormonal/cycle-affected identification)
- The computed averages from the chart (so Claude can reference exact numbers)

### Prompt asks Claude to identify

1. Phase-correlated symptom patterns (e.g., "Pain averages 6.2 during luteal vs 2.1 follicular")
2. Mood/energy trends by phase
3. Medication timing insights (if hormonal meds detected)
4. Data gaps and tracking suggestions
5. Actionable recommendations

### UI

- Result card with rose accent border (matching existing AIPanel card pattern)
- Chart renders above the AI text
- AI text rendered with `AIMarkdown` + `reveal` prop for paragraph stagger animation
- Standard medical disclaimer at bottom

---

## Feature 4: Medication Cycle Awareness

**Goal:** Flag cycle-related medications on med cards and enrich the AI profile.

### Detection logic

Static keyword matching — no API call:

**New constant** in `src/constants/defaults.js`:
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
```

**Check order:**
1. `med.fda_data?.pharm_class_moa` or `pharm_class_pe` → check for keyword match
2. `med.name` (lowercased) → check for keyword match
3. If match found, determine label: "Birth control" / "Hormonal" / "Iron supplement" / "Cycle-related"

### Medication cards (expanded view)

- When a med matches, show a small rose Badge: e.g., `Birth control` or `Hormonal` or `Cycle-related`
- Placed near existing badges (drug class, boxed warning)
- Display-only — no schema change, no new data column

### AI profile enrichment

In `buildProfile()` → medications section, append after existing cycle stats:
```
Cycle-related medications: Yaz (birth control), Ferrous sulfate (iron supplement)
```

This gives Claude context for cycle-aware suggestions (e.g., "Consider iron supplementation during heavy flow days" or "Birth control may affect cycle prediction accuracy").

---

## Feature 5: Dashboard Quick-Log

**Goal:** Quick shortcut on Dashboard to log period start without navigating to full CycleTracker.

### When cycle data exists

- In the cycle timeline entry (which already shows predicted period date), add a small "Log today" button
- Styled as a compact ghost button with Heart icon (matches rose theme)
- Tapping navigates to CycleTracker with form pre-opened for today: `onNav('cycles', { quickLog: true })`
- Distinct from the calendar's tap-to-log (which logs for the tapped date) — this always logs for today
- `CycleTracker.jsx` reads the `quickLog` prop → auto-sets `subView='form'` with today's date, type=period, value=Medium

### When no cycle data exists

- Add a dismissible CTA card below the timeline: "Start tracking your cycle →"
- Navigates to CycleTracker section
- Dismissible via existing `ALERT_DISMISS_KEY` pattern (localStorage)
- Only shows to users who have other health data (don't show to empty accounts)

### CycleTracker.jsx prop addition

- Accept new `quickLog` boolean prop
- When `true`, auto-open form with today's date on mount (useEffect)

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/utils/cycles.js` | **New** | Shared cycle utility (extracted + new `getCyclePhaseForDate`) |
| `src/components/sections/CycleTracker.jsx` | Modify | Import from utils/cycles.js, add `quickLog` prop |
| `src/components/sections/Vitals.jsx` | Modify | Phase badges on cards, chart overlay toggle + ReferenceAreas |
| `src/components/sections/Journal.jsx` | Modify | Phase badges on cards, phase info in form, mood-phase summary card |
| `src/components/sections/AIPanel.jsx` | Modify | New "Cycle Patterns" feature button + chart + AI prompt |
| `src/components/sections/Medications.jsx` | Modify | Cycle-related badge on expanded cards |
| `src/components/sections/Dashboard.jsx` | Modify | Quick-log button on timeline, "Start tracking" CTA |
| `src/constants/defaults.js` | Modify | Add `CYCLE_RELATED_KEYWORDS` |
| `src/services/profile.js` | Modify | Add cycle-related medications to AI profile |
| `src/App.jsx` | Modify | Pass `quickLog` prop to CycleTracker |

**No schema changes.** No new DB tables, columns, or migrations.
**No new dependencies.** Uses existing Recharts, lucide-react, and utilities.

---

## Testing Checklist

### Feature 0: Shared Utility
- [ ] `getCyclePhaseForDate` returns correct phase for dates within tracked cycles
- [ ] Returns `null` for dates before first tracked period
- [ ] CycleTracker.jsx behavior unchanged after extraction

### Feature 1: Vitals Correlation
- [ ] Phase badge shows on vitals cards when cycle data exists
- [ ] No badge when no cycle data
- [ ] "Color by cycle phase" toggle appears when cycle data exists
- [ ] Toggle state persists across page loads
- [ ] Chart ReferenceArea bands show correct phase colors/positions
- [ ] Chart legend updates when overlay toggled on/off

### Feature 2: Journal Correlation
- [ ] Phase badge on journal entry cards when cycle data exists
- [ ] Phase info line in form when date has cycle coverage
- [ ] Mood-phase summary card appears with sufficient data (5+ entries, 2+ phases)
- [ ] Summary card hidden when insufficient data
- [ ] Summary card collapsible, state persisted
- [ ] Average mood values computed correctly per phase

### Feature 3: AI Cycle Patterns
- [ ] Feature button appears in AIPanel menu
- [ ] Data gate message shown when insufficient data
- [ ] Bar chart renders with correct phase groupings
- [ ] Chart shows before AI response starts streaming
- [ ] AI response renders with rose accent card + reveal animation
- [ ] Medical disclaimer present
- [ ] Only last 3 months of data sent (not entire history)

### Feature 4: Medication Awareness
- [ ] Cycle-related badge appears on matching expanded med cards
- [ ] Detection works via fda_data pharm_class and name keywords
- [ ] Non-matching meds show no badge
- [ ] AI profile includes cycle-related medication list

### Feature 5: Dashboard Quick-Log
- [ ] "Log period" button appears on timeline cycle entry
- [ ] Tapping navigates to CycleTracker with form pre-opened for today
- [ ] "Start tracking" CTA appears when no cycle data
- [ ] CTA is dismissible and stays dismissed
- [ ] CTA hidden for empty accounts (no health data at all)
