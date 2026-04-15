// Barometric pressure data via Open-Meteo (free, no API key, CORS-friendly)
// Docs: https://open-meteo.com/en/docs

const CACHE_KEY = 'salve:baro-cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function geocodeLocation(locationStr) {
  if (!locationStr) return null;
  const q = encodeURIComponent(locationStr.split(',')[0].trim());
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const r = json.results?.[0];
    return r ? { lat: r.latitude, lon: r.longitude, name: r.name } : null;
  } catch {
    return null;
  }
}

async function getCoords(locationStr) {
  // 1. Try browser geolocation (fastest, most accurate)
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 5000,
          maximumAge: 600000, // accept cached position up to 10 min old
        })
      );
      return { lat: pos.coords.latitude, lon: pos.coords.longitude, name: null };
    } catch {
      // User denied or timed out — fall through to geocoding
    }
  }
  // 2. Fall back to geocoding the user's profile location string
  if (locationStr) return geocodeLocation(locationStr);
  return null;
}

/**
 * Fetch barometric pressure data for the user's location.
 * Returns null if location cannot be determined.
 *
 * @param {string} locationStr - user's profile location (e.g. "Chicago, IL")
 * @returns {Promise<{current, history, trend, change3h, change24h, locationName} | null>}
 */
export async function fetchBarometricData(locationStr) {
  // Check cache first
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
    }
  } catch {
    // Ignore corrupted cache
  }

  const coords = await getCoords(locationStr);
  if (!coords) return null;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${coords.lat.toFixed(4)}&longitude=${coords.lon.toFixed(4)}` +
    `&hourly=surface_pressure&past_days=7&forecast_days=1&timezone=auto`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const json = await res.json();

  const times = json.hourly?.time ?? [];
  const pressures = json.hourly?.surface_pressure ?? [];

  // Build daily averages (YYYY-MM-DD → avg hPa)
  const byDay = {};
  times.forEach((t, i) => {
    if (pressures[i] == null) return;
    const day = t.slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(pressures[i]);
  });

  const history = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      value: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    }));

  // Current reading: most recent non-null hourly value up to now
  const nowStr = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  let current = null;
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i].slice(0, 13) <= nowStr && pressures[i] != null) {
      current = Math.round(pressures[i] * 10) / 10;
      break;
    }
  }

  // 3-hour trend
  const threeHAgo = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 13);
  let prev3h = null;
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i].slice(0, 13) <= threeHAgo && pressures[i] != null) {
      prev3h = pressures[i];
      break;
    }
  }

  let trend = 'stable';
  let change3h = null;
  if (current != null && prev3h != null) {
    change3h = Math.round((current - prev3h) * 10) / 10;
    if (change3h > 0.5) trend = 'rising';
    else if (change3h < -0.5) trend = 'falling';
  }

  // 24-hour change
  const dayAgo = new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 13);
  let prev24h = null;
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i].slice(0, 13) <= dayAgo && pressures[i] != null) {
      prev24h = pressures[i];
      break;
    }
  }
  const change24h =
    current != null && prev24h != null
      ? Math.round((current - prev24h) * 10) / 10
      : null;

  const data = {
    current,
    history,
    trend,
    change3h,
    change24h,
    locationName: coords.name ?? null,
  };

  // Write to cache
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Ignore storage errors
  }

  return data;
}

/** Clear cached pressure data (e.g. after profile location change) */
export function clearBarometricCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

/**
 * Synchronously read the cached barometric data, if available and not expired.
 * Returns null if not cached or stale. Does NOT make a network request.
 */
export function readCachedBarometric() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || Date.now() - cached.ts >= CACHE_TTL) return null;
    return cached.data;
  } catch {
    return null;
  }
}
