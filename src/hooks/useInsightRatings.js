// Hook for insight ratings — provides rate/unrate with optimistic local state.
// Loads all ratings once on mount, then updates are optimistic.

import { useState, useEffect, useCallback } from 'react';
import { rateInsight, removeRating, loadRatings } from '../services/ratings';

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
      .catch(() => {}); // silent — ratings are non-critical
  }, [session?.user?.id]);

  const getRating = useCallback((surface, contentKey) => {
    return ratings.get(`${surface}:${contentKey}`) || 0;
  }, [ratings]);

  const rate = useCallback((surface, contentKey, rating, metadata) => {
    const key = `${surface}:${contentKey}`;
    const current = ratings.get(key) || 0;

    if (current === rating) {
      // Toggle off — remove rating
      setRatings(prev => { const next = new Map(prev); next.delete(key); return next; });
      removeRating(surface, contentKey).catch(() => {
        // Revert on failure
        setRatings(prev => { const next = new Map(prev); next.set(key, current); return next; });
      });
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
    }
  }, [ratings]);

  return { getRating, rate };
}
