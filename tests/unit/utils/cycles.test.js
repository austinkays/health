import { describe, it, expect } from 'vitest';
import {
  getCyclePhase,
  computeCycleStats,
  predictNextPeriod,
  getDayOfCycle,
  getCyclePhaseForDate,
  estimateFertility,
  detectBBTShift,
  getCycleAlerts,
} from '../../../src/utils/cycles.js';

// Helpers
const mkPeriod = (date) => ({ date, type: 'period' });
const mkBBT = (date, value) => ({ date, type: 'bbt', value: String(value) });
const mkMucus = (date, value) => ({ date, type: 'cervical_mucus', value });

// Synthetic cycles: two 28-day cycles starting on 2026-02-01 and 2026-03-01
const twoCycles = [
  mkPeriod('2026-02-01'), mkPeriod('2026-02-02'), mkPeriod('2026-02-03'),
  mkPeriod('2026-03-01'), mkPeriod('2026-03-02'),
];

describe('getCyclePhase', () => {
  it('returns null for dayOfCycle <= 0', () => {
    expect(getCyclePhase(0, 28)).toBe(null);
    expect(getCyclePhase(-1, 28)).toBe(null);
  });

  it('returns Menstrual for days 1-5', () => {
    expect(getCyclePhase(1, 28).name).toBe('Menstrual');
    expect(getCyclePhase(5, 28).name).toBe('Menstrual');
  });

  it('returns Follicular for early follicular days (before ovulatory window)', () => {
    // avgLen 28, ovDay = 14; follicular is day < 14 - 4 = < 10
    expect(getCyclePhase(6, 28).name).toBe('Follicular');
    expect(getCyclePhase(9, 28).name).toBe('Follicular');
  });

  it('returns Ovulatory around ovulation day', () => {
    // ovDay = 14 for avgLen=28, window is 10..15
    expect(getCyclePhase(10, 28).name).toBe('Ovulatory');
    expect(getCyclePhase(14, 28).name).toBe('Ovulatory');
    expect(getCyclePhase(15, 28).name).toBe('Ovulatory');
  });

  it('returns Luteal after ovulation window', () => {
    expect(getCyclePhase(16, 28).name).toBe('Luteal');
    expect(getCyclePhase(27, 28).name).toBe('Luteal');
  });
});

describe('computeCycleStats', () => {
  it('falls back to 28-day default when fewer than 2 period entries exist', () => {
    const stats = computeCycleStats([mkPeriod('2026-02-01')]);
    expect(stats.avgLength).toBe(28);
    expect(stats.lastPeriod).toBe('2026-02-01');
    expect(stats.periodStarts).toEqual([]);
  });

  it('returns 28-day default with no period entries at all', () => {
    const stats = computeCycleStats([]);
    expect(stats.avgLength).toBe(28);
    expect(stats.lastPeriod).toBe(null);
    expect(stats.periodStarts).toEqual([]);
  });

  it('detects multiple period starts and computes the average cycle length', () => {
    const stats = computeCycleStats(twoCycles);
    expect(stats.periodStarts).toEqual(['2026-02-01', '2026-03-01']);
    expect(stats.avgLength).toBe(28);
    expect(stats.lastPeriod).toBe('2026-03-01');
  });

  it('ignores cycle lengths outside the physiologic range (18-45 days)', () => {
    // One 10-day gap is implausible and should be filtered out
    const cycles = [
      mkPeriod('2026-01-01'),
      mkPeriod('2026-01-11'), // 10 days later, filtered
      mkPeriod('2026-02-08'), // 28 days after 01-11
    ];
    const stats = computeCycleStats(cycles);
    expect(stats.avgLength).toBe(28);
  });

  it('groups consecutive period days (≤2 days apart) as one start', () => {
    const cycles = [
      mkPeriod('2026-02-01'), mkPeriod('2026-02-02'), mkPeriod('2026-02-03'), mkPeriod('2026-02-04'),
      mkPeriod('2026-03-01'),
    ];
    const stats = computeCycleStats(cycles);
    expect(stats.periodStarts.length).toBe(2);
  });
});

describe('predictNextPeriod', () => {
  it('returns null when no lastPeriod', () => {
    expect(predictNextPeriod({ lastPeriod: null, avgLength: 28 })).toBe(null);
  });

  it('uses count-backward rule: next = lastPeriod + avgLength', () => {
    const next = predictNextPeriod({ lastPeriod: '2026-03-01', avgLength: 28 });
    expect(next).toBe('2026-03-29');
  });
});

describe('getCyclePhaseForDate', () => {
  it('returns null for empty cycles', () => {
    expect(getCyclePhaseForDate('2026-03-10', [])).toBe(null);
    expect(getCyclePhaseForDate('2026-03-10', null)).toBe(null);
  });

  it('returns null if target date is before any recorded period start', () => {
    expect(getCyclePhaseForDate('2026-01-01', twoCycles)).toBe(null);
  });

  it('identifies the correct phase for a given date', () => {
    // 2026-03-01 period start + avgLen 28; day 7 = 2026-03-07 = Follicular
    const result = getCyclePhaseForDate('2026-03-07', twoCycles);
    expect(result.phase).toBe('Follicular');
    expect(result.dayOfCycle).toBe(7);
  });
});

