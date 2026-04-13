/**
 * Google Fit / Google Takeout import.
 *
 * Google Takeout exports Fit data under `Takeout/Fit/Daily activity metrics/`
 * as per-day CSV files with columns:
 *   Start time, End time, Move Minutes count, Calories (kcal),
 *   Distance (m), Heart Points, Average heart rate (bpm),
 *   Max heart rate (bpm), Min heart rate (bpm), Low latitude, ...,
 *   Step count, Average weight (kg), Max weight (kg), Min weight (kg)
 *
 * Plus a single `Daily activity metrics.csv` with the whole year aggregated.
 * We prefer the aggregated file if present, otherwise walk the per-day files.
 *
 * Maps to vitals (steps, weight, hr) and activities (workouts from sessions,
 * if present).
 */

import { parseCSV, normalizeDate, toNum, kgToLbs, round } from './_parse';

export const META = {
  id: 'google_fit',
  label: 'Google Fit',
  tagline: 'Import steps, heart rate, and weight from Google Takeout.',
  accept: '.zip',
  inputType: 'zip',
  walkthrough: [
    'Sign in to <strong>takeout.google.com</strong>',
    'Deselect everything, then check only <strong>Fit</strong>',
    'Choose <strong>Export once</strong> and click Next',
    'Request the export and wait for the email, download the ZIP',
    'Upload the ZIP below',
  ],
};

export function detect() {
  return true;
}

export async function parse(zip, { onProgress } = {}) {
  const files = Object.keys(zip.files || {}).filter(n => !zip.files[n].dir);
  if (!files.length) return { vitals: [], counts: { total: 0 } };

  if (!files.some(f => /Fit|google|takeout/i.test(f))) {
    throw new Error("This ZIP doesn't look like a Google Takeout Fit archive. Expected a Takeout/Fit folder.");
  }

  const vitals = [];
  const readText = (name) => zip.files[name].async('string');

  // Prefer the aggregated "Daily activity metrics.csv" at the top level of Fit/
  const aggFile = files.find(f => /Daily activity metrics\.csv$/i.test(f) && !/Daily activity metrics\//i.test(f));
  const dailyFiles = aggFile
    ? [aggFile]
    : files.filter(f => /Daily activity metrics\/.*\.csv$/i.test(f));

  const total = Math.max(1, dailyFiles.length);
  let done = 0;
  const tick = () => { done++; onProgress?.(done / total); };

  for (const name of dailyFiles) {
    try {
      const text = await readText(name);
      const rows = parseCSV(text);
      for (const row of rows) {
        const date = normalizeDate(row['Start time'] || row['Date']);
        if (!date) continue;

        const steps = toNum(row['Step count'] || row['Steps']);
        if (steps != null && steps > 0) {
          vitals.push({ date, type: 'steps', value: String(Math.round(steps)), unit: 'steps', notes: '', source: 'google_fit' });
        }

        const avgHr = toNum(row['Average heart rate (bpm)'] || row['Average heart rate']);
        if (avgHr != null && avgHr > 20 && avgHr < 250) {
          vitals.push({ date, type: 'hr', value: String(Math.round(avgHr)), unit: 'bpm', notes: 'daily average', source: 'google_fit' });
        }

        const avgWeightKg = toNum(row['Average weight (kg)'] || row['Weight (kg)']);
        if (avgWeightKg != null && avgWeightKg > 0) {
          vitals.push({ date, type: 'weight', value: String(round(kgToLbs(avgWeightKg), 1)), unit: 'lbs', notes: '', source: 'google_fit' });
        }
      }
    } catch { /* skip malformed */ }
    tick();
  }

  return { vitals, counts: { total: vitals.length } };
}
