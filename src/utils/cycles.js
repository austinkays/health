import { C } from '../constants/colors';
import { localISODate } from './dates';

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
  return localISODate(next);
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

  const target = new Date(date + 'T00:00:00');
  let startDate = null;
  for (let i = stats.periodStarts.length - 1; i >= 0; i--) {
    const s = new Date(stats.periodStarts[i] + 'T00:00:00');
    if (s <= target) { startDate = s; break; }
  }
  if (!startDate) return null;

  const dayOfCycle = Math.floor((target - startDate) / 86400000) + 1;
  if (dayOfCycle > stats.avgLength * 2) return null;

  const phase = getCyclePhase(dayOfCycle, stats.avgLength);
  if (!phase) return null;

  return { phase: phase.name, dayOfCycle, color: phase.color };
}

/**
 * Estimates relative fertility for a given cycle day (1-based) and average cycle length.
 * Returns { pct: 0–100, zone: 'absolute'|'relative'|'fertile'|'peak' }.
 *
 * The windows of fertility are dictated by gamete lifespans:
 * - Sperm survive up to 120 hours (5 days) in cervical crypts when the cervix
 *   produces alkaline Type E mucus under high estradiol.
 * - The egg survives only 12–24 hours after release.
 * - Maximum biological fertile window: 120h before ovulation to 24h after.
 *
 * FERTILE [ovDay-5 → ovDay+1]:
 *   The cervix is open, producing Type E mucus that actively assists sperm transport.
 *   Peak is O-1 and O-day when the LH surge triggers egg release.
 *
 * POST-OVULATORY, ABSOLUTE [ovDay+2 → cycle end]:
 *   The egg is gone within 24h. Progesterone from the corpus luteum seals the
 *   cervix and reverts mucus to impenetrable Type G. The luteal phase is rigidly
 *   conserved at 12–14 days, making this the most predictable infertile window.
 *
 * PRE-OVULATORY, RELATIVE [day 1 → ovDay-6]:
 *   Dense Type G mucus traps and destroys sperm. Labeled "relative" because
 *   follicular phase length varies, in a short cycle, sperm from late in a
 *   period could survive long enough to meet an early ovulation.
 */
export function estimateFertility(dayOfCycle, avgLength) {
  if (dayOfCycle <= 0) return { pct: 0, zone: 'relative' };
  const ovDay = Math.round(avgLength - 14);
  const dist = dayOfCycle - ovDay; // negative = before ovulation, positive = after

  // ── POST-OVULATORY: absolute infertility ──
  if (dist >= 2) return { pct: 0, zone: 'absolute' };
  if (dist === 1) return { pct: 8, zone: 'fertile' };

  // ── FERTILE WINDOW: Type E mucus, sperm-permeable cervix ──
  if (dist === 0)  return { pct: 95, zone: 'peak' };
  if (dist === -1) return { pct: 95, zone: 'peak' };
  if (dist === -2) return { pct: 75, zone: 'fertile' };
  if (dist === -3) return { pct: 50, zone: 'fertile' };
  if (dist === -4) return { pct: 30, zone: 'fertile' };
  if (dist === -5) return { pct: 15, zone: 'fertile' };

  // ── BUFFER ZONE: early-ovulation safety margin ──
  // Ovulation can happen 2+ days early; flag these as "possible"
  if (dist === -6) return { pct: 8, zone: 'buffer' };
  if (dist === -7) return { pct: 5, zone: 'buffer' };

  // ── PRE-OVULATORY: relative infertility ──
  if (dayOfCycle <= 5) return { pct: 2, zone: 'relative' };
  return { pct: 1, zone: 'relative' };
}

/**
 * Detects BBT (Basal Body Temperature) thermal shift to confirm ovulation.
 * Looks for a sustained rise of ≥0.3°F above the previous 6 readings,
 * held for 3 consecutive days.
 *
 * Returns { confirmed: true, ovulationDate, shiftDay } or { confirmed: false, message }.
 */
