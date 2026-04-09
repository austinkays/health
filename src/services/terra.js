// src/services/terra.js
// Terra API client helpers. Terra is a unified data aggregator for ~50
// wearable & health platforms. The actual OAuth flow happens in Terra's
// hosted widget — we just generate the session URL and redirect there.
//
// Connections are persisted server-side via the terra_connections table.
// Webhook ingestion (api/terra-webhook.js) writes data into the user's
// vitals/activities tables as it arrives.

import { getAuthToken } from './token';
import { supabase } from './supabase';

/**
 * Generate a Terra widget session URL and redirect the user to it.
 * Terra's widget UI lets the user pick a provider and authorize it; on
 * success they're redirected back to TERRA_AUTH_SUCCESS_URL and Terra
 * fires an `auth` webhook to /api/terra-webhook to register the
 * connection on our side.
 *
 * @param {string[]} [providers] optional override of providers to show
 */
export async function startTerraConnect(providers) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch('/api/terra-widget', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(providers ? { providers } : {}),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Terra widget failed (${res.status})`);
  }

  const { url } = await res.json();
  if (!url) throw new Error('No widget URL returned');
  // Full redirect — Terra owns the OAuth flow page
  window.location.href = url;
}

/**
 * List the current user's Terra connections (one row per provider).
 * Returns an array of { provider, status, connected_at, last_sync_at }.
 */
export async function listTerraConnections() {
  const { data, error } = await supabase
    .from('terra_connections')
    .select('id, provider, status, connected_at, last_sync_at, terra_user_id')
    .order('connected_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Disconnect a Terra connection by its row id. Removes the local row;
 * the user's data already in vitals/activities is preserved.
 */
export async function disconnectTerraConnection(id) {
  const { error } = await supabase
    .from('terra_connections')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Friendly labels for the providers Terra exposes. Used in the UI to
// show "Fitbit" instead of "FITBIT".
export const PROVIDER_LABELS = {
  FITBIT: 'Fitbit',
  GARMIN: 'Garmin',
  WITHINGS: 'Withings',
  DEXCOM: 'Dexcom CGM',
  OURA: 'Oura Ring',
  POLAR: 'Polar',
  WHOOP: 'Whoop',
  GOOGLE: 'Google Fit',
  SAMSUNG: 'Samsung Health',
  PELOTON: 'Peloton',
  FREESTYLELIBRE: 'FreeStyle Libre',
  OMRON: 'Omron',
  EIGHTSLEEP: 'Eight Sleep',
  COROS: 'COROS',
  SUUNTO: 'Suunto',
  STRAVA: 'Strava',
  CONCEPT2: 'Concept2',
  WAHOO: 'Wahoo',
  IFIT: 'iFit',
  ZWIFT: 'Zwift',
};

export function providerLabel(provider) {
  if (!provider) return 'Unknown';
  return PROVIDER_LABELS[provider.toUpperCase()] || provider;
}

// Build-time flag — set VITE_TERRA_ENABLED=true in Vercel once a Terra
// account exists and the env vars (TERRA_DEV_ID, TERRA_API_KEY,
// TERRA_SIGNING_SECRET, TERRA_AUTH_SUCCESS_URL, TERRA_AUTH_FAILURE_URL)
// are configured. Until then, the UI hides the Connect with Terra card.
export const TERRA_ENABLED = import.meta.env.VITE_TERRA_ENABLED === 'true';
