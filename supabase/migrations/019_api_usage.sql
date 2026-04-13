-- 018: API usage tracking for persistent rate limiting
-- Logs every API call with optional token counts (for chat/AI endpoint)

CREATE TABLE IF NOT EXISTS api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  tokens_in int,
  tokens_out int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage (for potential usage dashboards)
CREATE POLICY "Users see own api_usage" ON api_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role inserts (from API endpoints), so no INSERT policy for users
-- The service_role key bypasses RLS anyway

-- Index for efficient rate limit queries: find recent requests by user+endpoint
CREATE INDEX idx_api_usage_rate_limit ON api_usage(user_id, endpoint, created_at DESC);

-- Auto-cleanup: delete rows older than 90 days (run via pg_cron or manual)
-- For now, just the index keeps queries fast even with growth

-- Helper function: check if a user is within rate limit
-- Returns TRUE if allowed, FALSE if rate limited
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_max_requests int,
  p_window_seconds int
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*) < p_max_requests
  FROM api_usage
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND created_at > now() - (p_window_seconds || ' seconds')::interval;
$$;
