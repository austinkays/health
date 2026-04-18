/**
 * Garmin Connect "Export Your Data" ZIP import.
 *
 * Garmin's bulk export drops a bunch of JSON files grouped into folders:
 *   DI-Connect-Fitness/      summarizedActivities.json (workouts)
 *   DI-Connect-Wellness/     daily wellness (steps, resting HR)
 *   DI-Connect-User-Profile/ profile info (ignored)
 *
 * Garmin's JSON shapes vary by generation so we parse defensively: walk
 * every .json file, sniff for known field names, and extract what we
 * recognize. Anything unknown is silently skipped.
 */

import { normalizeDate, toNum, kgToLbs, round, bucketByDay } from './_parse';

export const META = {
  id: 'garmin',
  label: 'Garmin Connect',
  tagline: 'Import workouts, steps, heart rate, weight, and sleep from Garmin Connect.',
  accept: '.zip',
  inputType: 'zip',
  walkthrough: [
    'Sign in to <strong>connect.garmin.com</strong>',
    'Open <a href="https://www.garmin.com/account/datamanagement/" target="_blank" rel="noopener noreferrer">Account Management</a>',
    'Click <strong>Export Your Data</strong>, then <strong>Request Data Export</strong>',
    'Wait for the email (can take up to 30 days), then download the ZIP',
    'Upload the ZIP below',
  ],
};

// Garmin activity type → Salve type
const TYPE_MAP = {
  running: 'run', trail_running: 'run', treadmill_running: 'run',
  cycling: 'cycling', road_biking: 'cycling', mountain_biking: 'cycling',
  indoor_cycling: 'cycling', virtual_ride: 'cycling',
  swimming: 'swim', lap_swimming: 'swim', open_water_swimming: 'swim',
  walking: 'walk', hiking: 'hike',
  strength_training: 'strength', yoga: 'yoga', pilates: 'pilates',
  rowing: 'rowing', elliptical: 'elliptical',
};

function normType(v) {
  const s = String(v || '').trim().toLowerCase();
  return TYPE_MAP[s] || s.replace(/_/g, ' ') || 'workout';
}

export function detect() {
  return true; // Detection happens inside parse().
}

export async function parse(zip, { onProgress } = {}) {
  const files = Object.keys(zip.files || {}).filter(n => !zip.files[n].dir && n.toLowerCase().endsWith('.json'));
  if (!files.length) return { vitals: [], activities: [], counts: { total: 0 } };

  // Sanity check
  if (!files.some(f => /garmin|DI-Connect/i.test(f))) {
    throw new Error("This ZIP doesn't look like a Garmin Connect export. Expected DI-Connect-* JSON files.");
  }

  const vitals = [];
  const activities = [];
  const hrReadings = [];

  // Helper to safely parse JSON text
  const readJson = async (name) => {
    try { return JSON.parse(await zip.files[name].async('string')); }
    catch { return null; }
  };

  const total = files.length;
  let done = 0;
  const tick = () => { done++; if (done % 10 === 0) onProgress?.(done / total); };

  for (const name of files) {
    const lower = name.toLowerCase();

    // Activities / workouts
    if (lower.includes('summarizedactivities') || lower.includes('summarized_activities') || lower.includes('activitiesservice')) {
      const json = await readJson(name);
      const list = Array.isArray(json) ? json : (json?.summarizedActivitiesExport || json?.activities || []);
      for (const act of list) {
        const date = normalizeDate(act.startTimeLocal || act.startTimeGmt || act.beginTimestamp);
        if (!date) continue;
        const type = normType(act.activityType?.typeKey || act.activityType || act.sportType);
        const duration_minutes = act.duration ? Math.round(act.duration / 60) : (act.durationInSeconds ? Math.round(act.durationInSeconds / 60) : null);
        // Skip short auto-detected walks (< 15 min) — already captured by daily step vitals
        if (type === 'walk' && (!duration_minutes || duration_minutes < 15)) continue;
        activities.push({
          date,
          type,
          duration_minutes,
          distance: act.distance ? round(act.distance / 1609.344, 2) : null,
          calories: toNum(act.calories),
          heart_rate_avg: toNum(act.avgHr || act.averageHR),
          source: 'garmin',
          notes: act.activityName || '',
        });
      }
      tick();
      continue;
    }

    // Daily wellness (steps, resting HR, sleep)
    if (lower.includes('wellness') && lower.includes('.json')) {
      const json = await readJson(name);
      const days = Array.isArray(json) ? json : (json?.userSummary ? [json.userSummary] : []);
      for (const day of days) {
        const date = normalizeDate(day.calendarDate || day.date || day.summaryDate);
        if (!date) continue;
        if (day.totalSteps || day.steps) {
          vitals.push({ date, type: 'steps', value: String(Math.round(day.totalSteps || day.steps)), unit: 'steps', notes: '', source: 'garmin' });
        }
        const rhr = day.restingHeartRate || day.minHeartRate;
        if (rhr) hrReadings.push({ date, value: rhr });
        if (day.sleepingSeconds || day.totalSleepSeconds) {
          const hours = (day.sleepingSeconds || day.totalSleepSeconds) / 3600;
          if (hours > 0 && hours < 24) {
            vitals.push({ date, type: 'sleep', value: String(round(hours, 2)), unit: 'hr', notes: '', source: 'garmin' });
          }
        }
      }
      tick();
      continue;
    }

    // Weight
    if (lower.includes('weight')) {
      const json = await readJson(name);
      const list = Array.isArray(json) ? json : (json?.weightList || json?.dateWeightList || []);
      for (const w of list) {
        const date = normalizeDate(w.timestamp || w.date || w.calendarDate);
        const kg = toNum(w.weight);
        if (!date || kg == null || kg <= 0) continue;
        // Garmin sometimes stores weight in grams
        const actualKg = kg > 500 ? kg / 1000 : kg;
        vitals.push({
          date,
          type: 'weight',
          value: String(round(kgToLbs(actualKg), 1)),
          unit: 'lbs',
          notes: '',
          source: 'garmin',
        });
      }
      tick();
      continue;
    }

    tick();
  }

  // Flush HR readings to daily averages
  for (const d of bucketByDay(hrReadings, r => r.date, r => r.value, { agg: 'avg', keep: ['n'] })) {
    vitals.push({ date: d.date, type: 'hr', value: String(Math.round(d.value)), unit: 'bpm', notes: 'resting, from Garmin', source: 'garmin' });
  }

  return { vitals, activities, counts: { total: vitals.length + activities.length } };
}
