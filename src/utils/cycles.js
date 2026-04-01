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
