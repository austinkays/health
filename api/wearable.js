// ── Unified wearable API proxy ──
// One Vercel function that routes OAuth2 token/refresh/data calls to all
// supported wearable providers via ?provider= query param. Consolidated to
// stay under the Vercel Hobby tier 12-function limit.
//
// Supported providers (all free, all OAuth2):
//   • oura     — Oura Ring (sleep, readiness, temperature, workouts)
//   • dexcom   — Dexcom CGM (continuous glucose monitoring)
//   • withings — Withings (smart scale, BP cuff, sleep mat, thermometer)
//   • fitbit   — Fitbit (sleep, HR, steps, weight)
//   • whoop    — Whoop (HRV, recovery score, sleep)
//
// Routing:
//   ?provider=<name>&action=token   POST → exchange auth code for tokens
//   ?provider=<name>&action=refresh POST → refresh expired access token
//   ?provider=<name>&action=data    GET  → proxy data request to provider
//   ?provider=<name>&action=config  GET  → return client_id + configured
//
// Each provider has a self-contained handler block below. Shared
// boilerplate (CORS, auth, rate limit, fetch helper) is at the top.

import { checkPersistentRateLimit, logUsage } from './_rateLimit.js';
import { verifyAuth } from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
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

// ── Oura app subscription registry helpers ─────────────────────────────
// Unlike per-user wearable_connections, these rows are app-level — one
// per (event_type, data_type) pair. The bootstrap endpoint creates them
// once against Oura's API; the weekly renewal path refreshes them.

