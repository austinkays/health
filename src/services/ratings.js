// Insight ratings service — thumbs up/down on AI-generated content.
// Uses upsert (one rating per user per surface+content_key).

import { supabase } from './supabase';

const TABLE = 'insight_ratings';

/**
 * Rate a piece of content. Upserts — calling again with the same
 * surface+content_key replaces the previous rating (toggle off by removing).
 */
export async function rateInsight(surface, contentKey, rating, metadata = null) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { user_id: user.id, surface, content_key: contentKey, rating, metadata },
      { onConflict: 'user_id,surface,content_key' }
    );
  if (error) throw error;
}

/** Remove a rating (un-vote). */
export async function removeRating(surface, contentKey) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', user.id)
    .eq('surface', surface)
    .eq('content_key', contentKey);
  if (error) throw error;
}

/** Load all ratings for the current user (lightweight — typically <100 rows). */
export async function loadRatings() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('surface, content_key, rating, metadata, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
