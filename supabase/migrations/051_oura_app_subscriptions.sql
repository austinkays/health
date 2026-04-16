-- 051_oura_app_subscriptions.sql
-- Oura Ring webhook subscription registry.
--
-- Unlike Fitbit (where subscriptions are per-user, one POST per user at
-- OAuth-connect time), Oura's webhook subscriptions are APP-scoped —
-- authenticated with client_id + client_secret, not a user access token.
-- One subscription covers every Salve user's data for that (event_type,
-- data_type) pair. Payloads include the Oura user_id so we match back
-- to wearable_connections.
--
-- Practically this means the table is a small app-level registry
-- (~7 rows max), not a per-user index. It's never read from the
-- browser — only the admin bootstrap endpoint and the renewal path
-- touch it, both via service-role.
--
-- Oura subscriptions expire (expiration_time is returned on create and
-- extended via PUT /v2/webhook/subscription/renew/{id}). A weekly
-- renewal path folded into api/wearable.js (to stay under the Vercel
-- Hobby 12-function ceiling) refreshes any row whose expiration_time
-- falls inside a 7-day window.
--
-- event_type is "create" | "update" | "delete" — which CRUD operation
-- on the data triggers the notification. data_type is the actual
-- collection (sleep, daily_readiness, daily_activity, etc.). We
-- subscribe to create-only in v1 and add update later if Oura
-- backfills/updates matter in practice.

CREATE TABLE IF NOT EXISTS oura_app_subscriptions (
  id                  text PRIMARY KEY,              -- Oura's subscription UUID (returned from create)
  event_type          text NOT NULL CHECK (event_type IN ('create','update','delete')),
  data_type           text NOT NULL,                  -- sleep | daily_sleep | daily_readiness | daily_activity | daily_spo2 | workout | daily_stress | ...
  callback_url        text NOT NULL,
  verification_token  text NOT NULL,                  -- we generate this, Oura echoes it on the verify challenge
  expiration_time     timestamptz,                    -- from Oura's response; renewal cron watches this
  status              text NOT NULL DEFAULT 'pending_verification',
                      -- 'pending_verification' | 'active' | 'expired' | 'error'
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Only one active subscription per (event_type, data_type) pair at a time.
-- Bootstrapping is idempotent: re-running skips rows that already exist.
CREATE UNIQUE INDEX IF NOT EXISTS oura_app_subscriptions_event_data_idx
  ON oura_app_subscriptions(event_type, data_type);

-- Index for the renewal path: find subs whose expiration window is near.
CREATE INDEX IF NOT EXISTS oura_app_subscriptions_expiration_idx
  ON oura_app_subscriptions(expiration_time);

-- updated_at trigger (matches terra_connections / wearable_connections pattern)
CREATE OR REPLACE FUNCTION public.handle_oura_app_subscription_updated()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS oura_app_subscriptions_updated_at ON oura_app_subscriptions;
CREATE TRIGGER oura_app_subscriptions_updated_at
  BEFORE UPDATE ON oura_app_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_oura_app_subscription_updated();

-- RLS: app-level table, never read from the browser. Enable with no
-- policies — that blocks all anon/authed access entirely, and service
-- role bypasses RLS by design. Defense in depth.
ALTER TABLE oura_app_subscriptions ENABLE ROW LEVEL SECURITY;
