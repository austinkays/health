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

export async function suggestDrugs(query) {
  if (!query || query.length < 2) return [];
  const data = await fetchWithAuth(`/api/drug-lookup?action=suggest&q=${encodeURIComponent(query)}`);
  return data.suggestions || [];
}

export async function getDrugInfo(name) {
  if (!name) return null;
  const data = await fetchWithAuth(`/api/drug-lookup?action=info&name=${encodeURIComponent(name)}`);
  return data.info || null;
}
