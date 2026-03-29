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

export async function searchProviders(name, state) {
  if (!name || name.length < 2) return [];
  let url = `/api/provider-lookup?action=search&name=${encodeURIComponent(name)}`;
  if (state) url += `&state=${encodeURIComponent(state)}`;
  const data = await fetchWithAuth(url);
  return data.providers || [];
}

export async function searchPharmacies(name, city, state) {
  if (!name || name.length < 2) return [];
  let url = `/api/provider-lookup?action=pharmacy&name=${encodeURIComponent(name)}`;
  if (city) url += `&city=${encodeURIComponent(city)}`;
  if (state) url += `&state=${encodeURIComponent(state)}`;
  const data = await fetchWithAuth(url);
  return data.pharmacies || [];
}