async function upsertOuraSubscription(row) {
  const { url, key } = supabaseConfig();
  if (!url || !key) throw new Error('Supabase service role not configured');
  const res = await fetch(`${url}/rest/v1/oura_app_subscriptions?on_conflict=event_type,data_type`, {
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
    throw new Error(`oura_app_subscriptions upsert failed (${res.status}): ${err}`);
  }
  const rows = await res.json();
  return rows[0];
}

async function getOuraSubscriptionByEventData(eventType, dataType) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  const res = await fetch(
    `${url}/rest/v1/oura_app_subscriptions?event_type=eq.${encodeURIComponent(eventType)}&data_type=eq.${encodeURIComponent(dataType)}&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

// ════════════════════════════════════════════════════════════════════════
// ── Oura ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';
const OURA_WEBHOOK_API_BASE = 'https://api.ouraring.com/v2/webhook';

// Data types we subscribe to. event_type is always 'create' in v1 —
// we want to know when NEW data arrives. Add 'update' subscriptions
// later if we find Oura backfills/updates existing records often
// enough to matter for our timeline display.
const OURA_SUBSCRIBE_MATRIX = [
  { event_type: 'create', data_type: 'sleep' },
  { event_type: 'create', data_type: 'daily_sleep' },
  { event_type: 'create', data_type: 'daily_readiness' },
  { event_type: 'create', data_type: 'daily_activity' },
  { event_type: 'create', data_type: 'daily_spo2' },
  { event_type: 'create', data_type: 'workout' },
  { event_type: 'create', data_type: 'daily_stress' },
];

// ── Oura webhook ingestion helpers ─────────────────────────────────
// Server-side equivalents of the transforms in src/services/oura.js.
// Phase 3 of the live-push migration uses these to take an incoming
// notification, fetch the relevant record from Oura, and upsert into
// vitals/activities so the user sees fresh data without manual sync.

// Refresh the connection's access token if it expires within 5 minutes,
// then return a usable token. Persists the new token + refresh_token
// (Oura's are single-use) back to wearable_connections via service-role.
async function getValidOuraAccessToken(conn) {
  const expiresAt = conn.expires_at ? Date.parse(conn.expires_at) : 0;
  const now = Date.now();
  if (expiresAt && expiresAt - now > 5 * 60 * 1000) {
    return conn.access_token;
  }

  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  if (!clientId || !clientSecret || !conn.refresh_token) return conn.access_token;

  const res = await fetchWithTimeout(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
      client_id: clientId, client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.warn('[oura:refresh] failed', res.status, err);
    return conn.access_token;
  }
  const tokens = await res.json();
  const expiresIn = Number.isFinite(Number(tokens.expires_in)) && Number(tokens.expires_in) > 0
    ? Number(tokens.expires_in) : 86400;
  await patchConnectionTokens(conn.user_id, 'oura', {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  });
  return tokens.access_token;
}

// Fetch one specific record from Oura by id. Endpoint URL depends on
// the data_type from the notification.
async function fetchOuraRecord(token, dataType, objectId) {
  // Map data_type → endpoint name. For most types they match 1:1.
  const endpoint = dataType; // sleep, daily_sleep, daily_readiness, daily_activity, daily_spo2, workout, daily_stress
  const url = `${OURA_API_BASE}/${endpoint}/${encodeURIComponent(objectId)}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Oura API ${dataType}/${objectId} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Transform an Oura record into Salve vitals/activities row(s).
// Returns { vitals: [...], activities: [...] }. Each row is missing
// user_id; the caller adds it before insert.
//
// Mirrors the field shapes used by the legacy client-side syncOura*
// functions in src/services/oura.js so Vitals/Activities charts render
// identically whether the data arrived via webhook or manual sync.
function transformOuraRecord(dataType, record) {
  const out = { vitals: [], activities: [] };
  if (!record || typeof record !== 'object') return out;

  switch (dataType) {
    case 'sleep': {
      // Long-form sleep session. total_sleep_duration in seconds.
      const day = record.day || (record.bedtime_end || '').slice(0, 10);
      const totalSec = Number(record.total_sleep_duration) || 0;
      if (day && totalSec > 0) {
        const hrs = Math.round((totalSec / 3600) * 10) / 10;
        out.vitals.push({
          date: day, type: 'sleep', value: String(hrs), value2: '', unit: 'hrs',
          source: 'oura', notes: '',
        });
      }
      // HR average from sleep session — useful resting HR proxy.
      const avgHr = Number(record.average_heart_rate);
      if (day && Number.isFinite(avgHr) && avgHr > 0) {
        out.vitals.push({
          date: day, type: 'hr', value: String(Math.round(avgHr)), value2: '', unit: 'bpm',
          source: 'oura', notes: 'Resting (sleep avg from Oura)',
        });
      }
      break;
    }
    case 'daily_activity': {
      const day = record.day;
      const steps = Number(record.steps);
      const activeCal = Number(record.active_calories);
      if (day && Number.isFinite(steps) && steps > 0) {
        out.vitals.push({
          date: day, type: 'steps', value: String(steps), value2: '', unit: 'steps',
          source: 'oura', notes: '',
        });
      }
      if (day && Number.isFinite(activeCal) && activeCal > 0) {
        out.vitals.push({
          date: day, type: 'active_energy', value: String(activeCal), value2: '', unit: 'cal',
          source: 'oura', notes: '',
        });
      }
      break;
    }
    case 'daily_spo2': {
      const day = record.day;
      const avg = record?.spo2_percentage?.average;
      if (day && Number.isFinite(Number(avg))) {
        out.vitals.push({
          date: day, type: 'spo2', value: String(Math.round(Number(avg) * 10) / 10),
          value2: '', unit: '%', source: 'oura', notes: '',
        });
      }
      break;
    }
    case 'workout': {
      const day = record.day;
      const start = record.start_datetime ? Date.parse(record.start_datetime) : null;
      const end = record.end_datetime ? Date.parse(record.end_datetime) : null;
      const durationMin = (start && end && end > start) ? Math.round((end - start) / 60000) : 0;
      const calories = Number(record.calories);
      const distance = Number(record.distance);
      if (day && record.activity) {
        out.activities.push({
          date: day,
          type: String(record.activity).toLowerCase(),
          duration_minutes: durationMin,
          distance: Number.isFinite(distance) && distance > 0 ? distance : null,
          calories: Number.isFinite(calories) && calories > 0 ? Math.round(calories) : null,
          heart_rate_avg: null,
          source: 'oura',
          notes: record.label || '',
        });
      }
      break;
    }
    // daily_sleep / daily_readiness / daily_stress: no clean mapping to
    // existing vital types yet. Log-only for now (handled in webhook
    // POST branch). Add new vital types + transforms here when desired.
    default:
      break;
  }

  return out;
}

function ouraWebhookCallbackUrl(req) {
  // Explicit env wins — set OURA_WEBHOOK_CALLBACK_URL in prod to lock the
  // callback to the production domain even if we run a preview deploy.
  if (process.env.OURA_WEBHOOK_CALLBACK_URL) {
    return process.env.OURA_WEBHOOK_CALLBACK_URL;
  }
  // Use a query-string-free path so Oura (which strips query strings from
  // callback URLs during the verification challenge) actually reaches our
  // handler. /api/oura-webhook is rewritten in vercel.json to
  // /api/wearable?provider=oura&action=webhook, so internally the same
  // handler runs but Oura sees a clean path.
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}/api/oura-webhook`;
}

async function ouraHandle(action, req, res, userId) {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;

  if (action === 'config') {
    return res.json({ client_id: clientId || null, configured: !!(clientId && clientSecret) });
  }

  if (action === 'token') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Oura not configured' });
    const { code, redirect_uri } = req.body || {};
    if (!code || !redirect_uri) return res.status(400).json({ error: 'Missing code or redirect_uri' });

    const tokenRes = await fetchWithTimeout(OURA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri,
        client_id: clientId, client_secret: clientSecret,
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(tokenRes.status).json({ error: 'Token exchange failed', details: err });
    }
    const tokens = await tokenRes.json();
    logUsage(userId, 'oura');

    // Persist tokens in Supabase so the webhook handler can map incoming
    // notifications back to this user via provider_user_id (Oura's user
    // uuid, fetched below from /v2/usercollection/personal_info). Falls
    // through to the client return below even on Supabase write failure
    // so a transient DB hiccup doesn't fully block connect — the legacy
    // localStorage-based sync still works in that degraded case. Phase 4
    // will make Supabase the authoritative source.
    const expiresInRaw = Number(tokens.expires_in);
    const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 86400; // Oura default: 24h
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    let ouraUserId = null;
    try {
      const piRes = await fetchWithTimeout(`${OURA_API_BASE}/personal_info`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (piRes.ok) {
        const pi = await piRes.json();
        ouraUserId = pi.id || null;
      } else {
        console.warn('[oura:token] personal_info fetch failed', piRes.status);
      }
    } catch (e) {
      console.warn('[oura:token] personal_info threw', e);
    }

    if (ouraUserId) {
      try {
        await upsertWearableConnection({
          user_id: userId,
          provider: 'oura',
          provider_user_id: ouraUserId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          scope: tokens.scope || null,
          status: 'connected',
          subscription_ids: [], // Oura subs are app-level, not per-user
          last_error: null,
        });
      } catch (e) {
        console.error('[oura:token] wearable_connections upsert failed', e);
      }
    } else {
      console.warn('[oura:token] no provider_user_id — skipping wearable_connections upsert');
    }

    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  }

  if (action === 'refresh') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Oura not configured' });
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

    const refreshRes = await fetchWithTimeout(OURA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', refresh_token,
        client_id: clientId, client_secret: clientSecret,
      }),
    });
    if (!refreshRes.ok) {
      const err = await refreshRes.text();
      return res.status(refreshRes.status).json({ error: 'Token refresh failed', details: err });
    }
    const tokens = await refreshRes.json();
    logUsage(userId, 'oura');

    // Mirror the new tokens to the wearable_connections row so server-side
    // webhook handlers / sync paths use the latest token. Best-effort —
    // client gets the new tokens regardless. Oura's refresh_token is
    // single-use so the next refresh must use the freshly-returned one.
    const expiresInRaw = Number(tokens.expires_in);
    const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 86400;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const existing = await getWearableConnection(userId, 'oura').catch(() => null);
    if (existing) {
      try {
        await upsertWearableConnection({
          ...existing,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          status: 'connected',
          last_error: null,
        });
      } catch (e) {
        console.warn('[oura:refresh] wearable_connections update failed', e);
      }
    }

    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  }

  if (action === 'status') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
    const conn = await getWearableConnection(userId, 'oura');
    if (!conn) return res.json({ connected: false });
    return res.json({
      connected: conn.status === 'connected',
      status: conn.status,
      provider_user_id: conn.provider_user_id,
      last_webhook_at: conn.last_webhook_at,
      last_sync_at: conn.last_sync_at,
      expires_at: conn.expires_at,
      last_error: conn.last_error,
    });
  }

  if (action === 'disconnect') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    const conn = await getWearableConnection(userId, 'oura');
    if (!conn) return res.json({ ok: true, already_disconnected: true });

    // Oura subscriptions are APP-scoped (not per-user) — never tear them
    // down on disconnect. Other users still need them. Just drop the
    // user's row + revoke the token.

    // Best-effort token revocation. Oura's revoke endpoint requires the
    // token in the form body. If it fails, the token will still expire
    // on its own (24h) and the local row is already gone.
    try {
      await fetchWithTimeout('https://api.ouraring.com/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: conn.access_token }),
      });
    } catch (e) {
      console.warn('[oura:disconnect] revoke threw', e);
    }

    await deleteWearableConnection(userId, 'oura');
    return res.json({ ok: true });
  }

  if (action === 'data') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
    const { oura_token, endpoint, start_date, end_date } = req.query;
    if (!oura_token) return res.status(400).json({ error: 'Missing oura_token' });

    const allowed = ['daily_sleep', 'daily_readiness', 'heartrate', 'daily_spo2', 'daily_stress', 'workout', 'session', 'sleep', 'tag', 'daily_cardiovascular_age', 'daily_resilience', 'daily_activity'];
    const ep = endpoint || 'daily_readiness';
    if (!allowed.includes(ep)) return res.status(400).json({ error: 'Invalid endpoint' });

    const params = new URLSearchParams();
    if (start_date) params.set('start_date', start_date);
    if (end_date) params.set('end_date', end_date);

    const dataRes = await fetchWithTimeout(`${OURA_API_BASE}/${ep}?${params}`, {
      headers: { Authorization: `Bearer ${oura_token}` },
    });
    if (!dataRes.ok) {
      if (dataRes.status === 401) return res.status(401).json({ error: 'Oura token expired' });
      let detail = '';
      try { const b = await dataRes.json(); detail = b.detail || b.message || JSON.stringify(b); } catch {}
      return res.status(dataRes.status).json({ error: `Oura API error (${dataRes.status}): ${detail || 'unknown'}` });
    }
    const data = await dataRes.json();
    logUsage(userId, 'oura');
    return res.json(data);
  }

  if (action === 'bootstrap_subscriptions') {
    // Admin-gated one-time setup. Idempotent — re-running skips pairs
    // that already have an active registry row. Use to initially
    // register the full subscription matrix, or to add a new entry
    // after OURA_SUBSCRIBE_MATRIX grows.
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Oura not configured' });

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });

    const callbackUrl = ouraWebhookCallbackUrl(req);
    const results = { callback_url: callbackUrl, created: [], skipped: [], failed: [] };

    for (const pair of OURA_SUBSCRIBE_MATRIX) {
      const existing = await getOuraSubscriptionByEventData(pair.event_type, pair.data_type);
      if (existing && existing.status !== 'expired' && existing.status !== 'error') {
        results.skipped.push({ ...pair, id: existing.id, status: existing.status });
        continue;
      }

      // Verification token: random opaque string we generate. Oura echoes
      // it back on the verify challenge, and ongoing notifications may
      // include it as a signature-equivalent. Crypto.randomUUID gives
      // us a non-guessable value without extra dependencies.
      const verification_token = (globalThis.crypto?.randomUUID?.() || `oura-${Date.now()}-${Math.random().toString(36).slice(2)}`);

      try {
        const subRes = await fetchWithTimeout(`${OURA_WEBHOOK_API_BASE}/subscription`, {
          method: 'POST',
          headers: {
            'x-client-id': clientId,
            'x-client-secret': clientSecret,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            callback_url: callbackUrl,
            verification_token,
            event_type: pair.event_type,
            data_type: pair.data_type,
          }),
        });

        if (!subRes.ok) {
          const body = await subRes.text().catch(() => '');
          console.warn(`[oura:bootstrap] ${pair.event_type}:${pair.data_type} failed (${subRes.status}):`, body);
          results.failed.push({ ...pair, status: subRes.status, detail: body });
          continue;
        }

        const sub = await subRes.json();
        // Status is 'active' when create succeeds: Oura only returns 2xx
        // after our webhook responded 200 to their challenge. The challenge
        // happens during the create call, so by the time subRes.ok we know
        // the verify already passed. (markOuraSubscriptionActive in the
        // webhook handler is best-effort but races the row insert below,
        // so we don't rely on it.)
        const row = await upsertOuraSubscription({
          id: sub.id,
          event_type: pair.event_type,
          data_type: pair.data_type,
          callback_url: callbackUrl,
          verification_token,
          expiration_time: sub.expiration_time || null,
          status: 'active',
          last_error: null,
        });
        console.log(`[oura:bootstrap] ${pair.event_type}:${pair.data_type} registered id=${sub.id} expires=${sub.expiration_time}`);
        results.created.push({ ...pair, id: row.id, expiration_time: row.expiration_time });
      } catch (e) {
        console.warn(`[oura:bootstrap] ${pair.event_type}:${pair.data_type} threw`, e);
        results.failed.push({ ...pair, error: String(e?.message || e) });
      }
    }

    logUsage(userId, 'oura_bootstrap');
    return res.json(results);
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// ════════════════════════════════════════════════════════════════════════
// ── Dexcom ──────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const DEXCOM_API_BASE = process.env.DEXCOM_USE_SANDBOX === 'true'
  ? 'https://sandbox-api.dexcom.com'
  : 'https://api.dexcom.com';
const DEXCOM_TOKEN_URL = `${DEXCOM_API_BASE}/v2/oauth2/token`;
const DEXCOM_DATA_BASE = `${DEXCOM_API_BASE}/v3/users/self`;

async function dexcomHandle(action, req, res, userId) {
  const clientId = process.env.DEXCOM_CLIENT_ID;
  const clientSecret = process.env.DEXCOM_CLIENT_SECRET;

  if (action === 'config') {
    return res.json({
      client_id: clientId || null,
      configured: !!(clientId && clientSecret),
      sandbox: process.env.DEXCOM_USE_SANDBOX === 'true',
    });
  }

  if (action === 'token') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Dexcom not configured' });
    const { code, redirect_uri } = req.body || {};
    if (!code || !redirect_uri) return res.status(400).json({ error: 'Missing code or redirect_uri' });

    const tokenRes = await fetchWithTimeout(DEXCOM_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        code, grant_type: 'authorization_code', redirect_uri,
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(tokenRes.status).json({ error: 'Token exchange failed', details: err });
    }
    const tokens = await tokenRes.json();
    logUsage(userId, 'dexcom');
    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  }

  if (action === 'refresh') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Dexcom not configured' });
    const { refresh_token, redirect_uri } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

    const refreshRes = await fetchWithTimeout(DEXCOM_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        refresh_token, grant_type: 'refresh_token',
        redirect_uri: redirect_uri || '',
      }),
    });
    if (!refreshRes.ok) {
      const err = await refreshRes.text();
      return res.status(refreshRes.status).json({ error: 'Token refresh failed', details: err });
    }
    const tokens = await refreshRes.json();
    logUsage(userId, 'dexcom');
    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  }

  if (action === 'data') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
    const { dexcom_token, endpoint, start_date, end_date } = req.query;
    if (!dexcom_token) return res.status(400).json({ error: 'Missing dexcom_token' });

    const allowed = ['egvs', 'events', 'devices', 'dataRange'];
    const ep = endpoint || 'egvs';
    if (!allowed.includes(ep)) return res.status(400).json({ error: 'Invalid endpoint' });

    const params = new URLSearchParams();
    if (start_date) params.set('startDate', start_date);
    if (end_date) params.set('endDate', end_date);

    const url = `${DEXCOM_DATA_BASE}/${ep}${params.toString() ? '?' + params : ''}`;
    const dataRes = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${dexcom_token}` },
    });
    if (!dataRes.ok) {
      if (dataRes.status === 401) return res.status(401).json({ error: 'Dexcom token expired' });
      let detail = '';
      try { const b = await dataRes.json(); detail = b.message || JSON.stringify(b); } catch {}
      return res.status(dataRes.status).json({ error: `Dexcom API error (${dataRes.status}): ${detail || 'unknown'}` });
    }
    const data = await dataRes.json();
    logUsage(userId, 'dexcom');
    return res.json(data);
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// ════════════════════════════════════════════════════════════════════════
// ── Withings ────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const WITHINGS_TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';
const WITHINGS_API_BASE = 'https://wbsapi.withings.net';

