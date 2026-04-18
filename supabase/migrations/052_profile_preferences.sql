-- Cross-device preference sync.
-- Before this migration, ~20 UI preference keys lived only in localStorage
-- (onboarding completion, barometer auto-log, theme, AI consent, dismissed tips,
-- starred dashboard tiles, cycle overlays, saved news/insights, etc.). The
-- result: users signing into the same account from multiple devices saw the
-- onboarding wizard, location prompt, and feature toggles reset on each browser.
--
-- This adds a single JSONB blob on profiles to hold those preferences. Values
-- are merged client-side (jsonb || patch) so per-key updates don't clobber
-- siblings, and the column inherits profile RLS so users only see their own.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
