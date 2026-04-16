import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';

// Shared stats fetch — lifted out of StatsPanel so UserDrilldown can consume
// the same `users_by_activity_7d` without making a second RPC call.
export default function useAdminStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [stats, setStats]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_admin_stats');
      if (rpcErr) throw rpcErr;
      setStats(data || null);
    } catch (err) {
      console.error('Failed to load admin stats:', err);
      setError(err?.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 30-second auto-refresh for live counter
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return { stats, loading, error, refresh: load };
}
