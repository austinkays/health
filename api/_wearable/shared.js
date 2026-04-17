// ── Shared helpers for per-provider wearable endpoints ────────────────
// Supabase service-role REST helpers, in-memory + persistent rate
// limiting, dedup checks, admin gate, and the CORS/auth preamble used
// by api/oura.js, api/fitbit.js, api/dexcom.js, api/withings.js, and
// api/whoop.js. Previously these lived inline at the top of
// api/wearable.js (removed 2026-04-17 when that router was split into
// per-provider endpoint files now that Vercel Pro lifts the 12-function
// Hobby ceiling).

import { checkPersistentRateLimit, logUsage } from '../_rateLimit.js';
import { verifyAuth } from '../_auth.js';
import { fetchWithTimeout } from '../_fetch.js';

export { fetchWithTimeout, logUsage };

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();

function checkMemoryRateLimit(userId, provider) {
  const key = `${userId}:${provider}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 5 * 60_000);

function basicAuthHeader(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

// ── Supabase service-role helpers for wearable_connections ─────────────
// Tokens live in Supabase so webhook handlers (which run without a user
// session) can act on the user's behalf. Writes use service-role REST
// calls to bypass RLS — the table has no INSERT/UPDATE policies for
// anon/authed roles, so this path is the only way rows get written.

function supabaseConfig() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function upsertWearableConnection(row) {
  const { url, key } = supabaseConfig();
  if (!url || !key) throw new Error('Supabase service role not configured');
  const res = await fetch(`${url}/rest/v1/wearable_connections?on_conflict=user_id,provider`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`wearable_connections upsert failed (${res.status}): ${err}`);
  }
  const rows = await res.json();
  return rows[0];
}

async function getWearableConnection(userId, provider) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  const res = await fetch(
    `${url}/rest/v1/wearable_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function deleteWearableConnection(userId, provider) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  await fetch(
    `${url}/rest/v1/wearable_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
    }
  );
}

async function getConnectionByProviderUserId(provider, providerUserId) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  const res = await fetch(
    `${url}/rest/v1/wearable_connections?provider=eq.${encodeURIComponent(provider)}&provider_user_id=eq.${encodeURIComponent(providerUserId)}&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function patchConnectionTokens(userId, provider, patch) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  await fetch(
    `${url}/rest/v1/wearable_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  ).catch(() => { /* best-effort */ });
}

async function touchConnectionWebhook(userId, provider) {
  const now = new Date().toISOString();
  await patchConnectionTokens(userId, provider, {
    last_webhook_at: now,
    last_sync_at: now,
  });
}

// Bulk vitals/activities upserts via service-role REST. Mirrors Terra's
// bulkInsertVitals/bulkInsertActivities pattern (api/terra.js:207). Each
// row should include user_id; we don't add it here so the caller can
// batch rows for different users in theory (today, only one user per
// webhook notification). Best-effort dedup uses pre-fetch + filter
// (per-row check) rather than DB UPSERT since the vitals table doesn't
// have a unique constraint on (user_id, date, type, source).

async function bulkInsertVitals(rows) {
  if (!rows.length) return;
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  await fetch(`${url}/rest/v1/vitals`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  }).catch(e => console.warn('[bulkInsertVitals] failed', e));
}

async function bulkInsertActivities(rows) {
  if (!rows.length) return;
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  await fetch(`${url}/rest/v1/activities`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  }).catch(e => console.warn('[bulkInsertActivities] failed', e));
}

// Per-row dedup: returns true if a vital with matching (user_id, date,
// type, source) already exists. Used to skip webhook-driven inserts
// when the user has already pulled the same day's data via legacy
// manual sync. Cheap because the vitals index covers (user_id, date).
async function vitalAlreadyExists(userId, date, type, source) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return false;
  const res = await fetch(
    `${url}/rest/v1/vitals?user_id=eq.${encodeURIComponent(userId)}&date=eq.${encodeURIComponent(date)}&type=eq.${encodeURIComponent(type)}&source=eq.${encodeURIComponent(source)}&limit=1&select=id`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

async function activityAlreadyExists(userId, date, type, source, durationMinutes) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return false;
  // Workouts dedup on (user_id, date, type, source, duration). Different
  // workouts on the same day have different durations.
  const res = await fetch(
    `${url}/rest/v1/activities?user_id=eq.${encodeURIComponent(userId)}&date=eq.${encodeURIComponent(date)}&type=eq.${encodeURIComponent(type)}&source=eq.${encodeURIComponent(source)}&duration_minutes=eq.${durationMinutes}&limit=1&select=id`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

// Server-side admin gate. Used by bootstrap endpoints that should only
// be callable by us (e.g. one-time Oura subscription setup). Mirrors
// the client-side isAdminActive() check but verified against Supabase
// with the service role — client-side localStorage tier overrides
// can't bypass this.
async function isAdminUser(userId) {
  const { url, key } = supabaseConfig();
  if (!url || !key || !userId) return false;
  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=tier&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows[0]?.tier === 'admin';
}

export {
  checkMemoryRateLimit,
  basicAuthHeader,
  supabaseConfig,
  upsertWearableConnection,
  getWearableConnection,
  deleteWearableConnection,
  getConnectionByProviderUserId,
  patchConnectionTokens,
  touchConnectionWebhook,
  bulkInsertVitals,
  bulkInsertActivities,
  vitalAlreadyExists,
  activityAlreadyExists,
  isAdminUser,
};

// ── CORS + auth + rate-limit wrapper ──────────────────────────────────
// Each provider endpoint's default export calls wrapProvider(req, res,
// '<provider>', providerHandle). Webhook fast-paths (Oura, Fitbit) run
// BEFORE this wrapper inside the provider file, since those calls come
// from the provider's servers and have no Salve auth token.
export async function wrapProvider(req, res, provider, handler) {
  const allowedOrigins = [
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.ALLOWED_ORIGIN,
    'http://localhost:5173',
  ].filter(Boolean);
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || (req.method === 'GET' ? 'data' : '');

  const userId = await verifyAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!checkMemoryRateLimit(userId, provider)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  if (!(await checkPersistentRateLimit(userId, provider, RATE_LIMIT_MAX, 60))) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  try {
    return await handler(action, req, res, userId);
  } catch (e) {
    if (e?.name === 'AbortError') return res.status(504).json({ error: `${provider} API timeout` });
    console.error(`[wearable:${provider}] Internal error`, e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
