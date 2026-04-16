-- Cloud-synced user preferences.
-- Stores UI settings (theme, dashboard layout, toggles) that should roam
-- across devices. localStorage remains the fast-read layer; this column
-- is the source of truth synced on login.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;
