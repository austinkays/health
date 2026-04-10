-- 031: Expand cycles.type check constraint to include bbt and cervical_mucus
-- The app has been writing these types (CycleTracker BBT logging, Oura
-- temperature sync, Flo import cervical mucus entries) but the original
-- constraint from 015_cycles.sql only allowed period/ovulation/symptom/
-- fertility_marker, so Oura temperature sync was failing with:
--   new row for relation "cycles" violates check constraint "cycles_type_check"

ALTER TABLE cycles DROP CONSTRAINT IF EXISTS cycles_type_check;

ALTER TABLE cycles ADD CONSTRAINT cycles_type_check
  CHECK (type IN ('period','ovulation','symptom','fertility_marker','bbt','cervical_mucus'));
