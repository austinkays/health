# Correlation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side health pattern detection engine that surfaces natural-language insights about relationships between tracked metrics (sleep, pain, mood, medications, exercise, cycle phases).

**Architecture:** Pure utility functions in `correlations.js` compute correlations on date-aligned data from `useHealthData`. Dashboard renders a "Patterns" teaser card. A new `Insights.jsx` section shows the full analysis. Premium users get AI-narrated insights via Sage.

**Tech Stack:** React, Tailwind, existing Recharts for mini charts, existing `services/ai.js` for narration.

---

### Task 1: Core Correlation Math (`src/utils/correlations.js`)

**Files:**
- Create: `src/utils/correlations.js`

This is the engine — pure functions with no React dependencies.

- [ ] **Step 1: Create the utility file with helper functions**

```js
// src/utils/correlations.js

/**
 * Health pattern correlation engine.
 * All functions are pure — no React, no side effects.
 * Operates on date-aligned time series from useHealthData.
 */

// ── Helpers ──

/** Join two {date, value}[] series on matching dates. Returns [pairedA[], pairedB[]]. */
export function alignByDate(seriesA, seriesB, lag = 0) {
  const mapB = new Map();
  seriesB.forEach(p => mapB.set(p.date, p.value));
  const xs = [], ys = [];
  seriesA.forEach(p => {
    const targetDate = lag === 0 ? p.date : shiftDate(p.date, lag);
    const bVal = mapB.get(targetDate);
    if (bVal != null && p.value != null) {
      xs.push(Number(p.value));
      ys.push(Number(bVal));
    }
  });
  return [xs, ys];
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pearson correlation coefficient. Returns { r, n } or null if n < minN. */
export function pearson(xs, ys, minN = 7) {
  const n = Math.min(xs.length, ys.length);
  if (n < minN) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return { r: num / den, n };
}

/** Group numeric values by a categorical variable. Returns { category, avg, count }[]. */
export function categoricalSplit(values, categories) {
  const groups = {};
  for (let i = 0; i < values.length; i++) {
    const cat = categories[i];
    if (cat == null || values[i] == null) continue;
    if (!groups[cat]) groups[cat] = { sum: 0, count: 0 };
    groups[cat].sum += Number(values[i]);
    groups[cat].count++;
  }
  return Object.entries(groups)
    .filter(([, g]) => g.count >= 3)
    .map(([category, g]) => ({ category, avg: +(g.sum / g.count).toFixed(1), count: g.count }))
    .sort((a, b) => b.count - a.count);
}

/** Compare metric average before vs after an event date. Returns { before, after, change, pct, nBefore, nAfter } or null. */
export function beforeAfter(series, eventDate, windowDays = 14) {
  const event = new Date(eventDate + 'T00:00:00').getTime();
  const windowMs = windowDays * 86400000;
  const before = [], after = [];
  series.forEach(p => {
    const t = new Date(p.date + 'T00:00:00').getTime();
    const v = Number(p.value);
    if (isNaN(v)) return;
    if (t >= event - windowMs && t < event) before.push(v);
    else if (t >= event && t <= event + windowMs) after.push(v);
  });
  if (before.length < 3 || after.length < 3) return null;
  const avgB = before.reduce((a, b) => a + b, 0) / before.length;
  const avgA = after.reduce((a, b) => a + b, 0) / after.length;
  const change = +(avgA - avgB).toFixed(1);
  const pct = avgB !== 0 ? +((change / Math.abs(avgB)) * 100).toFixed(0) : 0;
  return { before: +avgB.toFixed(1), after: +avgA.toFixed(1), change, pct, nBefore: before.length, nAfter: after.length };
}

/** Simple linear regression slope on last N days. Returns { direction, magnitude, perDay }. */
export function trendDirection(series, days = 14) {
  const cutoff = shiftDate(new Date().toISOString().slice(0, 10), -days);
  const recent = series
    .filter(p => p.date >= cutoff && p.value != null)
    .map(p => ({ ...p, value: Number(p.value) }))
    .filter(p => !isNaN(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (recent.length < 4) return null;
  // Simple linear regression
  const n = recent.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  recent.forEach((p, i) => {
    sumX += i; sumY += p.value; sumXY += i * p.value; sumX2 += i * i;
  });
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const totalChange = +(slope * (n - 1)).toFixed(1);
  const magnitude = Math.abs(totalChange);
  const direction = magnitude < 0.3 ? 'stable' : slope > 0 ? 'up' : 'down';
  return { direction, magnitude, totalChange, perDay: +slope.toFixed(2), n };
}
```

