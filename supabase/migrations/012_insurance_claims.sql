-- 012: Insurance claims tracking
-- Tracks individual insurance claims with amounts and status

CREATE TABLE IF NOT EXISTS insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  billed_amount numeric(10,2),
  allowed_amount numeric(10,2),
  paid_amount numeric(10,2),
  patient_responsibility numeric(10,2),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','processing','paid','denied','appealed')),
  claim_number text NOT NULL DEFAULT '',
  insurance_plan text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insurance_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own claims" ON insurance_claims
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own claims" ON insurance_claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own claims" ON insurance_claims
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own claims" ON insurance_claims
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_insurance_claims_user_id
  BEFORE INSERT ON insurance_claims
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER update_insurance_claims_updated_at
  BEFORE UPDATE ON insurance_claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_insurance_claims_user ON insurance_claims(user_id);
CREATE INDEX idx_insurance_claims_date ON insurance_claims(user_id, date DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE insurance_claims;
