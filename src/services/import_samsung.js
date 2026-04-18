/**
 * Samsung Health ZIP import.
 *
 * Samsung Health's "Data and Personalization, Download personal data"
 * delivers a ZIP full of CSV files named like
 * `com.samsung.shealth.<metric>.YYYYMMDDHHMMSS.csv`. We walk the ZIP and
 * pull out the most valuable metrics:
 *
 *   step_daily_trend      → vitals (steps, daily total)
 *   exercise              → activities (workouts)
 *   tracker.heart_rate    → vitals (hr, resting or average)
 *   weight                → vitals (weight, lbs)
 *   sleep                 → vitals (sleep, hours)
 *   tracker.oxygen_saturation → vitals (spo2)
 *   tracker.blood_pressure    → vitals (bp)
 *   tracker.blood_glucose     → vitals (glucose)
 *
 * Each CSV has a 2-row header: the first line is metadata, the second
 * row is the real column names. We skip the first line.
 */

import { parseCSV, normalizeDate, toNum, kgToLbs, round, bucketByDay } from './_parse';

export const META = {
  id: 'samsung_health',
  label: 'Samsung Health',
  tagline: 'Import steps, workouts, HR, sleep, weight, BP, and glucose from Samsung Health.',
  accept: '.zip',
  inputType: 'zip',
  walkthrough: [
    'Open <strong>Samsung Health</strong> on your phone',
    'Tap the <strong>menu</strong> (three lines), then <strong>Settings</strong>',
    'Tap <strong>Download personal data</strong>',
    'Wait for the ZIP to finish generating, then download it',
    'Upload the ZIP below',
  ],
};

// Samsung CSV files have 2 header lines: a metadata row + the real headers.
// parseCSV with headerRow: 1 skips the first row.
function samsungCSV(text) {
  return parseCSV(text, { headerRow: 1 });
}

// Samsung exercise type codes → activity type labels
const EXERCISE_TYPE = {
  '1001': 'walk', '1002': 'run', '11007': 'cycling', '14001': 'hike',
  '13001': 'swim', '15005': 'yoga', '15003': 'pilates', '15006': 'strength',
  '16001': 'elliptical', '16002': 'rowing', '11001': 'cycling',
};

export function detect() {
  // Detection happens in parse() by scanning for any com.samsung.shealth file.
  return true;
}

