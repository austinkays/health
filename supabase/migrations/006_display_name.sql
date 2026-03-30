-- Add display_name to medications for user-friendly casual names
-- The official 'name' field stays linked to RxNorm; display_name is what the user calls it
ALTER TABLE medications ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
