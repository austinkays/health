/**
 * Sleep Cycle CSV import.
 *
 * Sleep Cycle exports a CSV from the in-app "Export data" option. Columns
 * are roughly:
 *   Start, End, Sleep quality, Time in bed, Wake up mood notes,
 *   Heart rate (bpm), Movements per hour, Did snore, Snore time,
 *   Weather, Location, Steps, Alarm mode
 *
 * We map:
 *   - Start date + Time in bed → vitals ('sleep', hours)
 *   - Heart rate (resting)     → vitals ('hr')
 */

import { parseCSV, normalizeDate, toNum, round } from './_parse';

export const META = {
  id: 'sleep_cycle',
  label: 'Sleep Cycle',
  tagline: 'Import sleep sessions from Sleep Cycle.',
  accept: '.csv',
  inputType: 'text',
  walkthrough: [
    'Open Sleep Cycle on your phone',
    'Go to <strong>Profile</strong>, then <strong>Account</strong>',
    'Tap <strong>Export data</strong> and choose CSV',
    'Save or share the CSV to your device',
    'Upload the CSV below',
  ],
};

// "HH:MM" → decimal hours. Handles "7:25", "0:45", etc.
function hmToHours(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+):(\d+)/);
  if (!m) {
    const n = toNum(s);
    return n != null ? n : null;
  }
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

export function detect(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 2000).toLowerCase();
  return (head.includes('sleep quality') || head.includes('time in bed')) &&
         head.includes('start');
}

export function parse(text) {
  const rows = parseCSV(text, { delimiter: text.includes(';') && !text.split('\n')[0].includes(',') ? ';' : ',' });
  if (!rows.length) return { vitals: [], counts: { total: 0 } };

  const keys = Object.keys(rows[0]);
  const findKey = (...cands) => {
    for (const c of cands) {
      const m = keys.find(k => k.toLowerCase().includes(c));
      if (m) return m;
    }
    return null;
  };

  const startKey = findKey('start');
  const bedKey = findKey('time in bed', 'duration');
  const qualityKey = findKey('sleep quality', 'quality');
  const hrKey = findKey('heart rate');
  if (!startKey) return { vitals: [], counts: { total: 0 } };

  const vitals = [];
  for (const row of rows) {
    const date = normalizeDate(row[startKey]);
    if (!date) continue;

    const hours = hmToHours(row[bedKey]);
    if (hours != null && hours > 0 && hours < 24) {
      const quality = row[qualityKey];
      vitals.push({
        date,
        type: 'sleep',
        value: String(round(hours, 2)),
        unit: 'hr',
        notes: quality ? `quality ${String(quality).replace('%', '')}%` : '',
        source: 'sleep_cycle',
      });
    }

    const hr = toNum(row[hrKey]);
    if (hr != null && hr > 20 && hr < 200) {
      vitals.push({
        date,
        type: 'hr',
        value: String(Math.round(hr)),
        unit: 'bpm',
        notes: 'resting, from Sleep Cycle',
        source: 'sleep_cycle',
      });
    }
  }

  return { vitals, counts: { total: vitals.length } };
}
