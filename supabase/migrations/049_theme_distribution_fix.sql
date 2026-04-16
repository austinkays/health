-- 049_theme_distribution_fix.sql
--
-- Fixes the theme_distribution key in get_admin_stats() so it shows
-- *current* theme per user rather than total theme-change events.
--
-- Old approach: count(*) WHERE event LIKE 'theme_changed:%' (last 30 days)
--   → if each user only saved a theme once, every theme shows count = 1
--
-- New approach: DISTINCT ON (user_id) over both theme_changed and
--   theme_active events (ordered by most-recent first), then count users
--   per theme.  A companion change in App.jsx now emits theme_active:<id>
--   on every login, so users who never explicitly changed their theme
--   (still on the default 'lilac') are captured too.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
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
    'trial_expiring_7d', (
      SELECT count(*) FROM profiles
      WHERE trial_expires_at IS NOT NULL
        AND trial_expires_at > now()
        AND trial_expires_at <= now() + interval '7 days'
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

    -- ── Live users (last 5 minutes) ──────────────────────────────────────
    'active_now', (
      SELECT count(DISTINCT user_id) FROM usage_events
      WHERE created_at > now() - interval '5 minutes'
    ),

    -- ── Hourly usage distribution (7d, UTC hours 0–23) ───────────────────
    'hourly_distribution', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('hour', h, 'events', coalesce(e.cnt, 0), 'users', coalesce(e.uniq, 0))
        ORDER BY h
      ), '[]'::jsonb)
      FROM generate_series(0, 23) AS h
      LEFT JOIN (
        SELECT
          extract(hour FROM created_at)::int AS hr,
          count(*)                           AS cnt,
          count(DISTINCT user_id)            AS uniq
        FROM usage_events
        WHERE created_at > now() - interval '7 days'
        GROUP BY extract(hour FROM created_at)::int
      ) e ON e.hr = h
    ),

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

    'events_last_7d', (
      SELECT count(*) FROM usage_events
      WHERE created_at > now() - interval '7 days'
    ),
    'events_last_30d', (
      SELECT count(*) FROM usage_events
      WHERE created_at > now() - interval '30 days'
    ),

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

    'cost_7d_usd', (
      SELECT round(coalesce(sum(
        (coalesce(u.tokens_in, 0)::numeric / 1e6) * coalesce(p.price_in, 0) +
        (coalesce(u.tokens_out, 0)::numeric / 1e6) * coalesce(p.price_out, 0)
      ), 0)::numeric, 4)
      FROM api_usage u
      LEFT JOIN (VALUES
        ('chat',   3.0::numeric, 15.0::numeric),
        ('gemini', 0.075::numeric, 0.30::numeric)
      ) p(endpoint, price_in, price_out) ON u.endpoint = p.endpoint
      WHERE u.created_at > now() - interval '7 days'
    ),

    'cost_30d_usd', (
      SELECT round(coalesce(sum(
        (coalesce(u.tokens_in, 0)::numeric / 1e6) * coalesce(p.price_in, 0) +
        (coalesce(u.tokens_out, 0)::numeric / 1e6) * coalesce(p.price_out, 0)
      ), 0)::numeric, 4)
      FROM api_usage u
      LEFT JOIN (VALUES
        ('chat',   3.0::numeric, 15.0::numeric),
        ('gemini', 0.075::numeric, 0.30::numeric)
      ) p(endpoint, price_in, price_out) ON u.endpoint = p.endpoint
      WHERE u.created_at > now() - interval '30 days'
    ),

    'claude_cost_7d', (
      SELECT round(coalesce(sum(
        (coalesce(tokens_in, 0)::numeric / 1e6) * 3.0 +
        (coalesce(tokens_out, 0)::numeric / 1e6) * 15.0
      ), 0)::numeric, 4)
      FROM api_usage
      WHERE endpoint = 'chat'
        AND created_at > now() - interval '7 days'
    ),
    'claude_cost_30d', (
      SELECT round(coalesce(sum(
        (coalesce(tokens_in, 0)::numeric / 1e6) * 3.0 +
        (coalesce(tokens_out, 0)::numeric / 1e6) * 15.0
      ), 0)::numeric, 4)
      FROM api_usage
      WHERE endpoint = 'chat'
        AND created_at > now() - interval '30 days'
    ),
    'gemini_cost_7d', (
      SELECT round(coalesce(sum(
        (coalesce(tokens_in, 0)::numeric / 1e6) * 0.075 +
        (coalesce(tokens_out, 0)::numeric / 1e6) * 0.30
      ), 0)::numeric, 4)
      FROM api_usage
      WHERE endpoint = 'gemini'
        AND created_at > now() - interval '7 days'
    ),
    'gemini_cost_30d', (
      SELECT round(coalesce(sum(
        (coalesce(tokens_in, 0)::numeric / 1e6) * 0.075 +
        (coalesce(tokens_out, 0)::numeric / 1e6) * 0.30
      ), 0)::numeric, 4)
      FROM api_usage
      WHERE endpoint = 'gemini'
        AND created_at > now() - interval '30 days'
    ),

    'api_by_endpoint_7d', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'endpoint', endpoint,
          'calls', calls,
          'tokens', tokens,
          'cost_usd', cost_usd
        )
        ORDER BY calls DESC
      ), '[]'::jsonb)
      FROM (
        SELECT
          u.endpoint,
          count(*) AS calls,
          coalesce(sum(coalesce(u.tokens_in, 0) + coalesce(u.tokens_out, 0)), 0)::bigint AS tokens,
          round(coalesce(sum(
            (coalesce(u.tokens_in, 0)::numeric / 1e6) * coalesce(p.price_in, 0) +
            (coalesce(u.tokens_out, 0)::numeric / 1e6) * coalesce(p.price_out, 0)
          ), 0)::numeric, 4) AS cost_usd
        FROM api_usage u
        LEFT JOIN (VALUES
          ('chat',   3.0::numeric, 15.0::numeric),
          ('gemini', 0.075::numeric, 0.30::numeric)
        ) p(endpoint, price_in, price_out) ON u.endpoint = p.endpoint
        WHERE u.created_at > now() - interval '7 days'
        GROUP BY u.endpoint
      ) x
    ),

    'chat_blocked_7d', (
      SELECT count(*) FROM api_usage
      WHERE endpoint = 'chat_blocked'
        AND created_at > now() - interval '7 days'
    ),

    -- ── Top-active users + per-user unreviewed feedback count + claude cost ──
    'users_by_activity_7d', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'name', name,
          'tier', tier,
          'trial_expires_at', trial_expires_at,
          'events', events,
          'last_active_at', last_active_at,
          'unreviewed_feedback', unreviewed_feedback,
          'claude_cost_7d', claude_cost_7d
        )
        ORDER BY events DESC
      ), '[]'::jsonb)
      FROM (
        SELECT
          ue.user_id,
          p.name,
          coalesce(p.tier, 'free') AS tier,
          p.trial_expires_at,
          count(*) AS events,
          max(ue.created_at) AS last_active_at,
          (
            SELECT count(*) FROM feedback f
            WHERE f.user_id = ue.user_id
              AND coalesce(f.status, 'open') = 'open'
          ) AS unreviewed_feedback,
          (
            SELECT round(coalesce(sum(
              (coalesce(au.tokens_in, 0)::numeric / 1e6) * 3.0 +
              (coalesce(au.tokens_out, 0)::numeric / 1e6) * 15.0
            ), 0)::numeric, 4)
            FROM api_usage au
            WHERE au.user_id = ue.user_id
              AND au.endpoint = 'chat'
              AND au.created_at > now() - interval '7 days'
          ) AS claude_cost_7d
        FROM usage_events ue
        LEFT JOIN profiles p ON p.id = ue.user_id
        WHERE ue.created_at > now() - interval '7 days'
        GROUP BY ue.user_id, p.name, p.tier, p.trial_expires_at
        ORDER BY events DESC
        LIMIT 20
      ) u
    ),

    -- ── Theme distribution (current theme per user) ────────────────────────
    -- Uses DISTINCT ON (user_id) to find each user's most-recent theme event
    -- (either theme_active emitted on login, or theme_changed when they pick
    -- a new theme), then counts users per theme.  No time filter so users who
    -- haven't changed themes recently are still represented.
    'theme_distribution', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('theme', theme, 'count', n)
        ORDER BY n DESC
      ), '[]'::jsonb)
      FROM (
        SELECT theme, count(*) AS n
        FROM (
          SELECT DISTINCT ON (user_id) split_part(event, ':', 2) AS theme
          FROM usage_events
          WHERE event LIKE 'theme_changed:%' OR event LIKE 'theme_active:%'
          ORDER BY user_id, created_at DESC
        ) latest_per_user
        GROUP BY theme
        ORDER BY n DESC
      ) t
    ),

    -- ── Feedback summary ──────────────────────────────────────────────────
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
  'v6 — theme_distribution now counts current theme per user (DISTINCT ON latest event) instead of total change events.';
