-- 026: Insight ratings — thumbs up/down on AI-generated content
-- Tracks which patterns, insights, chat responses, and news users find useful.

CREATE TABLE IF NOT EXISTS insight_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface IN ('pattern','insight','chat','news','connections','resources','costs','cycle_patterns','monthly_summary')),
  content_key text NOT NULL,  -- e.g. pattern ID, feature type, message index
  rating smallint NOT NULL CHECK (rating IN (-1, 1)),  -- -1 = down, 1 = up
  metadata jsonb,  -- optional: insight category, pattern type, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insight_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own ratings" ON insight_ratings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own ratings" ON insight_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own ratings" ON insight_ratings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own ratings" ON insight_ratings
  FOR DELETE USING (auth.uid() = user_id);

-- One rating per user per surface+content_key (upsert pattern)
CREATE UNIQUE INDEX idx_insight_ratings_unique ON insight_ratings(user_id, surface, content_key);
CREATE INDEX idx_insight_ratings_user ON insight_ratings(user_id);

CREATE TRIGGER set_insight_ratings_user_id
  BEFORE INSERT ON insight_ratings
  FOR EACH ROW EXECUTE FUNCTION set_user_id();
