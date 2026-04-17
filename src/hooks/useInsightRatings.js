// Hook for insight ratings, provides rate/unrate with optimistic local state.
// Loads all ratings once on mount, then updates are optimistic.
//
// Daily-insight ratings (surface === 'insight') dual-write: they hit both
// `insight_ratings` (via rateInsight) AND `generated_insights.rating` (via
// updateInsightRatingByDate) so the timeline view can render rating state
// without an extra join. `insight_ratings` is source of truth — if the
// second write fails, `loadRecentInsights` reconciles on next read. The
// denormalized sync only fires after the primary write resolves, so a
// failed rate doesn't flip `generated_insights.rating` out of sync.
// The content_key for the daily insight is the ISO date (e.g. '2026-04-17'),
// NOT the literal 'daily', so each day gets its own rating row.

import { useState, useEffect, useCallback } from 'react';
import { rateInsight, removeRating, loadRatings } from '../services/ratings';
import { updateInsightRatingByDate } from '../services/insights';

export default function useInsightRatings(session) {
  // Map keyed by "surface:content_key" → rating (-1 or 1)
  const [ratings, setRatings] = useState(new Map());
  // User id pulled from the session once — avoids an auth.getUser() round-trip
  // on every thumbs-up/down click.
  const userId = session?.user?.id || null;

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

  // Best-effort dual-write for daily-insight ratings. Only called after the
  // primary `insight_ratings` write succeeds, so a failed rate can't cause
  // `generated_insights.rating` to drift out of sync. Still silent-fail on
  // the secondary write — loadRecentInsights reconciles on next read.
  const syncGeneratedInsightRating = useCallback(async (surface, contentKey, rating) => {
    if (surface !== 'insight') return;
    if (!userId) return;
    // Only date-shaped content keys correspond to a generated_insights row.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(contentKey)) return;
    try {
      await updateInsightRatingByDate(userId, contentKey, rating);
    } catch (_) { /* non-critical */ }
  }, [userId]);

  const rate = useCallback((surface, contentKey, rating, metadata) => {
    const key = `${surface}:${contentKey}`;
    const current = ratings.get(key) || 0;

    if (current === rating) {
      // Toggle off, remove rating
      setRatings(prev => { const next = new Map(prev); next.delete(key); return next; });
      removeRating(surface, contentKey)
        .then(() => { syncGeneratedInsightRating(surface, contentKey, null); })
        .catch(() => {
          // Revert on failure — skip the dual-write so the denormalized column
          // doesn't drift from insight_ratings.
          setRatings(prev => { const next = new Map(prev); next.set(key, current); return next; });
        });
    } else {
      // Set or change rating
      setRatings(prev => { const next = new Map(prev); next.set(key, rating); return next; });
      rateInsight(surface, contentKey, rating, metadata)
        .then(() => { syncGeneratedInsightRating(surface, contentKey, rating); })
        .catch(() => {
          // Revert on failure — skip the dual-write so the denormalized column
          // doesn't drift from insight_ratings.
          setRatings(prev => {
            const next = new Map(prev);
            if (current) next.set(key, current); else next.delete(key);
            return next;
          });
        });
    }
  }, [ratings, syncGeneratedInsightRating]);

  return { getRating, rate };
}
