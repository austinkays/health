import { supabase } from './supabase';

let cachedToken = null;
let tokenExpiry = 0;
let inflightPromise = null;
const CACHE_DURATION = 5_000; // 5 seconds

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
