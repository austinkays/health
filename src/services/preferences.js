// Cloud-synced user preferences.
//
// localStorage is the fast-read layer (synchronous, used by theme inline script,
// starred.js, etc.). The Supabase `profiles.preferences` JSONB column is the
// source of truth that roams across devices.
//
// Write path:  savePref(key, value)  → localStorage + fire-and-forget Supabase update
// Read path:   readPref(key)         → localStorage (synchronous, always available)
// Hydrate:     hydrateFromCloud(prefs) → called once on login, cloud wins
//
// Keys are the bare localStorage key names (e.g. 'salve:theme', 'salve:starred').
// The SYNCED_KEYS allowlist prevents accidentally syncing device-specific flags.

import { db } from './db';

// Only these localStorage keys are synced to the cloud.
export const SYNCED_KEYS = [
  'salve:theme',
  'salve:baro-autolog',
  'salve:oura-baseline',
  'salve:med-sort',
  'salve:cycle-overlays',
  'salve:vitals-cycle-overlay',
  'salve:journal-mood-phase',
  'salve:starred',
];

// Debounce timer for batching rapid preference changes into a single Supabase write
let _pendingFlush = null;

function flushToCloud() {
  _pendingFlush = null;

  // Snapshot ALL synced keys from localStorage (the single source of truth)
  // and write them as one object. This avoids the read-before-write race
  // that would occur if two tabs flushed concurrently with a get-then-update.
  const snapshot = snapshotLocal();
  if (Object.keys(snapshot).length === 0) return;

  db.profile.update({ preferences: snapshot })
    .catch(err => {
      console.warn('Failed to sync preferences to cloud:', err);
    });
}

/**
 * Save a preference to both localStorage and Supabase (debounced).
 * @param {string} key - localStorage key (must be in SYNCED_KEYS)
 * @param {*} value - value to store (string or JSON-serializable)
 */
export function savePref(key, value) {
  // Always write to localStorage immediately (fast path)
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch { /* quota exceeded, ignore */ }

  if (!SYNCED_KEYS.includes(key)) return;

  // Queue cloud sync (debounced 1s to batch rapid changes).
  // flushToCloud snapshots all synced keys from localStorage, so we just
  // need to ensure the debounce is (re)started.
  clearTimeout(_pendingFlush);
  _pendingFlush = setTimeout(flushToCloud, 1000);
}

/**
 * Read a preference from localStorage (synchronous).
 * @param {string} key - localStorage key
 * @param {*} fallback - default if missing
 */
export function readPref(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? raw : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Hydrate localStorage from cloud preferences.
 * Called once after loading profile data on login.
 * Cloud wins for synced keys — overwrites any stale localStorage values.
 * Skips keys the cloud doesn't have yet (first login on this account,
 * or preference was never saved to cloud).
 *
 * @param {Object} prefs - profiles.preferences JSONB from Supabase
 */
export function hydrateFromCloud(prefs) {
  if (!prefs || typeof prefs !== 'object') return;

  for (const key of SYNCED_KEYS) {
    if (key in prefs) {
      const value = prefs[key];
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      } catch { /* ignore */ }
    }
  }
}

/**
 * Snapshot all synced preferences from localStorage into a plain object.
 * Used to seed the cloud on first sync (existing user who had local-only prefs).
 * @returns {Object}
 */
export function snapshotLocal() {
  const snapshot = {};
  for (const key of SYNCED_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        // Try to parse JSON values (arrays, objects, booleans)
        try { snapshot[key] = JSON.parse(raw); } catch { snapshot[key] = raw; }
      }
    } catch { /* ignore */ }
  }
  return snapshot;
}
