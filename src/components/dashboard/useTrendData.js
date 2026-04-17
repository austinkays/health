import { useMemo } from 'react';
import { localISODate } from '../../utils/dates';

// Unified builder for HR and SpO2 7-day daily min/avg/max band data.
// Both were near-identical inline memos in the original Dashboard; only
// the label-formatting + rounding precision differs by type.
function buildBandTrend(vitals, type) {
  const typed = (vitals || []).filter(v => v.type === type);
  if (typed.length < 4) return null;
  const cutoff = localISODate(new Date(Date.now() - 7 * 86400000));
  const recent = typed.filter(v => v.date >= cutoff);
  if (recent.length < 4) return null;
  const byDate = new Map();
  for (const v of recent) {
    if (!byDate.has(v.date)) byDate.set(v.date, []);
    byDate.get(v.date).push(Number(v.value));
  }
  // HR rounds to whole numbers, SpO2 to 0.1% precision
  const isHR = type === 'hr';
  const round = (n) => isHR ? Math.round(n) : Math.round(n * 10) / 10;
  const days = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => {
      const min = round(Math.min(...vals));
      const max = round(Math.max(...vals));
      const avg = round(vals.reduce((s, v) => s + v, 0) / vals.length);
      const day = { date, min, band: isHR ? max - min : Math.round((max - min) * 10) / 10, avg };
      if (isHR) day.label = new Date(date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' }).slice(0, 2);
      return day;
    });
  if (days.length < 4) return null;
  const avg = round(days.reduce((s, d) => s + d.avg, 0) / days.length);
  if (isHR) {
    const min = Math.min(...days.map(d => d.min));
    const max = Math.max(...days.map(d => d.min + d.band));
    return { days, avg, min, max };
  }
  // SpO2: report "low nights" (<95%) and the session-wide min
  const lowNights = days.filter(d => d.min < 95).length;
  const minVal = Math.min(...days.map(d => d.min));
  return { days, avg, lowNights, minVal };
}

export function useSleepTrend(vitals) {
  return useMemo(() => {
    const sleepVitals = (vitals || []).filter(v => v.type === 'sleep');
    if (sleepVitals.length < 4) return null;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = localISODate(d);
      const recs = sleepVitals.filter(v => v.date === dateStr);
      const val = recs.length ? recs.reduce((s, v) => s + Number(v.value), 0) / recs.length : null;
      days.push({
        dateStr,
        label: d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 2),
        value: val !== null ? Math.round(val * 10) / 10 : null,
      });
    }
    const withData = days.filter(d => Number.isFinite(d.value));
    if (withData.length < 4) return null;
    const avg = Math.round(withData.reduce((s, d) => s + d.value, 0) / withData.length * 10) / 10;
    const last = withData[withData.length - 1];
    return { days, avg, last };
  }, [vitals]);
}

export function useHrTrend(vitals) {
  return useMemo(() => buildBandTrend(vitals, 'hr'), [vitals]);
}

export function useSpo2Trend(vitals) {
  return useMemo(() => buildBandTrend(vitals, 'spo2'), [vitals]);
}
