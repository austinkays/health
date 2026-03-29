import { useState, useCallback, useEffect } from 'react';
import { db } from '../services/db';

export default function useHealthData() {
  const [data, setData] = useState({
    meds: [], conditions: [], allergies: [], providers: [],
    vitals: [], appts: [], journal: [],
    settings: { name: '', location: '', ai_mode: 'onDemand', pharmacy: '', insurance_plan: '', insurance_id: '', insurance_group: '', insurance_phone: '', health_background: '' },
  });
  const [loading, setLoading] = useState(true);

  // Initial load from Supabase
  useEffect(() => {
    db.loadAll()
      .then(d => setData(d))
      .catch(err => console.error('Failed to load data:', err))
      .finally(() => setLoading(false));
  }, []);

  // Generic updater
  const update = useCallback(async (key, val) => {
    setData(prev => ({ ...prev, [key]: val }));
  }, []);

  // CRUD helpers that sync to Supabase
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
    vitals: 'vitals',
    appointments: 'appts',
    journal: 'journal',
  };
  return map[table] || table;
}