export function detectBBTShift(cycles) {
  const bbtEntries = cycles
    .filter(c => c.type === 'bbt' && c.value)
    .map(c => ({ date: c.date, temp: parseFloat(c.value) }))
    .filter(c => !isNaN(c.temp))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (bbtEntries.length < 9) return { confirmed: false, message: 'Need at least 9 BBT readings to detect a shift.' };

  // Sliding window: check if entries [i], [i+1], [i+2] are all ≥0.3°F above the avg of the prior 6
  for (let i = 6; i <= bbtEntries.length - 3; i++) {
    const baseline = bbtEntries.slice(i - 6, i);
    const baseAvg = baseline.reduce((s, b) => s + b.temp, 0) / 6;
    const threshold = baseAvg + 0.3;

    const day1 = bbtEntries[i];
    const day2 = bbtEntries[i + 1];
    const day3 = bbtEntries[i + 2];

    if (day1.temp >= threshold && day2.temp >= threshold && day3.temp >= threshold) {
      // Ovulation typically occurs 1–2 days before the sustained temperature shift
      return {
        confirmed: true,
        ovulationDate: bbtEntries[i - 2]?.date || bbtEntries[i - 1]?.date || day1.date,
        shiftDay: day1.date,
        baselineAvg: Math.round(baseAvg * 100) / 100,
        shiftTemp: Math.round(day1.temp * 100) / 100,
      };
    }
  }

  // No shift found
  const dayCount = bbtEntries.length;
  if (dayCount >= 20) {
    return { confirmed: false, message: `No temperature shift detected in ${dayCount} readings. Ovulation may not have occurred this cycle.` };
  }
  return { confirmed: false, message: 'No temperature shift detected yet. Keep logging daily.' };
}

/**
 * Symptothermal Method analysis, combines BBT, cervical mucus, and calendar
 * to determine fertility status using FAM (Fertility Awareness Method) rules.
 *
 * The Symptothermal Method cross-checks three independent biomarkers:
 *  1. Calendar (count-backward prediction of fertile window)
 *  2. Cervical mucus (real-time estrogen indicator, mucus pattern confirms approach of ovulation)
 *  3. BBT (progesterone indicator, thermal shift confirms ovulation retroactively)
 *
 * Rules for confirming the post-ovulatory infertile phase:
 *  - BBT rule: 3 consecutive temps ≥0.3°F above the previous 6 (standard cover-line rule)
 *  - Mucus rule: 3 days past the last day of peak-type (eggwhite) mucus ("Peak + 3")
 *  - Both must agree for full Symptothermal confirmation
 *
 * Returns: { status, confidence, details, rules }
 *  status: 'infertile-post' | 'infertile-pre' | 'possibly-fertile' | 'fertile' | 'peak' | 'unknown'
 *  confidence: 'high' | 'medium' | 'low'
 */
