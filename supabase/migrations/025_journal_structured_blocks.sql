-- 025: Journal structured content blocks + medication adherence
-- Adds triggers, interventions, and adherence fields for richer journal entries.
-- Backward-compatible: existing entries get empty defaults.

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS triggers text NOT NULL DEFAULT '';
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS interventions text NOT NULL DEFAULT '';
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS adherence jsonb NOT NULL DEFAULT '{}'::jsonb;
