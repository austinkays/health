-- 020_trial_expires_at.sql
-- Adds a 14-day auto-trial on new signups: every new account starts with
-- tier='premium' + trial_expires_at = now() + 14 days. When the timestamp
-- passes, server tier check treats the account as effectively 'free'.
-- trial_expires_at = NULL means permanent premium (no expiry).

-- 1. Add the column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz;

-- 2. Update the signup trigger so new users start on a 14-day premium trial
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, tier, trial_expires_at)
  VALUES (NEW.id, 'premium', now() + interval '14 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Backfill existing users — anyone already on the app gets permanent premium.
-- trial_expires_at = NULL signals "no expiry, never downgrade".
-- Adjust the WHERE clause before running in production if you want different
-- behavior for different users.
UPDATE profiles
  SET tier = 'premium', trial_expires_at = NULL
  WHERE tier = 'free' OR tier = 'premium';

-- 4. Helper function for the server-side tier check. Returns true when the
-- account has active premium access (permanent or trial not yet expired).
-- Used by api/chat.js and any other premium-gated endpoint.
CREATE OR REPLACE FUNCTION public.is_premium_active(user_id_in uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id_in
      AND tier = 'premium'
      AND (trial_expires_at IS NULL OR trial_expires_at > now())
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
