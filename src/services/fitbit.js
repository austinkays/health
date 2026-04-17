// ── Fitbit integration service ──
// OAuth2 + sleep / heart rate / steps / weight sync via /api/wearable?provider=fitbit proxy.
// Patterned after services/oura.js for consistency.

import { getAuthToken } from './token';

const STORAGE_KEY = 'salve:fitbit';

// Build-time flag — set VITE_FITBIT_ENABLED=true once a Fitbit dev app is
// created and the env vars are populated.
export const FITBIT_ENABLED = import.meta.env.VITE_FITBIT_ENABLED === 'true';

// ── Token storage ──

export function getFitbitTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function setFitbitTokens(tokens) {
  const expiresInRaw = Number(tokens.expires_in);
  const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0
    ? expiresInRaw
    : 28800; // Fitbit default: 8 hours
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
    fitbit_user_id: tokens.user_id,
    connected_at: tokens.connected_at || new Date().toISOString(),
  }));
}

export function clearFitbitTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

// Full disconnect: tells the server to delete Fitbit webhook subscriptions,
// revoke the access token, and remove the wearable_connections row. Then
// clears the localStorage mirror. Use this from the UI Disconnect button.
// `clearFitbitTokens()` by itself only clears the client mirror — use that
// from sign-out paths where the user is already gone and we shouldn't
// make authed server calls.
export async function disconnectFitbit() {
  const token = await getAuthToken();
  if (token) {
    try {
      await fetch('/api/wearable?provider=fitbit&action=disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Server-side cleanup is best-effort — even if it fails, clear
      // the local mirror so the UI reflects disconnected state. Server
      // row will orphan until next reconnect overwrites it.
    }
  }
  clearFitbitTokens();
}

export function isFitbitConnected() {
  return !!getFitbitTokens()?.access_token;
}

// ── Async server status check (30s TTL cache) ──

let _fitbitStatusCache = null;
let _fitbitStatusTs = 0;
const STATUS_TTL = 30000;

export async function checkFitbitStatus() {
  if (_fitbitStatusCache && Date.now() - _fitbitStatusTs < STATUS_TTL) return _fitbitStatusCache;
  try {
    const token = await getAuthToken();
    if (!token) return null;
    const res = await fetch('/api/wearable?provider=fitbit&action=status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    _fitbitStatusCache = data;
    _fitbitStatusTs = Date.now();
    return data;
  } catch {
    return null;
  }
}

export function clearFitbitStatusCache() {
  _fitbitStatusCache = null;
  _fitbitStatusTs = 0;
}

// ── OAuth2 helpers ──

export function getFitbitRedirectUri() {
  return `${window.location.origin}/connections`;
}

export async function getFitbitAuthUrl() {
  const token = await getAuthToken();
  if (!token) return null;
  const res = await fetch('/api/wearable?provider=fitbit&action=config', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const { client_id, configured } = await res.json();
  if (!configured || !client_id) return null;

  // Scopes: data we actually use. Fitbit space-separates them.
  const scope = 'activity heartrate sleep weight profile oxygen_saturation respiratory_rate temperature';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id,
    redirect_uri: getFitbitRedirectUri(),
    scope,
    expires_in: '604800', // 7 days
    state: 'salve-fitbit',
  });
  return `https://www.fitbit.com/oauth2/authorize?${params}`;
}

export async function exchangeFitbitCode(code) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/api/wearable?provider=fitbit&action=token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code, redirect_uri: getFitbitRedirectUri() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to connect Fitbit');
  }
  const tokens = await res.json();
  setFitbitTokens(tokens);
  return tokens;
}

// ── Token refresh (single in-flight mutex) ──

let _refreshPromise = null;

async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const stored = getFitbitTokens();
    if (!stored?.refresh_token) throw new Error('No refresh token');
    const token = await getAuthToken();
    if (!token) throw new Error('Not signed in');
    const res = await fetch('/api/wearable?provider=fitbit&action=refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    });
    if (!res.ok) {
      clearFitbitTokens();
      throw new Error('Fitbit session expired. Please reconnect.');
    }
    const tokens = await res.json();
    setFitbitTokens({ ...tokens, connected_at: stored.connected_at });
    return tokens.access_token;
  })().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

async function getValidFitbitToken() {
  const stored = getFitbitTokens();
  if (!stored) throw new Error('Fitbit not connected');
  if (stored.expires_at && Date.now() > stored.expires_at - 5 * 60_000) {
    return refreshAccessToken();
  }
  return stored.access_token;
}

