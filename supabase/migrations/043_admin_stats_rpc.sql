-- 043: Admin stats aggregation RPC
--
-- A SECURITY DEFINER function that aggregates cross-user stats for the Admin
-- page so Austin can see whether beta testers are actually using the app.
-- Access is gated INSIDE the function by checking profiles.tier = 'admin' for
-- the calling auth.uid(). Non-admins get a hard exception (matches the pattern
-- we use elsewhere). The function is GRANTed to authenticated so regular Supabase
-- clients can call it, but the admin check inside is the actual gate.
--
-- Data sources:
--   - profiles         (total users, tier mix, signups, trial counts)
--   - usage_events     (DAU/WAU/MAU, section traffic, AI feature usage, top events)
--   - api_usage        (API call volume + token burn by endpoint)
--   - feedback         (summary counts — details live in the existing Admin feedback UI)
--
-- Performance notes:
--   - Every time window is capped (7d / 14d / 30d) so the function stays cheap
--     even as the tables grow. No full-table scans.
--   - Relies on existing indexes:
--       idx_usage_events_user_time   (user_id, created_at DESC)
--       idx_usage_events_event_time  (event, created_at DESC)
--       idx_api_usage_rate_limit     (user_id, endpoint, created_at DESC)
--   - DAU series uses a generate_series join so days with zero activity still
--     render as 0 in the sparkline instead of gaps.
--
-- Idempotent: CREATE OR REPLACE, safe to re-run.

CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Admin gate. Non-admins get nothing.
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND tier = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),

    -- ── User cohort ───────────────────────────────────────────────────────
    'users_total', (SELECT count(*) FROM profiles),
    'users_by_tier', (
      SELECT coalesce(jsonb_object_agg(tier, n), '{}'::jsonb)
      FROM (
        SELECT coalesce(tier, 'free') AS tier, count(*) AS n
        FROM profiles
        GROUP BY coalesce(tier, 'free')
      ) t
    ),
    'users_in_trial', (
      SELECT count(*) FROM profiles
      WHERE trial_expires_at IS NOT NULL AND trial_expires_at > now()
    ),
    'signups_last_7d', (
      SELECT count(*) FROM profiles
      WHERE created_at > now() - interval '7 days'
    ),
    'signups_last_30d', (
      SELECT count(*) FROM profiles
      WHERE created_at > now() - interval '30 days'
    ),

    -- ── Active users (from usage_events) ──────────────────────────────────
    'dau', (
      SELECT count(DISTINCT user_id) FROM usage_events
      WHERE created_at > now() - interval '24 hours'
    ),
    'wau', (
      SELECT count(DISTINCT user_id) FROM usage_events
      WHERE created_at > now() - interval '7 days'
    ),
    'mau', (
      SELECT count(DISTINCT user_id) FROM usage_events
      WHERE created_at > now() - interval '30 days'
    ),

    -- Daily-active-users sparkline (last 14 days, zero-filled)
    'dau_series_14d', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('date', day, 'users', users)
        ORDER BY day
      ), '[]'::jsonb)
      FROM (
        SELECT
          d::date AS day,
          (
            SELECT count(DISTINCT user_id)
            FROM usage_events
            WHERE created_at >= d AND created_at < d + interval '1 day'
          ) AS users
        FROM generate_series(
          date_trunc('day', now() - interval '13 days'),
          date_trunc('day', now()),
          interval '1 day'
        ) d
      ) s
    ),

    -- ── Event volume ──────────────────────────────────────────────────────
    'events_last_7d', (
      SELECT count(*) FROM usage_events
      WHERE created_at > now() - interval '7 days'
    ),
    'events_last_30d', (
      SELECT count(*) FROM usage_events
      WHERE created_at > now() - interval '30 days'
    ),

    -- Top events overall (last 30 days, top 30)
    'top_events_30d', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('event', event, 'count', n)
        ORDER BY n DESC
      ), '[]'::jsonb)
      FROM (
        SELECT event, count(*) AS n
        FROM usage_events
        WHERE created_at > now() - interval '30 days'
        GROUP BY event
        ORDER BY n DESC
        LIMIT 30
      ) e
    ),

    -- Section traffic (section_opened:*) last 30 days
    'sections_30d', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('section', section, 'count', n)
        ORDER BY n DESC
      ), '[]'::jsonb)
      FROM (
        SELECT split_part(event, ':', 2) AS section, count(*) AS n
        FROM usage_events
        WHERE event LIKE 'section_opened:%'
          AND created_at > now() - interval '30 days'
        GROUP BY split_part(event, ':', 2)
      ) s
    ),

    -- AI features used (ai_feature_run:*) last 30 days
    'ai_features_30d', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('feature', feature, 'count', n)
        ORDER BY n DESC
      ), '[]'::jsonb)
      FROM (
        SELECT split_part(event, ':', 2) AS feature, count(*) AS n
        FROM usage_events
        WHERE event LIKE 'ai_feature_run:%'
          AND created_at > now() - interval '30 days'
        GROUP BY split_part(event, ':', 2)
      ) a
    ),

    -- ── API usage (last 7 days) ───────────────────────────────────────────
    'api_calls_7d', (
      SELECT count(*) FROM api_usage
      WHERE created_at > now() - interval '7 days'
    ),
    'api_tokens_7d', (
      SELECT coalesce(sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0)), 0)::bigint
      FROM api_usage
      WHERE created_at > now() - interval '7 days'
    ),
    'api_by_endpoint_7d', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'endpoint', endpoint,
          'calls', calls,
          'tokens', tokens
        )
        ORDER BY calls DESC
      ), '[]'::jsonb)
      FROM (
        SELECT
          endpoint,
          count(*) AS calls,
          coalesce(sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0)), 0)::bigint AS tokens
        FROM api_usage
        WHERE created_at > now() - interval '7 days'
        GROUP BY endpoint
      ) x
    ),

    -- ── Feedback summary (details live in existing Admin UI) ──────────────
    'feedback_total', (SELECT count(*) FROM feedback),
    'feedback_unreviewed', (
      SELECT count(*) FROM feedback
      WHERE coalesce(status, 'open') = 'open'
    ),
    'feedback_by_type', (
      SELECT coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
      FROM (
        SELECT type, count(*) AS n FROM feedback GROUP BY type
      ) f
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_admin_stats() FROM public;
GRANT EXECUTE ON FUNCTION get_admin_stats() TO authenticated;

COMMENT ON FUNCTION get_admin_stats() IS
  'Cross-user aggregated stats for the Admin page. SECURITY DEFINER with an inline tier=''admin'' gate — non-admins get an exception.';
