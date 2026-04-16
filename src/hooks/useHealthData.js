import { useState, useCallback, useEffect } from 'react';
import { db } from '../services/db';
import { cache } from '../services/cache';
import { isPremiumActive, getAIProvider, setAIProvider } from '../services/ai';
import { buildDemoData } from '../constants/demoData';
import { trackEvent, EVENTS } from '../services/analytics';
import { hydrateFromCloud, snapshotLocal, SYNCED_KEYS } from '../services/preferences';
import useRealtimeSync from './useRealtimeSync';

// Map of Supabase table name → analytics event for per-entity "thing added" tracking.
// Tables NOT in this map don't fire a per-entity event (e.g. allergies, providers —
// these fire through the generic `first_record_added` signal only).
const ADD_EVENT_BY_TABLE = {
  medications: EVENTS.MEDICATION_ADDED,
  vitals: EVENTS.VITAL_LOGGED,
  journal_entries: EVENTS.JOURNAL_ENTRY_ADDED,
  cycles: EVENTS.CYCLE_ENTRY_ADDED,
  todos: EVENTS.TODO_ADDED,
};

// Tables that count as "a real record" for the first_record_added funnel signal.
// Excludes profile-ish/config tables (feedback, drug_prices, etc.)
const RECORD_TABLES = new Set([
  'medications', 'conditions', 'allergies', 'providers', 'pharmacies',
  'vitals', 'appointments', 'journal_entries', 'labs', 'procedures',
  'immunizations', 'todos', 'cycles', 'activities', 'genetic_results',
]);

