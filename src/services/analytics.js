// Self-hosted, PHI-safe product analytics.
//
// What this does:
//   Log short enum-only event names to the `usage_events` Supabase table so
//   Austin can see which features of Salve are actually getting used.
//
// What this does NOT do:
//   - No event properties. No medication names. No journal content. No IDs.
//   - No third-party vendors. Data never leaves the user's own Supabase project.
//   - No cross-user aggregation is exposed client-side — each user can only
//     read their own rows (enforced by RLS in migration 026).
//
// How we stay safe:
//   - EVENTS is an allowlist of base event names. Anything not in this set is
//     silently dropped, even if called with a suffix.
//   - Suffixed events (e.g. 'section_opened:medications') are allowed ONLY if
//     the suffix is also in an explicit per-event allowlist. A typo or an
//     accidental `trackEvent('medication_added:Lexapro')` is dropped.
//   - Events are batched in memory and flushed every 10s or 20 events, whichever
//     comes first, and on page hide (`visibilitychange` → hidden).
//   - All writes are fire-and-forget. Analytics failures NEVER affect UX.
//   - If the user is in demo mode or signed out, events are discarded (no user_id).

import { supabase } from './supabase';

// ─── Event allowlist ──────────────────────────────────────────────────────
// Every event that can ever be logged lives here. Adding a new event is a
// deliberate, reviewable code change. No dynamic event names.

export const EVENTS = {
  // Navigation — which sections get real traffic?
  SECTION_OPENED: 'section_opened',

  // Onboarding funnel — where do new users drop off?
  SIGNED_IN_FIRST_TIME: 'signed_in_first_time',
  PROFILE_COMPLETED: 'profile_completed',
  FIRST_RECORD_ADDED: 'first_record_added',

  // Core writes — which sections are actually used vs. just visited?
  MEDICATION_ADDED: 'medication_added',
  VITAL_LOGGED: 'vital_logged',
  JOURNAL_ENTRY_ADDED: 'journal_entry_added',
  CYCLE_ENTRY_ADDED: 'cycle_entry_added',
  TODO_ADDED: 'todo_added',

  // AI engagement — which features justify the API cost?
  AI_CHAT_SENT: 'ai_chat_sent',
  AI_FEATURE_RUN: 'ai_feature_run',
  AI_TOOL_USED: 'ai_tool_used',

  // Integrations — are these worth the maintenance burden?
  IMPORT_COMPLETED: 'import_completed',
  OURA_SYNCED: 'oura_synced',

  // Settings engagement — power-user signals
  THEME_CHANGED: 'theme_changed',
  DASHBOARD_CUSTOMIZED: 'dashboard_customized',
  FEEDBACK_SUBMITTED: 'feedback_submitted',

  // Patterns & insights — are the new pattern types landing?
  PATTERN_VIEWED: 'pattern_viewed',
  INSIGHT_REFRESHED: 'insight_refreshed',
};

// Suffix allowlists for events that carry an enum discriminator.
// Keep these short and exhaustive.
const SUFFIX_ALLOWLIST = {
  section_opened: new Set([
    'dash', 'meds', 'vitals', 'appts', 'conditions', 'providers',
    'allergies', 'journal', 'ai', 'interactions', 'settings', 'labs',
    'procedures', 'immunizations', 'care_gaps', 'anesthesia', 'appeals',
    'surgical', 'insurance', 'pharmacies', 'cycles', 'todos', 'genetics',
    'activities', 'insights', 'sleep', 'hub_records', 'hub_care',
    'hub_tracking', 'hub_safety', 'hub_plans', 'hub_devices', 'oura',
    'apple_health', 'summary', 'search', 'legal', 'feedback', 'formhelper',
    'aboutme',
  ]),
  // Mirror the camelCase `feature` values passed to callAPI() in services/ai.js
  // so we can track at the central choke point without converting case.
  ai_feature_run: new Set([
    'insight', 'connections', 'news', 'resources', 'chat', 'labInterpret',
    'vitalsTrend', 'appointmentPrep', 'careGapDetect', 'journalPatterns',
    'cyclePatterns', 'immunizationSchedule', 'appealDraft',
    'crossReactivity', 'costOptimization', 'geneticExplanation',
    'formHelper', 'monthlySummary',
  ]),
  import_completed: new Set(['apple_health', 'flo', 'backup', 'sync', 'mychart']),
  theme_changed: new Set([
    'lilac', 'noir', 'midnight', 'forest', 'meadow', 'seafoam', 'sunrise',
    'aurora', 'neon', 'cherry', 'sunbeam', 'blaze', 'ember', 'galactic',
    'prismatic', 'crystal',
  ]),
  pattern_viewed: new Set([
    'correlation', 'trend', 'trigger', 'medication', 'anomaly', 'insight',
    'dayofweek', 'streak', 'comparison', 'timeofday',
  ]),
};

const ALLOWED_BASE_NAMES = new Set(Object.values(EVENTS));

// ─── Batching state ──────────────────────────────────────────────────────

const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 10_000;

let queue = [];
let flushTimer = null;
let disabled = false; // set true when signed out / in demo mode

/**
 * Validate + normalize an event name. Returns null (silently drops) if invalid.
 * The validation is intentionally paranoid — this is the PHI firewall.
 */
function validate(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 80) return null;

  const colonIdx = name.indexOf(':');
  const base = colonIdx === -1 ? name : name.slice(0, colonIdx);
  const suffix = colonIdx === -1 ? null : name.slice(colonIdx + 1);

  // Base must be in the allowlist
  if (!ALLOWED_BASE_NAMES.has(base)) return null;

  // Suffix, if present, must be in this event's per-event allowlist
  if (suffix !== null) {
    const allowed = SUFFIX_ALLOWLIST[base];
    if (!allowed || !allowed.has(suffix)) return null;
  }

  return name;
}

/**
 * Queue an event for later flushing. Safe to call anywhere, anytime.
 * Never throws, never blocks. Unknown events are silently dropped.
 */
export function trackEvent(name) {
  if (disabled) return;
  const normalized = validate(name);
  if (!normalized) {
    if (import.meta.env.DEV) {
      console.warn('[analytics] Dropped invalid event:', name);
    }
    return;
  }

  queue.push(normalized);

  if (queue.length >= BATCH_SIZE) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
}

/**
 * Flush the queue to Supabase. Fire-and-forget — we never wait on this.
 */
export function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  if (disabled) { queue = []; return; }

  const batch = queue;
  queue = [];

  // Fire-and-forget. We don't await, we don't throw, we don't surface errors
  // to the user. Worst case: analytics drops a few events.
  try {
    supabase
      .from('usage_events')
      .insert(batch.map(event => ({ event })))
      .then(({ error }) => {
        if (error && import.meta.env.DEV) {
          console.warn('[analytics] Flush failed:', error.message);
        }
      });
  } catch {
    // Swallow. Analytics must never affect UX.
  }
}

/**
 * Disable analytics (demo mode, signed out). Clears any pending queue.
 */
export function disableAnalytics() {
  disabled = true;
  queue = [];
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
}

/**
 * Re-enable analytics (called when a real user signs in).
 */
export function enableAnalytics() {
  disabled = false;
}

/**
 * Flush on page hide so events queued right before close aren't lost.
 * Call once at app startup.
 */
export function setupAnalyticsFlush() {
  if (typeof document === 'undefined') return;
  const handler = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', handler);
  window.addEventListener('pagehide', flush);
  return () => {
    document.removeEventListener('visibilitychange', handler);
    window.removeEventListener('pagehide', flush);
  };
}
