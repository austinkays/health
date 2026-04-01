-- 015: Cycle tracking for menstrual/fertility data
-- Tracks period days, ovulation, symptoms, and fertility markers

CREATE TABLE IF NOT EXISTS cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'period' CHECK (type IN ('period','ovulation','symptom','fertility_marker')),
  value text NOT NULL DEFAULT '',
  symptom text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own cycles" ON cycles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own cycles" ON cycles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own cycles" ON cycles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own cycles" ON cycles
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_cycles_user_id
  BEFORE INSERT ON cycles
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER update_cycles_updated_at
  BEFORE UPDATE ON cycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_cycles_user ON cycles(user_id);
CREATE INDEX idx_cycles_date ON cycles(user_id, date DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE cycles;
