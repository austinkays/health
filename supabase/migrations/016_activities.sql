-- 016: Activities table for workout/exercise tracking (Apple Health import)
-- Tracks workouts, runs, walks, yoga, etc. with duration, distance, calories

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT '',
  duration_minutes numeric,
  distance numeric,
  calories numeric,
  heart_rate_avg numeric,
  source text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own activities" ON activities
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own activities" ON activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own activities" ON activities
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own activities" ON activities
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_activities_user_id
  BEFORE INSERT ON activities
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_activities_user ON activities(user_id);
CREATE INDEX idx_activities_date ON activities(user_id, date DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE activities;
