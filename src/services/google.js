import { supabase } from './supabase';

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

export async function searchPlaces(query, type, location) {
  if (!query || query.length < 2) return [];

  const cacheKey = `${query}|${type || ''}|${location || ''}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch('/api/places', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, type, location }),
      signal: controller.signal,
    });

    if (res.status === 501) return []; // not configured — graceful degradation
    if (!res.ok) return [];

    const { results } = await res.json();
    cache.set(cacheKey, { data: results, ts: Date.now() });
    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export function searchProviders(query, location) {
  return searchPlaces(query + ' doctor', 'doctor', location);
}

export function searchPharmacies(query, location) {
  return searchPlaces(query + ' pharmacy', 'pharmacy', location);
}
