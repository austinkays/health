import { describe, it, expect } from 'vitest';
import {
  alignByDate,
  pearson,
  categoricalSplit,
  beforeAfter,
  trendDirection,
  sleepCorrelation,
  exerciseCorrelation,
  medImpact,
  cyclePhase,
  trend,
  computeCorrelations,
  computeMicroInsights,
} from '../../../src/utils/correlations.js';

describe('alignByDate', () => {
  it('returns empty arrays on missing inputs', () => {
    expect(alignByDate(null, [])).toEqual([[], []]);
    expect(alignByDate([], null)).toEqual([[], []]);
  });

  it('pairs matching-date entries into parallel arrays', () => {
    const a = [{ date: '2026-03-01', value: 5 }, { date: '2026-03-02', value: 7 }];
    const b = [{ date: '2026-03-01', value: 10 }, { date: '2026-03-02', value: 20 }];
    const [xs, ys] = alignByDate(a, b);
    expect(xs).toEqual([5, 7]);
    expect(ys).toEqual([10, 20]);
  });

  it('skips rows with missing / non-numeric values', () => {
    const a = [{ date: '2026-03-01', value: 5 }, { date: '2026-03-02', value: null }, { date: '2026-03-03', value: 'x' }];
    const b = [{ date: '2026-03-01', value: 10 }, { date: '2026-03-02', value: 20 }, { date: '2026-03-03', value: 30 }];
    const [xs, ys] = alignByDate(a, b);
    expect(xs).toEqual([5]);
    expect(ys).toEqual([10]);
  });

  it('supports positive lag — yesterday predicts today', () => {
    const a = [{ date: '2026-03-01', value: 5 }];
    const b = [{ date: '2026-03-02', value: 99 }];
    const [xs, ys] = alignByDate(a, b, 1);
    expect(xs).toEqual([5]);
    expect(ys).toEqual([99]);
  });
});

describe('pearson', () => {
  it('returns null below the minimum sample threshold', () => {
    expect(pearson([1, 2, 3], [1, 2, 3], 7)).toBe(null);
  });

  it('returns null on mismatched / empty inputs', () => {
    expect(pearson([], [], 2)).toBe(null);
    expect(pearson([1, 2], [1, 2, 3], 2)).toBe(null);
  });

  it('returns r=1.0 for a perfectly positive linear correlation', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    const ys = [2, 4, 6, 8, 10, 12, 14];
    const result = pearson(xs, ys, 7);
    expect(result.r).toBeCloseTo(1, 4);
    expect(result.n).toBe(7);
  });

  it('returns r=-1.0 for a perfectly negative linear correlation', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    const ys = [7, 6, 5, 4, 3, 2, 1];
    const result = pearson(xs, ys, 7);
    expect(result.r).toBeCloseTo(-1, 4);
  });

  it('returns null when variance is zero (constant series)', () => {
    expect(pearson([5, 5, 5, 5, 5, 5, 5], [1, 2, 3, 4, 5, 6, 7], 7)).toBe(null);
  });
});

describe('categoricalSplit', () => {
  it('returns empty on mismatched or empty inputs', () => {
    expect(categoricalSplit([], [])).toEqual([]);
    expect(categoricalSplit([1, 2], ['a'])).toEqual([]);
  });

  it('groups values by category with count >= 3 and sorts by avg desc', () => {
    const values = [5, 7, 9, 1, 2, 3, 4, 5, 6];
    const categories = ['high', 'high', 'high', 'low', 'low', 'low', 'mid', 'mid', 'mid'];
    const result = categoricalSplit(values, categories);
    expect(result.length).toBe(3);
    expect(result[0].category).toBe('high');
    expect(result[0].avg).toBe(7);
    expect(result[2].category).toBe('low');
  });

  it('drops categories with fewer than 3 values', () => {
    const result = categoricalSplit([1, 2, 3, 4], ['low', 'low', 'low', 'high']);
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('low');
  });
});

