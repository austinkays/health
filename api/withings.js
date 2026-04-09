// ── Withings API proxy — handles OAuth2 + measurement data fetching ──
// Keeps client_secret server-side. All calls require Supabase auth.
//
// Withings is quirky:
//   • Token endpoint takes `action=requesttoken` as a form field, not a path
//   • Token responses wrap the actual token data in { status, body: {...} }
//   • Measurement endpoint takes `action=getmeas` and returns { status, body: { measuregrps: [...] } }
//
// Actions via ?action= query param:
//   token    — exchange authorization code for access/refresh tokens (POST)
//   refresh  — refresh an expired access token (POST)
//   data     — proxy GET requests to Withings v2 API (GET)
//   config   — return client_id + configured status (GET)

import { checkPersistentRateLimit, logUsage } from './_rateLimit.js';

const EXTERNAL_TIMEOUT_MS = 15_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();

const WITHINGS_TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';
const WITHINGS_API_BASE = 'https://wbsapi.withings.net';

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function checkMemoryRateLimit(userId) {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
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

// Withings wraps successful responses as { status: 0, body: {...} }
// and errors as { status: nonzero, error: '...' }. Normalize.
async function unwrapWithings(res) {
  const json = await res.json();
  if (json && json.status === 0) return json.body || {};
  const code = json?.status ?? -1;
  const msg = json?.error || `Withings status ${code}`;
  const err = new Error(msg);
  err.withingsStatus = code;
  throw err;
}

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

  const userId = await verifyAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!checkMemoryRateLimit(userId)) return res.status(429).json({ error: 'Rate limit exceeded' });
  if (!(await checkPersistentRateLimit(userId, 'withings', RATE_LIMIT_MAX, 60))) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const clientId = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;
  const action = req.query.action || (req.method === 'GET' ? 'data' : '');

  try {
    // ── Exchange authorization code for tokens ──
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
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri,
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

    // ── Refresh an expired access token ──
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
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token,
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

    // ── Proxy data requests to Withings API ──
    if (action === 'data') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

      const { withings_token, endpoint, meastypes, startdate, enddate, lastupdate } = req.query;
      if (!withings_token) return res.status(400).json({ error: 'Missing withings_token' });

      const allowed = ['measure', 'sleep'];
      const ep = endpoint || 'measure';
      if (!allowed.includes(ep)) return res.status(400).json({ error: 'Invalid endpoint' });

      // Withings uses POST for data endpoints with form-encoded params, but
      // accepts GET via query string in their newer API. We use POST for
      // reliability.
      const params = new URLSearchParams({
        action: ep === 'measure' ? 'getmeas' : 'getsummary',
      });
      if (meastypes) params.set('meastypes', meastypes);
      if (startdate) params.set('startdate', startdate);
      if (enddate) params.set('enddate', enddate);
      if (lastupdate) params.set('lastupdate', lastupdate);
      // Withings 'measure' returns the most recent N meas if no date — set
      // a sensible default of last 30 days.
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
        // Withings returns 200 even for auth errors — surface them as 401
        if (e.withingsStatus === 401 || e.withingsStatus === 100) {
          return res.status(401).json({ error: 'Withings token expired' });
        }
        return res.status(502).json({ error: e.message });
      }
    }

    // ── Return OAuth config (client_id only, no secret) ──
    if (action === 'config') {
      return res.json({
        client_id: clientId || null,
        configured: !!(clientId && clientSecret),
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'Withings API timeout' });
    return res.status(500).json({ error: 'Internal error' });
  }
}
