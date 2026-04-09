-- 029_trim_beta_trial_to_30_days.sql
-- Reverts the over-eager 90-day beta trial back to 30 days. New signups
-- still get full Premium for the first month, which is plenty of time for
-- a beta tester to evaluate every feature. Users who want to keep going
-- after that can convert when billing opens.
--
-- Idempotent: safe to run whether or not 027_extend_beta_trial.sql has
-- already been applied.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, tier, trial_expires_at)
  VALUES (NEW.id, 'premium', now() + interval '30 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trim any active trial whose expiry is more than 30 days from now back
-- to 30 days. Permanent-premium (trial_expires_at IS NULL) and admin
-- accounts are left alone. Already-expired trials are also untouched.
UPDATE profiles
  SET trial_expires_at = now() + interval '30 days'
  WHERE tier = 'premium'
    AND trial_expires_at IS NOT NULL
    AND trial_expires_at > now() + interval '30 days';