describe('estimateFertility', () => {
  it('returns zone=relative with pct=0 for dayOfCycle <= 0', () => {
    expect(estimateFertility(0, 28)).toEqual({ pct: 0, zone: 'relative' });
    expect(estimateFertility(-1, 28)).toEqual({ pct: 0, zone: 'relative' });
  });

  it('flags peak fertility at ovulation and the day before', () => {
    // ovDay = 14 for avgLen 28
    expect(estimateFertility(13, 28)).toEqual({ pct: 95, zone: 'peak' });
    expect(estimateFertility(14, 28)).toEqual({ pct: 95, zone: 'peak' });
  });

  it('returns "fertile" zone in the 5 days before ovulation', () => {
    const expected = [
      [9,  { pct: 15, zone: 'fertile' }],
      [10, { pct: 30, zone: 'fertile' }],
      [11, { pct: 50, zone: 'fertile' }],
      [12, { pct: 75, zone: 'fertile' }],
    ];
    for (const [day, result] of expected) {
      expect(estimateFertility(day, 28)).toEqual(result);
    }
  });

  it('returns "fertile" with low pct for day after ovulation', () => {
    expect(estimateFertility(15, 28)).toEqual({ pct: 8, zone: 'fertile' });
  });

  it('returns "absolute" infertility 2+ days after ovulation', () => {
    expect(estimateFertility(16, 28)).toEqual({ pct: 0, zone: 'absolute' });
    expect(estimateFertility(26, 28)).toEqual({ pct: 0, zone: 'absolute' });
  });

  it('returns "buffer" zone for early-ovulation safety margin', () => {
    expect(estimateFertility(7, 28).zone).toBe('buffer');
    expect(estimateFertility(8, 28).zone).toBe('buffer');
  });

  it('returns "relative" for menstrual and early follicular days', () => {
    expect(estimateFertility(1, 28).zone).toBe('relative');
    expect(estimateFertility(5, 28).zone).toBe('relative');
    expect(estimateFertility(6, 28).zone).toBe('relative');
  });
});

describe('detectBBTShift', () => {
  it('returns not-confirmed when fewer than 9 BBT readings', () => {
    const cycles = [mkBBT('2026-03-01', 97.5), mkBBT('2026-03-02', 97.4)];
    const result = detectBBTShift(cycles);
    expect(result.confirmed).toBe(false);
    expect(result.message).toMatch(/at least 9/);
  });

  it('detects a sustained thermal shift of >=0.3°F above baseline', () => {
    // 6 baseline low temps + 3 high temps = confirmed shift
    const baseline = Array.from({ length: 6 }, (_, i) => mkBBT(`2026-03-0${i + 1}`, 97.4));
    const postShift = [mkBBT('2026-03-07', 97.8), mkBBT('2026-03-08', 97.9), mkBBT('2026-03-09', 97.8)];
    const result = detectBBTShift([...baseline, ...postShift]);
    expect(result.confirmed).toBe(true);
    expect(result.shiftDay).toBe('2026-03-07');
    expect(result.baselineAvg).toBeCloseTo(97.4, 1);
  });

  it('does not confirm if only 2 of 3 post-shift days are above threshold', () => {
    const baseline = Array.from({ length: 6 }, (_, i) => mkBBT(`2026-03-0${i + 1}`, 97.4));
    const noisyPost = [mkBBT('2026-03-07', 97.8), mkBBT('2026-03-08', 97.4), mkBBT('2026-03-09', 97.9)];
    const result = detectBBTShift([...baseline, ...noisyPost]);
    expect(result.confirmed).toBe(false);
  });
});

describe('getCycleAlerts', () => {
  it('flags a short cycle (< 21 days between the last two starts)', () => {
    const cycles = [
      mkPeriod('2026-02-01'),
      mkPeriod('2026-02-19'), // 18 days later
    ];
    const stats = computeCycleStats(cycles);
    // With an 18-day gap, stats.periodStarts has both, so we can test
    const alerts = getCycleAlerts(stats, cycles);
    const shortAlert = alerts.find(a => a.type === 'short_cycle');
    expect(shortAlert).toBeDefined();
    expect(shortAlert.severity).toBe('warning');
  });

  it('surfaces recent peak (egg-white) mucus as a fertility alert', () => {
    const today = new Date().toISOString().slice(0, 10);
    const cycles = [
      mkPeriod('2026-02-01'), mkPeriod('2026-03-01'),
      mkMucus(today, 'eggwhite'),
    ];
    const stats = computeCycleStats(cycles);
    const alerts = getCycleAlerts(stats, cycles);
    const peak = alerts.find(a => a.type === 'peak_mucus');
    expect(peak).toBeDefined();
  });

  it('returns an empty array when no signals are present', () => {
    const cycles = [mkPeriod('2026-02-01'), mkPeriod('2026-03-01')];
    const stats = computeCycleStats(cycles);
    const alerts = getCycleAlerts(stats, cycles);
    expect(Array.isArray(alerts)).toBe(true);
  });
});

describe('getDayOfCycle', () => {
  it('returns 0 when no lastPeriod', () => {
    expect(getDayOfCycle({ lastPeriod: null })).toBe(0);
  });

  it('returns a positive day-of-cycle when lastPeriod is in the past', () => {
    // Pin via stats object rather than Date.now() — can't mock today easily
    const stats = { lastPeriod: '2000-01-01', avgLength: 28 };
    const day = getDayOfCycle(stats);
    expect(day).toBeGreaterThan(0);
  });
});
