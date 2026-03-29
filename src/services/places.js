import { supabase } from './supabase';

async function callPlacesAPI(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('You must be signed in to search places.');

  const res = await fetch('/api/places', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Places API error ${res.status}`);
  }

  return res.json();
}

/**
 * Find nearby places by type (pharmacy, doctor, hospital, dentist, etc.)
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} type - Google Places type (e.g. 'pharmacy', 'doctor', 'hospital')
 * @param {number} radius - Search radius in meters (default 5000)
 */
export async function searchNearby(latitude, longitude, type = 'pharmacy', radius = 5000) {
  return callPlacesAPI({ action: 'nearby', latitude, longitude, type, radius });
}

/**
 * Text search for places (e.g. "CVS pharmacy near Austin TX")
 * @param {string} query - Free-text search query
 * @param {number} [latitude] - Optional location bias
 * @param {number} [longitude] - Optional location bias
 * @param {number} [radius] - Bias radius in meters
 */
export async function searchPlaces(query, latitude, longitude, radius) {
  const body = { action: 'search', query };
  if (latitude && longitude) {
    body.latitude = latitude;
    body.longitude = longitude;
    if (radius) body.radius = radius;
  }
  return callPlacesAPI(body);
}

/**
 * Get current user location via browser geolocation API.
 * Returns { latitude, longitude } or throws.
 */
export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(new Error(err.message || 'Could not get your location.')),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });
}
