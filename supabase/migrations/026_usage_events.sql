-- 026: Self-hosted, PHI-safe product analytics
--
-- Purpose: let Austin understand which Salve features get used vs. ignored so
-- he can iterate on the product. Everything stays inside the user's own Supabase
-- project — no third-party analytics vendors ever see this data.
--
-- DESIGN CONSTRAINTS (enforced at every layer — schema, RLS, client allowlist):
--   1. Event name only. NO properties. NO medication names, condition text, journal content, IDs.
--   2. Users can only write their own rows (RLS INSERT policy).
--   3. Users can only read their own rows (RLS SELECT policy) — so the user-facing
--      "my activity" view is possible without exposing other users' data.
--   4. Retention: 180 days. After that, rows are purged. Enough to spot seasonal
--      trends but not enough to reconstruct long-term behavior history.
--
-- The client-side allowlist (src/services/analytics.js) is the primary guard
-- against accidental PHI leaks. This schema is the backstop: even if a bug
-- sneaks a record_id into an event name, RLS ensures it can only ever be seen
-- by that user's own account.

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Event name is a short, enum-like identifier (e.g. 'section_opened:medications',
  -- 'ai_feature_run:insight'). Hard length cap prevents abuse.
  event text NOT NULL CHECK (length(event) <= 80 AND length(event) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own usage events" ON usage_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own usage events" ON usage_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policy for users — events are append-only from the client.
-- The retention cleanup runs as a SECURITY DEFINER function (below) that bypasses RLS.

-- Indexes:
--   (user_id, created_at desc) — primary query: "recent events for this user"
--   (event, created_at) — aggregate rollups: "how many section_opened:meds this week"
CREATE INDEX idx_usage_events_user_time ON usage_events(user_id, created_at DESC);
CREATE INDEX idx_usage_events_event_time ON usage_events(event, created_at DESC);

-- Auto-fill user_id on insert so clients never have to send it explicitly
-- (consistent with every other table in the app).
CREATE TRIGGER set_usage_events_user_id
  BEFORE INSERT ON usage_events
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

-- 180-day retention cleanup. Runs as SECURITY DEFINER so it can DELETE across
-- all users regardless of RLS. Call manually, from a Supabase cron job, or from
-- a Vercel serverless cron — whichever we set up later. Returns rows deleted
-- so we can log the cleanup.
CREATE OR REPLACE FUNCTION purge_old_usage_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM usage_events
  WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

COMMENT ON TABLE usage_events IS
  'PHI-safe product analytics. Event names only, no properties. 180-day retention via purge_old_usage_events().';
