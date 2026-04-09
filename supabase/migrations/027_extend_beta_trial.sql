-- 027_extend_beta_trial.sql
-- During the closed beta we want every new signup to have full Premium
-- access for the duration of the beta, not just 14 days, so they never
-- bump into a paywall or feature lock while we're still gathering
-- feedback. This bumps the trigger to 90 days.
--
-- When billing goes live and we're ready to enforce trial expiry, drop
-- this back to '14 days' (or whatever the actual trial period should be)
-- and re-run the migration.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, tier, trial_expires_at)
  VALUES (NEW.id, 'premium', now() + interval '90 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: any existing user whose trial would have expired during the
-- beta period gets bumped to a fresh 90 days from now. Permanent-premium
-- users (trial_expires_at IS NULL) and admin users are left alone.
UPDATE profiles
  SET trial_expires_at = now() + interval '90 days'
  WHERE tier = 'premium'
    AND trial_expires_at IS NOT NULL
    AND trial_expires_at < now() + interval '90 days';
