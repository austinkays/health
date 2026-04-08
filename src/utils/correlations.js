/**
 * correlations.js — Health pattern correlation engine
 * Pure functions only — no React, no side effects, no app-specific imports.
 * All date strings are 'YYYY-MM-DD' ISO format.
 */

// ---------------------------------------------------------------------------
// Mood → numeric score mapping
// ---------------------------------------------------------------------------
const MOOD_SCORE = {
  '😀 Great': 8,
  '😊 Good': 7,
  '😐 Okay': 5,
  '😔 Low': 3,
  '😢 Sad': 2,
  '😠 Frustrated': 3,
  '😰 Anxious': 3,
  '😴 Exhausted': 2,
};

// Human-readable metric labels
const METRIC_LABELS = {
  pain: 'pain',
  mood: 'mood',
  energy: 'energy',
  sleep: 'sleep',
  hr: 'heart rate',
  weight: 'weight',
  temp: 'temperature',
  glucose: 'glucose',
  spo2: 'SpO2',
  steps: 'steps',
};

// Polarity: which direction is "good"
const POLARITY_UP = new Set(['mood', 'energy', 'sleep', 'steps', 'spo2']);
const POLARITY_DOWN = new Set(['pain', 'hr']);
// weight/temp/glucose/etc. are neutral

// ---------------------------------------------------------------------------
// Internal date helpers
// ---------------------------------------------------------------------------

/**
 * Shifts a 'YYYY-MM-DD' date string by N days. Positive = forward.
 */