export async function parse(zip, { onProgress } = {}) {
  const files = Object.keys(zip.files || {}).filter(n => !zip.files[n].dir);
  if (!files.length) return { vitals: [], activities: [], counts: { total: 0 } };

  // Quick sanity check: any com.samsung files at all?
  if (!files.some(f => /com\.samsung\.shealth/i.test(f) || /samsung/i.test(f))) {
    throw new Error("This ZIP doesn't look like a Samsung Health export. Expected com.samsung.shealth CSV files.");
  }

  const vitals = [];
  const activities = [];

  const findFiles = (pattern) => files.filter(f => pattern.test(f));
  const readFile = async (name) => zip.files[name].async('string');

  let step = 0;
  const totalSteps = 8;
  const tick = () => { step++; onProgress?.(step / totalSteps); };

  // ── Steps (daily totals) ─────────────────────────────────
  for (const f of findFiles(/step_daily_trend.*\.csv$/i)) {
    try {
      const rows = samsungCSV(await readFile(f));
      for (const row of rows) {
        const date = normalizeDate(row.day_time || row.date || row.create_time);
        const count = toNum(row.count);
        if (!date || count == null || count <= 0) continue;
        vitals.push({
          date,
          type: 'steps',
          value: String(Math.round(count)),
          unit: 'steps',
          notes: '',
          source: 'samsung_health',
        });
      }
    } catch { /* skip malformed */ }
  }
  tick();

  // ── Exercises / workouts ─────────────────────────────────
  for (const f of findFiles(/shealth\.exercise\..*\.csv$/i)) {
    try {
      const rows = samsungCSV(await readFile(f));
      for (const row of rows) {
        const date = normalizeDate(row.start_time || row.create_time || row.exercise_start_time);
        if (!date) continue;
        const code = String(row.exercise_type || '').trim();
        const type = EXERCISE_TYPE[code] || 'workout';
        const duration = toNum(row.duration);
        const distanceM = toNum(row.distance);
        const calories = toNum(row.calorie);
        const avgHr = toNum(row.mean_heart_rate);
        const duration_minutes = duration ? Math.round(duration / 60000) : null;
        // Skip short auto-detected walks (< 15 min) — already captured by daily step vitals
        if (type === 'walk' && (!duration_minutes || duration_minutes < 15)) continue;
        activities.push({
          date,
          type,
          duration_minutes,
          distance: distanceM ? round(distanceM / 1609.344, 2) : null,
          calories,
          heart_rate_avg: avgHr ? Math.round(avgHr) : null,
          source: 'samsung_health',
          notes: '',
        });
      }
    } catch { /* */ }
  }
  tick();

  // ── Heart rate (bucket to daily average) ─────────────────
  const hrReadings = [];
  for (const f of findFiles(/tracker\.heart_rate.*\.csv$/i)) {
    try {
      const rows = samsungCSV(await readFile(f));
      for (const row of rows) {
        const date = normalizeDate(row.start_time || row.create_time);
        const bpm = toNum(row.heart_rate || row.rate);
        if (!date || bpm == null || bpm < 20 || bpm > 250) continue;
        hrReadings.push({ date, value: bpm });
      }
    } catch { /* */ }
  }
  for (const d of bucketByDay(hrReadings, r => r.date, r => r.value, { agg: 'avg', keep: ['n'] })) {
    vitals.push({ date: d.date, type: 'hr', value: String(Math.round(d.value)), unit: 'bpm', notes: `${d.n} readings`, source: 'samsung_health' });
  }
  tick();

  // ── Weight (kg → lbs) ────────────────────────────────────
  for (const f of findFiles(/shealth\.weight.*\.csv$/i).concat(findFiles(/weight.*\.csv$/i))) {
    try {
      const rows = samsungCSV(await readFile(f));
      for (const row of rows) {
        const date = normalizeDate(row.create_time || row.start_time || row.update_time);
        const kg = toNum(row.weight);
        if (!date || kg == null || kg <= 0) continue;
        vitals.push({
          date,
          type: 'weight',
          value: String(round(kgToLbs(kg), 1)),
          unit: 'lbs',
          notes: '',
          source: 'samsung_health',
        });
      }
    } catch { /* */ }
  }
  tick();

  // ── Sleep (milliseconds → hours) ─────────────────────────
  for (const f of findFiles(/shealth\.sleep.*\.csv$/i)) {
    try {
      const rows = samsungCSV(await readFile(f));
      for (const row of rows) {
        const date = normalizeDate(row.start_time || row.create_time);
        const start = toNum(row.start_time && Date.parse(row.start_time)) || null;
        const end = toNum(row.end_time && Date.parse(row.end_time)) || null;
        let hours = null;
        if (start != null && end != null) hours = (end - start) / 3600000;
        else if (toNum(row.sleep_duration)) hours = toNum(row.sleep_duration) / 60;
        if (!date || hours == null || hours <= 0 || hours > 24) continue;
        vitals.push({
          date,
          type: 'sleep',
          value: String(round(hours, 2)),
          unit: 'hr',
          notes: '',
          source: 'samsung_health',
        });
      }
    } catch { /* */ }
  }
  tick();

  // ── SpO2 ─────────────────────────────────────────────────
  for (const f of findFiles(/oxygen_saturation.*\.csv$/i)) {
    try {
      const rows = samsungCSV(await readFile(f));
      for (const row of rows) {
        const date = normalizeDate(row.start_time || row.create_time);
        const spo2 = toNum(row.spo2 || row.oxygen_saturation);
        if (!date || spo2 == null || spo2 <= 0) continue;
        vitals.push({ date, type: 'spo2', value: String(Math.round(spo2)), unit: '%', notes: '', source: 'samsung_health' });
      }
    } catch { /* */ }
  }
  tick();

  // ── Blood pressure ───────────────────────────────────────
  for (const f of findFiles(/blood_pressure.*\.csv$/i)) {
    try {
      const rows = samsungCSV(await readFile(f));
      for (const row of rows) {
        const date = normalizeDate(row.start_time || row.create_time);
        const sys = toNum(row.systolic);
        const dia = toNum(row.diastolic);
        if (!date || sys == null || dia == null) continue;
        vitals.push({
          date,
          type: 'bp',
          value: String(Math.round(sys)),
          value2: String(Math.round(dia)),
          unit: 'mmHg',
          notes: '',
          source: 'samsung_health',
        });
      }
    } catch { /* */ }
  }
  tick();

  // ── Blood glucose ────────────────────────────────────────
  for (const f of findFiles(/blood_glucose.*\.csv$/i)) {
    try {
      const rows = samsungCSV(await readFile(f));
      for (const row of rows) {
        const date = normalizeDate(row.start_time || row.create_time);
        const mgdl = toNum(row.glucose || row.blood_glucose);
        if (!date || mgdl == null || mgdl <= 0) continue;
        vitals.push({ date, type: 'glucose', value: String(Math.round(mgdl)), unit: 'mg/dL', notes: '', source: 'samsung_health' });
      }
    } catch { /* */ }
  }
  tick();

  return { vitals, activities, counts: { total: vitals.length + activities.length } };
}
