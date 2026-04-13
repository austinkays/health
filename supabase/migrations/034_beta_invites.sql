-- 028_beta_invites.sql
-- Closed-beta invite gate. Users need a valid, unclaimed code to sign up.
-- The code is bound to a single account on first sign-in. Returning users
-- don't need a code (they sign in normally with their existing email).
--
-- This is a soft gate enforced by the frontend (Auth.jsx checks the code
-- via check_beta_invite() before sending the magic link, then claims it
-- via claim_beta_invite() after the user signs in for the first time).
-- It's not bulletproof against a determined attacker, but combined with
-- the Anthropic spend cap and per-user 8/day Sage limit it bounds the
-- worst-case cost of the beta.
--
-- After the beta: drop the table or set VITE_BETA_INVITE_REQUIRED=false in
-- Vercel env vars and the gate disappears.

CREATE TABLE IF NOT EXISTS beta_invites (
  code         text PRIMARY KEY,
  notes        text,                              -- "given to user @foo on r/ChronicIllness"
  claimed_by   uuid REFERENCES auth.users(id),
  claimed_at   timestamptz,
  reserved_email text,                            -- email that validated the code (pre-signin)
  reserved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS: anon can read NOTHING directly. They use the security-definer
-- functions below. Authenticated users also can't read (no need).
ALTER TABLE beta_invites ENABLE ROW LEVEL SECURITY;

-- ── check_beta_invite ────────────────────────────────────────────────────
-- Called by Auth.jsx (anon) before sending the magic link. Returns true if
-- the code exists and is unclaimed (or reserved by the same email already).
-- Side effect: marks the code as reserved by this email so a second user
-- can't validate the same code at the same time.
CREATE OR REPLACE FUNCTION public.check_beta_invite(code_in text, email_in text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_row beta_invites%ROWTYPE;
BEGIN
  SELECT * INTO found_row FROM beta_invites WHERE code = code_in;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Already claimed by another user
  IF found_row.claimed_by IS NOT NULL THEN RETURN false; END IF;

  -- Already reserved by a different email less than 30 minutes ago
  IF found_row.reserved_email IS NOT NULL
     AND found_row.reserved_email <> email_in
     AND found_row.reserved_at > now() - interval '30 minutes' THEN
    RETURN false;
  END IF;

  -- Reserve it for this email so concurrent attempts fail
  UPDATE beta_invites
    SET reserved_email = email_in, reserved_at = now()
    WHERE code = code_in;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_beta_invite(text, text) TO anon, authenticated;

-- ── claim_beta_invite ────────────────────────────────────────────────────
-- Called by App.jsx (authenticated) after a fresh signin. Permanently binds
-- the code to the current user. Idempotent — safe to call multiple times
-- with the same code/user combo.
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

  UPDATE beta_invites
    SET claimed_by = uid, claimed_at = now()
    WHERE code = code_in
      AND (claimed_by IS NULL OR claimed_by = uid);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_beta_invite(text) TO authenticated;

-- ── Sample seed codes (UNCOMMENT + EDIT before running) ──────────────────
-- INSERT INTO beta_invites (code, notes) VALUES
--   ('SPOONIE-A1B2', 'reserved for r/ChronicIllness post'),
--   ('SPOONIE-C3D4', 'reserved for r/ChronicPain post'),
--   ('SPOONIE-E5F6', 'reserved for r/POTS post'),
--   ('SPOONIE-G7H8', 'reserved for DM #1'),
--   ('SPOONIE-J9K0', 'reserved for DM #2'),
--   ('SPOONIE-L1M2', 'reserved for DM #3'),
--   ('SPOONIE-N3P4', 'reserved for DM #4'),
--   ('SPOONIE-Q5R6', 'reserved for DM #5'),
--   ('SPOONIE-S7T8', 'reserved for DM #6'),
--   ('SPOONIE-U9V0', 'reserved for DM #7');
