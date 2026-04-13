// ── Supabase Realtime subscriptions ──
// Subscribes to INSERT/UPDATE/DELETE on vitals, activities, and cycles.
// Merges changes into useHealthData state so the UI updates instantly
// when any source (Oura auto-sync, Terra webhook, another tab) writes data.

import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';

const WATCHED_TABLES = ['vitals', 'activities', 'cycles'];

const TABLE_TO_KEY = {
  vitals: 'vitals',
  activities: 'activities',
  cycles: 'cycles',
};

/**
 * Subscribe to Supabase Realtime postgres_changes on key tables.
 * Merges new/updated/deleted rows into the data state in real time.
 *
 * @param {string|null} userId - authenticated user id (null = skip)
 * @param {boolean} enabled - false in demo mode or when not authenticated
 * @param {Function} setData - the setData from useHealthData
 */
export default function useRealtimeSync(userId, enabled, setData) {
  const channelRef = useRef(null);

  useEffect(() => {
    if (!enabled || !userId) return;

    const channel = supabase
      .channel('salve-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', filter: `user_id=eq.${userId}` },
        (payload) => {
          const table = payload.table;
          const key = TABLE_TO_KEY[table];
          if (!key) return;

          const row = payload.new;
          setData(prev => {
            // Skip if already present (dedup against optimistic adds from same tab)
            if (prev[key].some(r => r.id === row.id)) return prev;
            return { ...prev, [key]: [...prev[key], row] };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', filter: `user_id=eq.${userId}` },
        (payload) => {
          const key = TABLE_TO_KEY[payload.table];
          if (!key) return;

          const row = payload.new;
          setData(prev => ({
            ...prev,
            [key]: prev[key].map(r => r.id === row.id ? row : r),
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', filter: `user_id=eq.${userId}` },
        (payload) => {
          const key = TABLE_TO_KEY[payload.table];
          if (!key) return;

          const id = payload.old?.id;
          if (!id) return;
          setData(prev => ({
            ...prev,
            [key]: prev[key].filter(r => r.id !== id),
          }));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, enabled, setData]);
}
