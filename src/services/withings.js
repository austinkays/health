// ── Withings integration service ──
// OAuth2 flow + measurement sync via /api/withings proxy. Patterned after
// services/oura.js. Withings is the most popular consumer health hardware
// brand for chronic illness users — smart scales, BP cuffs, sleep mats,
// thermometers all use the same API.

import { getAuthToken } from './token';

const STORAGE_KEY = 'salve:withings';

// Build-time flag — set VITE_WITHINGS_ENABLED=true in Vercel once you have
// a Withings developer account and the OAuth env vars are set.
export const WITHINGS_ENABLED = import.meta.env.VITE_WITHINGS_ENABLED === 'true';

// Withings measurement type codes that we ingest.
// Full reference: https://developer.withings.com/api-reference/#tag/measure
export const MEAS_TYPES = {
  WEIGHT: 1,             // kg
  HEIGHT: 4,             // m
  FAT_FREE_MASS: 5,      // kg
  FAT_RATIO: 6,          // %
  FAT_MASS_WEIGHT: 8,    // kg
  DIASTOLIC_BP: 9,       // mmHg
  SYSTOLIC_BP: 10,       // mmHg
  HEART_PULSE: 11,       // bpm
  TEMPERATURE: 12,       // °C
  SPO2: 54,              // %
  BODY_TEMPERATURE: 71,  // °C
  SKIN_TEMPERATURE: 73,  // °C
  MUSCLE_MASS: 76,       // kg
  HYDRATION: 77,         // kg
  BONE_MASS: 88,         // kg
  PULSE_WAVE_VELOCITY: 91, // m/s
  VO2_MAX: 123,          // mL/(kg·min)
};

// Subset we actually map into vitals (the rest are stored but not surfaced).
const MEAS_TYPES_TO_FETCH = [
  MEAS_TYPES.WEIGHT,
  MEAS_TYPES.SYSTOLIC_BP,
  MEAS_TYPES.DIASTOLIC_BP,
  MEAS_TYPES.HEART_PULSE,
  MEAS_TYPES.BODY_TEMPERATURE,
  MEAS_TYPES.TEMPERATURE,
  MEAS_TYPES.SPO2,
];

// ── Token storage ──

export function getWithingsTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function setWithingsTokens(tokens) {
  const expiresInRaw = Number(tokens.expires_in);
  const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0
    ? expiresInRaw
    : 10800; // Withings default: 3 hours
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
    userid: tokens.userid,
    connected_at: tokens.connected_at || new Date().toISOString(),
  }));
}

export function clearWithingsTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isWithingsConnected() {
  return !!getWithingsTokens()?.access_token;
}

// ── OAuth2 helpers ──

export function getWithingsRedirectUri() {
  return `${window.location.origin}/settings`;
}

export async function getWithingsAuthUrl() {
  const token = await getAuthToken();
  if (!token) return null;
  const res = await fetch('/api/withings?action=config', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const { client_id, configured } = await res.json();
  if (!configured || !client_id) return null;

  // Withings scopes — request what we want to read.
  const params = new URLSearchParams({
    response_type: 'code',
    client_id,
    redirect_uri: getWithingsRedirectUri(),
    scope: 'user.metrics,user.activity,user.sleepevents,user.info',
    state: 'salve-withings',
  });
  return `https://account.withings.com/oauth2_user/authorize2?${params}`;
}

export async function exchangeWithingsCode(code) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/api/withings?action=token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code, redirect_uri: getWithingsRedirectUri() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to connect Withings');
  }
  const tokens = await res.json();
  setWithingsTokens(tokens);
  return tokens;
}

// ── Token refresh (single in-flight mutex) ──

let _refreshPromise = null;

async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const stored = getWithingsTokens();
    if (!stored?.refresh_token) throw new Error('No refresh token');
    const token = await getAuthToken();
    if (!token) throw new Error('Not signed in');
    const res = await fetch('/api/withings?action=refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    });
    if (!res.ok) {
      clearWithingsTokens();
      throw new Error('Withings session expired. Please reconnect.');
    }
    const tokens = await res.json();
    setWithingsTokens({ ...tokens, connected_at: stored.connected_at });
    return tokens.access_token;
  })().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

async function getValidWithingsToken() {
  const stored = getWithingsTokens();
  if (!stored) throw new Error('Withings not connected');
  if (stored.expires_at && Date.now() > stored.expires_at - 5 * 60_000) {
    return refreshAccessToken();
  }
  return stored.access_token;
}

// ── Data fetching ──

