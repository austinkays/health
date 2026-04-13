/**
 * FreeStyle Libre / LibreView CSV import.
 *
 * LibreView (Abbott's online portal) exports a "Glucose History" CSV with
 * columns roughly:
 *   Device,Serial Number,Device Timestamp,Record Type,
 *   Historic Glucose mg/dL (or mmol/L), Scan Glucose mg/dL, ...
 *
 * Record Type 0 = historic (15-min automatic reading)
 * Record Type 1 = scan (user-initiated)
 * Record Type 5 = insulin
 * Record Type 6 = notes
 *
 * We pull every glucose reading (historic + scan), aggregate to daily
 * averages + min/max to avoid flooding the vitals table with 96 readings
 * per day. Notes field captures reading count and daily range.
 */

import { parseCSV, normalizeDate, toNum, bucketByDay, mmolToMgDl, round } from './_parse';

export const META = {
  id: 'libre',
  label: 'FreeStyle Libre',
  tagline: 'Import CGM glucose history from LibreView.',
  accept: '.csv',
  inputType: 'text',
  walkthrough: [
    'Sign in to <strong>libreview.com</strong> on a computer',
    'Open your <strong>Glucose History</strong> from the dashboard',
    'Click <strong>Download glucose data</strong> (top right of the chart)',
    'Save the CSV and upload it below',
  ],
};

export function detect(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 4000).toLowerCase();
  return (head.includes('libreview') || head.includes('freestyle')) ||
         (head.includes('glucose') && head.includes('record type'));
}

export function parse(text) {
  // LibreView CSV has 1-2 preamble lines before the real header. Strip them.
  const lines = text.split(/\r?\n/);
  let headerLine = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (/(device|serial|timestamp|glucose)/i.test(lines[i])) { headerLine = i; break; }
  }
  const trimmed = lines.slice(headerLine).join('\n');
  const rows = parseCSV(trimmed);
  if (!rows.length) return { vitals: [], counts: { total: 0 } };

  const keys = Object.keys(rows[0]);
  const findKey = (...cands) => {
    for (const c of cands) {
      const m = keys.find(k => k.toLowerCase().includes(c));
      if (m) return m;
    }
    return null;
  };

  const tsKey = findKey('device timestamp', 'timestamp', 'date');
  const histKey = findKey('historic glucose');
  const scanKey = findKey('scan glucose');
  const recKey = findKey('record type');
  if (!tsKey) return { vitals: [], counts: { total: 0 } };

  // Detect units: LibreView exports are either mg/dL (US) or mmol/L (EU).
  const unitHint = (histKey || scanKey || '').toLowerCase();
  const isMmol = unitHint.includes('mmol');

  const readings = [];
  for (const row of rows) {
    const date = normalizeDate(row[tsKey]);
    if (!date) continue;
    const recType = row[recKey];
    // Skip non-glucose rows (insulin, notes, food)
    if (recType && recType !== '0' && recType !== '1') continue;

    const raw = toNum(row[histKey]) ?? toNum(row[scanKey]);
    if (raw == null) continue;

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
    source: 'libre',
  }));

  return { vitals, counts: { total: vitals.length, raw: readings.length } };
}
