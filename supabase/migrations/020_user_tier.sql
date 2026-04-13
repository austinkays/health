-- Add tier column to profiles for free/premium AI provider gating
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free', 'premium'));
