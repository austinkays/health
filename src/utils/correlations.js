/**
 * correlations.js, Health pattern correlation engine
 * Pure functions only, no React, no side effects, no app-specific imports.
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

/** Capitalize first letter of each word for titles */
function titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

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
 * Exercise days as {date, value: 1}[], one entry per date that has activities.
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
 * "Your {metric} has been trending {up/down} over the last 2 weeks ({change})., {sentiment}"
 */
export function trend(metric, result, polarity = 'neutral') {
  const label = METRIC_LABELS[metric] || metric;
  const sign = result.totalChange > 0 ? '+' : '';
  const changeStr = `${sign}${fmt(result.totalChange)}`;

  if (result.direction === 'stable') {
    return `Your ${label} has been stable over the last 2 weeks.`;
  }

  const dirWord = result.totalChange > 0 ? 'up' : 'down';
  // Vary the sentiment so multiple trends don't all say the same thing
  const positivePhrases = [", that's encouraging", ', keep it up', ', a positive sign', ', nice progress'];
  const negativePhrases = [', worth keeping an eye on', ', something to watch', ', worth noting'];
  let sentiment = '';
  if (result.direction === 'improving') {
    const idx = Math.abs(label.charCodeAt(0)) % positivePhrases.length;
    sentiment = positivePhrases[idx];
  } else if (result.direction === 'worsening') {
    const idx = Math.abs(label.charCodeAt(0)) % negativePhrases.length;
    sentiment = negativePhrases[idx];
  }

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

      // For pain/down_is_good, lower is better when you sleep more, so high sleep → lower pain = positive
      const isPositive = (polarity === 'up_is_good' && high.avg > low.avg) ||
                         (polarity === 'down_is_good' && high.avg < low.avg);
      const direction = isPositive ? 'positive' : 'negative';

      const score = clamp(Math.round(diff * 10 + 25), 25, 85);

      insights.push({
        id: nextId('correlation-sleep-' + type),
        type: 'correlation',
        category: 'sleep',
        title: `Sleep & ${titleCase(METRIC_LABELS[type] || type)}`,
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
        title: `Exercise & ${titleCase(METRIC_LABELS[type] || type)}`,
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
        title: `${medName} & ${titleCase(METRIC_LABELS[metric] || metric)}`,
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
        title: `Cycle Phase & ${titleCase(METRIC_LABELS[type] || type)}`,
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
      title: `${titleCase(METRIC_LABELS[type] || type)} Trend`,
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
        title: `Sleep & ${titleCase(symptomName)}`,
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
  // 7. Day-of-week patterns  (category: 'dayofweek')
  // -------------------------------------------------------------------------
  {
    const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const metricsForDow = [
      { series: extractMoodSeries(journal), metric: 'mood', polarity: 'up_is_good' },
      { series: extractVitalSeries(vitals, 'pain'), metric: 'pain', polarity: 'down_is_good' },
      { series: extractVitalSeries(vitals, 'energy'), metric: 'energy', polarity: 'up_is_good' },
      { series: extractVitalSeries(vitals, 'sleep'), metric: 'sleep', polarity: 'up_is_good' },
    ];

    for (const { series, metric, polarity } of metricsForDow) {
      if (series.length < 14) continue;

      const byDow = [[], [], [], [], [], [], []];
      for (const { date, value } of series) {
        const d = new Date(date + 'T00:00:00Z');
        byDow[d.getUTCDay()].push(value);
      }

      const avgs = byDow.map((vals, i) => ({
        dow: i,
        label: DOW_NAMES[i],
        avg: vals.length >= 2 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : null,
        count: vals.length,
      })).filter(d => d.avg !== null);

      if (avgs.length < 5) continue;

      const sorted = [...avgs].sort((a, b) => b.avg - a.avg);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      const diff = Math.abs(best.avg - worst.avg);

      if (diff < 0.5) continue;

      const label = METRIC_LABELS[metric] || metric;
      const betterDay = polarity === 'down_is_good' ? worst : best;
      const worsDay = polarity === 'down_is_good' ? best : worst;

      const template = `Your ${label} tends to be best on ${betterDay.label}s (${fmt(betterDay.avg)}) and worst on ${worsDay.label}s (${fmt(worsDay.avg)}).`;
      const score = clamp(Math.round(diff * 8 + 20), 20, 75);

      insights.push({
        id: nextId(`dayofweek-${metric}`),
        type: 'dayofweek',
        category: 'dayofweek',
        title: `${titleCase(label)} by Day of Week`,
        template,
        narrative: null,
        score,
        confidence: confidence(series.length),
        n: series.length,
        data: {
          type: 'bar',
          values: avgs.map(d => ({ label: d.label.slice(0, 3), value: d.avg, count: d.count })),
        },
        metricA: metric,
        direction: 'neutral',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 8. Streaks & consistency  (category: 'streak')
  // -------------------------------------------------------------------------
  {
    // Medication adherence streak (consecutive days with at least one logged med)
    const medDates = new Set(
      meds.filter(m => m.active !== false && m.start_date).map(m => m.start_date)
    );
    // Journal streak (consecutive days with an entry)
    const journalDates = new Set(journal.filter(e => e.date).map(e => e.date));
    // Exercise streak
    const exerciseDates = new Set(activities.filter(a => a.date).map(a => a.date));

    const calcStreak = (dateSet) => {
      if (!dateSet.size) return { current: 0, longest: 0 };
      const sorted = [...dateSet].sort().reverse();
      const today = sorted[0];
      let current = 1;
      for (let i = 1; i < sorted.length; i++) {
        if (dayDiff(sorted[i - 1], sorted[i]) === 1) current++;
        else break;
      }
      // Check if streak includes today (or yesterday for tolerance)
      const now = new Date().toISOString().slice(0, 10);
      const daysOld = dayDiff(now, today);
      if (daysOld > 1) current = 0;

      // Longest streak
      let longest = 1, run = 1;
      const asc = [...dateSet].sort();
      for (let i = 1; i < asc.length; i++) {
        if (dayDiff(asc[i], asc[i - 1]) === 1) { run++; longest = Math.max(longest, run); }
        else run = 1;
      }
      return { current, longest };
    };

    const streaks = [
      { name: 'journaling', ...calcStreak(journalDates), n: journalDates.size },
      { name: 'exercise', ...calcStreak(exerciseDates), n: exerciseDates.size },
    ];

    for (const s of streaks) {
      if (s.n < 7) continue;

      const val = s.current > 0 ? s.current : s.longest;
      if (val < 3) continue;
      const isCurrent = s.current > 0;
      const score = clamp(Math.round(val * 4 + 15), 20, 80);

      const template = isCurrent
        ? `You're on a ${val}-day ${s.name} streak! Keep it going.`
        : `Your longest ${s.name} streak was ${val} days. Start a new one today?`;

      insights.push({
        id: nextId(`streak-${s.name}`),
        type: 'streak',
        category: 'streak',
        title: `${titleCase(s.name)} Streak`,
        template,
        narrative: null,
        score,
        confidence: 'high',
        n: s.n,
        data: {
          type: 'stat',
          values: [
            { label: 'Current', value: s.current },
            { label: 'Longest', value: s.longest },
          ],
        },
        direction: isCurrent ? 'positive' : 'neutral',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 9. Week-over-week comparison  (category: 'comparison')
  // -------------------------------------------------------------------------
  {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const oneWeekAgo = shiftDate(todayStr, -7);
    const twoWeeksAgo = shiftDate(todayStr, -14);

    const weekAvg = (series, from, to) => {
      const vals = series.filter(s => s.date >= from && s.date < to).map(s => s.value);
      if (vals.length < 3) return null;
      return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100;
    };

    const compMetrics = [
      { series: extractVitalSeries(vitals, 'sleep'), metric: 'sleep', polarity: 'up_is_good' },
      { series: extractMoodSeries(journal), metric: 'mood', polarity: 'up_is_good' },
      { series: extractVitalSeries(vitals, 'pain'), metric: 'pain', polarity: 'down_is_good' },
      { series: extractVitalSeries(vitals, 'energy'), metric: 'energy', polarity: 'up_is_good' },
      { series: extractVitalSeries(vitals, 'steps'), metric: 'steps', polarity: 'up_is_good' },
    ];

    for (const { series, metric, polarity } of compMetrics) {
      const thisWeek = weekAvg(series, oneWeekAgo, todayStr);
      const lastWeek = weekAvg(series, twoWeeksAgo, oneWeekAgo);
      if (thisWeek === null || lastWeek === null) continue;

      const change = Math.round((thisWeek - lastWeek) * 100) / 100;
      const pctChange = lastWeek !== 0 ? Math.round((change / Math.abs(lastWeek)) * 100) : 0;
      if (Math.abs(pctChange) < 5) continue;

      const label = METRIC_LABELS[metric] || metric;
      const improving = (polarity === 'up_is_good' && change > 0) || (polarity === 'down_is_good' && change < 0);
      const dirWord = change > 0 ? 'up' : 'down';
      const sentiment = improving ? ', an improvement' : ', worth watching';

      const template = `Your ${label} is ${dirWord} ${Math.abs(pctChange)}% this week vs last (${fmt(lastWeek)} → ${fmt(thisWeek)})${sentiment}.`;
      const score = clamp(Math.round(Math.abs(pctChange) * 0.5 + 25), 25, 75);

      insights.push({
        id: nextId(`comparison-${metric}`),
        type: 'comparison',
        category: 'comparison',
        title: `${titleCase(label)}: This Week vs Last`,
        template,
        narrative: null,
        score,
        confidence: 'medium',
        n: series.filter(s => s.date >= twoWeeksAgo).length,
        data: {
          type: 'comparison',
          values: [
            { label: 'Last week', value: lastWeek },
            { label: 'This week', value: thisWeek },
          ],
        },
        metricA: metric,
        direction: improving ? 'positive' : 'negative',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 10. Medication adherence → symptom correlation  (category: 'medication')
  // -------------------------------------------------------------------------
  {
    // For meds with start_date, check if journal symptom frequency differs
    // on days where the user logged the med vs skipped (approximated by
    // checking if journal mentions med adherence data)
    const adherenceMeds = meds.filter(m => m.active !== false && m.name);

    for (const med of adherenceMeds) {
      if (!journal.length) break;

      // Use journal adherence data if available
      const takenDays = [];
      const missedDays = [];
      for (const entry of journal) {
        if (!entry.date || !Array.isArray(entry.med_adherence)) continue;
        const rec = entry.med_adherence.find(a => a.med_id === med.id || a.name === med.name);
        if (!rec) continue;
        if (rec.taken) takenDays.push(entry);
        else missedDays.push(entry);
      }

      if (takenDays.length < 5 || missedDays.length < 3) continue;

      const avgSeverity = (entries) => {
        const vals = entries.filter(e => e.severity != null).map(e => Number(e.severity));
        return vals.length >= 2 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
      };

      const takenSev = avgSeverity(takenDays);
      const missedSev = avgSeverity(missedDays);
      if (takenSev === null || missedSev === null) continue;

      const diff = Math.abs(missedSev - takenSev);
      if (diff < 0.5) continue;

      const better = takenSev < missedSev ? 'lower' : 'higher';
      const template = `On days you take ${med.display_name || med.name}, your symptom severity averages ${fmt(takenSev)} vs ${fmt(missedSev)} on missed days (${better} is better for you).`;
      const score = clamp(Math.round(diff * 12 + 25), 25, 80);

      insights.push({
        id: nextId(`adherence-${med.name}`),
        type: 'adherence',
        category: 'medication',
        title: `${med.display_name || med.name} Adherence`,
        template,
        narrative: null,
        score,
        confidence: confidence(takenDays.length + missedDays.length),
        n: takenDays.length + missedDays.length,
        data: {
          type: 'comparison',
          values: [
            { label: 'Taken', value: takenSev, count: takenDays.length },
            { label: 'Missed', value: missedSev, count: missedDays.length },
          ],
        },
        metricA: med.name,
        metricB: 'severity',
        medName: med.name,
        direction: takenSev <= missedSev ? 'positive' : 'negative',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 11. Time-of-day mood/energy patterns  (category: 'timeofday')
  // -------------------------------------------------------------------------
  {
    // Use journal entry time (from date or created_at) to bucket mood/energy
    const bucketEntry = (entry) => {
      const ts = entry.created_at || entry.date;
      if (!ts) return null;
      const d = new Date(ts);
      const h = d.getHours();
      if (isNaN(h)) return null;
      if (h < 6) return 'night';
      if (h < 12) return 'morning';
      if (h < 18) return 'afternoon';
      return 'evening';
    };

    const moodByTime = { morning: [], afternoon: [], evening: [] };
    for (const entry of journal) {
      if (!entry.mood || !MOOD_SCORE[entry.mood]) continue;
      const bucket = bucketEntry(entry);
      if (bucket && moodByTime[bucket]) moodByTime[bucket].push(MOOD_SCORE[entry.mood]);
    }

    const timeBuckets = Object.entries(moodByTime)
      .filter(([, vals]) => vals.length >= 3)
      .map(([label, vals]) => ({
        label: titleCase(label),
        avg: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100,
        count: vals.length,
      }));

    if (timeBuckets.length >= 2) {
      const sorted = [...timeBuckets].sort((a, b) => b.avg - a.avg);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      const diff = best.avg - worst.avg;

      if (diff >= 0.5) {
        const totalN = timeBuckets.reduce((s, b) => s + b.count, 0);
        const template = `Your mood tends to be highest in the ${best.label.toLowerCase()} (${fmt(best.avg)}/8) and lowest in the ${worst.label.toLowerCase()} (${fmt(worst.avg)}/8).`;
        const score = clamp(Math.round(diff * 8 + 22), 22, 70);

        insights.push({
          id: nextId('timeofday-mood'),
          type: 'timeofday',
          category: 'timeofday',
          title: 'Mood by Time of Day',
          template,
          narrative: null,
          score,
          confidence: confidence(totalN),
          n: totalN,
          data: {
            type: 'bar',
            values: timeBuckets.map(b => ({ label: b.label, value: b.avg, count: b.count })),
          },
          metricA: 'mood',
          direction: 'neutral',
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sort by score descending and return
  // -------------------------------------------------------------------------
  return insights.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Micro-insights: quick daily-rotating stat one-liners
// ---------------------------------------------------------------------------

/**
 * Returns an array of small stat observations, each { emoji, text, id }.
 * Dashboard picks 2 per day using day-of-year rotation.
 */
export function computeMicroInsights(data) {
  const micros = [];
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = shiftDate(today, -7);
  const monthAgo = shiftDate(today, -30);

  // helper: filter entries within a date range
  const since = (arr, dateField, cutoff) =>
    arr.filter(r => (r[dateField] || '') >= cutoff);

  // 1. Total vitals tracked
  if (data.vitals.length >= 10) {
    micros.push({ emoji: '📊', text: `You've tracked ${data.vitals.length} vitals entries`, id: 'total_vitals' });
  }

  // 2. Journal entries this month
  const journalMonth = since(data.journal_entries, 'date', monthAgo).length;
  if (journalMonth >= 3) {
    micros.push({ emoji: '📝', text: `${journalMonth} journal entries this month`, id: 'journal_month' });
  }

  // 3. Active medications count
  const activeMeds = data.meds.filter(m => m.active !== false).length;
  if (activeMeds >= 2) {
    micros.push({ emoji: '💊', text: `${activeMeds} active medications tracked`, id: 'active_meds' });
  }

  // 4. Sleep average this week vs last week
  const sleepVitals = data.vitals.filter(v => v.type === 'sleep' && v.value > 0);
  const sleepThisWeek = sleepVitals.filter(v => v.date >= weekAgo);
  const twoWeeksAgo = shiftDate(today, -14);
  const sleepLastWeek = sleepVitals.filter(v => v.date >= twoWeeksAgo && v.date < weekAgo);
  if (sleepThisWeek.length >= 3) {
    const avg = sleepThisWeek.reduce((s, v) => s + v.value, 0) / sleepThisWeek.length;
    let suffix = '';
    if (sleepLastWeek.length >= 3) {
      const prevAvg = sleepLastWeek.reduce((s, v) => s + v.value, 0) / sleepLastWeek.length;
      const diff = avg - prevAvg;
      if (Math.abs(diff) >= 0.2) suffix = ` (${diff > 0 ? '↑' : '↓'} ${Math.abs(diff).toFixed(1)} from last week)`;
    }
    micros.push({ emoji: '😴', text: `Average sleep this week: ${avg.toFixed(1)} hrs${suffix}`, id: 'sleep_avg' });
  }

  // 5. Workouts this week
  const workoutsWeek = since(data.activities, 'date', weekAgo).length;
  if (workoutsWeek >= 1) {
    const workoutsLastWeek = data.activities.filter(a => (a.date || '') >= twoWeeksAgo && (a.date || '') < weekAgo).length;
    let suffix = '';
    if (workoutsWeek > workoutsLastWeek && workoutsLastWeek > 0) suffix = ' — your most active week recently';
    micros.push({ emoji: '💪', text: `${workoutsWeek} workout${workoutsWeek !== 1 ? 's' : ''} this week${suffix}`, id: 'workouts_week' });
  }

  // 6. Resting HR average this week
  const hrWeek = data.vitals.filter(v => v.type === 'hr' && v.date >= weekAgo && v.value > 0);
  if (hrWeek.length >= 3) {
    const avg = Math.round(hrWeek.reduce((s, v) => s + v.value, 0) / hrWeek.length);
    micros.push({ emoji: '❤️', text: `Resting HR average this week: ${avg} bpm`, id: 'hr_avg' });
  }

  // 7. Mood trend (2 weeks)
  const moodEntries = data.journal_entries
    .filter(j => j.mood && j.date >= twoWeeksAgo)
    .map(j => ({ date: j.date, val: MOOD_SCORE[j.mood] || 0 }))
    .filter(m => m.val > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (moodEntries.length >= 5) {
    const firstHalf = moodEntries.slice(0, Math.floor(moodEntries.length / 2));
    const secondHalf = moodEntries.slice(Math.floor(moodEntries.length / 2));
    const avgFirst = firstHalf.reduce((s, m) => s + m.val, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, m) => s + m.val, 0) / secondHalf.length;
    const diff = avgSecond - avgFirst;
    if (Math.abs(diff) >= 0.4) {
      const dir = diff > 0 ? 'improving' : 'dipping';
      micros.push({ emoji: '📈', text: `Your mood trend is ${dir} over the last 2 weeks`, id: 'mood_trend' });
    }
  }

  // 8. Next appointment countdown
  const upcoming = data.appts
    .filter(a => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const daysOut = dayDiff(today, next.date);
    const provider = next.provider || 'your provider';
    if (daysOut <= 14) {
      const when = daysOut === 0 ? 'today' : daysOut === 1 ? 'tomorrow' : `in ${daysOut} days`;
      micros.push({ emoji: '🩺', text: `Next appointment: ${provider} ${when}`, id: 'next_appt' });
    }
  }

  // 9. Total conditions managed
  const activeConditions = (data.conditions || []).filter(c => c.status === 'active' || c.status === 'managed').length;
  if (activeConditions >= 2) {
    micros.push({ emoji: '🏥', text: `Managing ${activeConditions} active conditions`, id: 'conditions_count' });
  }

  // 10. Steps this week
  const stepsWeek = data.vitals.filter(v => v.type === 'steps' && v.date >= weekAgo && v.value > 0);
  if (stepsWeek.length >= 3) {
    const total = stepsWeek.reduce((s, v) => s + v.value, 0);
    const avgDaily = Math.round(total / stepsWeek.length);
    micros.push({ emoji: '🚶', text: `Averaging ${avgDaily.toLocaleString()} steps/day this week`, id: 'steps_avg' });
  }

  return micros;
}