function shiftDate(dateStr, days) {
  if (!dateStr || days === 0) return dateStr;
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the difference in days between two 'YYYY-MM-DD' strings (a - b).
 */
function dayDiff(a, b) {
  return (new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000;
}

// ---------------------------------------------------------------------------
// Exported helper: alignByDate
// ---------------------------------------------------------------------------

/**
 * Join two {date, value}[] arrays on matching dates.
 * lag > 0 shifts seriesA dates FORWARD by lag days before matching,
 * effectively asking "does seriesA on day D-lag predict seriesB on day D?"
 * (e.g., lag=1 pairs yesterday's sleep with today's pain)
 *
 * Returns [pairedXs[], pairedYs[]] or [[], []] if no overlap.
 */
export function alignByDate(seriesA, seriesB, lag = 0) {
  if (!seriesA?.length || !seriesB?.length) return [[], []];

  const mapB = new Map();
  for (const { date, value } of seriesB) {
    if (date && value != null && !isNaN(value)) {
      mapB.set(date, Number(value));
    }
  }

  const xs = [];
  const ys = [];

  for (const { date, value } of seriesA) {
    if (!date || value == null || isNaN(value)) continue;
    const shifted = lag !== 0 ? shiftDate(date, lag) : date;
    if (mapB.has(shifted)) {
      xs.push(Number(value));
      ys.push(mapB.get(shifted));
    }
  }

  return [xs, ys];
}

// ---------------------------------------------------------------------------
// Exported helper: pearson
// ---------------------------------------------------------------------------

/**
 * Pearson correlation coefficient between two same-length numeric arrays.
 * Returns {r, n} or null if n < minN or variance is zero.
 */
export function pearson(xs, ys, minN = 7) {
  if (!xs?.length || xs.length !== ys?.length) return null;
  const n = xs.length;
  if (n < minN) return null;

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denom = Math.sqrt(varX * varY);
  if (denom === 0) return null;

  return { r: num / denom, n };
}

// ---------------------------------------------------------------------------
// Exported helper: categoricalSplit
// ---------------------------------------------------------------------------

/**
 * Groups numeric `values` by string `categories` (parallel arrays).
 * Returns [{category, avg, count, values}] for groups with count >= 3.
 * Sorted by avg descending.
 */
export function categoricalSplit(values, categories) {
  if (!values?.length || values.length !== categories?.length) return [];

  const groups = new Map();
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const c = categories[i];
    if (v == null || isNaN(v) || !c) continue;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(Number(v));
  }

  const result = [];
  for (const [category, vals] of groups) {
    if (vals.length < 3) continue;
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    result.push({ category, avg: Math.round(avg * 100) / 100, count: vals.length, values: vals });
  }

  return result.sort((a, b) => b.avg - a.avg);
}

// ---------------------------------------------------------------------------
// Exported helper: beforeAfter
// ---------------------------------------------------------------------------

/**
 * Compares average of a {date, value}[] series in a window before vs after
 * an event date (exclusive of the event date itself).
 *
 * Returns {before, after, change, pct, nBefore, nAfter} or null.
 */
export function beforeAfter(series, eventDate, windowDays = 14) {
  if (!series?.length || !eventDate) return null;

  const beforeVals = [];
  const afterVals = [];

  for (const { date, value } of series) {
    if (!date || value == null || isNaN(value)) continue;
    const diff = dayDiff(date, eventDate);
    if (diff < 0 && diff >= -windowDays) beforeVals.push(Number(value));
    else if (diff > 0 && diff <= windowDays) afterVals.push(Number(value));
  }

  if (beforeVals.length < 3 || afterVals.length < 3) return null;

  const before = Math.round((beforeVals.reduce((s, v) => s + v, 0) / beforeVals.length) * 100) / 100;
  const after = Math.round((afterVals.reduce((s, v) => s + v, 0) / afterVals.length) * 100) / 100;
  const change = Math.round((after - before) * 100) / 100;
  const pct = before !== 0 ? Math.round((change / Math.abs(before)) * 1000) / 10 : null;

  return { before, after, change, pct, nBefore: beforeVals.length, nAfter: afterVals.length };
}

// ---------------------------------------------------------------------------
// Exported helper: trendDirection
// ---------------------------------------------------------------------------

/**
 * Linear regression slope on last N days of a {date, value}[] series.
 * Returns {direction, magnitude, totalChange, perDay, n} or null if < 4 pts.
 * direction: 'improving' | 'worsening' | 'stable'
 * polarity: 'up_is_good' | 'down_is_good' | 'neutral'
 */
export function trendDirection(series, days = 14, polarity = 'neutral') {
  if (!series?.length) return null;

  const cutoff = (() => {
    const dates = series.map(s => s.date).filter(Boolean).sort();
    if (!dates.length) return null;
    const last = dates[dates.length - 1];
    return shiftDate(last, -days);
  })();

  if (!cutoff) return null;

  const recent = series
    .filter(({ date, value }) => date && date >= cutoff && value != null && !isNaN(value))
    .sort((a, b) => a.date < b.date ? -1 : 1);

  if (recent.length < 4) return null;

  // Convert dates to numeric x-axis (day offset from first point)
  const t0 = recent[0].date;
  const xs = recent.map(({ date }) => dayDiff(date, t0));
  const ys = recent.map(({ value }) => Number(value));
  const n = xs.length;

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }

  if (den === 0) return null;

  const slope = num / den; // units per day
  const totalChange = Math.round(slope * (xs[xs.length - 1] - xs[0]) * 100) / 100;
  const perDay = Math.round(slope * 100) / 100;
  const magnitude = Math.abs(totalChange);

  // Stable threshold: < 5% of range or < 0.2 absolute
  const range = Math.max(...ys) - Math.min(...ys);
  const stableThreshold = Math.max(0.2, range * 0.05);

  let direction;
  if (magnitude < stableThreshold) {
    direction = 'stable';
  } else if (polarity === 'up_is_good') {
    direction = slope > 0 ? 'improving' : 'worsening';
  } else if (polarity === 'down_is_good') {
    direction = slope < 0 ? 'improving' : 'worsening';
  } else {
    direction = 'stable'; // neutral metrics don't have a good/bad direction
  }

  return { direction, magnitude, totalChange, perDay, n };
}

// ---------------------------------------------------------------------------
// Internal data extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extracts {date, value}[] for a vital type. Computes daily average when
 * multiple readings exist for the same date.
 */