- [ ] **Step 2: Commit helper functions**

```bash
git add src/utils/correlations.js
git commit -m "feat(correlations): add core math helpers — pearson, categoricalSplit, beforeAfter, trendDirection"
```

---

### Task 2: Data Extraction & Insight Generation (`src/utils/correlations.js` continued)

**Files:**
- Modify: `src/utils/correlations.js`

Add the main `computeCorrelations(data)` function that extracts time series from the data object and runs all curated correlation pairs.

- [ ] **Step 1: Add mood mapping and data extraction**

Append to `src/utils/correlations.js`:

```js
// ── Mood → numeric mapping ──
const MOOD_SCORE = {
  '😀 Great': 8, '😊 Good': 7, '😐 Okay': 5, '😔 Low': 3,
  '😢 Sad': 2, '😠 Frustrated': 3, '😰 Anxious': 3, '😴 Exhausted': 2,
};

// ── Polarity: is "up" good or bad for this metric? ──
const UP_IS_GOOD = new Set(['mood', 'energy', 'sleep', 'spo2']);
const DOWN_IS_GOOD = new Set(['pain', 'hr']);
// neutral: weight, temp, glucose, bp

/** Extract a {date, value}[] time series for a given vital type, using daily avg when multiple entries exist. */
function extractVitalSeries(vitals, type) {
  const byDate = {};
  vitals.forEach(v => {
    if (v.type !== type || v.value == null) return;
    const val = Number(v.value);
    if (isNaN(val)) return;
    if (!byDate[v.date]) byDate[v.date] = { sum: 0, count: 0 };
    byDate[v.date].sum += val;
    byDate[v.date].count++;
  });
  return Object.entries(byDate)
    .map(([date, d]) => ({ date, value: +(d.sum / d.count).toFixed(1) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Extract journal mood as numeric series. */
function extractMoodSeries(journal) {
  return journal
    .filter(e => e.mood && MOOD_SCORE[e.mood] != null)
    .map(e => ({ date: e.date, value: MOOD_SCORE[e.mood] }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Extract journal severity series. */
function extractSeveritySeries(journal) {
  return journal
    .filter(e => e.severity && e.severity !== '5')
    .map(e => ({ date: e.date, value: Number(e.severity) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Extract boolean "exercised today" series. */
function extractExerciseSeries(activities) {
  const dates = new Set(activities.map(a => a.date));
  return [...dates].map(date => ({ date, value: 1 })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Get cycle phase for each date in a series. Uses getCyclePhaseForDate from cycles.js. */
function addCyclePhases(dates, cycles, getCyclePhaseForDate) {
  return dates.map(date => {
    const cp = getCyclePhaseForDate(date, cycles);
    return cp ? cp.phase : null;
  });
}
```

- [ ] **Step 2: Add the main computeCorrelations function**

Append to `src/utils/correlations.js`:

```js
// ── Insight templates ──
const TEMPLATES = {
  sleepCorrelation: (metric, direction, splitData) => {
    const low = splitData.find(d => d.category === 'low');
    const high = splitData.find(d => d.category === 'high');
    if (!low || !high) return null;
    const diff = Math.abs(high.avg - low.avg).toFixed(1);
    const better = high.avg < low.avg ? 'lower' : 'higher';
    return `Your ${metric} averages ${low.avg} on short-sleep nights (< 6hrs) vs ${high.avg} on well-rested nights (7+ hrs). That's a ${diff}-point difference.`;
  },
  exerciseCorrelation: (metric, withExercise, withoutExercise) => {
    const diff = Math.abs(withExercise - withoutExercise).toFixed(1);
    const better = withExercise < withoutExercise ? 'lower' : 'higher';
    return `Your ${metric} averages ${withExercise} on days you exercise vs ${withoutExercise} on rest days — ${diff} points ${better}.`;
  },
  medImpact: (medName, metric, result) => {
    const verb = result.change > 0 ? 'increased' : 'decreased';
    return `Since starting ${medName}: your average ${metric} ${verb} from ${result.before} to ${result.after} (${result.change > 0 ? '+' : ''}${result.change}).`;
  },
  cyclePhase: (metric, splitData) => {
    if (splitData.length < 2) return null;
    const sorted = [...splitData].sort((a, b) => b.avg - a.avg);
    return `Your ${metric} is highest during the ${sorted[0].category} phase (${sorted[0].avg}) and lowest during ${sorted[sorted.length - 1].category} (${sorted[sorted.length - 1].avg}).`;
  },
  trend: (metric, result, polarity) => {
    if (result.direction === 'stable') return `Your ${metric} has been stable over the last 2 weeks.`;
    const goodDir = polarity === 'up_good' ? 'up' : polarity === 'down_good' ? 'down' : null;
    const isGood = goodDir === result.direction;
    const verb = result.direction === 'up' ? 'trending up' : 'trending down';
    const qualifier = isGood ? ' — that\'s encouraging' : goodDir ? ' — worth keeping an eye on' : '';
    return `Your ${metric} has been ${verb} over the last 2 weeks (${result.totalChange > 0 ? '+' : ''}${result.totalChange}).${qualifier}`;
  },
};