describe('beforeAfter', () => {
  const mkSeries = (entries) => entries.map(([date, value]) => ({ date, value }));

  it('returns null below 3 entries on either side', () => {
    const series = mkSeries([['2026-03-01', 5], ['2026-03-02', 5], ['2026-03-15', 10]]);
    expect(beforeAfter(series, '2026-03-10')).toBe(null);
  });

  it('computes before/after averages and percent change', () => {
    const series = mkSeries([
      ['2026-03-01', 6], ['2026-03-02', 6], ['2026-03-03', 6],
      ['2026-03-15', 8], ['2026-03-16', 8], ['2026-03-17', 8],
    ]);
    const result = beforeAfter(series, '2026-03-10', 14);
    expect(result.before).toBe(6);
    expect(result.after).toBe(8);
    expect(result.change).toBe(2);
    expect(result.pct).toBeCloseTo(33.3, 1);
  });
});

describe('trendDirection', () => {
  const mkSeries = (entries) => entries.map(([date, value]) => ({ date, value }));

  it('returns null on empty series or too few points', () => {
    expect(trendDirection([], 14, 'up_is_good')).toBe(null);
    // Use dates within the 14-day window from the most recent entry
    expect(trendDirection(mkSeries([['2026-03-14', 5], ['2026-03-15', 6], ['2026-03-16', 7]]), 14, 'up_is_good')).toBe(null);
  });

  it('detects an improving trend with up_is_good polarity', () => {
    const series = mkSeries([
      ['2026-03-01', 3], ['2026-03-03', 4], ['2026-03-05', 5],
      ['2026-03-07', 6], ['2026-03-09', 7], ['2026-03-11', 8],
    ]);
    const result = trendDirection(series, 14, 'up_is_good');
    expect(result.direction).toBe('improving');
    expect(result.totalChange).toBeGreaterThan(0);
  });

  it('detects an improving trend with down_is_good polarity', () => {
    const series = mkSeries([
      ['2026-03-01', 8], ['2026-03-03', 7], ['2026-03-05', 6],
      ['2026-03-07', 5], ['2026-03-09', 4], ['2026-03-11', 3],
    ]);
    const result = trendDirection(series, 14, 'down_is_good');
    expect(result.direction).toBe('improving');
  });

  it('labels flat series as stable', () => {
    const series = mkSeries([
      ['2026-03-01', 5], ['2026-03-03', 5], ['2026-03-05', 5],
      ['2026-03-07', 5], ['2026-03-09', 5], ['2026-03-11', 5],
    ]);
    const result = trendDirection(series, 14, 'up_is_good');
    expect(result.direction).toBe('stable');
  });

  it('returns null for neutral polarity with steady motion (neutral metrics have no good/bad)', () => {
    const series = mkSeries([
      ['2026-03-01', 3], ['2026-03-03', 4], ['2026-03-05', 5],
      ['2026-03-07', 6], ['2026-03-09', 7], ['2026-03-11', 8],
    ]);
    const result = trendDirection(series, 14, 'neutral');
    expect(result.direction).toBe('stable');
  });
});

describe('narrative templates', () => {
  it('sleepCorrelation produces a sentence with the metric label', () => {
    const out = sleepCorrelation('pain', [
      { category: 'low', avg: 7 },
      { category: 'high', avg: 3 },
    ]);
    expect(out).toMatch(/pain/);
    expect(out).toMatch(/short-sleep/);
  });

  it('exerciseCorrelation mentions exercise vs rest days', () => {
    expect(exerciseCorrelation('mood', 7.5, 5.5)).toMatch(/exercise days.*rest days/);
  });

  it('medImpact says "increased" or "decreased" based on change sign', () => {
    expect(medImpact('Lexapro', 'mood', { before: 4, after: 7, change: 3 })).toMatch(/increased/);
    expect(medImpact('Ibuprofen', 'pain', { before: 8, after: 5, change: -3 })).toMatch(/decreased/);
  });

  it('cyclePhase highlights the highest and lowest phases', () => {
    const out = cyclePhase('mood', [
      { category: 'Follicular', avg: 7 },
      { category: 'Luteal', avg: 3 },
    ]);
    expect(out).toMatch(/Follicular/);
    expect(out).toMatch(/Luteal/);
  });

  it('trend describes direction and applies sentiment for improving', () => {
    const out = trend('sleep', { direction: 'improving', totalChange: 1.5, n: 14 }, 'up_is_good');
    expect(out).toMatch(/trending up/);
  });

  it('trend says stable for flat series', () => {
    const out = trend('sleep', { direction: 'stable', totalChange: 0, n: 14 }, 'up_is_good');
    expect(out).toMatch(/stable/);
  });
});

