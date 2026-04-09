// ── Dexcom CGM API proxy — handles OAuth2 + glucose data fetching ──
// Keeps client_secret server-side. All calls require Supabase auth.
// Patterned after api/oura.js for consistency.
//
// Actions via ?action= query param:
//   token    — exchange authorization code for access/refresh tokens (POST)
//   refresh  — refresh an expired access token (POST)
//   data     — proxy GET requests to Dexcom v3 API (GET)
//   config   — return client_id + configured status (GET)

import { checkPersistentRateLimit, logUsage } from './_rateLimit.js';

const EXTERNAL_TIMEOUT_MS = 15_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();

// Use sandbox endpoint by default for safer testing — flip to production
// once your Dexcom dev account is approved for production access.
const DEXCOM_API_BASE = process.env.DEXCOM_USE_SANDBOX === 'true'
  ? 'https://sandbox-api.dexcom.com'
  : 'https://api.dexcom.com';
const DEXCOM_TOKEN_URL = `${DEXCOM_API_BASE}/v2/oauth2/token`;
const DEXCOM_DATA_BASE = `${DEXCOM_API_BASE}/v3/users/self`;

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
  if (!(await checkPersistentRateLimit(userId, 'dexcom', RATE_LIMIT_MAX, 60))) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const clientId = process.env.DEXCOM_CLIENT_ID;
  const clientSecret = process.env.DEXCOM_CLIENT_SECRET;
  const action = req.query.action || (req.method === 'GET' ? 'data' : '');

  try {
    // ── Exchange authorization code for tokens ──
    if (action === 'token') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
      if (!clientId || !clientSecret) return res.status(500).json({ error: 'Dexcom not configured' });

      const { code, redirect_uri } = req.body || {};
      if (!code || !redirect_uri) return res.status(400).json({ error: 'Missing code or redirect_uri' });

      const tokenRes = await fetchWithTimeout(DEXCOM_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri,
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

    // ── Refresh an expired access token ──
    if (action === 'refresh') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
      if (!clientId || !clientSecret) return res.status(500).json({ error: 'Dexcom not configured' });

      const { refresh_token } = req.body || {};
      if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

      const refreshRes = await fetchWithTimeout(DEXCOM_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token,
          grant_type: 'refresh_token',
          redirect_uri: req.body.redirect_uri || '',
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

    // ── Proxy data requests to Dexcom v3 API ──
    if (action === 'data') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

      const { dexcom_token, endpoint, start_date, end_date } = req.query;
      if (!dexcom_token) return res.status(400).json({ error: 'Missing dexcom_token' });

      const allowed = ['egvs', 'events', 'devices', 'dataRange'];
      const ep = endpoint || 'egvs';
      if (!allowed.includes(ep)) return res.status(400).json({ error: 'Invalid endpoint' });

      const params = new URLSearchParams();
      // Dexcom uses startDate / endDate (camelCase, ISO 8601)
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

    // ── Return OAuth config (client_id only, no secret) ──
    if (action === 'config') {
      return res.json({
        client_id: clientId || null,
        configured: !!(clientId && clientSecret),
        sandbox: process.env.DEXCOM_USE_SANDBOX === 'true',
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'Dexcom API timeout' });
    return res.status(500).json({ error: 'Internal error' });
  }
}