export function getSymptothermalStatus(cycles, stats) {
  if (!stats?.lastPeriod) return { status: 'unknown', confidence: 'low', details: 'Not enough cycle data. Log your period to get started.', rules: {} };

  const dayOfCycle = getDayOfCycle(stats);
  if (dayOfCycle <= 0) return { status: 'unknown', confidence: 'low', details: 'Could not determine current cycle day.', rules: {} };

  const ovDay = Math.round(stats.avgLength - 14);

  // ── Gather indicators ──
  const bbtShift = detectBBTShift(cycles);
  const bbtEntries = cycles.filter(c => c.type === 'bbt' && c.value).sort((a, b) => b.date.localeCompare(a.date));

  // Most recent mucus entries this cycle
  const lastPeriodDate = new Date(stats.lastPeriod + 'T00:00:00');
  const mucusThisCycle = cycles
    .filter(c => c.type === 'cervical_mucus' && new Date(c.date + 'T00:00:00') >= lastPeriodDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  const lastMucus = mucusThisCycle[0] || null;
  const lastPeakMucus = mucusThisCycle.find(m => m.value === 'eggwhite');

  // Days since last peak mucus ("Peak day")
  const daysSincePeak = lastPeakMucus
    ? Math.floor((new Date() - new Date(lastPeakMucus.date + 'T00:00:00')) / 86400000)
    : null;

  // Peak + 3 rule: 3 full evenings past the last day of peak mucus
  const peakPlus3 = daysSincePeak !== null && daysSincePeak >= 4;

  // Current mucus status
  const mucusDrying = lastMucus && (lastMucus.value === 'dry' || lastMucus.value === 'sticky');

  // Calendar-based estimate
  const calFertility = estimateFertility(dayOfCycle, stats.avgLength);

  const rules = {
    bbtShiftConfirmed: bbtShift.confirmed,
    bbtShiftDate: bbtShift.confirmed ? bbtShift.shiftDay : null,
    bbtBaseline: bbtShift.confirmed ? bbtShift.baselineAvg : null,
    peakPlus3,
    daysSincePeak,
    lastMucusType: lastMucus?.value || null,
    mucusDrying,
    calendarZone: calFertility.zone,
    dayOfCycle,
    ovulationDay: ovDay,
    hasBBTData: bbtEntries.length > 0,
    hasMucusData: mucusThisCycle.length > 0,
  };

  // ── POST-OVULATORY: Symptothermal confirmation ──
  if (bbtShift.confirmed && peakPlus3 && mucusDrying) {
    return { status: 'infertile-post', confidence: 'high', details: 'BBT shift + mucus drying both confirm ovulation has passed.', rules };
  }
  if (bbtShift.confirmed && calFertility.zone === 'absolute') {
    return { status: 'infertile-post', confidence: 'medium', details: 'BBT shift confirms ovulation. Log mucus for double-check.', rules };
  }
  if (peakPlus3 && mucusDrying && calFertility.zone === 'absolute') {
    return { status: 'infertile-post', confidence: 'medium', details: 'Mucus drying confirms ovulation passed. Log BBT for double-check.', rules };
  }

  // ── PEAK FERTILITY ──
  if (lastMucus?.value === 'eggwhite' || calFertility.zone === 'peak') {
    return { status: 'peak', confidence: lastMucus?.value === 'eggwhite' ? 'high' : 'medium', details: `Ovulation likely within 1–2 days (day ${dayOfCycle}).`, rules };
  }

  // ── FERTILE WINDOW ──
  if (calFertility.zone === 'fertile' || calFertility.zone === 'buffer' || lastMucus?.value === 'creamy') {
    return { status: 'fertile', confidence: 'medium', details: `Approaching fertile window. Ovulation expected ~day ${ovDay}.`, rules };
  }

  // ── PRE-OVULATORY ──
  if (dayOfCycle <= 5) {
    return { status: 'infertile-pre', confidence: 'medium', details: 'Menstrual phase, generally infertile.', rules };
  }
  if (calFertility.zone === 'relative' && mucusDrying) {
    return { status: 'infertile-pre', confidence: 'low', details: 'Dry mucus, early in cycle. Watch for mucus changes.', rules };
  }

  // ── DEFAULT ──
  const hint = !rules.hasBBTData && !rules.hasMucusData ? 'Log BBT + mucus for tracking.' : !rules.hasBBTData ? 'Log daily BBT.' : !rules.hasMucusData ? 'Log cervical mucus.' : 'Collecting data.';
  return { status: 'possibly-fertile', confidence: 'low', details: `Day ${dayOfCycle}. ${hint}`, rules };
}

/**
 * Analyzes cycle data for edge cases and returns alerts.
 */
export function getCycleAlerts(stats, cycles) {
  const alerts = [];

  // Short cycle detection
  if (stats.periodStarts.length >= 2) {
    const lastTwo = stats.periodStarts.slice(-2);
    const lastLen = Math.round((new Date(lastTwo[1] + 'T00:00:00') - new Date(lastTwo[0] + 'T00:00:00')) / 86400000);
    if (lastLen < 21) {
      alerts.push({
        type: 'short_cycle',
        severity: 'warning',
        message: `Last cycle was ${lastLen} days, shorter than typical. Ovulation may happen earlier than expected.`,
      });
    }
  }

  // Check for egg-white cervical mucus as fertile confirmation
  const recentMucus = cycles
    .filter(c => c.type === 'cervical_mucus')
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastEggWhite = recentMucus.find(m => m.value === 'eggwhite');
  if (lastEggWhite && stats.lastPeriod) {
    const daysSinceEW = Math.floor((new Date() - new Date(lastEggWhite.date + 'T00:00:00')) / 86400000);
    if (daysSinceEW <= 3) {
      alerts.push({
        type: 'peak_mucus',
        severity: 'info',
        message: `Peak mucus logged ${daysSinceEW === 0 ? 'today' : `${daysSinceEW}d ago`}, ovulation likely imminent.`,
      });
    }
  }

  // BBT shift detection
  const bbtResult = detectBBTShift(cycles);
  if (bbtResult.confirmed) {
    alerts.push({
      type: 'bbt_confirmed',
      severity: 'success',
      message: `BBT shift confirmed ovulation (${bbtResult.shiftDay}). Post-ovulatory infertile phase.`,
    });
  }

  return alerts;
}
