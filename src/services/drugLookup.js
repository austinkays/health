import { supabase } from './supabase';

// In-memory cache for drug info (persists for session lifetime)
const infoCache = new Map();

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

  const key = name.toLowerCase().trim();
  if (infoCache.has(key)) return infoCache.get(key);

  const data = await fetchWithAuth(`/api/drug-lookup?action=info&name=${encodeURIComponent(name)}`);
  const info = data.info || null;
  if (info) infoCache.set(key, info);
  return info;
}

// Batch enrich multiple medications — returns a Map of name -> info
export async function enrichAllMeds(meds) {
  const results = new Map();
  const toFetch = [];

  for (const m of meds) {
    const key = m.name.toLowerCase().trim();
    if (!key) continue;
    if (infoCache.has(key)) {
      results.set(m.id, infoCache.get(key));
    } else {
      toFetch.push(m);
    }
  }

  // Fetch uncached meds in parallel (max 5 concurrent to be nice to the API)
  const chunks = [];
  for (let i = 0; i < toFetch.length; i += 5) {
    chunks.push(toFetch.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    const fetched = await Promise.all(
      chunk.map(async (m) => {
        try {
          const info = await getDrugInfo(m.name);
          return { id: m.id, info };
        } catch {
          return { id: m.id, info: null };
        }
      })
    );
    for (const { id, info } of fetched) {
      if (info) results.set(id, info);
    }
  }

  return results;
}

// Check live drug interactions via RxNorm
export async function checkLiveInteractions(medNames) {
  if (!medNames || medNames.length < 2) return { interactions: [], rxcuis: {} };
  const data = await fetchWithAuth(
    `/api/drug-interactions?names=${encodeURIComponent(medNames.join(','))}`
  );
  return data;
}
