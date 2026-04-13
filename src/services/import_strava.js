/**
 * Strava bulk export "activities.csv" import.
 *
 * Strava's "Request your archive" delivers a ZIP with an activities.csv
 * summary. Columns roughly:
 *   Activity ID, Activity Date, Activity Name, Activity Type,
 *   Elapsed Time, Distance, Moving Time, Max Heart Rate,
 *   Average Heart Rate, Calories, ...
 *
 * Users can upload either activities.csv directly or the whole ZIP (we
 * look inside for an activities.csv file). Maps to the activities table.
 */

import { parseCSV, normalizeDate, toNum, mToMi, round } from './_parse';

export const META = {
  id: 'strava',
  label: 'Strava',
  tagline: 'Import workouts from your Strava bulk export.',
  accept: '.csv,.zip',
  inputType: 'text',
  walkthrough: [
    'On <strong>strava.com</strong>, go to <strong>Settings</strong>',
    'Under <strong>My Account</strong>, choose <strong>Download or Delete Your Account</strong>',
    'Click <strong>Request Your Archive</strong>, then wait for the email',
    'Download the ZIP and upload it below (we\'ll find activities.csv inside)',
    'Or upload just the <strong>activities.csv</strong> file by itself',
  ],
};

// Strava activity type → Salve activity type
const TYPE_MAP = {
  'run': 'run', 'trail run': 'run', 'virtual run': 'run', 'treadmill run': 'run',
  'ride': 'cycling', 'virtual ride': 'cycling', 'e-bike ride': 'cycling', 'mountain bike ride': 'cycling',
  'swim': 'swim',
  'walk': 'walk',
  'hike': 'hike',
  'yoga': 'yoga',
  'workout': 'strength',
  'weight training': 'strength',
  'rowing': 'rowing',
  'elliptical': 'elliptical',
};

function normType(v) {
  const s = String(v || '').trim().toLowerCase();
  return TYPE_MAP[s] || s || 'workout';
}

export function detect(input) {
  // ZIP passthrough (we'll look inside in parse)
  if (typeof input !== 'string') return true;
  const head = input.slice(0, 2000).toLowerCase();
  return head.includes('activity date') && head.includes('activity type');
}

export async function parse(input) {
  let csvText;
  if (typeof input === 'string') {
    csvText = input;
  } else {
    // JSZip instance - look for activities.csv
    const files = Object.keys(input.files || {});
    const csvFile = files.find(n => /activities\.csv$/i.test(n));
    if (!csvFile) throw new Error("Couldn't find activities.csv in the ZIP.");
    csvText = await input.files[csvFile].async('string');
  }

  const rows = parseCSV(csvText);
  if (!rows.length) return { activities: [], counts: { total: 0 } };

  const keys = Object.keys(rows[0]);
  const findKey = (...cands) => {
    for (const c of cands) {
      const m = keys.find(k => k.toLowerCase().includes(c));
      if (m) return m;
    }
    return null;
  };

  const dateKey = findKey('activity date', 'date');
  const typeKey = findKey('activity type', 'type');
  const nameKey = findKey('activity name', 'name');
  const elapsedKey = findKey('elapsed time');
  const movingKey = findKey('moving time');
  const distKey = findKey('distance');
  const maxHrKey = findKey('max heart rate');
  const avgHrKey = findKey('average heart rate');
  const caloriesKey = findKey('calories');

  if (!dateKey || !typeKey) return { activities: [], counts: { total: 0 } };

  const activities = [];
  for (const row of rows) {
    const date = normalizeDate(row[dateKey]);
    if (!date) continue;

    const type = normType(row[typeKey]);
    // Elapsed/moving time can be in seconds or "HH:MM:SS"
    let durationSec = toNum(row[movingKey]) || toNum(row[elapsedKey]);
    if (durationSec == null) {
      const t = String(row[movingKey] || row[elapsedKey] || '').match(/(\d+):(\d+):(\d+)/);
      if (t) durationSec = parseInt(t[1], 10) * 3600 + parseInt(t[2], 10) * 60 + parseInt(t[3], 10);
    }
    const durationMin = durationSec ? Math.round(durationSec / 60) : null;

    // Distance is in meters
    const distM = toNum(row[distKey]);
    const distMi = distM != null ? round(mToMi(distM), 2) : null;

    activities.push({
      date,
      type,
      duration_minutes: durationMin,
      distance: distMi,
      calories: toNum(row[caloriesKey]),
      heart_rate_avg: toNum(row[avgHrKey]),
      source: 'strava',
      notes: [row[nameKey], toNum(row[maxHrKey]) ? `max HR ${row[maxHrKey]}` : null].filter(Boolean).join(' · '),
    });
  }

  return { activities, counts: { total: activities.length } };
}
