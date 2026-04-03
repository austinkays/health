-- 018: Add source column to vitals + expand type check constraint for Oura/Apple Health integration

-- Add source column (oura, apple_health, manual, etc.)
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '';

-- Drop old type check constraint and add expanded one with spo2 and resp
ALTER TABLE vitals DROP CONSTRAINT IF EXISTS vitals_type_check;
ALTER TABLE vitals ADD CONSTRAINT vitals_type_check
  CHECK (type IN ('pain', 'mood', 'energy', 'sleep', 'bp', 'hr', 'weight', 'temp', 'glucose', 'spo2', 'resp', 'steps', 'active_energy'));
