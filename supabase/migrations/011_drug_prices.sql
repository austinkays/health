-- Drug price snapshots from NADAC (National Average Drug Acquisition Cost)
-- Stores per-unit wholesale prices fetched via RxCUI → NDC → NADAC pipeline

CREATE TABLE IF NOT EXISTS drug_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_id UUID REFERENCES medications(id) ON DELETE SET NULL,
  rxcui TEXT NOT NULL,
  ndc TEXT NOT NULL,
  nadac_per_unit NUMERIC(10,4) NOT NULL,
  pricing_unit TEXT DEFAULT 'EA',
  drug_name TEXT DEFAULT '',
  effective_date DATE,
  as_of_date DATE,
  classification TEXT DEFAULT '', -- G=Generic, B=Brand
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_drug_prices_user ON drug_prices(user_id);
CREATE INDEX idx_drug_prices_med_fetched ON drug_prices(medication_id, fetched_at DESC);

-- RLS
ALTER TABLE drug_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own drug prices" ON drug_prices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own drug prices" ON drug_prices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own drug prices" ON drug_prices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own drug prices" ON drug_prices FOR DELETE USING (auth.uid() = user_id);

-- Auto-set user_id on insert
CREATE OR REPLACE FUNCTION set_drug_prices_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_drug_prices_user_id_trigger
  BEFORE INSERT ON drug_prices
  FOR EACH ROW EXECUTE FUNCTION set_drug_prices_user_id();

-- Auto-update updated_at
CREATE TRIGGER update_drug_prices_updated_at
  BEFORE UPDATE ON drug_prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE drug_prices;
