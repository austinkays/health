// ── Oura Ring API proxy — handles OAuth2 token exchange + data fetching ──
// Keeps client_secret server-side. All calls require Supabase auth.
//
// Actions via ?action= query param:
//   token    — exchange authorization code for access/refresh tokens (POST)
//   refresh  — refresh an expired access token (POST)
//   data     — proxy GET requests to Oura V2 API (GET)

const EXTERNAL_TIMEOUT_MS = 15_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();

const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function checkRateLimit(userId) {
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

  // Auth
  const userId = await verifyAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!checkRateLimit(userId)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  const action = req.query.action || (req.method === 'GET' ? 'data' : '');

  try {
    // ── Exchange authorization code for tokens ──
    if (action === 'token') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
      if (!clientId || !clientSecret) return res.status(500).json({ error: 'Oura not configured' });

      const { code, redirect_uri } = req.body;
      if (!code || !redirect_uri) return res.status(400).json({ error: 'Missing code or redirect_uri' });

      const tokenRes = await fetchWithTimeout(OURA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return res.status(tokenRes.status).json({ error: 'Token exchange failed', details: err });
      }

      const tokens = await tokenRes.json();
      // Return access_token, refresh_token, expires_in — client stores encrypted
      return res.json({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
      });
    }

    // ── Refresh an expired access token ──
    if (action === 'refresh') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
      if (!clientId || !clientSecret) return res.status(500).json({ error: 'Oura not configured' });

      const { refresh_token } = req.body;
      if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

      const refreshRes = await fetchWithTimeout(OURA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!refreshRes.ok) {
        const err = await refreshRes.text();
        return res.status(refreshRes.status).json({ error: 'Token refresh failed', details: err });
      }

      const tokens = await refreshRes.json();
      return res.json({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
      });
    }

    // ── Proxy data requests to Oura V2 API ──
    if (action === 'data') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

      const { oura_token, endpoint, start_date, end_date } = req.query;
      if (!oura_token) return res.status(400).json({ error: 'Missing oura_token' });

      const allowed = ['daily_temperature', 'daily_sleep', 'daily_readiness', 'heartrate', 'daily_spo2'];
      const ep = endpoint || 'daily_temperature';
      if (!allowed.includes(ep)) return res.status(400).json({ error: 'Invalid endpoint' });

      const params = new URLSearchParams();
      if (start_date) params.set('start_date', start_date);
      if (end_date) params.set('end_date', end_date);

      const url = `${OURA_API_BASE}/${ep}?${params}`;
      const dataRes = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${oura_token}` },
      });

      if (!dataRes.ok) {
        if (dataRes.status === 401) return res.status(401).json({ error: 'Oura token expired' });
        return res.status(dataRes.status).json({ error: 'Oura API error' });
      }

      const data = await dataRes.json();
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
    if (e.name === 'AbortError') return res.status(504).json({ error: 'Oura API timeout' });
    return res.status(500).json({ error: 'Internal error' });
  }
}