// Withings wraps successful responses as { status: 0, body: {...} }
async function unwrapWithings(res) {
  const json = await res.json();
  if (json && json.status === 0) return json.body || {};
  const code = json?.status ?? -1;
  const msg = json?.error || `Withings status ${code}`;
  const err = new Error(msg);
  err.withingsStatus = code;
  throw err;
}

async function withingsHandle(action, req, res, userId) {
  const clientId = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;

  if (action === 'config') {
    return res.json({ client_id: clientId || null, configured: !!(clientId && clientSecret) });
  }

  if (action === 'token') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Withings not configured' });
    const { code, redirect_uri } = req.body || {};
    if (!code || !redirect_uri) return res.status(400).json({ error: 'Missing code or redirect_uri' });

    const tokenRes = await fetchWithTimeout(WITHINGS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'requesttoken',
        client_id: clientId, client_secret: clientSecret,
        grant_type: 'authorization_code', code, redirect_uri,
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(tokenRes.status).json({ error: 'Token exchange failed', details: err });
    }
    try {
      const body = await unwrapWithings(tokenRes);
      logUsage(userId, 'withings');
      return res.json({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_in: body.expires_in,
        userid: body.userid,
      });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  if (action === 'refresh') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Withings not configured' });
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

    const refreshRes = await fetchWithTimeout(WITHINGS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'requesttoken',
        client_id: clientId, client_secret: clientSecret,
        grant_type: 'refresh_token', refresh_token,
      }),
    });
    if (!refreshRes.ok) {
      const err = await refreshRes.text();
      return res.status(refreshRes.status).json({ error: 'Token refresh failed', details: err });
    }
    try {
      const body = await unwrapWithings(refreshRes);
      logUsage(userId, 'withings');
      return res.json({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_in: body.expires_in,
        userid: body.userid,
      });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  if (action === 'data') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
    const { withings_token, endpoint, meastypes, startdate, enddate, lastupdate } = req.query;
    if (!withings_token) return res.status(400).json({ error: 'Missing withings_token' });

    const allowed = ['measure', 'sleep'];
    const ep = endpoint || 'measure';
    if (!allowed.includes(ep)) return res.status(400).json({ error: 'Invalid endpoint' });

    const params = new URLSearchParams({
      action: ep === 'measure' ? 'getmeas' : 'getsummary',
    });
    if (meastypes) params.set('meastypes', meastypes);
    if (startdate) params.set('startdate', startdate);
    if (enddate) params.set('enddate', enddate);
    if (lastupdate) params.set('lastupdate', lastupdate);
    if (ep === 'measure' && !startdate && !lastupdate) {
      params.set('startdate', String(Math.floor(Date.now() / 1000) - 30 * 86400));
      params.set('enddate', String(Math.floor(Date.now() / 1000)));
    }

    const url = `${WITHINGS_API_BASE}/${ep === 'measure' ? 'measure' : 'v2/sleep'}`;
    const dataRes = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${withings_token}`,
      },
      body: params,
    });
    if (!dataRes.ok) {
      if (dataRes.status === 401) return res.status(401).json({ error: 'Withings token expired' });
      let detail = '';
      try { const b = await dataRes.json(); detail = b.error || JSON.stringify(b); } catch {}
      return res.status(dataRes.status).json({ error: `Withings API error (${dataRes.status}): ${detail || 'unknown'}` });
    }
    try {
      const body = await unwrapWithings(dataRes);
      logUsage(userId, 'withings');
      return res.json(body);
    } catch (e) {
      if (e.withingsStatus === 401 || e.withingsStatus === 100) {
        return res.status(401).json({ error: 'Withings token expired' });
      }
      return res.status(502).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// ════════════════════════════════════════════════════════════════════════
// ── Fitbit ──────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════
//
// ⚠️  DEPRECATION WARNING — legacy Fitbit Web API sunsets September 2026
//
// Fitbit is migrating their API to the new Google Health API:
//   • OAuth endpoint → accounts.google.com/o/oauth2/v2/auth
//   • API base       → health.googleapis.com/v4/users/me/
//   • Auth library   → Google Auth Library (not generic OAuth2)
//   • Existing tokens CANNOT be migrated; users must re-authorize
//   • New setup requires a Google Cloud project + OAuth consent screen
//
// This handler targets the legacy Fitbit Web API and will stop working
// September 2026. Before that date, either:
//   (a) rebuild this section against https://developers.google.com/health
//   (b) delete the Fitbit section entirely if nobody asks for it
//
// Until then the current code works fine for beta testing. Leaving it
// dormant behind VITE_FITBIT_ENABLED costs nothing.

const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const FITBIT_API_BASE = 'https://api.fitbit.com';

async function fitbitHandle(action, req, res, userId) {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;

  if (action === 'config') {
    return res.json({ client_id: clientId || null, configured: !!(clientId && clientSecret) });
  }

  if (action === 'token') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Fitbit not configured' });
    const { code, redirect_uri } = req.body || {};
    if (!code || !redirect_uri) return res.status(400).json({ error: 'Missing code or redirect_uri' });

    const tokenRes = await fetchWithTimeout(FITBIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(clientId, clientSecret),
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        redirect_uri, code,
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(tokenRes.status).json({ error: 'Token exchange failed', details: err });
    }
    const tokens = await tokenRes.json();
    logUsage(userId, 'fitbit');

    // Persist tokens in Supabase so the webhook handler can act on the
    // user's behalf when Fitbit pushes updates. Falls through to the
    // client return below even if Supabase write fails — the localStorage
    // flow still works for manual sync in that case, so connect isn't
    // fully blocked by a transient DB hiccup. Phase 4 will make Supabase
    // the authoritative source and drop localStorage.
    const expiresInRaw = Number(tokens.expires_in);
    const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 28800;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    let conn = null;
    try {
      conn = await upsertWearableConnection({
        user_id: userId,
        provider: 'fitbit',
        provider_user_id: tokens.user_id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: tokens.scope || null,
        status: 'connected',
        subscription_ids: [],
        last_error: null,
      });
    } catch (e) {
      console.error('[fitbit:token] wearable_connections upsert failed', e);
    }

    // Register 3 Fitbit webhook subscriptions (activities, sleep, body).
    // Subscription IDs must be unique across ALL of a user's subscriptions
    // (not just per-collection), so we suffix the connection uuid with
    // the collection name rather than reusing the bare uuid. Best-effort
    // on individual failures — log the response body so Vercel runtime
    // logs show the exact Fitbit error if a subscription is rejected.
    if (conn?.id) {
      const collections = ['activities', 'sleep', 'body'];
      const registered = [];
      for (const collection of collections) {
        const subId = `${conn.id}-${collection}`;
        try {
          const subRes = await fetchWithTimeout(
            `${FITBIT_API_BASE}/1/user/-/${collection}/apiSubscriptions/${subId}.json`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            }
          );
          if (subRes.ok) {
            registered.push({ collection, id: subId });
            console.log(`[fitbit:subscribe] ${collection} registered (${subRes.status}) id=${subId}`);
          } else {
            const body = await subRes.text().catch(() => '');
            console.warn(`[fitbit:subscribe] ${collection} failed (${subRes.status}) id=${subId}:`, body);
          }
        } catch (e) {
          console.warn(`[fitbit:subscribe] ${collection} threw id=${subId}`, e);
        }
      }
      if (registered.length > 0) {
        try {
          await upsertWearableConnection({
            user_id: userId,
            provider: 'fitbit',
            provider_user_id: tokens.user_id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expiresAt,
            scope: tokens.scope || null,
            status: 'connected',
            subscription_ids: registered,
            last_error: null,
          });
        } catch (e) {
          console.warn('[fitbit:subscribe] sub-id persist failed', e);
        }
      }
    }

    // Still return tokens to the client — the browser needs them for
    // its own /api/wearable?action=data calls until Phase 4 moves sync
    // server-side. Server write above is the canonical copy; client
    // mirror in localStorage is temporary.
    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      user_id: tokens.user_id,
    });
  }

  if (action === 'status') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
    const conn = await getWearableConnection(userId, 'fitbit');
    if (!conn) return res.json({ connected: false });
    return res.json({
      connected: conn.status === 'connected',
      status: conn.status,
      last_webhook_at: conn.last_webhook_at,
      last_sync_at: conn.last_sync_at,
      expires_at: conn.expires_at,
      subscription_count: Array.isArray(conn.subscription_ids) ? conn.subscription_ids.length : 0,
      last_error: conn.last_error,
    });
  }

  if (action === 'disconnect') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    const conn = await getWearableConnection(userId, 'fitbit');
    if (!conn) return res.json({ ok: true, already_disconnected: true });

    // Delete each subscription from Fitbit's side. Best-effort — a
    // Fitbit-side error shouldn't block the local cleanup, otherwise
    // users get permanently stuck. Log failures for operator visibility.
    const subs = Array.isArray(conn.subscription_ids) ? conn.subscription_ids : [];
    for (const s of subs) {
      if (!s?.collection || !s?.id) continue;
      try {
        const delRes = await fetchWithTimeout(
          `${FITBIT_API_BASE}/1/user/-/${s.collection}/apiSubscriptions/${s.id}.json`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${conn.access_token}` },
          }
        );
        if (!delRes.ok && delRes.status !== 404) {
          const body = await delRes.text().catch(() => '');
          console.warn(`[fitbit:disconnect] sub delete ${s.collection} (${delRes.status}):`, body);
        }
      } catch (e) {
        console.warn(`[fitbit:disconnect] sub delete ${s.collection} threw`, e);
      }
    }

    // Revoke the access token so Fitbit invalidates it server-side.
    // Also best-effort — if it fails the token will still expire on
    // its own (8h), and the row is already gone from our DB.
    try {
      await fetchWithTimeout(`${FITBIT_API_BASE}/oauth2/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuthHeader(clientId, clientSecret),
        },
        body: new URLSearchParams({ token: conn.access_token }),
      });
    } catch (e) {
      console.warn('[fitbit:disconnect] revoke threw', e);
    }

    await deleteWearableConnection(userId, 'fitbit');
    return res.json({ ok: true });
  }

  if (action === 'refresh') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Fitbit not configured' });
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

    const refreshRes = await fetchWithTimeout(FITBIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(clientId, clientSecret),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
      }),
    });
    if (!refreshRes.ok) {
      const err = await refreshRes.text();
      return res.status(refreshRes.status).json({ error: 'Token refresh failed', details: err });
    }
    const tokens = await refreshRes.json();
    logUsage(userId, 'fitbit');
    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  }

  if (action === 'data') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
    const { fitbit_token, path } = req.query;
    if (!fitbit_token) return res.status(400).json({ error: 'Missing fitbit_token' });
    if (!path) return res.status(400).json({ error: 'Missing path' });

    const allowedPrefixes = [
      '/1/user/-/activities/',
      '/1.2/user/-/sleep/',
      '/1/user/-/sleep/',
      '/1/user/-/body/',
      '/1/user/-/profile.json',
      '/1/user/-/devices.json',
      '/1/user/-/spo2/',
      '/1/user/-/br/',
      '/1/user/-/temp/',
      '/1/user/-/hrv/',
      '/1/user/-/cardioscore/',
    ];
    const ok = allowedPrefixes.some(p => path.startsWith(p));
    if (!ok) return res.status(400).json({ error: 'Invalid path' });

    const dataRes = await fetchWithTimeout(`${FITBIT_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${fitbit_token}` },
    });
    if (!dataRes.ok) {
      if (dataRes.status === 401) return res.status(401).json({ error: 'Fitbit token expired' });
      let detail = '';
      try { const b = await dataRes.json(); detail = b.errors?.[0]?.message || b.message || JSON.stringify(b); } catch {}
      return res.status(dataRes.status).json({ error: `Fitbit API error (${dataRes.status}): ${detail || 'unknown'}` });
    }
    const data = await dataRes.json();
    logUsage(userId, 'fitbit');
    return res.json(data);
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// ── Fitbit Subscription Webhook ──────────────────────────────────────
// Handles two request types from Fitbit's servers (no user auth):
//
// 1. GET  ?verify=<code> — Fitbit verifies your endpoint by sending your
//    subscriber verification code. Respond 204 if it matches, 404 if not.
//
// 2. POST — Fitbit sends a JSON array of update notifications when user
//    data changes. Respond 204 immediately. Each notification has:
//    { collectionType, date, ownerId, ownerType, subscriptionId }
//
// Endpoint URL for the Fitbit dashboard:
//   https://<your-domain>/api/wearable?provider=fitbit&action=webhook
//
// Env var: FITBIT_SUBSCRIBER_VERIFY — the verification code you set in
// the Fitbit developer dashboard under your subscriber.

async function fitbitWebhookHandle(req, res) {
  const verifyCode = process.env.FITBIT_SUBSCRIBER_VERIFY;

  // Verification challenge — Fitbit GET with ?verify=<code>
  if (req.method === 'GET') {
    const challenge = req.query.verify;
    if (!challenge || !verifyCode) return res.status(404).end();
    if (challenge === verifyCode) return res.status(204).end();
    return res.status(404).end();
  }

  // Notification — Fitbit POST with JSON array of updates
  if (req.method === 'POST') {
    // Must respond 204 within 5 seconds — Fitbit retries on other codes.
    // Log the notification for debugging but don't block the response.
    const notifications = req.body;
    if (Array.isArray(notifications) && notifications.length > 0) {
      console.log(`[fitbit:webhook] Received ${notifications.length} notification(s):`,
        notifications.map(n => `${n.collectionType}:${n.date}:${n.ownerId}`).join(', ')
      );
    }
    // The app syncs data client-side on page load / auto-refresh, so we
    // don't need server-side data fetching here. The webhook satisfies
    // Fitbit's API requirements and logs events for monitoring.
    return res.status(204).end();
  }

  return res.status(405).end();
}

// ── Oura Webhook ─────────────────────────────────────────────────────
// Oura performs a synchronous reachability check during create-subscription:
// it issues a GET to the callback URL with a verification challenge in
// the query string, and rejects subscription creation unless we respond
// 200 with a body that echoes the challenge.
//
// Once the subscription is active, Oura POSTs notifications when user
// data changes. Phase 3 of the live-push migration wires the POST
// branch up to fetch the actual record from Oura and upsert into
// vitals/activities. For now (Phase 1) the POST branch logs and 204s
// so we can observe what Oura actually sends and confirm subscriptions
// are firing end-to-end before writing the ingest path.

async function markOuraSubscriptionActive(verificationToken) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  await fetch(
    `${url}/rest/v1/oura_app_subscriptions?verification_token=eq.${encodeURIComponent(verificationToken)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'active', last_error: null }),
    }
  ).catch(() => { /* best-effort */ });
}

