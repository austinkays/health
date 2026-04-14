-- 045: Admin panel v3 — provider cost split, beta invite management, delete actions
--
-- This migration pairs with iteration 3 of the admin panel. Everything here
-- is idempotent (CREATE OR REPLACE, DROP POLICY IF EXISTS) so it's safe to
-- re-run.
--
-- New capabilities:
--   1. get_admin_stats() now returns per-provider cost (claude_*, gemini_*)
--      so the UI can stop doing the math, and users_by_activity_7d rows now
--      carry an unreviewed_feedback count so the user list can render a flag.
--   2. New RPCs for beta invite management:
--        - get_admin_beta_invites()    — list all codes with claimed user info
--        - create_admin_beta_invite()  — admin-only insert
--        - delete_admin_beta_invite()  — admin-only delete, UNCLAIMED ONLY
--   3. New RLS policy "Admins delete all feedback" — mirrors the UPDATE
--      policy from migration 042 so admins can hard-delete triaged spam
--      or duplicates. Users still can't delete other users' rows.
--
-- Safety notes:
--   - delete_admin_beta_invite() refuses to delete claimed codes. This
--     preserves the audit trail of who was given access. The user's tier
--     in the profiles table is untouched either way — deleting a code
--     never revokes premium.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Feedback delete policy (mirrors migration 042's UPDATE pattern)
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins delete all feedback" ON feedback;
CREATE POLICY "Admins delete all feedback" ON feedback
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.tier = 'admin'
    )
  );

-- ════════════════════════════════════════════════════════════════════════
-- 2. get_admin_stats() — add per-provider costs + per-user unreviewed
--    feedback counts so UserRow can render an unread flag without a
--    second round trip.
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

    -- Total cost (both providers combined) — kept for backward compat
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

    -- NEW in v3: per-provider cost. Claude is the paid one that actually
    -- matters for beta-code math; Gemini stays free and is shown as context.
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
    -- Added in v3: unreviewed_feedback and claude_cost_7d per user so the
    -- UserRow can flag unread feedback AND surface who's burning the
    -- paid-provider budget at a glance. claude_cost_7d per-user tells you
    -- "if I give out 10 more codes like this person, does it stay cheap?"
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

-- ════════════════════════════════════════════════════════════════════════
-- 3. Beta invite management RPCs (admin-gated SECURITY DEFINER)
-- ════════════════════════════════════════════════════════════════════════

-- List all beta invites with claimed user info. Joins across auth.users
-- (for email) and profiles (for name) so the admin UI gets everything
-- in one call. No RLS needed — the function itself is the access gate.
CREATE OR REPLACE FUNCTION get_admin_beta_invites()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND tier = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'code', bi.code,
        'notes', bi.notes,
        'claimed_by', bi.claimed_by,
        'claimed_at', bi.claimed_at,
        'reserved_email', bi.reserved_email,
        'reserved_at', bi.reserved_at,
        'created_at', bi.created_at,
        'claimed_user_name', p.name,
        'claimed_user_email', au.email,
        'claimed_user_tier', coalesce(p.tier, 'free'),
        'claimed_user_trial_expires_at', p.trial_expires_at
      )
      ORDER BY bi.created_at DESC
    ), '[]'::jsonb)
    FROM beta_invites bi
    LEFT JOIN profiles p    ON p.id = bi.claimed_by
    LEFT JOIN auth.users au ON au.id = bi.claimed_by
  );
END;
$$;

-- Create a new beta invite code. The admin UI passes the generated code
-- and optional notes. Enforces code format: non-empty, max 40 chars,
-- plus anti-overwrite guard in case of a duplicate.
CREATE OR REPLACE FUNCTION create_admin_beta_invite(code_in text, notes_in text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted beta_invites%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND tier = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF code_in IS NULL OR length(trim(code_in)) = 0 THEN
    RAISE EXCEPTION 'Code is required';
  END IF;
  IF length(code_in) > 40 THEN
    RAISE EXCEPTION 'Code too long (max 40 chars)';
  END IF;

  BEGIN
    INSERT INTO beta_invites (code, notes)
    VALUES (trim(code_in), notes_in)
    RETURNING * INTO inserted;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Code already exists: %', code_in;
  END;

  RETURN jsonb_build_object(
    'code', inserted.code,
    'notes', inserted.notes,
    'created_at', inserted.created_at
  );
END;
$$;

-- Delete a beta invite. SAFETY: refuses to delete codes that have been
-- claimed, so the audit trail of "who got access" is preserved. Deleting
-- a code never touches the user's profile row — their tier/trial status
-- is independent of this table.
CREATE OR REPLACE FUNCTION delete_admin_beta_invite(code_in text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_row beta_invites%ROWTYPE;
  affected int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND tier = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO found_row FROM beta_invites WHERE code = code_in;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code not found: %', code_in;
  END IF;

  IF found_row.claimed_by IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete claimed code — would orphan the audit trail';
  END IF;

  DELETE FROM beta_invites WHERE code = code_in AND claimed_by IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 4. Grants
-- ════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION get_admin_stats()              FROM public;
REVOKE ALL ON FUNCTION get_admin_beta_invites()       FROM public;
REVOKE ALL ON FUNCTION create_admin_beta_invite(text, text) FROM public;
REVOKE ALL ON FUNCTION delete_admin_beta_invite(text) FROM public;

GRANT EXECUTE ON FUNCTION get_admin_stats()              TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_beta_invites()       TO authenticated;
GRANT EXECUTE ON FUNCTION create_admin_beta_invite(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_admin_beta_invite(text) TO authenticated;

COMMENT ON FUNCTION get_admin_stats() IS
  'v3 — adds per-provider costs (claude_* / gemini_*) and users_by_activity_7d now carries unreviewed_feedback + per-user claude_cost_7d.';

COMMENT ON FUNCTION get_admin_beta_invites() IS
  'Admin panel beta invite list. Returns all codes with claimed user info joined from profiles + auth.users.';

COMMENT ON FUNCTION create_admin_beta_invite(text, text) IS
  'Admin-only: creates a new unclaimed beta invite code.';

COMMENT ON FUNCTION delete_admin_beta_invite(text) IS
  'Admin-only: deletes an UNCLAIMED beta invite code. Refuses to delete claimed codes to preserve the audit trail.';
