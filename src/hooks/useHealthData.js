import { useState, useCallback, useEffect } from 'react';
import { db } from '../services/db';

export default function useHealthData(session) {
  const [data, setData] = useState({
    meds: [], conditions: [], allergies: [], providers: [],
    pharmacies: [], vitals: [], appts: [], journal: [],
    labs: [], procedures: [], immunizations: [], care_gaps: [],
    anesthesia_flags: [], appeals_and_disputes: [], surgical_planning: [], insurance: [],
    settings: { name: '', location: '', ai_mode: 'onDemand', pharmacy: '', insurance_plan: '', insurance_id: '', insurance_group: '', insurance_phone: '', health_background: '' },
  });
  const [loading, setLoading] = useState(true);

  // Load from Supabase only when authenticated
  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    db.loadAll()
      .then(d => setData(d))
      .catch(err => console.error('Failed to load data:', err))
      .finally(() => setLoading(false));
  }, [session]);

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
    const saved = await db.profile.update(changes);
    setData(prev => ({ ...prev, settings: saved }));
  }, []);

  const reloadData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await db.loadAll();
      setData(d);
    } catch (err) {
      console.error('Failed to reload data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const eraseAll = useCallback(async () => {
    await db.eraseAll();
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
  };
  return map[table] || table;
}
