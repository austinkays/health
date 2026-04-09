-- 030_terra_connections.sql
-- Terra API integration. Terra is a unified data aggregator that handles
-- OAuth + data ingestion for ~50 wearable & health platforms (Fitbit,
-- Garmin, Whoop, Withings, Dexcom, Polar, Oura, Suunto, Coros, etc.).
--
-- One row per (user, provider). The terra_user_id is the unique ID Terra
-- assigns to each authorized provider connection — webhooks reference it,
-- so we look up our user_id by joining on terra_user_id.

CREATE TABLE IF NOT EXISTS terra_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terra_user_id   text NOT NULL UNIQUE,        -- Terra's per-connection ID
  provider        text NOT NULL,                -- 'FITBIT', 'GARMIN', 'DEXCOM', etc.
  scopes          text,                         -- comma-separated, optional
  reference_id    text,                         -- value we passed to Terra (= our user_id)
  status          text NOT NULL DEFAULT 'connected', -- 'connected' | 'disconnected' | 'error'
  last_webhook_at timestamptz,
  last_sync_at    timestamptz,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS terra_connections_user_id_idx ON terra_connections(user_id);
CREATE INDEX IF NOT EXISTS terra_connections_terra_user_id_idx ON terra_connections(terra_user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_terra_connection_updated()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS terra_connections_updated_at ON terra_connections;
CREATE TRIGGER terra_connections_updated_at
  BEFORE UPDATE ON terra_connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_terra_connection_updated();

-- RLS: users can only see their own connections. Webhooks use the service
-- role key which bypasses RLS, so they can write rows for any user.
ALTER TABLE terra_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "terra_connections_select_own" ON terra_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "terra_connections_delete_own" ON terra_connections
  FOR DELETE USING (auth.uid() = user_id);
