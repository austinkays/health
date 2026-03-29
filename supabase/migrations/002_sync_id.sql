-- Add sync_id to all health tables for MCP merge deduplication
-- sync_id is null for manually-created records
-- sync_id is a deterministic hash for MCP-synced records (e.g. "mcp-med-00a3f2k1")

ALTER TABLE medications ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE conditions ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE allergies ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS sync_id TEXT;

-- Composite indexes: user_id + sync_id for fast merge lookups
CREATE INDEX IF NOT EXISTS idx_medications_sync ON medications (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conditions_sync ON conditions (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_allergies_sync ON allergies (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_providers_sync ON providers (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vitals_sync ON vitals (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_sync ON appointments (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_sync ON journal_entries (user_id, sync_id) WHERE sync_id IS NOT NULL;
