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
    if (!token) return [];

    const params = new URLSearchParams();
    if (conditions.length > 0) {
      params.set('conditions', conditions.map(c => c.toLowerCase()).join(','));
    }

    const url = `/api/discover${params.toString() ? '?' + params : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return [];
    const { articles } = await res.json();
    writeCache(articles || []);
    return articles || [];
  } catch {
    return [];
  }
}
