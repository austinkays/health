// Client service for dynamic Discover articles from trusted RSS feeds.
// Caches in localStorage for 14 days to avoid unnecessary API calls.

import { getAuthToken } from './token';

const CACHE_KEY = 'salve:discover-articles';
const CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days

/** Read cached articles (returns null if stale/missing). */
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { articles, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) return null;
    return articles;
  } catch {
    return null;
  }
}

/** Write articles to cache with 14-day TTL. */
function writeCache(articles) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      articles,
      expiry: Date.now() + CACHE_TTL,
    }));
  } catch { /* quota, ignore */ }
}

/**
 * Fetch fresh articles from the discover API, condition-matched.
 * Returns cached articles if available and fresh.
 * @param {string[]} conditions - user's condition names for matching
 */
export async function fetchDiscoverArticles(conditions = []) {
  // Return cache if fresh
  const cached = readCache();
  if (cached) return cached;

  try {
    const token = await getAuthToken();
    if (!token) {
      console.warn('[Discover] No auth token available, skipping fetch');
      return [];
    }

    const params = new URLSearchParams();
    if (conditions.length > 0) {
      params.set('conditions', conditions.map(c => c.toLowerCase()).join(','));
    }

    const url = `/api/discover${params.toString() ? '?' + params : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[Discover] API returned ${res.status}:`, text.slice(0, 200));
      return [];
    }
    const { articles } = await res.json();
    // Only cache non-empty results — an empty fetch (feed down, no matches)
    // shouldn't block fresh attempts for the full 14-day TTL.
    if (articles?.length) writeCache(articles);
    else console.warn('[Discover] API returned empty articles array');
    return articles || [];
  } catch (err) {
    console.warn('[Discover] Fetch failed:', err.message);
    return [];
  }
}
