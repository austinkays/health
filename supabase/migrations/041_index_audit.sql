-- 041_index_audit.sql
-- Performance indexes identified during production audit.
-- Critical: composite indexes for high-volume filtered queries (vitals chart,
-- cycle calendar). Basic user_id indexes for RLS performance on tables that
-- were missing them.

-- Vitals: every chart filters by type (HR, sleep, bp, etc.) AND date range.
-- Without this, queries scan ALL vital types for a user before filtering.
CREATE INDEX IF NOT EXISTS idx_vitals_user_type_date ON vitals (user_id, type, date DESC);

-- Cycles: calendar view filters by type (period/bbt/cervical_mucus/etc.)
CREATE INDEX IF NOT EXISTS idx_cycles_user_type_date ON cycles (user_id, type, date DESC);

-- Missing basic user_id indexes — RLS policies filter on auth.uid() = user_id,
-- so without an index PostgreSQL does a sequential scan on every query.
CREATE INDEX IF NOT EXISTS idx_labs_user ON labs (user_id);
CREATE INDEX IF NOT EXISTS idx_immunizations_user ON immunizations (user_id);
CREATE INDEX IF NOT EXISTS idx_insurance_user ON insurance (user_id);
CREATE INDEX IF NOT EXISTS idx_procedures_user ON procedures (user_id);
CREATE INDEX IF NOT EXISTS idx_anesthesia_flags_user ON anesthesia_flags (user_id);
CREATE INDEX IF NOT EXISTS idx_surgical_planning_user ON surgical_planning (user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals_and_disputes (user_id);
CREATE INDEX IF NOT EXISTS idx_care_gaps_user ON care_gaps (user_id);