async function touchOuraSubscriptionWebhook(subscriptionId) {
  // No-op for now — wearable_connections.last_webhook_at is updated
  // when Phase 3 ingests data per-user. Tracking last-fired on the
  // app-level subscription row would also be useful; deferred until
  // the renewal path needs it.
  return subscriptionId;
}

async function ouraWebhookHandle(req, res) {
  // ── Verification challenge ────────────────────────────────────────
  // Oura GETs the callback URL during create-subscription with the
  // verification_token we provided in the create payload. We must
  // respond 200 to confirm. Some webhook providers also expect us to
  // echo a `challenge` value in the response body — Oura's exact
  // shape isn't fully documented in the public API surface, so we
  // log everything on the first hit and respond defensively:
  // - 200 status (the bare minimum Oura requires per the create-subs error)
  // - JSON body that includes any `challenge` query param verbatim,
  //   plus the `verification_token` echoed back.
  if (req.method === 'GET') {
    const vt = req.query.verification_token;
    const challenge = req.query.challenge;
    console.log('[oura:webhook:verify] query=', JSON.stringify(req.query), 'headers=', JSON.stringify({
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
    }));

    if (vt) {
      // Mark the matching subscription active. Best-effort — even if
      // this fails the verification still passes; we just won't have
      // the local status flipped. Renewal cron / next bootstrap will
      // reconcile.
      await markOuraSubscriptionActive(vt);
    }

    // Respond with 200 and a body that covers common echo patterns.
    // If Oura's exact format turns out to be different, the runtime
    // log above will show the request shape and we adapt.
    return res.status(200).json({
      verification_token: vt || null,
      challenge: challenge || null,
    });
  }

  // ── Notification or POST-based verification challenge ─────────────
  if (req.method === 'POST') {
    let parsedBody = null;
    try { parsedBody = req.body; } catch { /* leave null */ }

    // Verification challenge path — Oura might use POST instead of GET
    // for the verify (their create-sub error said "Expected 200" while
    // our POST handler was returning 204). If body/query carries
    // verification_token, treat as verification and respond 200 with
    // the echo body — never proceed to ingest.
    const vt = req.query.verification_token
      || (parsedBody && typeof parsedBody === 'object' && parsedBody.verification_token);
    const challenge = req.query.challenge
      || (parsedBody && typeof parsedBody === 'object' && parsedBody.challenge);
    if (vt || challenge) {
      console.log('[oura:webhook:verify-post] vt-present=', !!vt, 'challenge-present=', !!challenge);
      if (vt) await markOuraSubscriptionActive(vt);
      return res.status(200).json({
        verification_token: vt || null,
        challenge: challenge || null,
      });
    }

    // Notification path. Body shape per Oura docs:
    //   { event_type, event_time, user_id, data_type, object_id }
    // Some implementations send an array; handle both.
    const notifications = Array.isArray(parsedBody)
      ? parsedBody
      : (parsedBody && typeof parsedBody === 'object') ? [parsedBody] : [];

    if (notifications.length === 0) {
      console.log('[oura:webhook] empty body, ignoring');
      return res.status(200).end();
    }

    // Process each notification serially — keeps log output ordered and
    // avoids per-user fetches racing on the same connection row's
    // refresh-token rotation. Volume is low (1-7 events per ring sync).
    let totalVitals = 0;
    let totalActivities = 0;
    for (const n of notifications) {
      try {
        const { event_type, data_type, user_id: ouraUserId, object_id } = n || {};
        console.log(`[oura:webhook] ${event_type}/${data_type} user=${ouraUserId} object=${object_id}`);

        if (!data_type || !ouraUserId || !object_id) {
          console.warn('[oura:webhook] missing fields, skipping:', JSON.stringify(n).slice(0, 200));
          continue;
        }
        // Only act on creates for now. update/delete events will land
        // here once we subscribe to them; ignored silently in v1.
        if (event_type !== 'create') {
          continue;
        }

        const conn = await getConnectionByProviderUserId('oura', ouraUserId);
        if (!conn) {
          console.warn(`[oura:webhook] no wearable_connections for oura user_id=${ouraUserId}`);
          continue;
        }

        let token;
        try {
          token = await getValidOuraAccessToken(conn);
        } catch (e) {
          console.warn(`[oura:webhook] token refresh failed for user=${conn.user_id}`, e);
          continue;
        }

        let record;
        try {
          record = await fetchOuraRecord(token, data_type, object_id);
        } catch (e) {
          console.warn(`[oura:webhook] record fetch failed`, e?.message || e);
          continue;
        }

        const { vitals, activities } = transformOuraRecord(data_type, record);

        // Per-row dedup. Cheap query on (user_id, date, type, source).
        const vitalsToInsert = [];
        for (const row of vitals) {
          const exists = await vitalAlreadyExists(conn.user_id, row.date, row.type, 'oura');
          if (!exists) vitalsToInsert.push({ ...row, user_id: conn.user_id });
        }
        const activitiesToInsert = [];
        for (const row of activities) {
          const exists = await activityAlreadyExists(conn.user_id, row.date, row.type, 'oura', row.duration_minutes);
          if (!exists) activitiesToInsert.push({ ...row, user_id: conn.user_id });
        }

        if (vitalsToInsert.length) await bulkInsertVitals(vitalsToInsert);
        if (activitiesToInsert.length) await bulkInsertActivities(activitiesToInsert);
        totalVitals += vitalsToInsert.length;
        totalActivities += activitiesToInsert.length;

        // Touch the connection row so the UI's "Last push" indicator
        // (Phase 4 work) has data to show.
        await touchConnectionWebhook(conn.user_id, 'oura');
      } catch (e) {
        // Per-notification error must never crash the whole batch.
        console.error('[oura:webhook] notification handler threw', e);
      }
    }

    console.log(`[oura:webhook] processed ${notifications.length} notification(s), wrote ${totalVitals} vitals + ${totalActivities} activities`);
    return res.status(200).end();
  }

  return res.status(405).end();
}

