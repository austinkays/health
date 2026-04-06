-- 021: In-app user feedback
-- Simple feedback/bug/suggestion table so users can contact the developer from within the app

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'feedback' CHECK (type IN ('feedback','bug','suggestion')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own feedback" ON feedback
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own feedback" ON feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own feedback" ON feedback
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_feedback_user_id
  BEFORE INSERT ON feedback
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER update_feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_feedback_user ON feedback(user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE feedback;
