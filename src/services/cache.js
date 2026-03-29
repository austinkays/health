// Offline cache layer (encrypted)
// localStorage acts as a read cache + offline write queue.
// Supabase is the source of truth. This is a fallback.
// Health data is AES-GCM encrypted using a key derived from the auth token.

import { encrypt, decrypt, clearKeyCache } from './crypto';

const CACHE_KEY = 'hc:cache';
const PENDING_KEY = 'hc:pending';

let _token = null;

export const cache = {
  // Set the auth token for encrypt/decrypt operations
  setToken(token) {
    _token = token;
  },

  // Clear token and key cache on sign-out
  clearToken() {
    _token = null;
    clearKeyCache();
  },

  // Read cached data (fallback when offline)
  async read() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw || !_token) return null;
      const json = await decrypt(raw, _token);
      return JSON.parse(json);
    } catch {
      return null;
    }
  },

  // Write full dataset to cache (after successful Supabase fetch)
  async write(data) {
    try {
      if (!_token) return;
      const encrypted = await encrypt(JSON.stringify(data), _token);
      localStorage.setItem(CACHE_KEY, encrypted);
    } catch {
      // localStorage full or unavailable — silently fail
    }
  },

  // Queue a write operation for when we come back online
  // Pending ops contain only table/id/action — no PHI, so no encryption needed
  queueWrite(operation) {
    try {
      const pending = this.getPending();
      pending.push({ ...operation, queuedAt: Date.now() });
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
      // silently fail
    }
  },

  // Get all pending operations
  getPending() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  // Clear pending queue (after successful flush)
  clearPending() {
    localStorage.removeItem(PENDING_KEY);
  },

  // Clear all cached data
  clear() {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(PENDING_KEY);
  },

  // Check if online
  isOnline() {
    return navigator.onLine;
  },
};

// Flush pending operations when coming back online
export function setupOfflineSync(flushCallback) {
  function handleOnline() {
    const pending = cache.getPending();
    if (pending.length > 0 && flushCallback) {
      flushCallback(pending);
    }
  }

  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}
