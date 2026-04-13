-- 024: Enhanced journal — structured symptoms, cross-links, gratitude
-- Adds per-symptom severity tracking, condition/medication links, and gratitude field.
-- Backward-compatible: existing entries get empty defaults.

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS symptoms jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS linked_conditions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS linked_meds jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS gratitude text NOT NULL DEFAULT '';
