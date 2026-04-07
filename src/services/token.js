import { supabase } from './supabase';

let cachedToken = null;
let tokenExpiry = 0;
let inflightPromise = null;
const CACHE_DURATION = 5_000; // 5 seconds

// Seed the token from onAuthStateChange so getAuthToken() can return
// immediately without calling supabase.auth.getSession() (which acquires
// the navigator lock and contends with parallel db queries).
export function seedToken(accessToken) {
  cachedToken = accessToken || null;
  tokenExpiry = accessToken ? Date.now() + CACHE_DURATION : 0;
}

export async function getAuthToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  // Deduplicate concurrent calls
  if (inflightPromise) return inflightPromise;
  inflightPromise = supabase.auth.getSession()
    .then(({ data: { session } }) => {
      const token = session?.access_token || null;
      cachedToken = token;
      tokenExpiry = Date.now() + CACHE_DURATION;
      return token;
    })
    .catch(() => {
      cachedToken = null;
      tokenExpiry = 0;
      return null;
    })
    .finally(() => {
      inflightPromise = null;
    });
  return inflightPromise;
}

export function clearTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
  inflightPromise = null;
}
