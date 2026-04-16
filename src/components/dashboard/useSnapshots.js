import { useMemo } from 'react';
import { localISODate } from '../../utils/dates';
import { VITAL_POLARITY } from './constants';

/* Vitals snapshot, one featured vital (with 14-day chart) + compact supporting chips */
export function useVitalsSnapshot(vitals) {
  return useMemo(() => {
    const today = Date.now();
    const recentCutoff = localISODate(new Date(today - 7 * 86400000));
    const sparkCutoff = localISODate(new Date(today - 7 * 86400000));
    const list = vitals || [];
    if (!list.length) return null;
    const recent = list.filter(v => v.date >= recentCutoff);
    if (!recent.length) return null;
    const byType = {};
    for (const v of recent) {
      if (!byType[v.type] || v.date > byType[v.type].date) byType[v.type] = v;
    }
    const priority = ['sleep', 'hr', 'bp', 'weight', 'steps', 'energy', 'pain', 'mood', 'spo2', 'resp', 'temp', 'glucose'];
    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const buildItem = (type) => {
      const latest = byType[type];
      if (!latest) return null;
      // Aggregate to daily averages so high-frequency wearable data doesn't make a blob
      const byDateMap = new Map();
      for (const v of list.filter(v2 => v2.type === type && v2.date >= sparkCutoff)) {
        const n = Number(v.value);
        if (!Number.isFinite(n)) continue;
        if (!byDateMap.has(v.date)) byDateMap.set(v.date, []);
        byDateMap.get(v.date).push(n);
      }
      const series = [...byDateMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, vals]) => ({
          date,
          value: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10,
        }));
      const recent7 = series.filter(p => p.date >= recentCutoff).map(p => p.value);
      const recentAvg = mean(recent7);
      const latestNum = Number(latest.value);
      let delta = null, direction = 'flat', signal = 'neutral';
      // Compare the LATEST reading to the 7-day average
      if (recentAvg !== null && Number.isFinite(latestNum)) {
        delta = latestNum - recentAvg;
        const relThresh = Math.max(Math.abs(recentAvg) * 0.03, 0.1);
        direction = delta > relThresh ? 'up' : delta < -relThresh ? 'down' : 'flat';
        const polarity = VITAL_POLARITY[type];
        if (polarity && direction !== 'flat') {
          signal = (polarity === direction) ? 'good' : 'watch';
        }
      }
      return { ...latest, series, recentAvg, delta, direction, signal };
    };
    const available = priority.filter(t => byType[t]);
    if (!available.length) return null;
    // Featured: top priority vital that also has at least 2 readings for a chart
    const featuredType = available.find(t => {
      const s = list.filter(v => v.type === t && v.date >= sparkCutoff);
      return s.length >= 2;
    }) || available[0];
    const featured = buildItem(featuredType);
    const chips = available
      .filter(t => t !== featuredType)
      .map(buildItem)
      .filter(Boolean);
    return { featured, chips };
  }, [vitals]);
}

/* Activity snapshot, last 7 days summary + per-day bar data */
export function useActivitySnapshot(activities) {
  return useMemo(() => {
    const list = activities || [];
    if (!list.length) return null;
    const cutoff = localISODate(new Date(Date.now() - 7 * 86400000));
    const recent = list.filter(a => a.date >= cutoff);
    if (!recent.length) return null;
    const totalMinutes = recent.reduce((s, a) => s + (Number(a.duration_minutes) || 0), 0);
    const totalCalories = recent.reduce((s, a) => s + (Number(a.calories) || 0), 0);
    const dayBars = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = localISODate(d);
      const dayMins = list.filter(a => a.date === dateStr).reduce((s, a) => s + (Number(a.duration_minutes) || 0), 0);
      dayBars.push({ date: dateStr, mins: dayMins, label: d.toLocaleDateString('en', { weekday: 'short' })[0] });
    }
    const lastActivity = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    return { count: recent.length, totalMinutes, totalCalories, dayBars, lastActivity };
  }, [activities]);
}

/* Mood snapshot, 7-day mood dots from journal entries (no Recharts, pure CSS) */
export function useMoodSnapshot(journal) {
  return useMemo(() => {
    const list = journal || [];
    if (!list.length) return null;
    const MOOD_SCORE = { '😀 Great': 5, '😊 Good': 4, '😐 Okay': 3, '😔 Low': 2, '😢 Sad': 1, '😠 Frustrated': 2, '😰 Anxious': 2, '😴 Exhausted': 1 };
    const MOOD_COLOR = { '😀 Great': 'sage', '😊 Good': 'sage', '😐 Okay': 'textMid', '😔 Low': 'amber', '😢 Sad': 'rose', '😠 Frustrated': 'amber', '😰 Anxious': 'amber', '😴 Exhausted': 'rose' };
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = localISODate(d);
      const entry = list.find(j => j.date === dateStr && j.mood);
      days.push({
        date: dateStr,
        label: d.toLocaleDateString('en', { weekday: 'short' })[0],
        mood: entry?.mood || null,
        emoji: entry?.mood ? entry.mood.split(' ')[0] : null,
        score: entry?.mood ? (MOOD_SCORE[entry.mood] || 3) : null,
        color: entry?.mood ? (MOOD_COLOR[entry.mood] || 'textMid') : null,
      });
    }
    const withMood = days.filter(d => d.mood);
    if (withMood.length < 2) return null;
    const latest = withMood[withMood.length - 1];
    const avgScore = Math.round(withMood.reduce((s, d) => s + d.score, 0) / withMood.length * 10) / 10;
    const avgLabel = avgScore >= 4.5 ? 'Great' : avgScore >= 3.5 ? 'Good' : avgScore >= 2.5 ? 'Okay' : 'Low';
    return { days, latest, avgScore, avgLabel, count: withMood.length };
  }, [journal]);
}
