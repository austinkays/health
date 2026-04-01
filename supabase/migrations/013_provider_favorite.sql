-- Add is_favorite boolean to providers for pinning to top of list
ALTER TABLE providers ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;
