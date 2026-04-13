-- 040_open_signup_beta_codes.sql
-- Opens signup to everyone (no invite code required) and repurposes beta
-- invite codes as premium trial grants. When a user redeems a code via
-- claim_beta_invite(), they get 14 days of premium access.
--
-- Pair with: set VITE_BETA_INVITE_REQUIRED=false in Vercel env vars.

-- 1. New signups get free tier (no auto-premium trial)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, tier, trial_expires_at)
  VALUES (NEW.id, 'free', NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Claiming a beta invite now grants a 14-day premium trial.
--    Idempotent: if the same user re-claims the same code, their trial
--    is NOT extended (claimed_by already matches, no profile update).
CREATE OR REPLACE FUNCTION public.claim_beta_invite(code_in text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  affected int;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RETURN false; END IF;

  -- Only claim if unclaimed or already owned by this user
  UPDATE beta_invites
    SET claimed_by = uid, claimed_at = now()
    WHERE code = code_in
      AND (claimed_by IS NULL OR claimed_by = uid);

  GET DIAGNOSTICS affected = ROW_COUNT;

  -- First-time claim: grant 14-day premium trial
  IF affected > 0 THEN
    UPDATE profiles
      SET tier = 'premium',
          trial_expires_at = now() + interval '14 days'
      WHERE id = uid
        AND (tier = 'free' OR (tier = 'premium' AND trial_expires_at IS NOT NULL AND trial_expires_at < now()));
        -- Only upgrade if currently free or trial-expired.
        -- Don't downgrade someone with permanent premium or an active longer trial.
  END IF;

  RETURN affected > 0;
END;
$$;