function extractVitalSeries(vitals, type) {
  if (!vitals?.length) return [];

  const byDate = new Map();
  for (const v of vitals) {
    if (v.type !== type || v.value == null || isNaN(v.value)) continue;
    const val = Number(v.value);
    if (!byDate.has(v.date)) byDate.set(v.date, []);
    byDate.get(v.date).push(val);
  }

  return Array.from(byDate.entries())
    .map(([date, vals]) => ({
      date,
      value: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100,
    }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
}

/**
 * Maps journal mood emoji → numeric score via MOOD_SCORE.
 * Returns {date, value}[] skipping unrecognized moods.
 */
function extractMoodSeries(journal) {
  if (!journal?.length) return [];
  return journal
    .filter(e => e.date && e.mood && MOOD_SCORE[e.mood] != null)
    .map(e => ({ date: e.date, value: MOOD_SCORE[e.mood] }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
}

/**
 * Journal overall severity as {date, value}[].
 */
function extractSeveritySeries(journal) {
  if (!journal?.length) return [];
  return journal
    .filter(e => e.date && e.severity != null && !isNaN(e.severity))
    .map(e => ({ date: e.date, value: Number(e.severity) }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
}

/**
 * Exercise days as {date, value: 1}[] — one entry per date that has activities.
 */
function extractExerciseSeries(activities) {
  if (!activities?.length) return [];
  const dates = new Set(activities.filter(a => a.date).map(a => a.date));
  return Array.from(dates)
    .map(date => ({ date, value: 1 }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
}

// ---------------------------------------------------------------------------
// Natural language template functions
// ---------------------------------------------------------------------------

function fmt(n) {
  return typeof n === 'number' ? (Math.round(n * 10) / 10).toString() : String(n);
}

/**
 * "Your {metric} averages X on short-sleep nights vs Y on well-rested nights."
 * splitData is [{category, avg}] where categories are 'low'|'mid'|'high' sleep.
 */
export function sleepCorrelation(metric, splitData) {
  const label = METRIC_LABELS[metric] || metric;
  const low = splitData.find(d => d.category === 'low');
  const high = splitData.find(d => d.category === 'high');
  if (!low || !high) {
    const sorted = [...splitData].sort((a, b) => a.avg - b.avg);
    if (sorted.length < 2) return `Your ${label} varies with sleep duration.`;
    return `Your ${label} averages ${fmt(sorted[0].avg)} on poor-sleep nights vs ${fmt(sorted[sorted.length - 1].avg)} on well-rested nights.`;
  }
  return `Your ${label} averages ${fmt(low.avg)} on short-sleep nights vs ${fmt(high.avg)} on well-rested nights.`;
}

/**
 * "Your {metric} averages X on exercise days vs Y on rest days."
 */
export function exerciseCorrelation(metric, withExercise, withoutExercise) {
  const label = METRIC_LABELS[metric] || metric;
  return `Your ${label} averages ${fmt(withExercise)} on exercise days vs ${fmt(withoutExercise)} on rest days.`;
}

/**
 * "Since starting {medName}: your average {metric} increased/decreased from X to Y."
 */
export function medImpact(medName, metric, result) {
  const label = METRIC_LABELS[metric] || metric;
  const direction = result.change > 0 ? 'increased' : 'decreased';
  return `Since starting ${medName}: your average ${label} ${direction} from ${fmt(result.before)} to ${fmt(result.after)}.`;
}

/**
 * "Your {metric} is highest during {phase} ({avg}) and lowest during {phase} ({avg})."
 */
export function cyclePhase(metric, splitData) {
  const label = METRIC_LABELS[metric] || metric;
  if (!splitData?.length) return `Your ${label} varies across cycle phases.`;
  const sorted = [...splitData].sort((a, b) => b.avg - a.avg);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  if (highest.category === lowest.category) return `Your ${label} is consistent across cycle phases.`;
  return `Your ${label} is highest during ${highest.category} phase (${fmt(highest.avg)}) and lowest during ${lowest.category} (${fmt(lowest.avg)}).`;
}

/**
 * "Your {metric} has been trending {up/down} over the last 2 weeks ({change}). — {sentiment}"
 */
export function trend(metric, result, polarity = 'neutral') {
  const label = METRIC_LABELS[metric] || metric;
  const sign = result.totalChange > 0 ? '+' : '';
  const changeStr = `${sign}${fmt(result.totalChange)}`;

  if (result.direction === 'stable') {
    return `Your ${label} has been stable over the last 2 weeks.`;
  }

  const dirWord = result.totalChange > 0 ? 'up' : 'down';
  let sentiment = '';
  if (result.direction === 'improving') sentiment = " — that's encouraging";
  else if (result.direction === 'worsening') sentiment = ' — worth keeping an eye on';

  return `Your ${label} has been trending ${dirWord} over the last 2 weeks (${changeStr})${sentiment}.`;
}

// ---------------------------------------------------------------------------
// Internal scoring helpers
// ---------------------------------------------------------------------------

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function confidence(n) {
  return n >= 14 ? 'high' : 'medium';
}

// ---------------------------------------------------------------------------
// Main function: computeCorrelations
// ---------------------------------------------------------------------------

/**
 * Computes health pattern insights from Salve's data object.
 *
 * @param {object} data - useHealthData data object with vitals, journal, meds, activities, cycles arrays
 * @param {function|null} getCyclePhaseForDate - from utils/cycles.js; receives (date, cycles) → {phase}
 * @returns {Array} sorted insight objects
 */
export function computeCorrelations(data, getCyclePhaseForDate = null) {
  const vitals = data?.vitals || [];
  const journal = data?.journal_entries || data?.journal || [];
  const meds = data?.meds || data?.medications || [];
  const activities = data?.activities || [];
  const cycles = data?.cycles || [];

  const insights = [];
  let idCounter = 0;
  const nextId = (prefix) => `${prefix}-${idCounter++}`;

  // -------------------------------------------------------------------------
  // 1. Sleep → pain, mood, energy
  // -------------------------------------------------------------------------
  const sleepSeries = extractVitalSeries(vitals, 'sleep');

  if (sleepSeries.length >= 7) {
    // Build a date→sleepBracket map
    const sleepBracketByDate = new Map();
    for (const { date, value } of sleepSeries) {
      const bracket = value < 6 ? 'low' : value < 7 ? 'mid' : 'high';
      sleepBracketByDate.set(date, { bracket, value });
    }

    const sleepTargets = [
      { type: 'pain', lag: 1 },   // sleep last night → pain today
      { type: 'mood', lag: 1 },
      { type: 'energy', lag: 1 },
    ];

    for (const { type, lag } of sleepTargets) {
      let series;
      if (type === 'mood') {
        series = extractMoodSeries(journal);
      } else {
        series = extractVitalSeries(vitals, type);
      }
      if (!series.length) continue;

      // For each metric date, look up sleep the day before
      const metricValues = [];
      const bracketCategories = [];

      for (const { date, value } of series) {
        const prevDate = shiftDate(date, -lag);
        const sleepEntry = sleepBracketByDate.get(prevDate);
        if (!sleepEntry) continue;
        metricValues.push(Number(value));
        bracketCategories.push(sleepEntry.bracket);
      }

      const splitData = categoricalSplit(metricValues, bracketCategories);
      if (splitData.length < 2) continue;

      const low = splitData.find(d => d.category === 'low');
      const high = splitData.find(d => d.category === 'high');
      if (!low || !high) continue;

      const diff = Math.abs(high.avg - low.avg);
      if (diff < 0.3) continue;

      const totalN = splitData.reduce((s, d) => s + d.count, 0);
      const polarity = POLARITY_UP.has(type) ? 'up_is_good' : POLARITY_DOWN.has(type) ? 'down_is_good' : 'neutral';

      // For pain/down_is_good, lower is better when you sleep more — so high sleep → lower pain = positive
      const isPositive = (polarity === 'up_is_good' && high.avg > low.avg) ||
                         (polarity === 'down_is_good' && high.avg < low.avg);
      const direction = isPositive ? 'positive' : 'negative';

      const score = clamp(Math.round(diff * 10 + 25), 25, 85);

      insights.push({
        id: nextId('correlation-sleep-' + type),
        type: 'correlation',
        category: 'sleep',
        title: `Sleep & ${METRIC_LABELS[type] || type}`,
        template: sleepCorrelation(type, splitData),
        narrative: null,
        score,
        confidence: confidence(totalN),
        n: totalN,
        data: {
          type: 'bar',
          values: splitData.map(d => ({
            label: d.category === 'low' ? '<6hrs' : d.category === 'mid' ? '6–7hrs' : '7+hrs',
            value: d.avg,
            count: d.count,
          })),
        },
        metricA: 'sleep',
        metricB: type,
        direction,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. Exercise → mood, energy, pain
  // -------------------------------------------------------------------------
  const exerciseSeries = extractExerciseSeries(activities);

  if (exerciseSeries.length >= 3) {
    const exerciseDateSet = new Set(exerciseSeries.map(e => e.date));

    const exerciseTargets = ['mood', 'energy', 'pain'];

    for (const type of exerciseTargets) {
      const series = type === 'mood'
        ? extractMoodSeries(journal)
        : extractVitalSeries(vitals, type);

      if (!series.length) continue;

      const withEx = series.filter(({ date }) => exerciseDateSet.has(date)).map(({ value }) => Number(value));
      const withoutEx = series.filter(({ date }) => !exerciseDateSet.has(date)).map(({ value }) => Number(value));

      if (withEx.length < 3 || withoutEx.length < 3) continue;

      const avgWith = Math.round((withEx.reduce((s, v) => s + v, 0) / withEx.length) * 100) / 100;
      const avgWithout = Math.round((withoutEx.reduce((s, v) => s + v, 0) / withoutEx.length) * 100) / 100;
      const diff = Math.abs(avgWith - avgWithout);
      if (diff < 0.3) continue;

      const polarity = POLARITY_UP.has(type) ? 'up_is_good' : POLARITY_DOWN.has(type) ? 'down_is_good' : 'neutral';
      const isPositive = (polarity === 'up_is_good' && avgWith > avgWithout) ||
                         (polarity === 'down_is_good' && avgWith < avgWithout);

      const totalN = withEx.length + withoutEx.length;
      const score = clamp(Math.round(diff * 10 + 25), 25, 85);

      insights.push({
        id: nextId('correlation-exercise-' + type),
        type: 'correlation',
        category: 'exercise',
        title: `Exercise & ${METRIC_LABELS[type] || type}`,
        template: exerciseCorrelation(type, avgWith, avgWithout),
        narrative: null,
        score,
        confidence: confidence(totalN),
        n: totalN,
        data: {
          type: 'comparison',
          values: [
            { label: 'Exercise days', value: avgWith, count: withEx.length },
            { label: 'Rest days', value: avgWithout, count: withoutEx.length },
          ],
        },
        metricA: 'exercise',
        metricB: type,
        direction: isPositive ? 'positive' : 'negative',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Medication before/after
  // -------------------------------------------------------------------------
  const medTargets = ['pain', 'mood', 'energy', 'sleep'];
  const activeMeds = meds.filter(m => m.start_date && (m.active !== false));

  for (const med of activeMeds) {
    for (const metric of medTargets) {
      const series = metric === 'mood'
        ? extractMoodSeries(journal)
        : extractVitalSeries(vitals, metric);

      if (!series.length) continue;

      const result = beforeAfter(series, med.start_date, 14);
      if (!result) continue;
      if (Math.abs(result.change) < 0.3) continue;

      const medName = med.display_name || med.name;
      const totalN = result.nBefore + result.nAfter;
      const polarity = POLARITY_UP.has(metric) ? 'up_is_good' : POLARITY_DOWN.has(metric) ? 'down_is_good' : 'neutral';
      const isPositive = (polarity === 'up_is_good' && result.change > 0) ||
                         (polarity === 'down_is_good' && result.change < 0);

      const pctAbs = result.pct != null ? Math.abs(result.pct) : Math.abs(result.change) * 10;
      const score = clamp(Math.round(pctAbs + 20), 20, 90);

      insights.push({
        id: nextId(`medication-${medName}-${metric}`),
        type: 'medication',
        category: 'medication',
        title: `${medName} & ${METRIC_LABELS[metric] || metric}`,
        template: medImpact(medName, metric, result),
        narrative: null,
        score,
        confidence: confidence(totalN),
        n: totalN,
        data: {
          type: 'comparison',
          values: [
            { label: 'Before', value: result.before, count: result.nBefore },
            { label: 'After', value: result.after, count: result.nAfter },
          ],
        },
        metricA: 'medication',
        metricB: metric,
        direction: isPositive ? 'positive' : 'negative',
        medName,
        eventDate: med.start_date,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. Cycle phase → mood, pain, energy
  // -------------------------------------------------------------------------
  if (cycles.length >= 7 && typeof getCyclePhaseForDate === 'function') {
    const cycleTargets = ['mood', 'pain', 'energy'];

    for (const type of cycleTargets) {
      const series = type === 'mood'
        ? extractMoodSeries(journal)
        : extractVitalSeries(vitals, type);

      if (!series.length) continue;

      const metricValues = [];
      const phaseCategories = [];

      for (const { date, value } of series) {
        try {
          const phaseInfo = getCyclePhaseForDate(date, cycles);
          if (!phaseInfo?.phase) continue;
          metricValues.push(Number(value));
          phaseCategories.push(phaseInfo.phase);
        } catch {
          // skip dates where cycle phase can't be computed
        }
      }

      const splitData = categoricalSplit(metricValues, phaseCategories);
      if (splitData.length < 2) continue;

      const sorted = [...splitData].sort((a, b) => b.avg - a.avg);
      const highest = sorted[0];
      const lowest = sorted[sorted.length - 1];
      const diff = Math.abs(highest.avg - lowest.avg);
      if (diff < 0.3) continue;

      const totalN = splitData.reduce((s, d) => s + d.count, 0);
      const score = clamp(Math.round(diff * 10 + 28), 28, 85);

      insights.push({
        id: nextId('cycle-' + type),
        type: 'cycle',
        category: 'cycle',
        title: `Cycle Phase & ${METRIC_LABELS[type] || type}`,
        template: cyclePhase(type, splitData),
        narrative: null,
        score,
        confidence: confidence(totalN),
        n: totalN,
        data: {
          type: 'bar',
          values: splitData.map(d => ({ label: d.category, value: d.avg, count: d.count })),
        },
        metricA: 'cycle_phase',
        metricB: type,
        direction: 'neutral',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5. Trends (14-day): pain, mood, energy, sleep, hr
  // -------------------------------------------------------------------------
  const trendTargets = [
    { type: 'pain', polarity: 'down_is_good', source: 'vital' },
    { type: 'mood', polarity: 'up_is_good', source: 'journal_mood' },
    { type: 'energy', polarity: 'up_is_good', source: 'vital' },
    { type: 'sleep', polarity: 'up_is_good', source: 'vital' },
    { type: 'hr', polarity: 'down_is_good', source: 'vital' },
  ];

  for (const { type, polarity, source } of trendTargets) {
    const series = source === 'journal_mood'
      ? extractMoodSeries(journal)
      : extractVitalSeries(vitals, type);

    if (!series.length) continue;

    const result = trendDirection(series, 14, polarity);
    if (!result) continue;
    if (result.direction === 'stable') continue; // not actionable enough

    // Base score lower than correlations (trends less directly actionable)
    let score = clamp(Math.round(result.magnitude * 8 + 15), 15, 70);
    if (result.direction === 'improving') score = clamp(score + 15, 15, 85);

    insights.push({
      id: nextId('trend-' + type),
      type: 'trend',
      category: 'trend',
      title: `${METRIC_LABELS[type] || type} trend`,
      template: trend(type, result, polarity),
      narrative: null,
      score,
      confidence: confidence(result.n),
      n: result.n,
      data: {
        type: 'trend',
        values: series.slice(-14).map(({ date, value }) => ({ date, value: Number(value) })),
        slope: result.perDay,
        totalChange: result.totalChange,
        direction: result.direction,
      },
      metricA: type,
      metricB: null,
      direction: result.direction === 'improving' ? 'positive'
               : result.direction === 'worsening' ? 'negative'
               : 'neutral',
    });
  }

  // -------------------------------------------------------------------------
  // 6. Symptom frequency by sleep quality
  // -------------------------------------------------------------------------
  if (sleepSeries.length >= 7 && journal.length >= 5) {
    // Build date → sleep bracket
    const sleepBracket = new Map();
    for (const { date, value } of sleepSeries) {
      sleepBracket.set(date, value < 6 ? 'poor' : value < 7 ? 'mid' : 'good');
    }

    // Count all symptoms across journal entries
    const symptomCounts = new Map();
    for (const entry of journal) {
      if (!Array.isArray(entry.symptoms)) continue;
      for (const s of entry.symptoms) {
        if (!s?.name) continue;
        symptomCounts.set(s.name, (symptomCounts.get(s.name) || 0) + 1);
      }
    }

    // Top 3 most-logged symptoms
    const topSymptoms = Array.from(symptomCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    for (const symptomName of topSymptoms) {
      // Build presence series: 1 if symptom logged that day, 0 if not (and a vitals-adjacent date)
      const poorDayCount = { present: 0, total: 0 };
      const goodDayCount = { present: 0, total: 0 };

      for (const entry of journal) {
        if (!entry.date) continue;
        // Check sleep the prior night
        const prevDate = shiftDate(entry.date, -1);
        const bracket = sleepBracket.get(prevDate);
        if (!bracket || bracket === 'mid') continue; // only compare extremes

        const hasSymptom = Array.isArray(entry.symptoms) &&
          entry.symptoms.some(s => s?.name === symptomName);

        if (bracket === 'poor') {
          poorDayCount.total++;
          if (hasSymptom) poorDayCount.present++;
        } else if (bracket === 'good') {
          goodDayCount.total++;
          if (hasSymptom) goodDayCount.present++;
        }
      }

      if (poorDayCount.total < 3 || goodDayCount.total < 3) continue;

      const poorRate = Math.round((poorDayCount.present / poorDayCount.total) * 100);
      const goodRate = Math.round((goodDayCount.present / goodDayCount.total) * 100);
      const diff = Math.abs(poorRate - goodRate);

      if (diff < 15) continue; // not meaningfully different

      const totalN = poorDayCount.total + goodDayCount.total;
      const score = clamp(Math.round(diff * 0.4 + 20), 20, 70);
      const isWorseOnPoorSleep = poorRate > goodRate;

      const template = `${symptomName} appears on ${poorRate}% of poor-sleep days vs ${goodRate}% of well-rested days.`;

      insights.push({
        id: nextId(`symptom-sleep-${symptomName}`),
        type: 'correlation',
        category: 'symptom',
        title: `Sleep & ${symptomName}`,
        template,
        narrative: null,
        score,
        confidence: confidence(totalN),
        n: totalN,
        data: {
          type: 'comparison',
          values: [
            { label: 'Poor sleep', value: poorRate, count: poorDayCount.total, unit: '%' },
            { label: 'Good sleep', value: goodRate, count: goodDayCount.total, unit: '%' },
          ],
        },
        metricA: 'sleep',
        metricB: symptomName,
        direction: isWorseOnPoorSleep ? 'negative' : 'positive',
        symptomName,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Sort by score descending and return
  // -------------------------------------------------------------------------
  return insights.sort((a, b) => b.score - a.score);
}
