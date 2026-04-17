-- 052: Persistent Sage daily insights
-- One row per user per day. Enables cross-device sync, history timeline,
-- and a rating feedback loop that influences future insight generation.

CREATE TABLE IF NOT EXISTS generated_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  -- Client-supplied local ISO date (YYYY-MM-DD). Stored as a real column,
  -- not an expression index, so `.upsert({...}, { onConflict: 'user_id,generated_on' })`
  -- works cleanly from the Supabase client.
  generated_on date NOT NULL,
  text text NOT NULL CHECK (char_length(text) <= 4000),
  focus_area text NOT NULL DEFAULT 'general' CHECK (focus_area IN (
    'sleep','medication','nutrition','exercise','cycle',
    'symptom','prevention','condition','connection',
    'lifestyle','encouragement','research','general'
  )),
  seed_pattern_id text,
  seed_pattern_title text,
  seed_pattern_category text,
  -- Denormalized from insight_ratings for fast timeline queries.
  -- insight_ratings remains source of truth; loadRecentInsights reconciles on read.
  rating smallint CHECK (rating IN (-1, 1)),
  model text,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE generated_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own generated_insights" ON generated_insights
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own generated_insights" ON generated_insights
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own generated_insights" ON generated_insights
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own generated_insights" ON generated_insights
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_generated_insights_user_id
  BEFORE INSERT ON generated_insights
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER update_generated_insights_updated_at
  BEFORE UPDATE ON generated_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Primary upsert target: one row per user per day.
CREATE UNIQUE INDEX idx_generated_insights_user_day
  ON generated_insights(user_id, generated_on);
-- Timeline queries (newest-first pagination).
CREATE INDEX idx_generated_insights_user_time
  ON generated_insights(user_id, generated_at DESC);
-- Focus-area preference aggregation.
CREATE INDEX idx_generated_insights_user_focus
  ON generated_insights(user_id, focus_area);

-- Extend load_all_data() so the initial hydration round-trip includes
-- the last 60 insights (enough for the timeline view) without a
-- separate query on Dashboard mount.
CREATE OR REPLACE FUNCTION load_all_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_build_object(
    'profile',           COALESCE((SELECT row_to_json(p)::jsonb FROM profiles p WHERE p.id = uid), '{}'::jsonb),
    'medications',       COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM medications r WHERE r.user_id = uid), '[]'::jsonb),
    'conditions',        COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM conditions r WHERE r.user_id = uid), '[]'::jsonb),
    'allergies',         COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM allergies r WHERE r.user_id = uid), '[]'::jsonb),
    'providers',         COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM providers r WHERE r.user_id = uid), '[]'::jsonb),
    'pharmacies',        COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM pharmacies r WHERE r.user_id = uid), '[]'::jsonb),
    'vitals',            COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM vitals r WHERE r.user_id = uid), '[]'::jsonb),
    'appointments',      COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM appointments r WHERE r.user_id = uid), '[]'::jsonb),
    'journal_entries',   COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM journal_entries r WHERE r.user_id = uid), '[]'::jsonb),
    'labs',              COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM labs r WHERE r.user_id = uid), '[]'::jsonb),
    'procedures',        COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM procedures r WHERE r.user_id = uid), '[]'::jsonb),
    'immunizations',     COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM immunizations r WHERE r.user_id = uid), '[]'::jsonb),
    'care_gaps',         COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM care_gaps r WHERE r.user_id = uid), '[]'::jsonb),
    'anesthesia_flags',  COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM anesthesia_flags r WHERE r.user_id = uid), '[]'::jsonb),
    'appeals_and_disputes', COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM appeals_and_disputes r WHERE r.user_id = uid), '[]'::jsonb),
    'surgical_planning', COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM surgical_planning r WHERE r.user_id = uid), '[]'::jsonb),
    'insurance',         COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM insurance r WHERE r.user_id = uid), '[]'::jsonb),
    'insurance_claims',  COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM insurance_claims r WHERE r.user_id = uid), '[]'::jsonb),
    'drug_prices',       COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM drug_prices r WHERE r.user_id = uid), '[]'::jsonb),
    'todos',             COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM todos r WHERE r.user_id = uid), '[]'::jsonb),
    'cycles',            COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM cycles r WHERE r.user_id = uid), '[]'::jsonb),
    'activities',        COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM activities r WHERE r.user_id = uid), '[]'::jsonb),
    'genetic_results',   COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM genetic_results r WHERE r.user_id = uid), '[]'::jsonb),
    'feedback',          COALESCE((SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at) FROM feedback r WHERE r.user_id = uid), '[]'::jsonb),
    'generated_insights', COALESCE((
      SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.generated_at DESC)
      FROM (
        SELECT * FROM generated_insights
        WHERE user_id = uid
        ORDER BY generated_at DESC
        LIMIT 60
      ) r
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;
