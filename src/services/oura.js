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
    scope: 'daily heartrate workout tag session spo2 personal email ring_configuration stress heart_health',
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
 * Fetch daily sleep scores from Oura.
 */
export async function fetchOuraDailySleep(startDate, endDate) {
  const data = await ouraGet('daily_sleep', startDate, endDate);
  return data?.data || [];
}

/**
 * Fetch sleep session data from Oura (has actual duration, HR, HRV).
 */
export async function fetchOuraSleepSessions(startDate, endDate) {
  const data = await ouraGet('sleep', startDate, endDate);
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

// ── Full sync: all Oura data types → vitals + activities ──

function dateRange(days) {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return { startDate, endDate };
}

function existingDates(records, type) {
  return new Set(
    records.filter(r => r.type === type && r.notes?.includes('Oura')).map(r => r.date)
  );
}

/**
 * Sync Oura sleep data → vitals.
 * Uses sleep sessions endpoint for actual duration, HR, and HRV.
 * Groups by day (longest sleep per night = "primary" sleep).
 */
export async function syncOuraSleep(existingVitals, addItem, days = 30) {
  const { startDate, endDate } = dateRange(days);
  const sessions = await fetchOuraSleepSessions(startDate, endDate);
  const existing = existingDates(existingVitals, 'sleep');

  // Group sessions by day, pick the longest (primary sleep)
  const byDay = {};
  for (const s of sessions) {
    const day = s.day;
    if (!day) continue;
    const dur = s.total_sleep_duration || 0;
    if (!byDay[day] || dur > (byDay[day].total_sleep_duration || 0)) {
      byDay[day] = s;
    }
  }

  let added = 0;
  for (const [day, s] of Object.entries(byDay)) {
    if (existing.has(day)) continue;
    const totalSec = s.total_sleep_duration;
    if (!totalSec) continue;
    const hrs = Math.round((totalSec / 3600) * 10) / 10;
    await addItem('vitals', {
      date: day, type: 'sleep', value: String(hrs), value2: '', unit: 'hrs',
      notes: `Oura Ring (efficiency: ${s.efficiency ?? '—'}%, latency: ${s.latency ? Math.round(s.latency / 60) + 'min' : '—'})`,
      source: 'oura',
    });
    added++;
  }
  return { added, total: Object.keys(byDay).length };
}

/**
 * Sync Oura heart rate → vitals (lowest/resting HR from sleep sessions).
 */
export async function syncOuraHeartRate(existingVitals, addItem, days = 30) {
  const { startDate, endDate } = dateRange(days);
  const sessions = await fetchOuraSleepSessions(startDate, endDate);
  const existing = existingDates(existingVitals, 'hr');

  // Group by day, pick primary sleep
  const byDay = {};
  for (const s of sessions) {
    const day = s.day;
    if (!day) continue;
    const dur = s.total_sleep_duration || 0;
    if (!byDay[day] || dur > (byDay[day].total_sleep_duration || 0)) {
      byDay[day] = s;
    }
  }

  let added = 0;
  for (const [day, s] of Object.entries(byDay)) {
    if (existing.has(day)) continue;
    const rhr = s.lowest_heart_rate || s.average_heart_rate;
    if (!rhr) continue;
    await addItem('vitals', {
      date: day, type: 'hr', value: String(rhr), value2: '', unit: 'bpm',
      notes: `Oura Ring (resting HR${s.average_hrv ? ', avg HRV: ' + Math.round(s.average_hrv) + 'ms' : ''})`,
      source: 'oura',
    });
    added++;
  }
  return { added, total: Object.keys(byDay).length };
}

/**
 * Sync Oura SpO2 → vitals.
 */
export async function syncOuraSpO2(existingVitals, addItem, days = 30) {
  const { startDate, endDate } = dateRange(days);
  let entries = [];
  try {
    const spo2Data = await ouraGet('daily_spo2', startDate, endDate);
    entries = spo2Data?.data || [];
  } catch { return { added: 0, total: 0 }; }
  const existing = existingDates(existingVitals, 'spo2');

  let added = 0;
  for (const s of entries) {
    if (!s.day || existing.has(s.day)) continue;
    const avg = s.spo2_percentage?.average;
    if (avg == null) continue;
    await addItem('vitals', {
      date: s.day, type: 'spo2', value: String(Math.round(avg)), value2: '', unit: '%',
      notes: 'Oura Ring', source: 'oura',
    });
    added++;
  }
  return { added, total: entries.length };
}

/**
 * Sync Oura readiness → vitals (as energy score out of 10).
 */
export async function syncOuraReadinessVitals(existingVitals, addItem, days = 30) {
  const { startDate, endDate } = dateRange(days);
  const readinessData = await fetchOuraReadiness(startDate, endDate);
  const existing = existingDates(existingVitals, 'energy');

  let added = 0;
  for (const r of readinessData) {
    if (!r.day || existing.has(r.day)) continue;
    const score = r.score;
    if (score == null) continue;
    const val = Math.round(score / 10);
    await addItem('vitals', {
      date: r.day, type: 'energy', value: String(val), value2: '', unit: '/10',
      notes: `Oura Ring readiness (score: ${score}/100)`,
      source: 'oura',
    });
    added++;
  }
  return { added, total: readinessData.length };
}

/**
 * Sync Oura stress data → vitals.
 */
export async function syncOuraStress(existingVitals, addItem, days = 30) {
  const { startDate, endDate } = dateRange(days);
  let entries = [];
  try {
    const stressData = await ouraGet('daily_stress', startDate, endDate);
    entries = stressData?.data || [];
  } catch { return { added: 0, total: 0 }; }
  const existing = new Set(
    existingVitals.filter(r => r.source === 'oura' && r.notes?.includes('stress')).map(r => r.date)
  );

  let added = 0;
  for (const s of entries) {
    if (!s.day || existing.has(s.day)) continue;
    const stressHigh = s.stress_high;
    if (stressHigh == null) continue;
    const stressVal = Math.min(10, Math.round(stressHigh / 60 / 12));
    await addItem('vitals', {
      date: s.day, type: 'pain', value: String(stressVal), value2: '', unit: '/10',
      notes: `Oura Ring stress (high: ${Math.round(stressHigh / 60)}min, recovery: ${s.recovery_high ? Math.round(s.recovery_high / 60) : '—'}min)`,
      source: 'oura',
    });
    added++;
  }
  return { added, total: entries.length };
}

/**
 * Sync Oura workouts → activities table.
 */
export async function syncOuraWorkouts(existingActivities, addItem, days = 30) {
  const { startDate, endDate } = dateRange(days);
  const workoutData = await ouraGet('workout', startDate, endDate);
  const entries = workoutData?.data || [];

  // Dedup by date + activity type + duration
  const existingKeys = new Set(
    (existingActivities || [])
      .filter(a => a.source === 'oura')
      .map(a => `${a.date}|${a.type}|${a.duration_minutes}`)
  );

  const ouraTypeMap = {
    walking: 'Walking', running: 'Running', cycling: 'Cycling',
    swimming: 'Swimming', hiking: 'Hiking', strength_training: 'Strength Training',
    yoga: 'Yoga', hiit: 'HIIT', elliptical: 'Elliptical', rowing: 'Rowing',
    dancing: 'Dancing', pilates: 'Pilates', other: 'Other',
  };

  let added = 0;
  for (const w of entries) {
    const day = w.day || (w.start_datetime ? w.start_datetime.slice(0, 10) : null);
    if (!day) continue;
    const dur = w.total_calories ? Math.round((w.end_datetime && w.start_datetime
      ? (new Date(w.end_datetime) - new Date(w.start_datetime)) / 60000
      : 0)) : null;
    const durMin = dur || (w.duration ? Math.round(w.duration / 60) : '');
    const type = ouraTypeMap[w.activity?.toLowerCase()] || w.activity || 'Other';
    const key = `${day}|${type}|${durMin}`;
    if (existingKeys.has(key)) continue;

    await addItem('activities', {
      date: day,
      type,
      duration_minutes: String(durMin || ''),
      distance: w.distance ? String(Math.round(w.distance) / 1000) : '',
      calories: w.calories ? String(Math.round(w.calories)) : '',
      heart_rate_avg: w.average_heart_rate ? String(w.average_heart_rate) : '',
      source: 'oura',
      notes: `Oura Ring (intensity: ${w.intensity || '—'})`,
    });
    added++;
  }
  return { added, total: entries.length };
}

/**
 * Full Oura sync — all data types at once.
 * Returns summary of what was synced.
 */
export async function syncAllOuraData(data, addItem, days = 30, baselineF = 97.7) {
  const results = {};

  try { results.temperature = await syncOuraTemperature(data.cycles || [], addItem, days, baselineF); } catch (e) { results.temperature = { error: e.message }; }
  try { results.sleep = await syncOuraSleep(data.vitals || [], addItem, days); } catch (e) { results.sleep = { error: e.message }; }
  try { results.heartRate = await syncOuraHeartRate(data.vitals || [], addItem, days); } catch (e) { results.heartRate = { error: e.message }; }
  try { results.spo2 = await syncOuraSpO2(data.vitals || [], addItem, days); } catch (e) { results.spo2 = { error: e.message }; }
  try { results.readiness = await syncOuraReadinessVitals(data.vitals || [], addItem, days); } catch (e) { results.readiness = { error: e.message }; }
  try { results.workouts = await syncOuraWorkouts(data.activities || [], addItem, days); } catch (e) { results.workouts = { error: e.message }; }

  return results;
}
