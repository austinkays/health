// Offline cache layer (encrypted)
// localStorage acts as a read cache + offline write queue.
// Supabase is the source of truth. This is a fallback.
// Health data is AES-GCM encrypted using a key derived from the auth token.

import { encrypt, decrypt, clearKeyCache, prewarmKey } from './crypto';

const CACHE_KEY = 'hc:cache';
const PENDING_KEY = 'hc:pending';
const SETTINGS_KEY = 'hc:settings'; // unencrypted sidecar for non-PHI settings (instant read)

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

  // Pre-derive the AES key in the background so cache.read() is instant.
  // Call this as soon as a session token is available (e.g. in onAuthStateChange).
  prewarm() {
    if (!_token) return;
    prewarmKey(_token); // fire-and-forget — result cached in crypto.js
  },

  // Read non-PHI settings synchronously (no decryption needed).
  // Written alongside the encrypted cache to give instant name/prefs on load.
  readSettingsSync() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  // Write non-PHI settings to plain sidecar (called alongside cache.write).
  writeSettingsSync(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* ignore quota errors */ }
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
      // Keep non-PHI settings sidecar in sync for instant synchronous reads
      if (data?.settings) this.writeSettingsSync(data.settings);
      const encrypted = await encrypt(JSON.stringify(data), _token);
      try {
        localStorage.setItem(CACHE_KEY, encrypted);
      } catch (e) {
        if (e?.name === 'QuotaExceededError' || e?.code === 22) {
          // Storage full — clear cache and try once more with just the new data
          localStorage.removeItem(CACHE_KEY);
          localStorage.removeItem(PENDING_KEY);
          try {
            localStorage.setItem(CACHE_KEY, encrypted);
          } catch {
            // Still full (e.g. encrypted blob itself is too large) — skip caching
          }
        }
      }
    } catch {
      // Encrypt failed or token unavailable — skip caching
    }
  },

  // Queue a write operation for when we come back online
  // Pending ops contain only table/id/action — no PHI, so no encryption needed
  queueWrite(operation) {
    try {
      const pending = this.getPending();
      pending.push({ ...operation, queuedAt: Date.now() });
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      } catch (e) {
        if (e?.name === 'QuotaExceededError' || e?.code === 22) {
          // Pending queue full — trim oldest half and retry
          const trimmed = pending.slice(Math.floor(pending.length / 2));
          try { localStorage.setItem(PENDING_KEY, JSON.stringify(trimmed)); } catch { /* give up */ }
        }
      }
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
    localStorage.removeItem(SETTINGS_KEY);
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
