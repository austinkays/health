// Cross-device preference sync.
//
// Thin wrapper around a single JSONB column (profiles.preferences) plus a
// localStorage mirror. Reads are synchronous (memory → localStorage). Writes
// update memory + localStorage immediately and debounce-upsert to the server.
//
// Use this for any UI state that a user would reasonably expect to follow
// them between devices (onboarding completion, theme, AI consent, feature
// toggles, dismissed tips, dashboard customization, etc.). Do NOT use it for
// device-local concerns (install-prompt dismissal, daily throttles, OAuth
// token mirrors, PHI).

import { db } from './db';

const LS_KEY = 'salve:preferences';
const DEBOUNCE_MS = 600;

let _memory = null;
let _pendingPatch = {};
let _flushTimer = null;
let _listeners = new Set();

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalStorage(obj) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch { /* quota or unavailable */ }
}

function notify() {
  for (const fn of _listeners) {
    try { fn(_memory); } catch { /* isolate listeners */ }
  }
}

// Initialize memory from localStorage on first use — keeps getPref() synchronous
// for things like OnboardingWizard's hasCompletedOnboarding() called before
// the server has responded.
function ensureMemory() {
  if (_memory === null) _memory = loadFromLocalStorage();
  return _memory;
}

// Seed memory with the server-authoritative preferences blob (from
// profiles.preferences, delivered via useHealthData). Called whenever
// data.settings.preferences changes. Merges over any local-only writes
// so an optimistic toggle made before hydration isn't clobbered.
export function hydratePreferences(serverPrefs) {
  const server = serverPrefs || {};
  const local = ensureMemory();
  // One-time migration: if the server has never seen this user's prefs,
  // scan localStorage for the handful of pre-existing `salve:*` keys that
  // should sync and seed them. Without this, a user who set a theme on
  // device A before this deploy would see lilac on device B until they
  // re-picked a theme.
  const legacy = collectLegacyLocalStoragePrefs(server, local);
  if (Object.keys(legacy).length) {
    for (const [k, v] of Object.entries(legacy)) {
      _pendingPatch[k] = v;
    }
    scheduleFlush();
  }
  const merged = {
    ...server,
    ...legacy,
    ..._pendingPatch,
    ...pickLocalOverrides(local, server),
  };
  _memory = merged;
  writeLocalStorage(merged);
  notify();
}

// Keys the app was writing directly to localStorage before the preferences
// service existed. Values are read once per hydration if the server row
// doesn't already have them, then written up to the server so the next
// device sees them. Keep this list in sync with the CLAUDE.md "should sync"
// table — anything device-local (install dismissal, daily throttles, OAuth
// tokens, PHI cache) must NOT appear here.
const LEGACY_KEY_MAP = {
  'salve:theme': { key: 'theme' },
  'salve:ai-consent': {
    key: 'aiConsent',
    // Only "granted" matters; anything else is effectively absent.
    parse: (v) => (v === 'granted' ? 'granted' : null),
  },
  'salve:ai-provider': { key: 'aiProvider' },
  'salve:onboarded': {
    key: 'onboarded',
    parse: (v) => (v === 'true' || v === '1' ? true : null),
  },
  'salve:baro-autolog': {
    key: 'baroAutoLog',
    parse: (v) => v === 'true',
  },
  'salve:baro-view': { key: 'baroView' },
  'salve:oura-baseline': {
    key: 'ouraBaseline',
    parse: (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    },
  },
  'salve:last-seen-whats-new': { key: 'lastSeenWhatsNew' },
  'salve:last-seen-version': { key: 'lastSeenWhatsNew' },
  'salve:med-sort': { key: 'medSort' },
  'salve:cycle-overlays': {
    key: 'cycleOverlays',
    parse: (v) => { try { return JSON.parse(v); } catch { return null; } },
  },
  'salve:vitals-cycle-overlay': {
    key: 'vitalsCycleOverlay',
    parse: (v) => v === 'true',
  },
  'salve:dash-primary': {
    key: 'dashPrimary',
    parse: (v) => { try { return JSON.parse(v); } catch { return null; } },
  },
  'salve:dash-more': {
    key: 'dashMore',
    parse: (v) => v === 'true',
  },
  'salve:starred': {
    key: 'starred',
    parse: (v) => { try { return JSON.parse(v); } catch { return null; } },
  },
  'salve:hidden-sources': {
    key: 'hiddenSources',
    parse: (v) => { try { return JSON.parse(v); } catch { return null; } },
  },
  'salve:dismissed-tips': {
    key: 'dismissedTips',
    parse: (v) => { try { return JSON.parse(v); } catch { return null; } },
  },
  'salve:saved-insights': {
    key: 'savedInsights',
    parse: (v) => { try { return JSON.parse(v); } catch { return null; } },
  },
  'salve:saved-news': {
    key: 'savedNews',
    parse: (v) => { try { return JSON.parse(v); } catch { return null; } },
  },
};

function collectLegacyLocalStoragePrefs(server, local) {
  const out = {};
  for (const [lsKey, spec] of Object.entries(LEGACY_KEY_MAP)) {
    if (spec.key in server) continue;      // server already has it
    if (spec.key in local) continue;       // already migrated
    let raw = null;
    try { raw = localStorage.getItem(lsKey); } catch { /* ignore */ }
    if (raw == null) continue;
    const parsed = spec.parse ? spec.parse(raw) : raw;
    if (parsed == null) continue;
    out[spec.key] = parsed;
  }
  return out;
}

// If a key exists locally but not on the server, keep the local value —
// handles the migration window where a user toggled something before the
// server knew about preferences at all.
function pickLocalOverrides(local, server) {
  const out = {};
  for (const [k, v] of Object.entries(local)) {
    if (!(k in server)) out[k] = v;
  }
  return out;
}

export function getPref(key, fallback) {
  const mem = ensureMemory();
  return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : fallback;
}

export function getAllPrefs() {
  return { ...ensureMemory() };
}

// Set a single preference. Updates memory + localStorage synchronously,
// schedules a debounced JSONB merge to the server. value=null deletes the key.
export function setPref(key, value) {
  const mem = ensureMemory();
  if (value === null || value === undefined) {
    delete mem[key];
  } else {
    mem[key] = value;
  }
  writeLocalStorage(mem);
  _pendingPatch[key] = value === undefined ? null : value;
  scheduleFlush();
  notify();
}

function scheduleFlush() {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => { flushNow().catch(() => {}); }, DEBOUNCE_MS);
}

// Flush pending writes to the server now. Safe to call repeatedly.
export async function flushNow() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  const patch = _pendingPatch;
  if (!Object.keys(patch).length) return;
  _pendingPatch = {};
  try {
    await db.profile.updatePreferences(patch);
  } catch (err) {
    // Put the patch back so the next flush retries. Don't spam the console
    // on expected offline / auth-expired errors.
    _pendingPatch = { ...patch, ..._pendingPatch };
    scheduleFlush();
    if (import.meta.env?.DEV) console.warn('preferences flush failed:', err?.message || err);
  }
}

// Subscribe to preference changes (memory or hydration). Returns an
// unsubscribe function. Fires on every setPref/hydrate — consumers should
// compare values themselves if they need cheap re-render skipping.
export function subscribePreferences(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

// Clear all in-memory + localStorage preferences. Called on sign-out.
// Does NOT touch the server row — that's still there for the next sign-in.
export function clearLocalPreferences() {
  _memory = {};
  _pendingPatch = {};
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  notify();
}

// Flush on tab hide so in-flight writes aren't lost to a closed tab.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flushNow().catch(() => {}); });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow().catch(() => {});
  });
}
