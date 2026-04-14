-- 044: Admin stats v2 — cost tracking, tier-gate visibility, per-user drill-down
--
-- Extends migration 043's get_admin_stats() RPC with:
--   • Cost math (tokens × hardcoded per-endpoint prices → USD)
--   • chat_blocked_7d (tier-gate pressure signal — how many free users hit the wall)
--   • trial_expiring_7d (churn risk — trials ending within the next 7 days)
--   • users_by_activity_7d (top 20 most-active users with profile metadata for the
--     drill-down table; aggregate counts only, NO record content)
--
-- Adds a new RPC:
--   • get_admin_user_detail(p_user_id) — metadata-only per-user drill-down.
--     Returns profile, engagement counts, API cost, feedback list, and per-table
--     record_counts. Does NOT return any row content (no medication names, no
--     journal text, no vital values) — that's the PHI boundary.
--
-- Both functions are SECURITY DEFINER with an inline profiles.tier='admin' gate.
-- Idempotent: CREATE OR REPLACE, safe to re-run.
--
-- Pricing rationale (April 2026 public rates, per 1M tokens USD):
--   chat    → claude-sonnet-4-6 blended: $3.00 in / $15.00 out
--   gemini  → gemini-2.5-flash blended:  $0.075 in / $0.30 out
--   All other endpoints (wearables, free APIs, push, stripe) are $0.
--   Update via a new migration when provider prices change.

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

    -- Total cost 7d — sums (tokens_in × price_in + tokens_out × price_out)
    -- across every api_usage row in the last 7d. LEFT JOIN so unknown endpoints
    -- contribute $0 rather than NULL.
    'cost_7d_usd', (
      SELECT round(coalesce(sum(
        (coalesce(u.tokens_in, 0)::numeric / 1e6) * coalesce(p.price_in, 0) +
        (coalesce(u.tokens_out, 0)::numeric / 1e6) * coalesce(p.price_out, 0)
      ), 0)::numeric, 4)
      FROM api_usage u
      LEFT JOIN (VALUES
        ('chat',            3.0::numeric,  15.0::numeric),
        ('gemini',          0.075::numeric, 0.30::numeric)
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
        ('chat',            3.0::numeric,  15.0::numeric),
        ('gemini',          0.075::numeric, 0.30::numeric)
      ) p(endpoint, price_in, price_out) ON u.endpoint = p.endpoint
      WHERE u.created_at > now() - interval '30 days'
    ),

    -- Per-endpoint breakdown with calls, tokens, and cost
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
          ('chat',            3.0::numeric,  15.0::numeric),
          ('gemini',          0.075::numeric, 0.30::numeric)
        ) p(endpoint, price_in, price_out) ON u.endpoint = p.endpoint
        WHERE u.created_at > now() - interval '7 days'
        GROUP BY u.endpoint
      ) x
    ),

    -- Tier-gate pressure: free users who hit the premium wall in the last 7d
    'chat_blocked_7d', (
      SELECT count(*) FROM api_usage
      WHERE endpoint = 'chat_blocked'
        AND created_at > now() - interval '7 days'
    ),

    -- ── Top-active users (feeds the drill-down list in the Admin UI) ──────
    -- Aggregate counts + profile metadata only — NO record content. Top 20
    -- by usage_events count in the last 7 days, LEFT JOINed to profiles for
    -- names. SECURITY DEFINER makes this cross-user read safe.
    'users_by_activity_7d', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'name', name,
          'tier', tier,
          'trial_expires_at', trial_expires_at,
          'events', events,
          'last_active_at', last_active_at
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
          max(ue.created_at) AS last_active_at
        FROM usage_events ue
        LEFT JOIN profiles p ON p.id = ue.user_id
        WHERE ue.created_at > now() - interval '7 days'
        GROUP BY ue.user_id, p.name, p.tier, p.trial_expires_at
        ORDER BY events DESC
        LIMIT 20
      ) u
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

-- ── Per-user drill-down ────────────────────────────────────────────────────
-- Returns engagement metadata + record counts for one user. NEVER returns
-- record content — no medication names, no journal text, no vital values.
-- The Admin UI consumes this for the drill-down panel.

