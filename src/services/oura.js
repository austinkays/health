// ── Oura Ring integration service ──
// OAuth2 flow, token management (encrypted localStorage), data fetching via /api/oura proxy.
// Temperature deviation from Oura → approximate BBT for cycle tracking.

import { getAuthToken } from './token';

const STORAGE_KEY = 'salve:oura';

// ── Token storage (localStorage, encrypted by cache layer) ──

export function getOuraTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function setOuraTokens(tokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in || 86400) * 1000,
    connected_at: tokens.connected_at || new Date().toISOString(),
  }));
}

export function clearOuraTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isOuraConnected() {
  return !!getOuraTokens()?.access_token;
}

// ── OAuth2 helpers ──

export function getOuraRedirectUri() {
  return `${window.location.origin}/settings`;
}

export async function getOuraAuthUrl() {
  const token = await getAuthToken();
  if (!token) return null;
  const res = await fetch('/api/oura?action=config', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const { client_id, configured } = await res.json();
  if (!configured || !client_id) return null;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id,
    redirect_uri: getOuraRedirectUri(),
    scope: 'daily',
    state: 'salve-oura',
  });
  return `https://cloud.ouraring.com/oauth/authorize?${params}`;
}

export async function exchangeOuraCode(code) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/api/oura?action=token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code, redirect_uri: getOuraRedirectUri() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to connect Oura');
  }
  const tokens = await res.json();
  setOuraTokens(tokens);
  return tokens;
}

// ── Token refresh ──

async function refreshAccessToken() {
  const stored = getOuraTokens();
  if (!stored?.refresh_token) throw new Error('No refresh token');

  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch('/api/oura?action=refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ refresh_token: stored.refresh_token }),
  });
  if (!res.ok) {
    // If refresh fails, token is revoked — disconnect
    clearOuraTokens();
    throw new Error('Oura session expired. Please reconnect.');
  }
  const tokens = await res.json();
  setOuraTokens({ ...tokens, connected_at: stored.connected_at });
  return tokens.access_token;
}

async function getValidOuraToken() {
  const stored = getOuraTokens();
  if (!stored) throw new Error('Oura not connected');
  // Refresh if within 5 minutes of expiry
  if (stored.expires_at && Date.now() > stored.expires_at - 5 * 60_000) {
    return refreshAccessToken();
  }
  return stored.access_token;
}

// ── Data fetching ──

async function ouraGet(endpoint, startDate, endDate) {
  const ouraToken = await getValidOuraToken();
  const authToken = await getAuthToken();
  if (!authToken) throw new Error('Not signed in');

  const params = new URLSearchParams({
    action: 'data',
    oura_token: ouraToken,
    endpoint,
  });
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);

  const res = await fetch(`/api/oura?${params}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (res.status === 401) {
    // Try refresh once
    const newToken = await refreshAccessToken();
    params.set('oura_token', newToken);
    const retry = await fetch(`/api/oura?${params}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!retry.ok) throw new Error('Oura API error after refresh');
    return retry.json();
  }
  if (!res.ok) throw new Error('Oura API error');
  return res.json();
}

/**
 * Fetch daily temperature data from Oura.
 * Returns array of { day, temperature_deviation, temperature_trend_deviation }
 * temperature_deviation is in Celsius, relative to personal baseline.
 */
export async function fetchOuraTemperature(startDate, endDate) {
  const data = await ouraGet('daily_temperature', startDate, endDate);
  return data?.data || [];
}

/**
 * Fetch daily sleep data from Oura.
 */
export async function fetchOuraSleep(startDate, endDate) {
  const data = await ouraGet('daily_sleep', startDate, endDate);
  return data?.data || [];
}

/**
 * Fetch daily readiness data from Oura.
 */
export async function fetchOuraReadiness(startDate, endDate) {
  const data = await ouraGet('daily_readiness', startDate, endDate);
  return data?.data || [];
}

// ── Temperature conversion utilities ──

/**
 * Convert Oura temperature deviation (Celsius, relative to baseline) to approximate BBT in Fahrenheit.
 *
 * Oura provides a deviation from the user's personal baseline, NOT absolute temperature.
 * Average waking BBT baseline is ~97.7°F (36.5°C). We use this as the reference point.
 * The user can override this baseline in settings.
 *
 * @param {number} deviationC - temperature deviation in Celsius from Oura
 * @param {number} baselineF - assumed baseline BBT in Fahrenheit (default 97.7)
 * @returns {number} approximate BBT in Fahrenheit, rounded to 2 decimal places
 */
export function ouraDeviationToBBT(deviationC, baselineF = 97.7) {
  // Convert Celsius deviation to Fahrenheit deviation (multiply by 9/5)
  const deviationF = deviationC * 1.8;
  return Math.round((baselineF + deviationF) * 100) / 100;
}

/**
 * Convert Oura temperature readings to cycle tracker BBT entries.
 * Returns entries ready to insert into the cycles table.
 * Skips dates that already have manual BBT entries (manual overrides wearable).
 *
 * @param {Array} ouraTemps - array from fetchOuraTemperature()
 * @param {Array} existingCycles - current cycles data
 * @param {number} baselineF - user's baseline BBT in Fahrenheit
 * @returns {Array} new cycle entries to add
 */
export function ouraTemperatureToCycleEntries(ouraTemps, existingCycles, baselineF = 97.7) {
  // Find dates that already have manual BBT entries
  const existingBBTDates = new Set(
    (existingCycles || [])
      .filter(c => c.type === 'bbt' && c.value)
      .map(c => c.date)
  );

  return ouraTemps
    .filter(t => t.temperature_deviation != null && !existingBBTDates.has(t.day))
    .map(t => ({
      date: t.day,
      type: 'bbt',
      value: String(ouraDeviationToBBT(t.temperature_deviation, baselineF)),
      symptom: '',
      notes: `Oura Ring (deviation: ${t.temperature_deviation > 0 ? '+' : ''}${t.temperature_deviation.toFixed(2)}°C)`,
    }));
}

/**
 * Sync Oura temperature data into cycle tracker.
 * Fetches last N days of temperature, converts to BBT, inserts new entries.
 * Returns { added: number, skipped: number, entries: Array }
 */
export async function syncOuraTemperature(existingCycles, addItem, days = 30, baselineF = 97.7) {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const ouraTemps = await fetchOuraTemperature(startDate, endDate);
  const newEntries = ouraTemperatureToCycleEntries(ouraTemps, existingCycles, baselineF);

  let added = 0;
  for (const entry of newEntries) {
    await addItem('cycles', entry);
    added++;
  }

  return {
    added,
    skipped: ouraTemps.length - added,
    total: ouraTemps.length,
  };
}
