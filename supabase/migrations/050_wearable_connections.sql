-- 050_wearable_connections.sql
-- Server-side OAuth state for direct wearable integrations (Fitbit first,
-- Oura next). Previously tokens lived in localStorage, which meant only the
-- browser could call the provider APIs — webhooks from Fitbit couldn't act
-- on the user's behalf because there was no server-reachable token.
--
-- This table holds access + refresh tokens in Supabase. Writes happen only
-- from server routes using the service role key (never from client code).
-- Users can SELECT and DELETE their own row via RLS, which powers the
-- "is this provider connected?" UI state + the Disconnect button.
--
-- One row per (user, provider). subscription_ids holds the Fitbit webhook
-- subscription IDs we registered on connect, so disconnect can cleanly
-- remove them from Fitbit's side.
--
-- Token storage is plaintext — same threat model as terra_connections
-- (migration 036). These are user-scoped API keys to Fitbit/Oura, not
-- credentials to Salve itself. RLS + service-role isolation is the
-- control; pgcrypto column encryption wouldn't meaningfully change the
-- breach surface since a leaked SUPABASE_SERVICE_ROLE_KEY compromises
-- both paths.

CREATE TABLE IF NOT EXISTS wearable_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN ('fitbit','oura')),
  provider_user_id  text NOT NULL,                           -- Fitbit encoded user id, Oura user uuid
  access_token      text NOT NULL,
  refresh_token     text,
  expires_at        timestamptz,
  scope             text,
  subscription_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,      -- Fitbit subscriptions registered on connect
  status            text NOT NULL DEFAULT 'connected',       -- 'connected' | 'disconnected' | 'error'
  last_webhook_at   timestamptz,
  last_sync_at      timestamptz,
  last_error        text,
  connected_at      timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One active connection per user per provider. Reconnecting upserts.
CREATE UNIQUE INDEX IF NOT EXISTS wearable_connections_user_provider_idx
  ON wearable_connections(user_id, provider);

-- Webhook lookup: incoming notification → find the Salve user.
CREATE INDEX IF NOT EXISTS wearable_connections_provider_user_idx
  ON wearable_connections(provider, provider_user_id);

-- updated_at trigger (matches terra_connections pattern)
CREATE OR REPLACE FUNCTION public.handle_wearable_connection_updated()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wearable_connections_updated_at ON wearable_connections;
CREATE TRIGGER wearable_connections_updated_at
  BEFORE UPDATE ON wearable_connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_wearable_connection_updated();

-- RLS: users can SELECT + DELETE their own row. No INSERT/UPDATE policies —
-- tokens only written via service-role from api/wearable.js (OAuth exchange,
-- webhook ingest, token refresh). The client never writes this table
-- directly, so no INSERT/UPDATE path from the browser is possible.
ALTER TABLE wearable_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wearable_connections_select_own" ON wearable_connections;
CREATE POLICY "wearable_connections_select_own" ON wearable_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wearable_connections_delete_own" ON wearable_connections;
CREATE POLICY "wearable_connections_delete_own" ON wearable_connections
  FOR DELETE USING (auth.uid() = user_id);
