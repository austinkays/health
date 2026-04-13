-- Add time column to vitals for intraday resolution
-- Allows storing hourly Apple Health readings (HR, SpO2, resp) with time of day
-- Manual entries leave this null; import-sourced entries set e.g. '08:00'
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS time TEXT;