CREATE OR REPLACE FUNCTION get_admin_user_detail(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Admin gate — same inline check as get_admin_stats().
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND tier = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),

    -- ── Profile header ────────────────────────────────────────────────────
    -- Pull name/tier/trial from profiles, email from auth.users. No health
    -- data. The email is the only personally-identifying field and is
    -- already visible to the admin via the Supabase dashboard.
    'profile', (
      SELECT jsonb_build_object(
        'user_id', p.id,
        'name', p.name,
        'email', au.email,
        'tier', coalesce(p.tier, 'free'),
        'trial_expires_at', p.trial_expires_at,
        'created_at', p.created_at,
        'last_active_at', (
          SELECT max(created_at) FROM usage_events WHERE user_id = p.id
        )
      )
      FROM profiles p
      LEFT JOIN auth.users au ON au.id = p.id
      WHERE p.id = p_user_id
    ),

    -- ── Engagement (last 7 days) ──────────────────────────────────────────
    'usage_7d', jsonb_build_object(
      'events_total', (
        SELECT count(*) FROM usage_events
        WHERE user_id = p_user_id AND created_at > now() - interval '7 days'
      ),
      'sections', (
        SELECT coalesce(jsonb_agg(
          jsonb_build_object('section', section, 'count', n)
          ORDER BY n DESC
        ), '[]'::jsonb)
        FROM (
          SELECT split_part(event, ':', 2) AS section, count(*) AS n
          FROM usage_events
          WHERE user_id = p_user_id
            AND event LIKE 'section_opened:%'
            AND created_at > now() - interval '7 days'
          GROUP BY split_part(event, ':', 2)
          ORDER BY n DESC
          LIMIT 10
        ) s
      ),
      'ai_features', (
        SELECT coalesce(jsonb_agg(
          jsonb_build_object('feature', feature, 'count', n)
          ORDER BY n DESC
        ), '[]'::jsonb)
        FROM (
          SELECT split_part(event, ':', 2) AS feature, count(*) AS n
          FROM usage_events
          WHERE user_id = p_user_id
            AND event LIKE 'ai_feature_run:%'
            AND created_at > now() - interval '7 days'
          GROUP BY split_part(event, ':', 2)
          ORDER BY n DESC
          LIMIT 10
        ) a
      )
    ),

    -- ── API usage (last 7 days) ───────────────────────────────────────────
    'api_7d', jsonb_build_object(
      'calls_total', (
        SELECT count(*) FROM api_usage
        WHERE user_id = p_user_id AND created_at > now() - interval '7 days'
      ),
      'tokens_total', (
        SELECT coalesce(sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0)), 0)::bigint
        FROM api_usage
        WHERE user_id = p_user_id AND created_at > now() - interval '7 days'
      ),
      'cost_usd', (
        SELECT round(coalesce(sum(
          (coalesce(u.tokens_in, 0)::numeric / 1e6) * coalesce(p.price_in, 0) +
          (coalesce(u.tokens_out, 0)::numeric / 1e6) * coalesce(p.price_out, 0)
        ), 0)::numeric, 4)
        FROM api_usage u
        LEFT JOIN (VALUES
          ('chat',   3.0::numeric,  15.0::numeric),
          ('gemini', 0.075::numeric, 0.30::numeric)
        ) p(endpoint, price_in, price_out) ON u.endpoint = p.endpoint
        WHERE u.user_id = p_user_id AND u.created_at > now() - interval '7 days'
      ),
      'by_endpoint', (
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
              (coalesce(u.tokens_in, 0)::numeric / 1e6) * coalesce(pr.price_in, 0) +
              (coalesce(u.tokens_out, 0)::numeric / 1e6) * coalesce(pr.price_out, 0)
            ), 0)::numeric, 4) AS cost_usd
          FROM api_usage u
          LEFT JOIN (VALUES
            ('chat',   3.0::numeric,  15.0::numeric),
            ('gemini', 0.075::numeric, 0.30::numeric)
          ) pr(endpoint, price_in, price_out) ON u.endpoint = pr.endpoint
          WHERE u.user_id = p_user_id
            AND u.created_at > now() - interval '7 days'
          GROUP BY u.endpoint
        ) x
      )
    ),

    -- ── Feedback from this user (all-time) ────────────────────────────────
    -- Feedback content is user-authored product input, not PHI, so it's safe
    -- to return in full here for admin triage.
    'feedback', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'id', id,
          'type', type,
          'message', message,
          'status', coalesce(status, 'open'),
          'response', response,
          'responded_at', responded_at,
          'created_at', created_at
        )
        ORDER BY created_at DESC
      ), '[]'::jsonb)
      FROM feedback
      WHERE user_id = p_user_id
    ),

    -- ── Record counts (engagement proxy — NOT record content) ─────────────
    -- CRITICAL PHI BOUNDARY: each field is count(*) only. We never select
    -- any row content (no medication names, no journal text, no vitals values).
    -- If you're tempted to add a field that returns actual row data here,
    -- STOP and discuss with a maintainer first.
    'record_counts', jsonb_build_object(
      'medications',    (SELECT count(*) FROM medications    WHERE user_id = p_user_id),
      'conditions',     (SELECT count(*) FROM conditions     WHERE user_id = p_user_id),
      'allergies',      (SELECT count(*) FROM allergies      WHERE user_id = p_user_id),
      'providers',      (SELECT count(*) FROM providers      WHERE user_id = p_user_id),
      'vitals',         (SELECT count(*) FROM vitals         WHERE user_id = p_user_id),
      'appointments',   (SELECT count(*) FROM appointments   WHERE user_id = p_user_id),
      'journal',        (SELECT count(*) FROM journal_entries WHERE user_id = p_user_id),
      'labs',           (SELECT count(*) FROM labs           WHERE user_id = p_user_id),
      'todos',          (SELECT count(*) FROM todos          WHERE user_id = p_user_id),
      'activities',     (SELECT count(*) FROM activities     WHERE user_id = p_user_id),
      'cycles',         (SELECT count(*) FROM cycles         WHERE user_id = p_user_id)
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_admin_stats() FROM public;
GRANT EXECUTE ON FUNCTION get_admin_stats() TO authenticated;

REVOKE ALL ON FUNCTION get_admin_user_detail(uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_admin_user_detail(uuid) TO authenticated;

COMMENT ON FUNCTION get_admin_stats() IS
  'v2 — adds cost math, chat_blocked visibility, trial_expiring_7d, users_by_activity_7d. Admin-tier gated.';

COMMENT ON FUNCTION get_admin_user_detail(uuid) IS
  'Per-user drill-down for the Admin UI. Returns aggregate counts + engagement metadata only — NO record content. PHI boundary: never add fields that return health data row contents.';