async function withingsGet(endpoint, params = {}) {
  const withingsToken = await getValidWithingsToken();
  const authToken = await getAuthToken();
  if (!authToken) throw new Error('Not signed in');

  const query = new URLSearchParams({
    action: 'data',
    withings_token: withingsToken,
    endpoint,
    ...params,
  });

  const res = await fetch(`/api/withings?${query}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    query.set('withings_token', newToken);
    const retry = await fetch(`/api/withings?${query}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!retry.ok) {
      let detail = 'Withings API error after refresh';
      try { const b = await retry.json(); detail = b.error || detail; } catch {}
      throw new Error(detail);
    }
    return retry.json();
  }
  if (!res.ok) {
    let detail = 'Withings API error';
    try { const b = await res.json(); detail = b.error || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

/**
 * Fetch the last `days` of measurements. Returns Withings measure groups
 * as { measuregrps: [...] }. Each group has { date (epoch), measures: [{value, type, unit}] }.
 */
export async function fetchWithingsMeasurements(days = 30) {
  const startdate = Math.floor(Date.now() / 1000) - days * 86400;
  const enddate = Math.floor(Date.now() / 1000);
  const meastypes = MEAS_TYPES_TO_FETCH.join(',');
  return withingsGet('measure', { meastypes, startdate: String(startdate), enddate: String(enddate) });
}

// ── Sync to vitals table ──

const KG_TO_LB = 2.20462;
const C_TO_F = (c) => c * 9 / 5 + 32;

function localISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Decode a single Withings measure { value, type, unit }. value is an int,
// unit is the power-of-10 exponent (e.g. unit=-3 with value=72500 → 72.5).
function decodeMeasure(meas) {
  if (!meas || typeof meas.value !== 'number') return null;
  const unit = typeof meas.unit === 'number' ? meas.unit : 0;
  return meas.value * Math.pow(10, unit);
}

/**
 * Sync the last `days` of measurements from Withings into vitals. Groups
 * BP systolic + diastolic into a single bp vital row, dedupes against
 * existing vitals on (date, type, source), and tags everything as
 * source: 'withings'.
 */
export async function syncWithingsMeasurements(existingVitals, addItem, days = 30) {
  let result;
  try {
    result = await fetchWithingsMeasurements(days);
  } catch (err) {
    throw new Error(`Could not fetch Withings data: ${err.message}`);
  }

  const groups = Array.isArray(result?.measuregrps) ? result.measuregrps : [];
  if (!groups.length) return { added: 0, skipped: 0 };

  // Build a dedup key set from existing vitals
  const existingKeys = new Set(
    (existingVitals || [])
      .filter(v => v.source === 'withings')
      .map(v => `${v.date}|${v.type}`)
  );

  let added = 0;
  let skipped = 0;

  for (const grp of groups) {
    const epoch = grp.date;
    if (!epoch) continue;
    const date = localISODate(new Date(epoch * 1000));
    const measures = Array.isArray(grp.measures) ? grp.measures : [];

    // Index measures in this group by type for easy lookup
    const byType = new Map();
    for (const m of measures) {
      const v = decodeMeasure(m);
      if (v != null) byType.set(m.type, v);
    }

    // Weight (kg → lbs)
    if (byType.has(MEAS_TYPES.WEIGHT) && !existingKeys.has(`${date}|weight`)) {
      try {
        await addItem('vitals', {
          date, type: 'weight',
          value: Math.round(byType.get(MEAS_TYPES.WEIGHT) * KG_TO_LB * 10) / 10,
          unit: 'lbs', source: 'withings', notes: '',
        });
        existingKeys.add(`${date}|weight`);
        added++;
      } catch { /* */ }
    }

    // BP — systolic + diastolic come as separate measures, combine into one row
    if (byType.has(MEAS_TYPES.SYSTOLIC_BP) && byType.has(MEAS_TYPES.DIASTOLIC_BP) && !existingKeys.has(`${date}|bp`)) {
      try {
        await addItem('vitals', {
          date, type: 'bp',
          value: Math.round(byType.get(MEAS_TYPES.SYSTOLIC_BP)),
          value2: Math.round(byType.get(MEAS_TYPES.DIASTOLIC_BP)),
          unit: 'mmHg', source: 'withings', notes: '',
        });
        existingKeys.add(`${date}|bp`);
        added++;
      } catch { /* */ }
    }

    // Heart rate
    if (byType.has(MEAS_TYPES.HEART_PULSE) && !existingKeys.has(`${date}|hr`)) {
      try {
        await addItem('vitals', {
          date, type: 'hr',
          value: Math.round(byType.get(MEAS_TYPES.HEART_PULSE)),
          unit: 'bpm', source: 'withings', notes: '',
        });
        existingKeys.add(`${date}|hr`);
        added++;
      } catch { /* */ }
    }

    // Body temperature (C → F) — prefer body_temp over generic temp
    const tempC = byType.get(MEAS_TYPES.BODY_TEMPERATURE) ?? byType.get(MEAS_TYPES.TEMPERATURE);
    if (tempC != null && !existingKeys.has(`${date}|temp`)) {
      try {
        await addItem('vitals', {
          date, type: 'temp',
          value: Math.round(C_TO_F(tempC) * 10) / 10,
          unit: '°F', source: 'withings', notes: '',
        });
        existingKeys.add(`${date}|temp`);
        added++;
      } catch { /* */ }
    }

    // SpO2
    if (byType.has(MEAS_TYPES.SPO2) && !existingKeys.has(`${date}|spo2`)) {
      try {
        await addItem('vitals', {
          date, type: 'spo2',
          value: Math.round(byType.get(MEAS_TYPES.SPO2)),
          unit: '%', source: 'withings', notes: '',
        });
        existingKeys.add(`${date}|spo2`);
        added++;
      } catch { /* */ }
    }

    if (!added) skipped++;
  }

  return { added, skipped };
}