// ── Data fetching ──

async function fitbitGet(path) {
  const fitbitToken = await getValidFitbitToken();
  const authToken = await getAuthToken();
  if (!authToken) throw new Error('Not signed in');

  const params = new URLSearchParams({
    provider: 'fitbit',
    action: 'data',
    fitbit_token: fitbitToken,
    path,
  });

  const res = await fetch(`/api/wearable?${params}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    params.set('fitbit_token', newToken);
    const retry = await fetch(`/api/wearable?${params}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!retry.ok) {
      let detail = 'Fitbit API error after refresh';
      try { const b = await retry.json(); detail = b.error || detail; } catch {}
      throw new Error(detail);
    }
    return retry.json();
  }
  if (!res.ok) {
    let detail = 'Fitbit API error';
    try { const b = await res.json(); detail = b.error || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

function localISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nDaysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISODate(d);
}

// ── Fitbit activity name → normalized type mapping ──

const FITBIT_ACTIVITY_MAP = {
  'Walk': 'Walking', 'Outdoor Walk': 'Walking', 'Indoor Walk': 'Walking', 'Treadmill': 'Running',
  'Run': 'Running', 'Outdoor Run': 'Running', 'Bike': 'Cycling', 'Outdoor Bike': 'Cycling',
  'Spinning': 'Cycling', 'Swim': 'Swimming', 'Pool Swim': 'Swimming', 'Open Water Swim': 'Swimming',
  'Hike': 'Hiking', 'Weights': 'Strength Training', 'Weight Training': 'Strength Training',
  'Yoga': 'Yoga', 'Pilates': 'Yoga', 'Interval Workout': 'HIIT', 'Circuit Training': 'HIIT',
  'Bootcamp': 'HIIT', 'Elliptical': 'Elliptical', 'Rowing Machine': 'Rowing',
  'Stairclimber': 'Stair Climbing', 'Dance': 'Dance', 'Kickboxing': 'Martial Arts',
  'Martial Arts': 'Martial Arts', 'Tennis': 'Tennis', 'Golf': 'Golf',
};

// ── Data fetchers for FitbitPage ──

export async function fetchFitbitDevices() {
  return fitbitGet('/1/user/-/devices.json').catch(() => []);
}

export async function fetchFitbitProfile() {
  const data = await fitbitGet('/1/user/-/profile.json').catch(() => null);
  return data?.user || null;
}

// ── Sync helpers ──

function buildDedupSet(existing, source) {
  return new Set(
    (existing || [])
      .filter(v => v.source === source)
      .map(v => `${v.date}|${v.type}`)
  );
}

function buildActivityDedupSet(existing) {
  return new Set(
    (existing || [])
      .filter(a => a.source === 'fitbit')
      .map(a => `${a.date}|${a.type}|${a.duration_minutes}`)
  );
}

// ── Sync to vitals + activities tables ──

/**
 * Sync the last `days` of data from Fitbit. Pulls all available data
 * types and writes per-day vitals + activities tagged source: 'fitbit'.
 * Dedupes against existing data so re-sync is idempotent.
 *
 * Data types: sleep, resting HR, steps, weight, SpO2, breathing rate,
 * skin temperature, HRV, Active Zone Minutes, activities/workouts.
 */
export async function syncFitbitData(existingVitals, addItem, days = 30, existingActivities) {
  const startDate = nDaysAgoISO(days - 1);
  const endDate = localISODate(new Date());

  // Batch 1: core vitals (4 calls)
  const [sleepData, hrData, stepsData, weightData] = await Promise.all([
    fitbitGet(`/1.2/user/-/sleep/date/${startDate}/${endDate}.json`).catch(() => null),
    fitbitGet(`/1/user/-/activities/heart/date/${startDate}/${endDate}.json`).catch(() => null),
    fitbitGet(`/1/user/-/activities/steps/date/${startDate}/${endDate}.json`).catch(() => null),
    fitbitGet(`/1/user/-/body/log/weight/date/${startDate}/${endDate}.json`).catch(() => null),
  ]);

  // Batch 2: extended vitals (5 calls) — these require expanded OAuth scopes
  const [spo2Data, brData, tempData, hrvData, azmData] = await Promise.all([
    fitbitGet(`/1/user/-/spo2/date/${startDate}/${endDate}.json`).catch(() => null),
    fitbitGet(`/1/user/-/br/date/${startDate}/${endDate}.json`).catch(() => null),
    fitbitGet(`/1/user/-/temp/skin/date/${startDate}/${endDate}.json`).catch(() => null),
    fitbitGet(`/1/user/-/hrv/date/${startDate}/${endDate}.json`).catch(() => null),
    fitbitGet(`/1/user/-/activities/active-zone-minutes/date/${startDate}/${endDate}.json`).catch(() => null),
  ]);

  // Batch 3: activities (1 call)
  const activitiesData = await fitbitGet(
    `/1/user/-/activities/list.json?afterDate=${startDate}&sort=asc&limit=100&offset=0`
  ).catch(() => null);

  const dedupKeys = buildDedupSet(existingVitals, 'fitbit');
  const actDedupKeys = buildActivityDedupSet(existingActivities);
  let added = 0;

  // ── Sleep ──
  const sleepSessions = Array.isArray(sleepData?.sleep) ? sleepData.sleep : [];
  const sleepByDate = new Map();
  for (const s of sleepSessions) {
    if (!s.dateOfSleep) continue;
    const minutes = (s.minutesAsleep ?? 0) + (sleepByDate.get(s.dateOfSleep) || 0);
    sleepByDate.set(s.dateOfSleep, minutes);
  }
  for (const [date, minutes] of sleepByDate) {
    if (dedupKeys.has(`${date}|sleep`) || minutes <= 0) continue;
    try {
      await addItem('vitals', { date, type: 'sleep', value: Math.round((minutes / 60) * 10) / 10, unit: 'hrs', source: 'fitbit', notes: '' });
      dedupKeys.add(`${date}|sleep`);
      added++;
    } catch { /* */ }
  }

  // ── Resting heart rate ──
  const hrDays = Array.isArray(hrData?.['activities-heart']) ? hrData['activities-heart'] : [];
  for (const day of hrDays) {
    const date = day.dateTime;
    const rhr = day?.value?.restingHeartRate;
    if (!date || typeof rhr !== 'number' || rhr <= 0) continue;
    if (dedupKeys.has(`${date}|hr`)) continue;
    try {
      await addItem('vitals', { date, type: 'hr', value: Math.round(rhr), unit: 'bpm', source: 'fitbit', notes: 'resting' });
      dedupKeys.add(`${date}|hr`);
      added++;
    } catch { /* */ }
  }

  // ── Steps ──
  const stepDays = Array.isArray(stepsData?.['activities-steps']) ? stepsData['activities-steps'] : [];
  for (const day of stepDays) {
    const date = day.dateTime;
    const steps = parseInt(day.value, 10);
    if (!date || !Number.isFinite(steps) || steps < 0) continue;
    if (dedupKeys.has(`${date}|steps`)) continue;
    try {
      await addItem('vitals', { date, type: 'steps', value: steps, unit: 'steps', source: 'fitbit', notes: '' });
      dedupKeys.add(`${date}|steps`);
      added++;
    } catch { /* */ }
  }

  // ── Weight ──
  const weights = Array.isArray(weightData?.weight) ? weightData.weight : [];
  for (const w of weights) {
    const date = w.date;
    if (!date || typeof w.weight !== 'number') continue;
    if (dedupKeys.has(`${date}|weight`)) continue;
    const lbs = Math.round(w.weight * 2.20462 * 10) / 10;
    try {
      await addItem('vitals', { date, type: 'weight', value: lbs, unit: 'lbs', source: 'fitbit', notes: '' });
      dedupKeys.add(`${date}|weight`);
      added++;
    } catch { /* */ }
  }

  // ── SpO2 (Blood Oxygen) ──
  const spo2Days = Array.isArray(spo2Data) ? spo2Data : [];
  for (const day of spo2Days) {
    const date = day.dateTime;
    const avg = day?.value?.avg;
    if (!date || typeof avg !== 'number') continue;
    if (dedupKeys.has(`${date}|spo2`)) continue;
    const min = day.value.min;
    const max = day.value.max;
    const notes = (typeof min === 'number' && typeof max === 'number') ? `Range: ${min}–${max}%` : '';
    try {
      await addItem('vitals', { date, type: 'spo2', value: Math.round(avg * 10) / 10, unit: '%', source: 'fitbit', notes });
      dedupKeys.add(`${date}|spo2`);
      added++;
    } catch { /* */ }
  }

  // ── Breathing Rate ──
  const brDays = Array.isArray(brData?.br) ? brData.br : [];
  for (const day of brDays) {
    const date = day.dateTime;
    const rate = day?.value?.breathingRate;
    if (!date || typeof rate !== 'number') continue;
    if (dedupKeys.has(`${date}|resp`)) continue;
    try {
      await addItem('vitals', { date, type: 'resp', value: Math.round(rate * 10) / 10, unit: 'rpm', source: 'fitbit', notes: '' });
      dedupKeys.add(`${date}|resp`);
      added++;
    } catch { /* */ }
  }

  // ── Skin Temperature ──
  const tempDays = Array.isArray(tempData?.tempSkin) ? tempData.tempSkin : [];
  for (const day of tempDays) {
    const date = day.dateTime;
    const relC = day?.value?.nightlyRelative;
    if (!date || typeof relC !== 'number') continue;
    if (dedupKeys.has(`${date}|temp`)) continue;
    // Convert deviation from baseline (°C) to approximate °F value
    const baselineF = 97.7;
    const tempF = Math.round((baselineF + relC * 1.8) * 10) / 10;
    try {
      await addItem('vitals', { date, type: 'temp', value: tempF, unit: '°F', source: 'fitbit', notes: `Deviation: ${relC > 0 ? '+' : ''}${relC.toFixed(2)}°C from baseline` });
      dedupKeys.add(`${date}|temp`);
      added++;
    } catch { /* */ }
  }

  // ── HRV (Heart Rate Variability) ──
  const hrvDays = Array.isArray(hrvData?.hrv) ? hrvData.hrv : [];
  for (const day of hrvDays) {
    const date = day.dateTime;
    const rmssd = day?.value?.dailyRmssd;
    if (!date || typeof rmssd !== 'number') continue;
    if (dedupKeys.has(`${date}|hrv`)) continue;
    const deepRmssd = day.value.deepRmssd;
    const notes = typeof deepRmssd === 'number' ? `Deep sleep HRV: ${Math.round(deepRmssd)}ms` : '';
    try {
      await addItem('vitals', { date, type: 'hrv', value: Math.round(rmssd), unit: 'ms', source: 'fitbit', notes });
      dedupKeys.add(`${date}|hrv`);
      added++;
    } catch { /* */ }
  }

  // ── Active Zone Minutes ──
  const azmDays = Array.isArray(azmData?.['activities-active-zone-minutes'])
    ? azmData['activities-active-zone-minutes'] : [];
  for (const day of azmDays) {
    const date = day.dateTime;
    const val = day?.value;
    if (!date || !val) continue;
    const total = (val.fatBurnActiveZoneMinutes || 0)
      + (val.cardioActiveZoneMinutes || 0)
      + (val.peakActiveZoneMinutes || 0);
    if (total <= 0) continue;
    if (dedupKeys.has(`${date}|azm`)) continue;
    const parts = [];
    if (val.fatBurnActiveZoneMinutes) parts.push(`Fat Burn: ${val.fatBurnActiveZoneMinutes}`);
    if (val.cardioActiveZoneMinutes) parts.push(`Cardio: ${val.cardioActiveZoneMinutes}`);
    if (val.peakActiveZoneMinutes) parts.push(`Peak: ${val.peakActiveZoneMinutes}`);
    try {
      await addItem('vitals', { date, type: 'azm', value: total, unit: 'min', source: 'fitbit', notes: parts.join(', ') });
      dedupKeys.add(`${date}|azm`);
      added++;
    } catch { /* */ }
  }

  // ── Activities / Workouts ──
  const activities = Array.isArray(activitiesData?.activities) ? activitiesData.activities : [];
  for (const a of activities) {
    const date = a.startDate;
    if (!date) continue;
    const durationMin = typeof a.duration === 'number' ? Math.round(a.duration / 60000) : (a.activeDuration ? Math.round(a.activeDuration / 60000) : 0);
    if (durationMin <= 0) continue;
    const type = FITBIT_ACTIVITY_MAP[a.activityName] || a.activityName || 'Other';
    if (actDedupKeys.has(`${date}|${type}|${durationMin}`)) continue;
    const distMi = typeof a.distance === 'number' ? Math.round(a.distance * 0.621371 * 100) / 100 : undefined;
    try {
      await addItem('activities', {
        date,
        type,
        duration_minutes: durationMin,
        distance: distMi || null,
        calories: typeof a.calories === 'number' ? Math.round(a.calories) : null,
        heart_rate_avg: typeof a.averageHeartRate === 'number' ? Math.round(a.averageHeartRate) : null,
        source: 'fitbit',
        notes: '',
      });
      actDedupKeys.add(`${date}|${type}|${durationMin}`);
      added++;
    } catch { /* */ }
  }

  return { added };
}