// ════════════════════════════════════════════════════════════════════════
// ── Whoop ───────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';

async function whoopHandle(action, req, res, userId) {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;

  if (action === 'config') {
    return res.json({ client_id: clientId || null, configured: !!(clientId && clientSecret) });
  }

  if (action === 'token') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Whoop not configured' });
    const { code, redirect_uri } = req.body || {};
    if (!code || !redirect_uri) return res.status(400).json({ error: 'Missing code or redirect_uri' });

    const tokenRes = await fetchWithTimeout(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri,
        client_id: clientId, client_secret: clientSecret,
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(tokenRes.status).json({ error: 'Token exchange failed', details: err });
    }
    const tokens = await tokenRes.json();
    logUsage(userId, 'whoop');
    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  }

  if (action === 'refresh') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Whoop not configured' });
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

    const refreshRes = await fetchWithTimeout(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', refresh_token,
        client_id: clientId, client_secret: clientSecret,
        scope: 'offline',
      }),
    });
    if (!refreshRes.ok) {
      const err = await refreshRes.text();
      return res.status(refreshRes.status).json({ error: 'Token refresh failed', details: err });
    }
    const tokens = await refreshRes.json();
    logUsage(userId, 'whoop');
    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  }

  if (action === 'data') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
    const { whoop_token, endpoint, start, end, limit } = req.query;
    if (!whoop_token) return res.status(400).json({ error: 'Missing whoop_token' });

    const allowed = [
      'v1/cycle', 'v1/recovery', 'v1/activity/sleep',
      'v1/activity/workout', 'v1/user/profile/basic',
    ];
    const ep = endpoint || 'v1/recovery';
    if (!allowed.includes(ep)) return res.status(400).json({ error: 'Invalid endpoint' });

    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (limit) params.set('limit', limit);

    const dataRes = await fetchWithTimeout(`${WHOOP_API_BASE}/${ep}${params.toString() ? '?' + params : ''}`, {
      headers: { Authorization: `Bearer ${whoop_token}` },
    });
    if (!dataRes.ok) {
      if (dataRes.status === 401) return res.status(401).json({ error: 'Whoop token expired' });
      let detail = '';
      try { const b = await dataRes.json(); detail = b.message || JSON.stringify(b); } catch {}
      return res.status(dataRes.status).json({ error: `Whoop API error (${dataRes.status}): ${detail || 'unknown'}` });
    }
    const data = await dataRes.json();
    logUsage(userId, 'whoop');
    return res.json(data);
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// ════════════════════════════════════════════════════════════════════════
// ── Router ──────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const PROVIDERS = {
  oura: ouraHandle,
  dexcom: dexcomHandle,
  withings: withingsHandle,
  fitbit: fitbitHandle,
  whoop: whoopHandle,
};

export default async function handler(req, res) {
  // CORS
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

  const provider = req.query.provider;
  const action = req.query.action || (req.method === 'GET' ? 'data' : '');

  // ── Fitbit webhook (no user auth — called by Fitbit's servers) ──
  if (provider === 'fitbit' && action === 'webhook') {
    return fitbitWebhookHandle(req, res);
  }

  // ── Oura webhook (no user auth — called by Oura's servers) ──
  if (provider === 'oura' && action === 'webhook') {
    return ouraWebhookHandle(req, res);
  }

  const handle = provider && PROVIDERS[provider];
  if (!handle) return res.status(400).json({ error: 'Unknown or missing provider' });

  // Auth + rate limit
  const userId = await verifyAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!checkMemoryRateLimit(userId, provider)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  if (!(await checkPersistentRateLimit(userId, provider, RATE_LIMIT_MAX, 60))) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  try {
    return await handle(action, req, res, userId);
  } catch (e) {
    if (e?.name === 'AbortError') return res.status(504).json({ error: `${provider} API timeout` });
    console.error(`[wearable:${provider}] Internal error`, e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
