// ── Dexcom CGM integration service ──
// OAuth2 flow + glucose value sync via /api/dexcom proxy. Patterned after
// services/oura.js for consistency.
//
// Token storage: localStorage (encrypted by cache layer at rest).
// Token refresh: in-flight mutex prevents concurrent refresh races.

import { getAuthToken } from './token';

const STORAGE_KEY = 'salve:dexcom';

// Build-time flag — set VITE_DEXCOM_ENABLED=true in Vercel once you have
// a Dexcom developer account, app credentials, and approved redirect URI.
// Until then, the UI hides the connect card so testers don't hit a dead end.
export const DEXCOM_ENABLED = import.meta.env.VITE_DEXCOM_ENABLED === 'true';

// ── Token storage ──

export function getDexcomTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function setDexcomTokens(tokens) {
  // Dexcom returns expires_in as seconds. Validate to avoid marking a fresh
  // token as already-expired if the field is missing/garbage.
  const expiresInRaw = Number(tokens.expires_in);
  const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0
    ? expiresInRaw
    : 7200; // Dexcom default: 2 hours
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
    connected_at: tokens.connected_at || new Date().toISOString(),
  }));
}

export function clearDexcomTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isDexcomConnected() {
  return !!getDexcomTokens()?.access_token;
}

// ── OAuth2 helpers ──

export function getDexcomRedirectUri() {
  return `${window.location.origin}/connections`;
}

export async function getDexcomAuthUrl() {
  const token = await getAuthToken();
  if (!token) return null;
  const res = await fetch('/api/dexcom?action=config', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const { client_id, configured, sandbox } = await res.json();
  if (!configured || !client_id) return null;

  // Dexcom requires offline_access scope to receive a refresh_token.
  const params = new URLSearchParams({
    client_id,
    redirect_uri: getDexcomRedirectUri(),
    response_type: 'code',
    scope: 'offline_access',
    state: 'salve-dexcom',
  });
  const base = sandbox ? 'https://sandbox-api.dexcom.com' : 'https://api.dexcom.com';
  return `${base}/v2/oauth2/login?${params}`;
}

export async function exchangeDexcomCode(code) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/api/dexcom?action=token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code, redirect_uri: getDexcomRedirectUri() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to connect Dexcom');
  }
  const tokens = await res.json();
  setDexcomTokens(tokens);
  return tokens;
}

// ── Token refresh (single in-flight mutex) ──

let _refreshPromise = null;

async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const stored = getDexcomTokens();
    if (!stored?.refresh_token) throw new Error('No refresh token');
    const token = await getAuthToken();
    if (!token) throw new Error('Not signed in');
    const res = await fetch('/api/dexcom?action=refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        refresh_token: stored.refresh_token,
        redirect_uri: getDexcomRedirectUri(),
      }),
    });
    if (!res.ok) {
      clearDexcomTokens();
      throw new Error('Dexcom session expired. Please reconnect.');
    }
    const tokens = await res.json();
    setDexcomTokens({ ...tokens, connected_at: stored.connected_at });
    return tokens.access_token;
  })().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

async function getValidDexcomToken() {
  const stored = getDexcomTokens();
  if (!stored) throw new Error('Dexcom not connected');
  // Refresh if within 5 minutes of expiry
  if (stored.expires_at && Date.now() > stored.expires_at - 5 * 60_000) {
    return refreshAccessToken();
  }
  return stored.access_token;
}

// ── Data fetching ──

async function dexcomGet(endpoint, startDate, endDate) {
  const dexcomToken = await getValidDexcomToken();
  const authToken = await getAuthToken();
  if (!authToken) throw new Error('Not signed in');

  const params = new URLSearchParams({
    action: 'data',
    dexcom_token: dexcomToken,
    endpoint,
  });
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);

  const res = await fetch(`/api/dexcom?${params}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (res.status === 401) {
    // Try refresh once
    const newToken = await refreshAccessToken();
    params.set('dexcom_token', newToken);
    const retry = await fetch(`/api/dexcom?${params}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!retry.ok) {
      let detail = 'Dexcom API error after refresh';
      try { const b = await retry.json(); detail = b.error || detail; } catch {}
      throw new Error(detail);
    }
    return retry.json();
  }
  if (!res.ok) {
    let detail = 'Dexcom API error';
    try { const b = await res.json(); detail = b.error || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

/**
 * Fetch estimated glucose values (EGVs) for a date range.
 * Dexcom requires startDate / endDate as ISO 8601 strings (UTC).
 * Max range per request: 90 days.
 *
 * Returns the raw `records` array. Each record has fields like:
 *   { systemTime, displayTime, value, unit, trend, trendRate, transmitterId, ... }
 */
export async function fetchDexcomEgvs(startDate, endDate) {
  const data = await dexcomGet('egvs', startDate, endDate);
  return data?.records || [];
}

// ── Sync to vitals table ──

function formatLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateNDaysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * Sync the last `days` of glucose data from Dexcom into the user's vitals.
 * Aggregates intraday EGV readings into per-day daily averages so the chart
 * isn't flooded — chronic illness users care more about daily trends than
 * 5-minute samples. Skips dates that already have a glucose vital from any
 * source so we don't double-record.
 */
export async function syncDexcomGlucose(existingVitals, addItem, days = 14) {
  const endDate = new Date().toISOString();
  const startDate = dateNDaysAgoISO(days);

  let records;
  try {
    records = await fetchDexcomEgvs(startDate, endDate);
  } catch (err) {
    throw new Error(`Could not fetch Dexcom data: ${err.message}`);
  }

  if (!records.length) return { added: 0, skipped: 0 };

  // Group EGVs by local calendar date
  const byDate = new Map();
  for (const rec of records) {
    const valueMgDl = typeof rec.value === 'number' ? rec.value
      : (rec.unit === 'mmol/L' && typeof rec.value === 'number' ? rec.value * 18.0182 : null);
    if (valueMgDl == null) continue;
    const ts = rec.displayTime || rec.systemTime;
    if (!ts) continue;
    const localDate = formatLocalISODate(new Date(ts));
    if (!byDate.has(localDate)) byDate.set(localDate, []);
    byDate.get(localDate).push(valueMgDl);
  }

  // Filter out dates that already have ANY glucose vital — manual entries
  // and Apple Health imports take priority over Dexcom-derived averages.
  const existingDates = new Set(
    (existingVitals || [])
      .filter(v => v.type === 'glucose')
      .map(v => v.date)
  );

  let added = 0;
  let skipped = 0;
  for (const [date, values] of byDate) {
    if (existingDates.has(date)) {
      skipped++;
      continue;
    }
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    const min = Math.round(Math.min(...values));
    const max = Math.round(Math.max(...values));
    try {
      await addItem('vitals', {
        date,
        type: 'glucose',
        value: avg,
        unit: 'mg/dL',
        source: 'dexcom',
        notes: `${values.length} readings · range ${min}–${max}`,
      });
      added++;
    } catch {
      // skip on error, keep going
    }
  }
  return { added, skipped };
}
