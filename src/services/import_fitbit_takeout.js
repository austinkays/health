/**
 * Fitbit Takeout import.
 *
 * Users who don't want to connect their Fitbit account via OAuth can
 * download a full account archive from Google Takeout. It's a ZIP with
 * per-day JSON files organized like:
 *
 *   Fitbit/Global Export Data/steps-YYYY-MM-DD.json
 *   Fitbit/Global Export Data/sleep-YYYY-MM-DD.json
 *   Fitbit/Global Export Data/heart_rate-YYYY-MM-DD.json
 *   Fitbit/Global Export Data/weight-YYYY-MM-DD.json
 *   Fitbit/Global Export Data/exercise-YYYY-MM-DD.json
 *
 * Each file is an array of sample objects. We aggregate to daily values
 * so we don't dump minute-by-minute HR into the vitals table.
 */

import { normalizeDate, toNum, round, bucketByDay } from './_parse';

export const META = {
  id: 'fitbit_takeout',
  label: 'Fitbit Takeout',
  tagline: 'Import steps, HR, sleep, weight, and workouts from a Fitbit Takeout archive.',
  accept: '.zip',
  inputType: 'zip',
  walkthrough: [
    'Sign in to <strong>takeout.google.com</strong> (Google Takeout)',
    'Deselect everything, then check only <strong>Fitbit</strong>',
    'Request the export and wait for the email (can take hours)',
    'Download the ZIP and upload it below',
  ],
};

export function detect() {
  return true;
}

export async function parse(zip, { onProgress } = {}) {
  const allFiles = Object.keys(zip.files || {}).filter(n => !zip.files[n].dir);
  if (!allFiles.length) return { vitals: [], activities: [], counts: { total: 0 } };

  // Sanity check
  if (!allFiles.some(f => /fitbit/i.test(f))) {
    throw new Error("This ZIP doesn't look like a Fitbit Takeout archive. Expected a Fitbit folder.");
  }

  const vitals = [];
  const activities = [];
  const hrReadings = [];
  const stepsByDay = new Map();

  const readJson = async (name) => {
    try { return JSON.parse(await zip.files[name].async('string')); }
    catch { return null; }
  };

  // Fitbit Takeout files have date in filename: `<metric>-YYYY-MM-DD.json`
  const withDateFromName = (name) => {
    const m = name.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };

  const stepFiles = allFiles.filter(n => /\/steps-\d{4}/i.test(n));
  const hrFiles = allFiles.filter(n => /\/heart_rate-\d{4}/i.test(n));
  const sleepFiles = allFiles.filter(n => /\/sleep-\d{4}/i.test(n));
  const weightFiles = allFiles.filter(n => /\/weight-\d{4}/i.test(n));
  const exerciseFiles = allFiles.filter(n => /\/exercise-\d{4}/i.test(n));

  const total = stepFiles.length + hrFiles.length + sleepFiles.length + weightFiles.length + exerciseFiles.length;
  let done = 0;
  const tick = () => { done++; if (done % 5 === 0) onProgress?.(done / total); };

  // ── Steps: aggregate minute values to daily ──
  for (const name of stepFiles) {
    const fileDate = withDateFromName(name);
    const json = await readJson(name);
    if (!Array.isArray(json)) { tick(); continue; }
    let total = 0;
    for (const row of json) total += toNum(row.value) || 0;
    if (fileDate && total > 0) {
      stepsByDay.set(fileDate, (stepsByDay.get(fileDate) || 0) + total);
    }
    tick();
  }
  for (const [date, count] of stepsByDay) {
    vitals.push({ date, type: 'steps', value: String(Math.round(count)), unit: 'steps', notes: '', source: 'fitbit' });
  }

  // ── Heart rate: aggregate per-day average ──
  for (const name of hrFiles) {
    const fileDate = withDateFromName(name);
    if (!fileDate) { tick(); continue; }
    const json = await readJson(name);
    if (!Array.isArray(json)) { tick(); continue; }
    for (const row of json) {
      const bpm = toNum(row.value?.bpm || row.bpm || row.value);
      if (bpm != null && bpm > 20 && bpm < 250) hrReadings.push({ date: fileDate, value: bpm });
    }
    tick();
  }

  // ── Sleep ──
  for (const name of sleepFiles) {
    const json = await readJson(name);
    if (!Array.isArray(json)) { tick(); continue; }
    for (const session of json) {
      const date = normalizeDate(session.dateOfSleep || session.startTime);
      const minutes = toNum(session.duration) ? toNum(session.duration) / 60000 : toNum(session.minutesAsleep);
      if (!date || minutes == null || minutes <= 0) continue;
      const hours = minutes / 60;
      if (hours > 24) continue;
      vitals.push({
        date,
        type: 'sleep',
        value: String(round(hours, 2)),
        unit: 'hr',
        notes: session.efficiency ? `efficiency ${session.efficiency}%` : '',
        source: 'fitbit',
      });
    }
    tick();
  }

  // ── Weight ──
  for (const name of weightFiles) {
    const json = await readJson(name);
    if (!Array.isArray(json)) { tick(); continue; }
    for (const w of json) {
      const date = normalizeDate(w.date || w.logId);
      const lbs = toNum(w.weight);
      if (!date || lbs == null || lbs <= 0) continue;
      // Fitbit Takeout is usually lbs already; guard against kg (<200 lbs most reasonable)
      vitals.push({
        date,
        type: 'weight',
        value: String(round(lbs, 1)),
        unit: 'lbs',
        notes: '',
        source: 'fitbit',
      });
    }
    tick();
  }

  // ── Workouts ──
  for (const name of exerciseFiles) {
    const json = await readJson(name);
    if (!Array.isArray(json)) { tick(); continue; }
    for (const ex of json) {
      const date = normalizeDate(ex.startTime);
      if (!date) continue;
      const type = String(ex.activityName || 'workout').toLowerCase();
      const duration_minutes = toNum(ex.duration) ? Math.round(toNum(ex.duration) / 60000) : null;
      // Skip short auto-detected walks (< 15 min) — already captured by daily step vitals
      if (type.includes('walk') && (!duration_minutes || duration_minutes < 15)) continue;
      activities.push({
        date,
        type,
        duration_minutes,
        distance: toNum(ex.distance) ? round(toNum(ex.distance) / 1609.344, 2) : null,
        calories: toNum(ex.calories),
        heart_rate_avg: toNum(ex.averageHeartRate),
        source: 'fitbit',
        notes: '',
      });
    }
    tick();
  }

  // Flush HR
  for (const d of bucketByDay(hrReadings, r => r.date, r => r.value, { agg: 'avg', keep: ['n'] })) {
    vitals.push({ date: d.date, type: 'hr', value: String(Math.round(d.value)), unit: 'bpm', notes: `${d.n} readings`, source: 'fitbit' });
  }

  return { vitals, activities, counts: { total: vitals.length + activities.length } };
}
