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

export function isFitbitConnected() {
  return !!getFitbitTokens()?.access_token;
}

// ── OAuth2 helpers ──

export function getFitbitRedirectUri() {
  return `${window.location.origin}/settings`;
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
  const scope = 'activity heartrate sleep weight profile';
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

// ── Sync to vitals table ──

/**
 * Sync the last `days` of data from Fitbit. Pulls sleep, resting heart
 * rate, daily steps, and recent weights in parallel, then writes per-day
 * vitals tagged source: 'fitbit'. Dedupes against existing vitals on
 * (date, type, source) so re-sync is idempotent.
 */
export async function syncFitbitData(existingVitals, addItem, days = 30) {
  const startDate = nDaysAgoISO(days - 1);
  const endDate = localISODate(new Date());

  // Fetch in parallel — Fitbit's per-user rate limit is 150/hr so 4 calls
  // is safely under any practical ceiling.
  const [sleepData, hrData, stepsData, weightData] = await Promise.all([
    fitbitGet(`/1.2/user/-/sleep/date/${startDate}/${endDate}.json`).catch(() => null),
    fitbitGet(`/1/user/-/activities/heart/date/${startDate}/${endDate}.json`).catch(() => null),
    fitbitGet(`/1/user/-/activities/steps/date/${startDate}/${endDate}.json`).catch(() => null),
    fitbitGet(`/1/user/-/body/log/weight/date/${startDate}/${endDate}.json`).catch(() => null),
  ]);

  const dedupKeys = new Set(
    (existingVitals || [])
      .filter(v => v.source === 'fitbit')
      .map(v => `${v.date}|${v.type}`)
  );

  let added = 0;

  // Sleep — array of sleep sessions, one per night usually
  const sleepSessions = Array.isArray(sleepData?.sleep) ? sleepData.sleep : [];
  // Group by dateOfSleep in case there are multiple sessions per day
  const sleepByDate = new Map();
  for (const s of sleepSessions) {
    if (!s.dateOfSleep) continue;
    const minutes = (s.minutesAsleep ?? 0) + (sleepByDate.get(s.dateOfSleep) || 0);
    sleepByDate.set(s.dateOfSleep, minutes);
  }
  for (const [date, minutes] of sleepByDate) {
    if (dedupKeys.has(`${date}|sleep`)) continue;
    if (minutes <= 0) continue;
    try {
      await addItem('vitals', {
        date,
        type: 'sleep',
        value: Math.round((minutes / 60) * 10) / 10,
        unit: 'hrs',
        source: 'fitbit',
        notes: '',
      });
      dedupKeys.add(`${date}|sleep`);
      added++;
    } catch { /* */ }
  }

  // Resting heart rate — comes embedded in activities-heart day records
  const hrDays = Array.isArray(hrData?.['activities-heart']) ? hrData['activities-heart'] : [];
  for (const day of hrDays) {
    const date = day.dateTime;
    const rhr = day?.value?.restingHeartRate;
    if (!date || typeof rhr !== 'number' || rhr <= 0) continue;
    if (dedupKeys.has(`${date}|hr`)) continue;
    try {
      await addItem('vitals', {
        date,
        type: 'hr',
        value: Math.round(rhr),
        unit: 'bpm',
        source: 'fitbit',
        notes: 'resting',
      });
      dedupKeys.add(`${date}|hr`);
      added++;
    } catch { /* */ }
  }

  // Steps — daily totals
  const stepDays = Array.isArray(stepsData?.['activities-steps']) ? stepsData['activities-steps'] : [];
  for (const day of stepDays) {
    const date = day.dateTime;
    const steps = parseInt(day.value, 10);
    if (!date || !Number.isFinite(steps) || steps < 0) continue;
    if (dedupKeys.has(`${date}|steps`)) continue;
    try {
      await addItem('vitals', {
        date,
        type: 'steps',
        value: steps,
        unit: 'steps',
        source: 'fitbit',
        notes: '',
      });
      dedupKeys.add(`${date}|steps`);
      added++;
    } catch { /* */ }
  }

  // Weight — comes as logged entries with date + weight (already in user's preferred unit)
  const weights = Array.isArray(weightData?.weight) ? weightData.weight : [];
  for (const w of weights) {
    const date = w.date;
    if (!date || typeof w.weight !== 'number') continue;
    if (dedupKeys.has(`${date}|weight`)) continue;
    // Fitbit weight is in kg by default. Convert to lbs.
    const lbs = Math.round(w.weight * 2.20462 * 10) / 10;
    try {
      await addItem('vitals', {
        date,
        type: 'weight',
        value: lbs,
        unit: 'lbs',
        source: 'fitbit',
        notes: '',
      });
      dedupKeys.add(`${date}|weight`);
      added++;
    } catch { /* */ }
  }

  return { added };
}