export default function useHealthData(session, demoMode = false) {
  const [data, setData] = useState(() => {
    // Synchronous read of non-PHI settings sidecar, shows name/prefs instantly
    // before the encrypted cache or Supabase have a chance to load.
    const cachedSettings = cache.readSettingsSync();
    return {
      meds: [], conditions: [], allergies: [], providers: [],
      pharmacies: [], vitals: [], appts: [], journal: [],
      labs: [], procedures: [], immunizations: [], care_gaps: [],
      anesthesia_flags: [], appeals_and_disputes: [], surgical_planning: [], insurance: [],
      insurance_claims: [],
      drug_prices: [],
      todos: [],
      cycles: [],
      activities: [],
      genetic_results: [],
      feedback: [],
      medication_reminders: [],
      settings: cachedSettings ?? { name: '', location: '', ai_mode: 'onDemand', pharmacy: '', insurance_plan: '', insurance_id: '', insurance_group: '', insurance_phone: '', health_background: '' },
    };
  });
  const [loading, setLoading] = useState(true);

  // Demo mode: inject the curated demo profile, skip all network calls.
  useEffect(() => {
    if (!demoMode) return;
    setData(buildDemoData());
    setLoading(false);
  }, [demoMode]);

  // Cache-first loading: show cached data instantly, then refresh from Supabase.
  // Depend on session user ID (stable string), NOT the session object reference,
  // which changes on every token refresh and caused 3× duplicate load_all_data calls.
  const sessionUserId = session?.user?.id;
  const sessionToken = session?.access_token;
  useEffect(() => {
    if (demoMode) return;
    if (!sessionUserId || !sessionToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Flip back to loading when a real session arrives. Without this, a
    // fresh-browser sign-in flow leaves `loading=false` from the no-session
    // branch above, and App.jsx's onboarding guard sees dataLoading=false
    // with still-empty data and pops the wizard — even on accounts that
    // have plenty of data. See the onboarding effect in App.jsx.
    setLoading(true);

    async function load() {
      // Ensure cache has the token for decryption
      cache.setToken(sessionToken);

      // 1. Try reading from encrypted localStorage cache for instant display
      try {
        const cached = await cache.read();
        if (cached && !cancelled) {
          setData(cached);
          setLoading(false);
          // Early hydration from cached preferences (instant, before network)
          if (cached.settings?.preferences) {
            hydrateFromCloud(cached.settings.preferences);
          }
        }
      } catch { /* cache miss is fine */ }

      // 2. Always refresh from Supabase in background
      try {
        const fresh = await db.loadAll();
        if (!cancelled) {
          setData(fresh);
          // Defer cache write off the critical path, don't block rendering
          setTimeout(() => cache.write(fresh).catch(() => {}), 100);
          // ── Preference sync: cloud → localStorage ──
          // If the cloud has preferences, hydrate localStorage so this device
          // picks up settings saved on other devices (theme, starred, etc.).
          // If the cloud is empty (first sync / new column), seed it from
          // whatever this device already has in localStorage.
          try {
            const cloudPrefs = fresh.settings?.preferences;
            if (cloudPrefs && Object.keys(cloudPrefs).length > 0) {
              hydrateFromCloud(cloudPrefs);
            } else {
              // First sync: push existing localStorage prefs to cloud
              const local = snapshotLocal();
              if (Object.keys(local).length > 0) {
                db.profile.update({ preferences: local }).catch(() => {});
              }
            }
          } catch { /* preference sync is non-fatal */ }
          // If premium is no longer active (trial expired / free tier) but the
          // client still has anthropic selected, force-switch to gemini so
          // requests don't hit /api/chat and 403. Keeps client + server in sync.
          if (!isPremiumActive(fresh.settings) && getAIProvider() === 'anthropic') {
            setAIProvider('gemini');
          }
          // One-time cleanup: strip phantom severity from journal entries that
          // never had symptoms. EMPTY_JOURNAL used to default severity to '5'
          // and there's no severity picker in the form, so entries saved
          // without symptoms got a '5/10' badge the user never chose.
          setTimeout(() => cleanupPhantomJournalSeverity(fresh, setData), 200);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionUserId, demoMode]);

  // Generic updater
  const update = useCallback(async (key, val) => {
    setData(prev => ({ ...prev, [key]: val }));
  }, []);

  // CRUD helpers that sync to Supabase, state updates AFTER server confirms
  const addItem = useCallback(async (table, item) => {
    const saved = await db[table].add(item);
    setData(prev => {
      const key = tableToKey(table);
      // db.add's dedup path returns an existing row when a match is found
      // (e.g. Oura re-sync, Apple Health re-import). Don't append a duplicate
      // with the same id — that produces duplicate React keys and inflates
      // the list over time.
      if (saved?.id && prev[key].some(x => x.id === saved.id)) {
        return prev;
      }
      // Analytics: fire inside the updater so we can read the BEFORE state and
      // detect whether this was the user's first-ever real record. Tracking
      // calls are fire-and-forget and allowlisted — safe to call here.
      if (RECORD_TABLES.has(table)) {
        const wasEmpty = [...RECORD_TABLES].every(t => {
          const k = tableToKey(t);
          return !prev[k] || prev[k].length === 0;
        });
        if (wasEmpty) trackEvent(EVENTS.FIRST_RECORD_ADDED);
      }
      const perEntityEvent = ADD_EVENT_BY_TABLE[table];
      if (perEntityEvent) trackEvent(perEntityEvent);
      return { ...prev, [key]: [...prev[key], saved] };
    });
    return saved;
  }, []);

  const updateItem = useCallback(async (table, id, changes) => {
    const saved = await db[table].update(id, changes);
    setData(prev => {
      const key = tableToKey(table);
      return { ...prev, [key]: prev[key].map(x => x.id === id ? saved : x) };
    });
    return saved;
  }, []);

  const removeItem = useCallback(async (table, id) => {
    await db[table].remove(id);
    setData(prev => {
      const key = tableToKey(table);
      return { ...prev, [key]: prev[key].filter(x => x.id !== id) };
    });
  }, []);

  const updateSettings = useCallback(async (changes) => {
    // Optimistic local update, instant UI response
    setData(prev => ({ ...prev, settings: { ...prev.settings, ...changes } }));
    // Optimistic local update — instant UI response
    setData(prev => {
      const nextSettings = { ...prev.settings, ...changes };
      // Analytics: fire profile_completed ONCE when both core fields go from
      // empty to non-empty. Guarded by a localStorage flag so re-edits don't
      // re-fire. This is the onboarding funnel signal — "user actually set
      // themselves up" vs. "user signed in and bounced".
      try {
        const wasComplete = Boolean((prev.settings?.name || '').trim()) &&
                            Boolean((prev.settings?.health_background || '').trim());
        const isComplete = Boolean((nextSettings.name || '').trim()) &&
                           Boolean((nextSettings.health_background || '').trim());
        if (!wasComplete && isComplete && !localStorage.getItem('salve:profile-completed-fired')) {
          localStorage.setItem('salve:profile-completed-fired', '1');
          trackEvent(EVENTS.PROFILE_COMPLETED);
        }
      } catch { /* ignore */ }
      return { ...prev, settings: nextSettings };
    });
    // Fire the network save in the background
    try {
      await db.profile.update(changes);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }, []);

  const reloadData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await db.loadAll();
      setData(d);
      cache.write(d).catch(() => {});
    } catch (err) {
      console.error('Failed to reload data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const eraseAll = useCallback(async () => {
    try {
      await db.eraseAll();
    } catch (err) {
      console.warn('Erase had partial failures:', err.message);
    }
    window.location.reload();
  }, []);

  // ── Realtime: subscribe to vitals/activities/cycles changes ──
  // Merges INSERT/UPDATE/DELETE from any source (Oura auto-sync, Terra webhook,
  // another browser tab) into state so the UI updates instantly.
  useRealtimeSync(session?.user?.id, !demoMode && !!session, setData);

  return { data, loading, update, addItem, updateItem, removeItem, updateSettings, eraseAll, reloadData };
}

const SEVERITY_CLEANUP_KEY = 'salve:journal-severity-cleanup-v1';

async function cleanupPhantomJournalSeverity(fresh, setData) {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(SEVERITY_CLEANUP_KEY) === 'done') return;
  const phantoms = (fresh.journal || []).filter(
    e => e.severity && !(e.symptoms && e.symptoms.length > 0)
  );
  if (phantoms.length === 0) {
    localStorage.setItem(SEVERITY_CLEANUP_KEY, 'done');
    return;
  }
  try {
    await Promise.all(phantoms.map(e => db.journal.update(e.id, { severity: '' })));
    setData(prev => ({
      ...prev,
      journal: prev.journal.map(e =>
        phantoms.some(p => p.id === e.id) ? { ...e, severity: '' } : e
      ),
    }));
    localStorage.setItem(SEVERITY_CLEANUP_KEY, 'done');
  } catch (err) {
    console.warn('Journal severity cleanup failed, will retry next load:', err);
  }
}

function tableToKey(table) {
  const map = {
    medications: 'meds',
    conditions: 'conditions',
    allergies: 'allergies',
    providers: 'providers',
    pharmacies: 'pharmacies',
    vitals: 'vitals',
    appointments: 'appts',
    journal: 'journal',
    labs: 'labs',
    procedures: 'procedures',
    immunizations: 'immunizations',
    care_gaps: 'care_gaps',
    anesthesia_flags: 'anesthesia_flags',
    appeals_and_disputes: 'appeals_and_disputes',
    surgical_planning: 'surgical_planning',
    insurance: 'insurance',
    insurance_claims: 'insurance_claims',
    drug_prices: 'drug_prices',
    todos: 'todos',
    cycles: 'cycles',
    activities: 'activities',
    genetic_results: 'genetic_results',
    feedback: 'feedback',
    medication_reminders: 'medication_reminders',
  };
  return map[table] || table;
}