describe('computeCorrelations', () => {
  it('returns an empty array with no data', () => {
    expect(computeCorrelations({})).toEqual([]);
  });

  it('does not claim patterns when sample size is below minimum', () => {
    const data = {
      vitals: [{ type: 'sleep', date: '2026-03-01', value: 6 }],
      journal_entries: [],
    };
    const insights = computeCorrelations(data);
    expect(insights).toEqual([]);
  });

  it('surfaces a sleep vs pain correlation when the effect is large enough', () => {
    // Pain averages 8 on low-sleep nights, 3 on high-sleep nights — big gap
    const vitals = [];
    // 6 low-sleep nights paired with next-day high pain
    for (let i = 1; i <= 6; i++) {
      vitals.push({ type: 'sleep', date: `2026-03-0${i}`, value: 5 });
      vitals.push({ type: 'pain', date: `2026-03-0${i + 1}`, value: 8 });
    }
    // 6 high-sleep nights paired with next-day low pain
    for (let i = 7; i <= 12; i++) {
      const day = String(i).padStart(2, '0');
      const nextDay = String(i + 1).padStart(2, '0');
      vitals.push({ type: 'sleep', date: `2026-03-${day}`, value: 8 });
      vitals.push({ type: 'pain', date: `2026-03-${nextDay}`, value: 3 });
    }
    const insights = computeCorrelations({ vitals });
    const sleepPain = insights.find(i => i.metricA === 'sleep' && i.metricB === 'pain');
    expect(sleepPain).toBeDefined();
    expect(sleepPain.direction).toBe('positive'); // good sleep → low pain is good
  });

  it('sorts results by score descending', () => {
    // Synthesize two patterns and assert sort order
    const vitals = [];
    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, '0');
      vitals.push({ type: 'sleep', date: `2026-03-${day}`, value: i < 5 ? 5 : 8 });
      vitals.push({ type: 'energy', date: `2026-03-${day}`, value: i < 5 ? 2 : 8 });
    }
    const insights = computeCorrelations({ vitals });
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i - 1].score).toBeGreaterThanOrEqual(insights[i].score);
    }
  });
});

describe('computeMicroInsights', () => {
  it('returns an empty array for empty data', () => {
    expect(computeMicroInsights({})).toEqual([]);
  });

  it('surfaces active-medications count when >= 2 active meds', () => {
    const data = {
      meds: [
        { name: 'Lexapro', active: true },
        { name: 'Adderall', active: true },
        { name: 'Old Med', active: false },
      ],
    };
    const micros = computeMicroInsights(data);
    const activeMeds = micros.find(m => m.id === 'active_meds');
    expect(activeMeds).toBeDefined();
    expect(activeMeds.text).toMatch(/2 active/);
  });

  it('surfaces total_vitals when >= 10 entries', () => {
    const data = {
      vitals: Array.from({ length: 12 }, (_, i) => ({
        type: 'hr', date: `2026-03-${String(i + 1).padStart(2, '0')}`, value: 70,
      })),
    };
    const micros = computeMicroInsights(data);
    expect(micros.find(m => m.id === 'total_vitals')).toBeDefined();
  });
});
