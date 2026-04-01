-- 014: Health to-do's and reminders
-- Actionable items with priority, category, recurrence, and optional cross-references

-- Ensure helper functions exist (idempotent)
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS trigger AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  due_date text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  category text NOT NULL DEFAULT 'custom' CHECK (category IN ('medication','appointment','follow_up','insurance','lab','custom')),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  recurring text NOT NULL DEFAULT 'none' CHECK (recurring IN ('none','daily','weekly','monthly')),
  related_id uuid,
  related_table text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_suggested')),
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own todos" ON todos
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own todos" ON todos
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own todos" ON todos
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own todos" ON todos
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_todos_user_id
  BEFORE INSERT ON todos
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER update_todos_updated_at
  BEFORE UPDATE ON todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_todos_user ON todos(user_id);
CREATE INDEX idx_todos_due ON todos(user_id, due_date);

ALTER PUBLICATION supabase_realtime ADD TABLE todos;
