-- 017: Pharmacogenomics / genetic results
-- Tracks gene variants, metabolizer phenotypes, and drug-gene interactions

CREATE TABLE IF NOT EXISTS genetic_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT '',
  gene text NOT NULL DEFAULT '',
  variant text NOT NULL DEFAULT '',
  phenotype text NOT NULL DEFAULT '',
  affected_drugs jsonb DEFAULT '[]'::jsonb,
  category text NOT NULL DEFAULT 'pharmacogenomic',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE genetic_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own genetic_results" ON genetic_results
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own genetic_results" ON genetic_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own genetic_results" ON genetic_results
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own genetic_results" ON genetic_results
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_genetic_results_user_id
  BEFORE INSERT ON genetic_results
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER update_genetic_results_updated_at
  BEFORE UPDATE ON genetic_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_genetic_results_user ON genetic_results(user_id);
CREATE INDEX idx_genetic_results_gene ON genetic_results(user_id, gene);

ALTER PUBLICATION supabase_realtime ADD TABLE genetic_results;