/** Main entry point. Returns sorted Insight[]. */
export function computeCorrelations(data, getCyclePhaseForDate) {
  const insights = [];
  const vitals = data.vitals || [];
  const journal = data.journal || [];
  const activities = data.activities || [];
  const cycles = data.cycles || [];
  const meds = (data.meds || []).filter(m => m.active !== false);

  // Extract core time series
  const sleepSeries = extractVitalSeries(vitals, 'sleep');
  const painSeries = extractVitalSeries(vitals, 'pain');
  const hrSeries = extractVitalSeries(vitals, 'hr');
  const energySeries = extractVitalSeries(vitals, 'energy');
  const moodSeries = extractMoodSeries(journal);
  const severitySeries = extractSeveritySeries(journal);
  const exerciseDates = extractExerciseSeries(activities);

  // Helper to make a sleep bracket for each date
  const sleepByDate = new Map(sleepSeries.map(s => [s.date, s.value]));
  function sleepBracket(date) {
    const hrs = sleepByDate.get(date);
    if (hrs == null) return null;
    return hrs < 6 ? 'low' : hrs >= 7 ? 'high' : 'mid';
  }

  // Helper to check if exercised on date
  const exerciseDateSet = new Set(exerciseDates.map(e => e.date));
  function exercisedOn(date) { return exerciseDateSet.has(date) ? 'yes' : 'no'; }

  let id = 0;
  const addInsight = (type, category, title, template, score, confidence, n, chartData, metricA, metricB, direction) => {
    if (!template) return;
    insights.push({
      id: `${type}-${category}-${metricA}-${metricB || 'trend'}-${id++}`,
      type, category, title, template, narrative: null,
      score, confidence: n >= 14 ? 'high' : 'medium', n,
      data: chartData,
      metricA, metricB: metricB || '', direction: direction || 'neutral',
    });
  };

  // ═══════ SLEEP → other metrics ═══════
  const sleepTargets = [
    { series: painSeries, name: 'pain', label: 'Sleep & Pain' },
    { series: moodSeries, name: 'mood', label: 'Sleep & Mood' },
    { series: energySeries, name: 'energy', label: 'Sleep & Energy' },
  ];
  sleepTargets.forEach(({ series, name, label }) => {
    if (series.length < 7) return;
    const brackets = series.map(p => sleepBracket(p.date)).filter(Boolean);
    const vals = series.filter(p => sleepBracket(p.date) != null).map(p => p.value);
    if (brackets.length < 7) return;
    const split = categoricalSplit(vals, brackets);
    const text = TEMPLATES.sleepCorrelation(name, null, split);
    if (text) {
      const low = split.find(d => d.category === 'low');
      const high = split.find(d => d.category === 'high');
      const strength = low && high ? Math.abs(high.avg - low.avg) * 10 : 0;
      addInsight('correlation', 'sleep', label, text, Math.min(95, strength + 30), 'medium', brackets.length,
        { type: 'bar', values: split }, 'sleep', name, 'negative');
    }
  });

  // ═══════ EXERCISE → other metrics ═══════
  const exerciseTargets = [
    { series: moodSeries, name: 'mood', label: 'Exercise & Mood' },
    { series: energySeries, name: 'energy', label: 'Exercise & Energy' },
    { series: painSeries, name: 'pain', label: 'Exercise & Pain' },
  ];
  exerciseTargets.forEach(({ series, name, label }) => {
    if (series.length < 7) return;
    const groups = series.map(p => exercisedOn(p.date));
    const vals = series.map(p => p.value);
    const split = categoricalSplit(vals, groups);
    const withEx = split.find(d => d.category === 'yes');
    const withoutEx = split.find(d => d.category === 'no');
    if (withEx && withoutEx && (withEx.count >= 3 && withoutEx.count >= 3)) {
      const text = TEMPLATES.exerciseCorrelation(name, withEx.avg, withoutEx.avg);
      const strength = Math.abs(withEx.avg - withoutEx.avg) * 10;
      addInsight('correlation', 'exercise', label, text, Math.min(90, strength + 25), 'medium',
        withEx.count + withoutEx.count,
        { type: 'bar', values: [{ category: 'Exercise days', avg: withEx.avg, count: withEx.count }, { category: 'Rest days', avg: withoutEx.avg, count: withoutEx.count }] },
        'exercise', name, 'positive');
    }
  });

  // ═══════ MEDICATION before/after ═══════
  const metricSeries = { pain: painSeries, mood: moodSeries, energy: energySeries, sleep: sleepSeries, severity: severitySeries };
  meds.forEach(med => {
    if (!med.start_date) return;
    const medName = med.display_name || med.name;
    ['pain', 'mood', 'energy', 'sleep'].forEach(metric => {
      const series = metricSeries[metric];
      if (!series || series.length < 7) return;
      const result = beforeAfter(series, med.start_date);
      if (!result) return;
      if (Math.abs(result.change) < 0.3) return; // too small to matter
      const text = TEMPLATES.medImpact(medName, metric, result);
      const strength = Math.abs(result.pct);
      addInsight('medication', 'medication', `Since starting ${medName}`, text,
        Math.min(90, strength + 20), 'medium', result.nBefore + result.nAfter,
        { type: 'comparison', values: [{ label: 'Before', value: result.before }, { label: 'After', value: result.after }] },
        medName, metric, result.change > 0 ? 'positive' : 'negative');
    });
  });

  // ═══════ CYCLE PHASE correlations ═══════
  if (cycles.length > 0 && getCyclePhaseForDate) {
    const cycleTargets = [
      { series: moodSeries, name: 'mood', label: 'Mood by Cycle Phase' },
      { series: painSeries, name: 'pain', label: 'Pain by Cycle Phase' },
      { series: energySeries, name: 'energy', label: 'Energy by Cycle Phase' },
    ];
    cycleTargets.forEach(({ series, name, label }) => {
      if (series.length < 7) return;
      const phases = series.map(p => {
        const cp = getCyclePhaseForDate(p.date, cycles);
        return cp ? cp.phase : null;
      });
      const vals = series.map(p => p.value);
      const validIdx = phases.map((p, i) => p != null ? i : -1).filter(i => i >= 0);
      if (validIdx.length < 7) return;
      const split = categoricalSplit(
        validIdx.map(i => vals[i]),
        validIdx.map(i => phases[i])
      );
      if (split.length < 2) return;
      const text = TEMPLATES.cyclePhase(name, split);
      const range = Math.max(...split.map(s => s.avg)) - Math.min(...split.map(s => s.avg));
      addInsight('cycle', 'cycle', label, text, Math.min(85, range * 8 + 15), 'medium',
        validIdx.length, { type: 'bar', values: split }, 'cycle_phase', name, 'neutral');
    });
  }

  // ═══════ TRENDS (14-day) ═══════
  const trendTargets = [
    { series: painSeries, name: 'pain', label: 'Pain Trend', polarity: 'down_good' },
    { series: moodSeries, name: 'mood', label: 'Mood Trend', polarity: 'up_good' },
    { series: energySeries, name: 'energy', label: 'Energy Trend', polarity: 'up_good' },
    { series: sleepSeries, name: 'sleep', label: 'Sleep Trend', polarity: 'up_good' },
    { series: hrSeries, name: 'heart rate', label: 'Heart Rate Trend', polarity: 'down_good' },
  ];
  trendTargets.forEach(({ series, name, label, polarity }) => {
    const result = trendDirection(series);
    if (!result) return;
    const text = TEMPLATES.trend(name, result, polarity);
    const goodDir = polarity === 'up_good' ? 'up' : polarity === 'down_good' ? 'down' : null;
    const isGood = goodDir === result.direction;
    // Trends score lower than correlations (less actionable) but improving trends get a boost
    const baseScore = result.direction === 'stable' ? 10 : result.magnitude * 5;
    addInsight('trend', 'trend', label, text,
      Math.min(70, baseScore + (isGood ? 15 : 5)), 'medium', result.n,
      { type: 'trend', values: [{ direction: result.direction, magnitude: result.magnitude, totalChange: result.totalChange }] },
      name, '', result.direction === 'up' ? 'positive' : result.direction === 'down' ? 'negative' : 'neutral');
  });

  // ═══════ SYMPTOM FREQUENCY ═══════
  // Top symptoms from journal → frequency by sleep bracket or exercise
  const symptomCounts = {};
  journal.forEach(e => {
    (e.symptoms || []).forEach(s => {
      if (s.name) symptomCounts[s.name] = (symptomCounts[s.name] || 0) + 1;
    });
  });
  const topSymptoms = Object.entries(symptomCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  topSymptoms.forEach(symptomName => {
    // Check if this symptom appears more on poor-sleep days
    const symptomDates = new Set();
    journal.forEach(e => {
      if ((e.symptoms || []).some(s => s.name === symptomName)) symptomDates.add(e.date);
    });
    if (symptomDates.size < 5) return;

    // Sleep correlation for this symptom
    if (sleepSeries.length >= 7) {
      const allDates = [...new Set([...sleepSeries.map(s => s.date)])];
      const hasSymptom = allDates.map(d => symptomDates.has(d) ? 1 : 0);
      const brackets = allDates.map(d => sleepBracket(d)).filter(Boolean);
      if (brackets.length >= 7) {
        const symptomRate = categoricalSplit(
          allDates.filter(d => sleepBracket(d) != null).map(d => symptomDates.has(d) ? 1 : 0),
          allDates.filter(d => sleepBracket(d) != null).map(d => sleepBracket(d))
        );
        const low = symptomRate.find(d => d.category === 'low');
        const high = symptomRate.find(d => d.category === 'high');
        if (low && high && Math.abs(low.avg - high.avg) > 0.1) {
          const pctLow = (low.avg * 100).toFixed(0);
          const pctHigh = (high.avg * 100).toFixed(0);
          const text = `${symptomName} appears ${pctLow}% of days after short sleep (< 6hrs) vs ${pctHigh}% after 7+ hours.`;
          addInsight('correlation', 'symptom', `Sleep & ${symptomName}`, text,
            Math.min(80, Math.abs(low.avg - high.avg) * 100 + 20), 'medium', brackets.length,
            { type: 'bar', values: [{ category: '< 6hrs sleep', avg: +(low.avg * 100).toFixed(0), count: low.count }, { category: '7+ hrs sleep', avg: +(high.avg * 100).toFixed(0), count: high.count }] },
            'sleep', symptomName, 'negative');
        }
      }
    }
  });

  // Sort by score descending
  return insights.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/correlations.js
git commit -m "feat(correlations): add computeCorrelations with sleep, exercise, med, cycle, trend, symptom analysis"
```

---

### Task 3: AI Narration Function (`src/services/ai.js` + `api/_prompts.js`)

**Files:**
- Modify: `src/services/ai.js` — add `fetchCorrelationNarrative()`
- Modify: `api/_prompts.js` — add `correlationNarrative` prompt key

- [ ] **Step 1: Add the prompt to `api/_prompts.js`**

Add after the `extractJournal` prompt entry (around line 217):

```js
  correlationNarrative:
    `You are a warm, supportive health pattern analyst. The user's health tracking data shows these statistical patterns. Rewrite them as 3-5 short, clear insight cards.

RULES:
- Each insight: 1-2 sentences max. Warm but factual.
- Say "tends to" not "causes". These are correlations, not causation.
- Focus on what the user can DO with this information.
- Use the person's name if available, otherwise "you/your".
- Never alarming. Frame negative trends as "worth keeping an eye on", not "dangerous".
- Return a JSON array of strings: ["insight 1", "insight 2", ...]
- No markdown, no code fences, just the JSON array.`,
```

- [ ] **Step 2: Add the AI function to `src/services/ai.js`**

Add after the `fetchCostOptimization` export (around line 515):

```js
export async function fetchCorrelationNarrative(insights, profileText) {
  const summary = insights.slice(0, 6).map(i => `- ${i.title}: ${i.template}`).join('\n');
  const raw = await callAPI(
    [{ role: 'user', content: `Rewrite these health patterns as warm, actionable insight cards:\n\n${summary}` }],
    'correlationNarrative', profileText,
    800, false, 'insight'   // Lite tier — cheap
  );
  const cleaned = raw.replace(/\n\n---\n\n\*.+\*$/s, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Add `'correlationNarrative'` to the `isValidPromptKey()` check in `api/_prompts.js`**

The `isValidPromptKey()` function checks against `Object.keys(PROMPTS)`. Since we added `correlationNarrative` to PROMPTS, it will be auto-included. Verify this is the case — if `isValidPromptKey` uses a hardcoded list, add the new key.

- [ ] **Step 4: Commit**

```bash
git add api/_prompts.js src/services/ai.js
git commit -m "feat(correlations): add AI narration prompt + fetchCorrelationNarrative service"
```

---

### Task 4: Dashboard "Patterns" Card (`src/components/sections/Dashboard.jsx`)

**Files:**
- Modify: `src/components/sections/Dashboard.jsx`

Add a "Patterns" card that shows the top 3 insights, positioned after the "Needs Attention" alerts and before the AI Insight teaser.

- [ ] **Step 1: Add imports and computation**

At the top of Dashboard.jsx, add the import:

```js
import { computeCorrelations } from '../../utils/correlations';
import { getCyclePhaseForDate } from '../../utils/cycles';
import { fetchCorrelationNarrative, isFeatureLocked } from '../../services/ai';
```

Note: `getCyclePhaseForDate` may already be imported — check first and skip if so. Same for `isFeatureLocked`.

Inside the Dashboard component, add the correlation computation (memoized):

```js
  // ── Correlation insights ──
  const allInsights = useMemo(() => computeCorrelations(data, getCyclePhaseForDate), [data]);
  const topInsights = useMemo(() => allInsights.slice(0, 3), [allInsights]);
```

- [ ] **Step 2: Add the Patterns card JSX**

Insert after the `{/* Needs attention */}` closing `</section>` and `)}` (around line 1100), before `{/* AI Insight teaser */}`:

```jsx
          {/* Correlation Patterns */}
          {topInsights.length > 0 && (
            <section aria-label="Health patterns" className="dash-stagger dash-stagger-3 mb-4 md:mb-6">
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-salve-lav" />
                    <span className="text-[10px] md:text-xs text-salve-textFaint font-montserrat tracking-widest uppercase">Patterns</span>
                  </div>
                  <button onClick={() => onNav('insights')} className="bg-transparent border-none cursor-pointer text-salve-lav text-[11px] font-montserrat p-0 hover:underline flex items-center gap-0.5">
                    See all <ChevronRight size={12} />
                  </button>
                </div>
                <div className="space-y-0">
                  {topInsights.map((insight, i) => {
                    const accentColor = {
                      sleep: 'border-salve-lav',
                      exercise: 'border-salve-sage',
                      medication: 'border-salve-sage',
                      cycle: 'border-salve-amber',
                      trend: 'border-salve-lav',
                      symptom: 'border-salve-rose',
                    }[insight.category] || 'border-salve-lav';
                    const icon = {
                      sleep: Moon,
                      exercise: Activity,
                      medication: Pill,
                      cycle: Heart,
                      trend: TrendingUp,
                      symptom: Activity,
                    }[insight.category] || Sparkles;
                    const Icon = icon;
                    return (
                      <div key={insight.id}>
                        {i > 0 && <div className="border-t border-salve-border/40 my-2.5" />}
                        <div className={`border-l-2 ${accentColor} pl-3 py-0.5`}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Icon size={12} className="text-salve-textFaint" />
                            <span className="text-[11px] font-medium font-montserrat text-salve-text">{insight.title}</span>
                          </div>
                          <p className="text-[12px] md:text-[13px] text-salve-textMid font-montserrat leading-relaxed">
                            {insight.narrative || insight.template}
                          </p>
                          {insight.confidence === 'medium' && (
                            <span className="text-[9px] text-salve-textFaint/50 font-montserrat mt-0.5 block">Based on {insight.n} days of data</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </section>
          )}
```

Note: The icons `Moon`, `Activity`, `Heart`, `Pill`, `TrendingUp`, `Sparkles` should already be imported in Dashboard.jsx. Check and add any missing ones.

- [ ] **Step 3: Commit**

```bash
git add src/components/sections/Dashboard.jsx
git commit -m "feat(correlations): add Patterns card to Dashboard with top 3 insights"
```

---

### Task 5: Full Insights Section (`src/components/sections/Insights.jsx`)

**Files:**
- Create: `src/components/sections/Insights.jsx`

- [ ] **Step 1: Create the full Insights section**

```jsx
// src/components/sections/Insights.jsx
import { useState, useMemo } from 'react';
import { Sparkles, Moon, Activity, Heart, Pill, TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { computeCorrelations } from '../../utils/correlations';
import { getCyclePhaseForDate } from '../../utils/cycles';
import { C } from '../../constants/colors';

const CATEGORY_META = {
  sleep:      { label: 'Sleep',      icon: Moon,       color: C.lav },
  exercise:   { label: 'Exercise',   icon: Activity,   color: C.sage },
  medication: { label: 'Medication', icon: Pill,       color: C.sage },
  cycle:      { label: 'Cycle',      icon: Heart,      color: C.amber },
  trend:      { label: 'Trends',     icon: TrendingUp, color: C.lav },
  symptom:    { label: 'Symptoms',   icon: Activity,   color: C.rose },
};

const FILTERS = ['all', 'sleep', 'exercise', 'medication', 'cycle', 'symptom', 'trend'];

function MiniBar({ values, color }) {
  const max = Math.max(...values.map(v => v.avg || v.value || 0), 1);
  return (
    <div className="flex items-end gap-1.5 mt-2 mb-1">
      {values.map((v, i) => (
        <div key={i} className="flex-1 text-center">
          <div className="relative mx-auto rounded-t" style={{ width: '100%', maxWidth: 48 }}>
            <div
              className="rounded-t transition-all"
              style={{ height: Math.max(4, ((v.avg || v.value || 0) / max) * 48), backgroundColor: color + '44' }}
            />
          </div>
          <span className="text-[9px] text-salve-textFaint font-montserrat block mt-0.5 truncate">{v.category || v.label}</span>
          <span className="text-[10px] font-medium font-montserrat" style={{ color }}>{v.avg ?? v.value}</span>
        </div>
      ))}
    </div>
  );
}

function TrendArrow({ direction, totalChange }) {
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const color = direction === 'stable' ? C.textFaint : direction === 'up' ? C.sage : C.rose;
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <Icon size={14} color={color} />
      <span className="text-[11px] font-montserrat font-medium" style={{ color }}>
        {direction === 'stable' ? 'Stable' : `${totalChange > 0 ? '+' : ''}${totalChange}`}
      </span>
      <span className="text-[10px] text-salve-textFaint font-montserrat">over 2 weeks</span>
    </div>
  );
}

export default function Insights({ data }) {
  const [filter, setFilter] = useState('all');
  const allInsights = useMemo(() => computeCorrelations(data, getCyclePhaseForDate), [data]);
  const filtered = filter === 'all' ? allInsights : allInsights.filter(i => i.category === filter);

  // Separate trends from correlations for grouping
  const correlations = filtered.filter(i => i.type !== 'trend');
  const trends = filtered.filter(i => i.type === 'trend');

  if (allInsights.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={<Sparkles size={28} className="text-salve-lav" />}
          title="Patterns are brewing"
          subtitle="Keep logging for a few more days — Salve is learning your patterns. Insights appear after 7 days of overlapping data."
        />
      </div>
    );
  }

  return (
    <div className="mt-2">
      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map(f => {
          const active = filter === f;
          const meta = CATEGORY_META[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[11px] px-2.5 py-1 rounded-full border font-montserrat font-medium transition-colors cursor-pointer ${
                active ? 'bg-salve-lav/20 border-salve-lav/50 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30'
              }`}
            >
              {f === 'all' ? 'All' : meta?.label || f}
            </button>
          );
        })}
      </div>

      {/* Correlation insights */}
      {correlations.length > 0 && (
        <div className="space-y-3 mb-4">
          {correlations.map(insight => {
            const meta = CATEGORY_META[insight.category] || CATEGORY_META.trend;
            const Icon = meta.icon;
            const accentCls = {
              sleep: 'border-l-salve-lav',
              exercise: 'border-l-salve-sage',
              medication: 'border-l-salve-sage',
              cycle: 'border-l-salve-amber',
              symptom: 'border-l-salve-rose',
            }[insight.category] || 'border-l-salve-lav';
            return (
              <Card key={insight.id} className={`!border-l-2 ${accentCls}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={13} style={{ color: meta.color }} />
                  <span className="text-[11px] font-medium font-montserrat text-salve-text">{insight.title}</span>
                  {insight.confidence === 'medium' && (
                    <Badge className="!text-[8px] !px-1.5 !py-0 ml-auto" variant="ghost">{insight.n} days</Badge>
                  )}
                </div>
                <p className="text-[12.5px] text-salve-textMid font-montserrat leading-relaxed">
                  {insight.narrative || insight.template}
                </p>
                {insight.data?.type === 'bar' && insight.data.values && (
                  <MiniBar values={insight.data.values} color={meta.color} />
                )}
                {insight.data?.type === 'comparison' && insight.data.values && (
                  <MiniBar values={insight.data.values} color={meta.color} />
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Trend summary */}
      {trends.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-px bg-salve-border/50" />
            <span className="text-[10px] font-montserrat font-medium text-salve-textFaint uppercase tracking-wider">Trends</span>
            <div className="flex-1 h-px bg-salve-border/50" />
          </div>
          <Card>
            <div className="space-y-2">
              {trends.map(t => (
                <div key={t.id} className="flex items-center justify-between py-1">
                  <span className="text-xs font-montserrat text-salve-textMid capitalize">{t.metricA}</span>
                  <TrendArrow
                    direction={t.data?.values?.[0]?.direction || 'stable'}
                    totalChange={t.data?.values?.[0]?.totalChange || 0}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {filtered.length === 0 && filter !== 'all' && (
        <p className="text-center text-sm text-salve-textFaint font-montserrat mt-8">No {CATEGORY_META[filter]?.label || filter} patterns yet.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sections/Insights.jsx
git commit -m "feat(correlations): add full Insights section with filters, mini charts, trends"
```

---

### Task 6: Wire Up Routes & Navigation (`src/App.jsx`, `Dashboard.jsx`)

**Files:**
- Modify: `src/App.jsx` — add lazy import + case in renderSection
- Modify: `src/components/sections/Dashboard.jsx` — add 'insights' to STARRED_META

- [ ] **Step 1: Add lazy import in App.jsx**

After the other `lazyWithRetry` imports (around line 72):

```js
const Insights = lazyWithRetry(() => import('./components/sections/Insights'));
```

- [ ] **Step 2: Add case in renderSection**

In the `switch(tab)` block inside `renderSection()`, add after the `'activities'` case (around line 364):

```js
      case 'insights':   return <Insights data={data} />;
```

- [ ] **Step 3: Add to STARRED_META in Dashboard.jsx**

In the `STARRED_META` object (around line 197), add:

```js
  insights:     { label: 'Insights',    icon: Sparkles },
```

Note: `Sparkles` should already be imported in Dashboard.jsx. If not, add it to the lucide-react import.

- [ ] **Step 4: Add to TAB_LABELS in Header.jsx**

Check `src/components/layout/Header.jsx` for the `TAB_LABELS` object and add:

```js
  insights: 'Insights',
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/sections/Dashboard.jsx src/components/layout/Header.jsx
git commit -m "feat(correlations): wire Insights section into routing, nav, and Quick Access"
```

---

### Task 7: Build, Verify, Final Commit

**Files:** None new — verification only.

- [ ] **Step 1: Build check**

```bash
npx vite build --mode development 2>&1 | tail -10
```

Expected: Clean build with no errors. Insights.jsx should appear as a new code-split chunk.

- [ ] **Step 2: Verify no broken imports**

```bash
grep -r "correlations" src/ --include="*.js" --include="*.jsx" -l
```

Expected: `correlations.js`, `Dashboard.jsx`, `Insights.jsx` — no unexpected files.

- [ ] **Step 3: Push**

```bash
git push
```
