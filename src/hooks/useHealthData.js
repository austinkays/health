import { useState, useCallback, useEffect } from 'react';
import { db } from '../services/db';
import { cache } from '../services/cache';
import { isPremiumActive, getAIProvider, setAIProvider } from '../services/ai';
import { buildDemoData } from '../constants/demoData';

export default function useHealthData(session, demoMode = false) {
  const [data, setData] = useState({
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
    settings: { name: '', location: '', ai_mode: 'onDemand', pharmacy: '', insurance_plan: '', insurance_id: '', insurance_group: '', insurance_phone: '', health_background: '' },
  });
  const [loading, setLoading] = useState(true);

  // Demo mode: inject the curated demo profile, skip all network calls.
  useEffect(() => {
    if (!demoMode) return;
    setData(buildDemoData());
    setLoading(false);
  }, [demoMode]);

  // Cache-first loading: show cached data instantly, then refresh from Supabase
  useEffect(() => {
    if (demoMode) return;
    if (!session) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      // Ensure cache has the token for decryption
      cache.setToken(session.access_token);

      // 1. Try reading from encrypted localStorage cache for instant display
      try {
        const cached = await cache.read();
        if (cached && !cancelled) {
          setData(cached);
          setLoading(false);
        }
      } catch { /* cache miss is fine */ }

      // 2. Always refresh from Supabase in background
      try {
        const fresh = await db.loadAll();
        if (!cancelled) {
          setData(fresh);
          cache.write(fresh).catch(() => {});
          // If premium is no longer active (trial expired / free tier) but the
          // client still has anthropic selected, force-switch to gemini so
          // requests don't hit /api/chat and 403. Keeps client + server in sync.
          if (!isPremiumActive(fresh.settings) && getAIProvider() === 'anthropic') {
            setAIProvider('gemini');
          }
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [session, demoMode]);

  // Generic updater
  const update = useCallback(async (key, val) => {
    setData(prev => ({ ...prev, [key]: val }));
  }, []);

  // CRUD helpers that sync to Supabase — state updates AFTER server confirms
  const addItem = useCallback(async (table, item) => {
    const saved = await db[table].add(item);
    setData(prev => {
      const key = tableToKey(table);
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
    // Optimistic local update — instant UI response
    setData(prev => ({ ...prev, settings: { ...prev.settings, ...changes } }));
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

  return { data, loading, update, addItem, updateItem, removeItem, updateSettings, eraseAll, reloadData };
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
  };
  return map[table] || table;
}
