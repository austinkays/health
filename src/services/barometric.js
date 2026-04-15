// Barometric pressure data via Open-Meteo (free, no API key, CORS-friendly)
// Docs: https://open-meteo.com/en/docs

const CACHE_KEY = 'salve:baro-cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Conditions known to be sensitive to barometric pressure changes.
 * Used by Conditions.jsx and Journal.jsx to surface relevant context.
 */
export const PRESSURE_SENSITIVE = [
  'arthritis', 'fibromyalgia', 'migraine', 'headache', 'pots', 'dysautonomia',
  'me/cfs', 'chronic fatigue', 'chronic pain', 'joint pain', 'lupus',
  'sjogren', 'raynaud', 'scleroderma',
];

/**
 * Scientific explanations for each pressure-sensitive condition group.
 * Mirrors the SCIENCE array in BarometricCard.jsx — single source of truth.
 * `conditions` maps to PRESSURE_SENSITIVE keys for matching.
 */
export const BARO_SCIENCE = [
  {
    condition: 'Arthritis & Joint Pain',
    conditions: ['arthritis', 'joint pain'],
    detail:
      'When atmospheric pressure drops, the tissues surrounding joints expand slightly, compressing nerve endings and synovial fluid. Studies show even a 1 hPa decrease correlates with increased pain ratings in osteoarthritis and rheumatoid arthritis. Rapid drops of 5+ hPa over 24 hours are especially impactful.',
  },
  {
    condition: 'Fibromyalgia',
    conditions: ['fibromyalgia', 'chronic pain'],
    detail:
      'Central sensitization in fibromyalgia amplifies the nervous system\'s response to environmental stimuli. Falling pressure activates baroreceptors and peripheral pain receptors more strongly, which can worsen widespread pain, fatigue, and cognitive symptoms ("fibro fog").',
  },
  {
    condition: 'Migraines & Headaches',
    conditions: ['migraine', 'headache'],
    detail:
      'Rapid pressure changes (particularly drops) are one of the most consistently reported migraine triggers. The mechanism involves changes in cerebrospinal fluid pressure, trigeminal nerve activation, and altered serotonin metabolism. Effects often appear 12 to 24 hours after the pressure change.',
  },
  {
    condition: 'POTS & Dysautonomia',
    conditions: ['pots', 'dysautonomia'],
    detail:
      'Atmospheric pressure provides passive external compression on blood vessels, assisting venous return to the heart. When pressure drops, the autonomic nervous system must compensate harder to maintain blood pressure during position changes, worsening orthostatic intolerance and tachycardia.',
  },
  {
    condition: 'ME/CFS',
    conditions: ['me/cfs', 'chronic fatigue'],
    detail:
      'Many people with ME/CFS report that weather pressure changes can trigger post-exertional malaise and worsen cognitive symptoms. The mechanism likely involves autonomic dysregulation and immune system changes that are not yet fully understood.',
  },
];

async function geocodeZip(zip) {
  // US zip code lookup via Zippopotam.us (free, no API key, HTTPS)
  try {
    const res = await fetch(
      `https://api.zippopotam.us/us/${zip}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const place = json.places?.[0];
    if (!place) return null;
    return {
      lat: parseFloat(place.latitude),
      lon: parseFloat(place.longitude),
      name: `${place['place name']}, ${place['state abbreviation']}`,
    };
  } catch {
    return null;
  }
}

async function geocodeLocation(locationStr) {
  if (!locationStr) return null;
  const trimmed = locationStr.trim();

  // If it looks like a US zip code (5 digits, optionally followed by -4 digits),
  // use the zip geocoder instead of the city-name geocoder.
  if (/^\d{5}(-\d{4})?$/.test(trimmed)) {
    return geocodeZip(trimmed.slice(0, 5));
  }

  const q = encodeURIComponent(trimmed.split(',')[0].trim());
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
