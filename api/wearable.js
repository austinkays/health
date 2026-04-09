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

const EXTERNAL_TIMEOUT_MS = 15_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

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

async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user.id;
  } catch {
    return null;
  }
}

function basicAuthHeader(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

// ════════════════════════════════════════════════════════════════════════
// ── Oura ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';

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
    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
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
    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      user_id: tokens.user_id,
    });
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

  const action = req.query.action || (req.method === 'GET' ? 'data' : '');

  try {
    return await handle(action, req, res, userId);
  } catch (e) {
    if (e?.name === 'AbortError') return res.status(504).json({ error: `${provider} API timeout` });
    console.error(`[wearable:${provider}] Internal error`, e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
