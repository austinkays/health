import { supabase } from './supabase';

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

async function fetchWithAuth(url) {
  const token = await getToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Lookup failed (${res.status})`);
  }

  return res.json();
}

// Search for doctors, clinics, pharmacies by text query
export async function searchPlaces(query) {
  if (!query || query.length < 3) return [];
  const data = await fetchWithAuth(`/api/places-lookup?action=search&q=${encodeURIComponent(query)}`);
  return data.results || [];
}

// Get full details for a place by place_id
export async function getPlaceDetails(placeId) {
  if (!placeId) return null;
  const data = await fetchWithAuth(`/api/places-lookup?action=details&place_id=${encodeURIComponent(placeId)}`);
  return data.details || null;
}

// Autocomplete for clinic/address input
export async function autocompletePlaces(query) {
  if (!query || query.length < 3) return [];
  const data = await fetchWithAuth(`/api/places-lookup?action=autocomplete&q=${encodeURIComponent(query)}`);
  return data.predictions || [];
}
