// ── Fitbit API proxy — handles OAuth2 + activity/sleep/HR data fetching ──
// Keeps client_secret server-side. All calls require Supabase auth.
//
// Fitbit specifics:
//   • Token endpoint requires HTTP Basic Auth (Base64 client_id:client_secret)
//   • Tokens expire in 8 hours by default
//   • Rate limit: 150 calls/hour per user (we enforce a per-minute backstop)
//
// Actions via ?action= query param:
//   token    — exchange authorization code for access/refresh tokens (POST)
//   refresh  — refresh an expired access token (POST)
//   data     — proxy GET requests to Fitbit Web API (GET)
//   config   — return client_id + configured status (GET)

import { checkPersistentRateLimit, logUsage } from './_rateLimit.js';

const EXTERNAL_TIMEOUT_MS = 15_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();

const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const FITBIT_API_BASE = 'https://api.fitbit.com';

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

function basicAuthHeader(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
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
  if (!(await checkPersistentRateLimit(userId, 'fitbit', RATE_LIMIT_MAX, 60))) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  const action = req.query.action || (req.method === 'GET' ? 'data' : '');

  try {
    // ── Exchange authorization code for tokens ──
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
          redirect_uri,
          code,
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

    // ── Refresh an expired access token ──
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

    // ── Proxy data requests to Fitbit API ──
    if (action === 'data') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

      const { fitbit_token, path } = req.query;
      if (!fitbit_token) return res.status(400).json({ error: 'Missing fitbit_token' });
      if (!path) return res.status(400).json({ error: 'Missing path' });

      // Whitelist of allowed path prefixes — prevents using us as a proxy for
      // arbitrary Fitbit endpoints. Each entry is a substring match.
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

      const url = `${FITBIT_API_BASE}${path}`;
      const dataRes = await fetchWithTimeout(url, {
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

    // ── Return OAuth config (client_id only, no secret) ──
    if (action === 'config') {
      return res.json({
        client_id: clientId || null,
        configured: !!(clientId && clientSecret),
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'Fitbit API timeout' });
    return res.status(500).json({ error: 'Internal error' });
  }
}
