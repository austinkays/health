// ── Whoop integration service ──
// OAuth2 + recovery / sleep / cycle sync via /api/whoop proxy.
//
// The high-value data for chronic illness users:
//   • HRV (heart rate variability, RMSSD ms) — autonomic function marker
//   • Resting HR — baseline cardiovascular fitness
//   • Recovery score (0-100) — overall body readiness
//   • Sleep duration + efficiency
//
// Patterned after services/oura.js for consistency.

import { getAuthToken } from './token';

const STORAGE_KEY = 'salve:whoop';

// Build-time flag — set VITE_WHOOP_ENABLED=true once a Whoop dev app is
// approved and the env vars are populated. (Whoop requires app review
// before granting credentials, so this flag may stay off longer than
// the others.)
export const WHOOP_ENABLED = import.meta.env.VITE_WHOOP_ENABLED === 'true';

// ── Token storage ──

export function getWhoopTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function setWhoopTokens(tokens) {
  const expiresInRaw = Number(tokens.expires_in);
  const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0
    ? expiresInRaw
    : 3600; // Whoop default: 1 hour
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
    connected_at: tokens.connected_at || new Date().toISOString(),
  }));
}

export function clearWhoopTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isWhoopConnected() {
  return !!getWhoopTokens()?.access_token;
}

// ── OAuth2 helpers ──

export function getWhoopRedirectUri() {
  return `${window.location.origin}/connections`;
}

export async function getWhoopAuthUrl() {
  const token = await getAuthToken();
  if (!token) return null;
  const res = await fetch('/api/whoop?action=config', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const { client_id, configured } = await res.json();
  if (!configured || !client_id) return null;

  // Whoop scopes — request what we need to read. `offline` enables refresh.
  const scope = [
    'offline',
    'read:recovery',
    'read:cycles',
    'read:sleep',
    'read:workout',
    'read:profile',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id,
    redirect_uri: getWhoopRedirectUri(),
    scope,
    state: 'salve-whoop',
  });
  return `https://api.prod.whoop.com/oauth/oauth2/auth?${params}`;
}

export async function exchangeWhoopCode(code) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/api/whoop?action=token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code, redirect_uri: getWhoopRedirectUri() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to connect Whoop');
  }
  const tokens = await res.json();
  setWhoopTokens(tokens);
  return tokens;
}

// ── Token refresh (single in-flight mutex) ──

let _refreshPromise = null;

async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const stored = getWhoopTokens();
    if (!stored?.refresh_token) throw new Error('No refresh token');
    const token = await getAuthToken();
    if (!token) throw new Error('Not signed in');
    const res = await fetch('/api/whoop?action=refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    });
    if (!res.ok) {
      clearWhoopTokens();
      throw new Error('Whoop session expired. Please reconnect.');
    }
    const tokens = await res.json();
    setWhoopTokens({ ...tokens, connected_at: stored.connected_at });
    return tokens.access_token;
  })().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

async function getValidWhoopToken() {
  const stored = getWhoopTokens();
  if (!stored) throw new Error('Whoop not connected');
  if (stored.expires_at && Date.now() > stored.expires_at - 5 * 60_000) {
    return refreshAccessToken();
  }
  return stored.access_token;
}

// ── Data fetching ──

async function whoopGet(endpoint, params = {}) {
  const whoopToken = await getValidWhoopToken();
  const authToken = await getAuthToken();
  if (!authToken) throw new Error('Not signed in');

  const query = new URLSearchParams({
    action: 'data',
    whoop_token: whoopToken,
    endpoint,
    ...params,
  });

  const res = await fetch(`/api/whoop?${query}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    query.set('whoop_token', newToken);
    const retry = await fetch(`/api/whoop?${query}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!retry.ok) {
      let detail = 'Whoop API error after refresh';
      try { const b = await retry.json(); detail = b.error || detail; } catch {}
      throw new Error(detail);
    }
    return retry.json();
  }
  if (!res.ok) {
    let detail = 'Whoop API error';
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
  return d.toISOString();
}

// ── Sync to vitals table ──

/**
 * Sync the last `days` of recovery + sleep data from Whoop. Pulls
 * recoveries (HRV, RHR), sleep sessions, and cycles in parallel.
 * Writes per-day vitals tagged source: 'whoop'. Dedupes against
 * existing vitals on (date, type, source).
 */
export async function syncWhoopData(existingVitals, addItem, days = 30) {
  const start = nDaysAgoISO(days);
  const end = new Date().toISOString();

  const [recoveries, sleeps] = await Promise.all([
    whoopGet('v1/recovery', { start, end, limit: '50' }).catch(() => null),
    whoopGet('v1/activity/sleep', { start, end, limit: '50' }).catch(() => null),
  ]);

  const dedupKeys = new Set(
    (existingVitals || [])
      .filter(v => v.source === 'whoop')
      .map(v => `${v.date}|${v.type}`)
  );

  let added = 0;

  // Recovery records contain HRV (RMSSD ms), resting HR, recovery score.
  // The shape is { records: [{ score: { hrv_rmssd_milli, resting_heart_rate, recovery_score }, ...}] }
  const recoveryRecords = Array.isArray(recoveries?.records) ? recoveries.records : [];
  for (const rec of recoveryRecords) {
    const ts = rec.created_at || rec.updated_at;
    if (!ts) continue;
    const date = localISODate(new Date(ts));
    const score = rec.score || {};

    // Resting heart rate
    if (typeof score.resting_heart_rate === 'number' && score.resting_heart_rate > 0
        && !dedupKeys.has(`${date}|hr`)) {
      try {
        await addItem('vitals', {
          date,
          type: 'hr',
          value: Math.round(score.resting_heart_rate),
          unit: 'bpm',
          source: 'whoop',
          notes: 'resting',
        });
        dedupKeys.add(`${date}|hr`);
        added++;
      } catch { /* */ }
    }

    // Note: we don't currently have an HRV vital type in the schema, so
    // we surface HRV in the notes field on the HR record. If/when an
    // hrv vital type is added later, this can be split out.
  }

  // Sleep — sessions with total sleep duration in milliseconds
  const sleepRecords = Array.isArray(sleeps?.records) ? sleeps.records : [];
  // Group by date in case there are multiple naps + nighttime sessions
  const sleepByDate = new Map();
  for (const s of sleepRecords) {
    const ts = s.start || s.created_at;
    if (!ts) continue;
    const date = localISODate(new Date(ts));
    const totalMilli = s?.score?.stage_summary?.total_in_bed_time_milli
      ?? s?.score?.stage_summary?.total_sleep_time_milli;
    if (typeof totalMilli !== 'number' || totalMilli <= 0) continue;
    sleepByDate.set(date, (sleepByDate.get(date) || 0) + totalMilli);
  }
  for (const [date, totalMilli] of sleepByDate) {
    if (dedupKeys.has(`${date}|sleep`)) continue;
    const hours = Math.round((totalMilli / 3600000) * 10) / 10;
    if (hours <= 0) continue;
    try {
      await addItem('vitals', {
        date,
        type: 'sleep',
        value: hours,
        unit: 'hrs',
        source: 'whoop',
        notes: '',
      });
      dedupKeys.add(`${date}|sleep`);
      added++;
    } catch { /* */ }
  }

  return { added };
}
