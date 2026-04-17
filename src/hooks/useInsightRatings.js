// Hook for insight ratings, provides rate/unrate with optimistic local state.
// Loads all ratings once on mount, then updates are optimistic.
//
// Daily-insight ratings (surface === 'insight') dual-write: they hit both
// `insight_ratings` (via rateInsight) AND `generated_insights.rating` (via
// updateInsightRatingByDate) so the timeline view can render rating state
// without an extra join. `insight_ratings` is source of truth — if the
// second write fails, `loadRecentInsights` reconciles on next read.
// The content_key for the daily insight is the ISO date (e.g. '2026-04-17'),
// NOT the literal 'daily', so each day gets its own rating row.

import { useState, useEffect, useCallback } from 'react';
import { rateInsight, removeRating, loadRatings } from '../services/ratings';
import { updateInsightRatingByDate } from '../services/insights';
import { supabase } from '../services/supabase';

export default function useInsightRatings(session) {
  // Map keyed by "surface:content_key" → rating (-1 or 1)
  const [ratings, setRatings] = useState(new Map());

  useEffect(() => {
    if (!session) return;
    loadRatings()
      .then(rows => {
        const map = new Map();
        for (const r of rows) map.set(`${r.surface}:${r.content_key}`, r.rating);
        setRatings(map);
      })
      .catch(() => {}); // silent, ratings are non-critical
  }, [session?.user?.id]);

  const getRating = useCallback((surface, contentKey) => {
    return ratings.get(`${surface}:${contentKey}`) || 0;
  }, [ratings]);

  // Best-effort dual-write for daily-insight ratings. Non-critical — silent
  // failure is acceptable because loadRecentInsights reconciles rating state
  // against insight_ratings on read.
  const syncGeneratedInsightRating = useCallback(async (surface, contentKey, rating) => {
    if (surface !== 'insight') return;
    // Only date-shaped content keys correspond to a generated_insights row.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(contentKey)) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      await updateInsightRatingByDate(user.id, contentKey, rating);
    } catch (_) { /* non-critical */ }
  }, []);

  const rate = useCallback((surface, contentKey, rating, metadata) => {
    const key = `${surface}:${contentKey}`;
    const current = ratings.get(key) || 0;

    if (current === rating) {
      // Toggle off, remove rating
      setRatings(prev => { const next = new Map(prev); next.delete(key); return next; });
      removeRating(surface, contentKey).catch(() => {
        // Revert on failure
        setRatings(prev => { const next = new Map(prev); next.set(key, current); return next; });
      });
      syncGeneratedInsightRating(surface, contentKey, null);
    } else {
      // Set or change rating
      setRatings(prev => { const next = new Map(prev); next.set(key, rating); return next; });
      rateInsight(surface, contentKey, rating, metadata).catch(() => {
        // Revert on failure
        setRatings(prev => {
          const next = new Map(prev);
          if (current) next.set(key, current); else next.delete(key);
          return next;
        });
      });
      syncGeneratedInsightRating(surface, contentKey, rating);
    }
  }, [ratings, syncGeneratedInsightRating]);

  return { getRating, rate };
}
