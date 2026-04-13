/**
 * MySugr CSV import.
 *
 * MySugr exports a CSV with columns roughly:
 *   Date,Time,Blood Glucose Measurement (mg/dL or mmol/L),
 *   Meal Carbohydrates (g),Insulin Injection Units,Insulin (Meal),
 *   Insulin (Correction),Basal Injection Units,tags,note
 *
 * We pull every blood glucose reading, aggregate to daily average with
 * min/max. Insulin, carbs, and notes are left out of this first pass.
 */

import { parseCSV, normalizeDate, toNum, bucketByDay, mmolToMgDl, round } from './_parse';

export const META = {
  id: 'mysugr',
  label: 'mySugr',
  tagline: 'Import diabetes logbook from mySugr.',
  accept: '.csv',
  inputType: 'text',
  walkthrough: [
    'Sign in to <strong>mySugr</strong> on the web',
    'Go to <strong>Reports</strong>',
    'Choose <strong>Logbook export</strong>, pick a date range, export as CSV',
    'Save the CSV and upload it below',
  ],
};

export function detect(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 3000).toLowerCase();
  return head.includes('mysugr') ||
         (head.includes('blood glucose') && head.includes('insulin'));
}

export function parse(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { vitals: [], counts: { total: 0 } };

  const keys = Object.keys(rows[0]);
  const findKey = (...cands) => {
    for (const c of cands) {
      const m = keys.find(k => k.toLowerCase().includes(c));
      if (m) return m;
    }
    return null;
  };

  const dateKey = findKey('date');
  const bgKey = findKey('blood glucose', 'glucose', 'bg');
  if (!dateKey || !bgKey) return { vitals: [], counts: { total: 0 } };

  const isMmol = bgKey.toLowerCase().includes('mmol');

  const readings = [];
  for (const row of rows) {
    const date = normalizeDate(row[dateKey]);
    if (!date) continue;
    const raw = toNum(row[bgKey]);
    if (raw == null || raw <= 0) continue;
    const mgdl = isMmol ? mmolToMgDl(raw) : raw;
    readings.push({ date, value: mgdl });
  }

  if (!readings.length) return { vitals: [], counts: { total: 0 } };

  const daily = bucketByDay(readings, r => r.date, r => r.value, {
    agg: 'avg',
    keep: ['min', 'max', 'n'],
  });

  const vitals = daily.map(d => ({
    date: d.date,
    type: 'glucose',
    value: String(round(d.value, 0)),
    unit: 'mg/dL',
    notes: `${d.n} readings, range ${round(d.min, 0)} to ${round(d.max, 0)}`,
    source: 'mysugr',
  }));

  return { vitals, counts: { total: vitals.length, raw: readings.length } };
}
