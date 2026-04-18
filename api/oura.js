// ── Oura Ring — OAuth2 proxy + live-push webhook ─────────────────
// Split out of api/wearable.js on 2026-04-17 (Vercel Pro lifts the
// 12-function Hobby ceiling; each provider is now its own endpoint).
// See api/_wearable/shared.js for rate-limit, CORS, auth wrapper,
// and Supabase service-role helpers.

import {
  fetchWithTimeout, logUsage,
  supabaseConfig, upsertWearableConnection, getWearableConnection,
  deleteWearableConnection, getConnectionByProviderUserId,
  patchConnectionTokens, touchConnectionWebhook,
  bulkInsertVitals, bulkInsertActivities,
  vitalAlreadyExists, activityAlreadyExists,
  isAdminUser, wrapProvider,
} from './_wearable/shared.js';

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

async function patchOuraSubscription(id, patch) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  await fetch(
    `${url}/rest/v1/oura_app_subscriptions?id=eq.${encodeURIComponent(id)}`,
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
      // Skip short auto-detected walks (< 15 min) — already captured by daily step vitals
      const actLower = String(record.activity || '').toLowerCase();
      if (actLower === 'walking' && (!durationMin || durationMin < 15)) break;
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
  // /api/oura?action=webhook, so internally the same handler runs but Oura
  // sees a clean path.
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
    const { endpoint, start_date, end_date } = req.query;
    let oura_token = req.query.oura_token;

    // Phase 4 fallback: if client didn't send a token, look up the
    // server-side wearable_connections row and use the stored token
    // (auto-refreshing if needed). This lets the client drop its
    // localStorage mirror entirely.
    if (!oura_token) {
      const conn = await getWearableConnection(userId, 'oura');
      if (!conn) return res.status(400).json({ error: 'No Oura connection found' });
      oura_token = await getValidOuraAccessToken(conn);
    }

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

  if (action === 'renew_subscriptions') {
    // Admin-gated. Renew any oura_app_subscriptions row whose
    // expiration_time falls within the next 7 days. Idempotent — safe
    // to call repeatedly. Intended to be triggered by a Vercel cron
    // (weekly) once configured; can also be called manually anytime.
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'Oura not configured' });

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });

    // Pull all subs whose expiration is within the renewal window. Doing
    // this in-memory rather than a SQL filter so we get full visibility
    // in the response.
    const { url: sUrl, key: sKey } = supabaseConfig();
    const listRes = await fetch(`${sUrl}/rest/v1/oura_app_subscriptions?select=*`, {
      headers: { apikey: sKey, Authorization: `Bearer ${sKey}` },
    });
    if (!listRes.ok) return res.status(500).json({ error: 'Failed to load subscriptions' });
    const allSubs = await listRes.json();

    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const dueForRenewal = allSubs.filter(s => {
      if (!s.expiration_time) return true; // no expiration set → renew anyway
      return Date.parse(s.expiration_time) < horizon;
    });

    const results = { total: allSubs.length, due: dueForRenewal.length, renewed: [], failed: [], skipped: allSubs.length - dueForRenewal.length };

    for (const sub of dueForRenewal) {
      try {
        const renewRes = await fetchWithTimeout(`${OURA_WEBHOOK_API_BASE}/subscription/renew/${encodeURIComponent(sub.id)}`, {
          method: 'PUT',
          headers: {
            'x-client-id': clientId,
            'x-client-secret': clientSecret,
          },
        });
        if (!renewRes.ok) {
          const body = await renewRes.text().catch(() => '');
          console.warn(`[oura:renew] ${sub.event_type}:${sub.data_type} (id=${sub.id}) failed (${renewRes.status}):`, body);
          results.failed.push({ id: sub.id, event_type: sub.event_type, data_type: sub.data_type, status: renewRes.status, detail: body });
          // Mark the row as errored so the next bootstrap_subscriptions
          // run will recreate it (bootstrap skips active rows but
          // recreates expired/error ones).
          await patchOuraSubscription(sub.id, { status: 'error', last_error: `renew ${renewRes.status}: ${body.slice(0, 200)}` });
          continue;
        }
        const renewed = await renewRes.json();
        await patchOuraSubscription(sub.id, {
          expiration_time: renewed.expiration_time || null,
          status: 'active',
          last_error: null,
        });
        results.renewed.push({ id: sub.id, event_type: sub.event_type, data_type: sub.data_type, expiration_time: renewed.expiration_time });
      } catch (e) {
        console.warn(`[oura:renew] ${sub.event_type}:${sub.data_type} threw`, e);
        results.failed.push({ id: sub.id, event_type: sub.event_type, data_type: sub.data_type, error: String(e?.message || e) });
      }
    }

    logUsage(userId, 'oura_renew');
    return res.json(results);
  }

  return res.status(400).json({ error: 'Unknown action' });
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

export default function handler(req, res) {
  const action = req.query.action || (req.method === 'GET' ? 'data' : '');
  if (action === 'webhook') return ouraWebhookHandle(req, res);
  return wrapProvider(req, res, 'oura', ouraHandle);
}
