-- Add fda_data JSONB column to medications for storing OpenFDA label data
-- Populated automatically when a medication is linked via RxCUI
-- Contains: brand_name, generic_name, pharm_class, manufacturer, warnings, contraindications, etc.
ALTER TABLE medications ADD COLUMN IF NOT EXISTS fda_data jsonb DEFAULT NULL;
