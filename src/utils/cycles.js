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

/**
 * Estimates relative fertility for a given cycle day (1-based) and average cycle length.
 * Returns { pct: 0–100, zone: 'absolute'|'relative'|'fertile'|'peak' }.
 *
 * Based on the HPO axis model and gamete viability:
 *
 * FERTILE WINDOW [ovDay-5 → ovDay]:
 *   Sperm survive up to 120h in Type E (estrogenic) cervical mucus secreted
 *   under high estradiol. Peak is O-1 and O-day (E2 >200pg/mL sustained ~50h
 *   triggers LH surge → oocyte release). The oocyte survives only 12–24h.
 *
 * POST-OVULATORY — ABSOLUTE INFERTILITY [ovDay+1 → cycle end]:
 *   Corpus luteum produces progesterone → cervical os constricts, mucus reverts
 *   to impenetrable Type G, oocyte undergoes apoptosis within 24h. The luteal
 *   phase is highly conserved at 12–14 days. Conception is biologically impossible.
 *
 * PRE-OVULATORY — RELATIVE INFERTILITY [day 1 → ovDay-6]:
 *   Low E2 → Type G mucus blocks sperm. However, follicular phase length is
 *   variable — accelerated folliculogenesis can shorten it. In short cycles,
 *   spermatozoal viability (120h) from coitus during late menses can bridge to
 *   an early ovulation. "Relative" because the barrier exists but is not absolute.
 */
export function estimateFertility(dayOfCycle, avgLength) {
  if (dayOfCycle <= 0) return { pct: 0, zone: 'relative' };
  const ovDay = Math.round(avgLength - 14);
  const dist = dayOfCycle - ovDay; // negative = before ovulation, positive = after

  // ── POST-OVULATORY: absolute infertility ──
  // Oocyte dead within 24h, P4 dominance, Type G mucus, cervix closed
  if (dist >= 2) return { pct: 0, zone: 'absolute' };
  // Day after ovulation: oocyte may still be viable for ~12h
  if (dist === 1) return { pct: 8, zone: 'fertile' };

  // ── FERTILE WINDOW: Type E mucus, sperm-permeable cervix ──
  // Peak: O-1 and O-day — LH surge, oocyte release, optimal timing
  if (dist === 0)  return { pct: 95, zone: 'peak' };
  if (dist === -1) return { pct: 95, zone: 'peak' };
  if (dist === -2) return { pct: 75, zone: 'fertile' };
  if (dist === -3) return { pct: 50, zone: 'fertile' };
  // Outer edge: sperm deposited now must survive 4–5 days
  if (dist === -4) return { pct: 30, zone: 'fertile' };
  if (dist === -5) return { pct: 15, zone: 'fertile' };

  // ── PRE-OVULATORY: relative infertility ──
  // Type G mucus present but follicular phase length varies
  // Closer to fertile window = higher risk from early ovulation
  if (dist === -6) return { pct: 5, zone: 'relative' };
  if (dist === -7) return { pct: 3, zone: 'relative' };

  // Menstrual phase (days 1–5): very low but nonzero in short cycles
  // Late menses + short follicular phase + 120h sperm viability = small risk
  if (dayOfCycle <= 5) return { pct: 2, zone: 'relative' };

  // Early follicular, far from ovulation
  return { pct: 1, zone: 'relative' };
}
