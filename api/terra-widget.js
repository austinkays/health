// api/terra-widget.js
// Generates a Terra Widget session URL so the user can pick a provider
// (Fitbit, Garmin, Withings, Dexcom, etc.) and authorize it via OAuth.
// Terra hosts the entire widget UI; we just hand the user a one-time URL.
//
// On success the widget redirects back to TERRA_AUTH_SUCCESS_URL with
// `?user_id=<terra_user_id>&reference_id=<our_user_id>` query params,
// and Terra ALSO fires an `auth` webhook to /api/terra-webhook which is
// where we actually persist the connection. This endpoint just kicks off
// the flow.
//
// Required env vars:
//   TERRA_DEV_ID
//   TERRA_API_KEY
//   TERRA_AUTH_SUCCESS_URL  (e.g. https://salveapp.com/?terra=success)
//   TERRA_AUTH_FAILURE_URL  (e.g. https://salveapp.com/?terra=failure)
//   SUPABASE_SERVICE_ROLE_KEY
//   VITE_SUPABASE_URL or SUPABASE_URL

const EXTERNAL_TIMEOUT_MS = 15_000;
const TERRA_API_BASE = 'https://api.tryterra.co/v2';

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

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

// Providers Terra supports that are most relevant to chronic illness users.
// The widget will only show these by default; pass ?providers= in the
// request to override.
const DEFAULT_PROVIDERS = [
  'FITBIT',
  'GARMIN',
  'WITHINGS',
  'DEXCOM',
  'OURA',         // alternative path to existing Oura integration
  'POLAR',
  'WHOOP',
  'GOOGLE',       // Google Fit
  'SAMSUNG',
  'PELOTON',
  'FREESTYLELIBRE',
  'OMRON',
  'EIGHTSLEEP',
  'COROS',
  'SUUNTO',
];

export default async function handler(req, res) {
  // CORS
  const allowedOrigins = [
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.ALLOWED_ORIGIN,
    'http://localhost:5173',
  ].filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowedOrigins.some(o => origin === o || origin.endsWith('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const devId = process.env.TERRA_DEV_ID;
  const apiKey = process.env.TERRA_API_KEY;
  const successUrl = process.env.TERRA_AUTH_SUCCESS_URL;
  const failureUrl = process.env.TERRA_AUTH_FAILURE_URL;
  if (!devId || !apiKey || !successUrl || !failureUrl) {
    return res.status(500).json({ error: 'Terra not configured' });
  }

  const userId = await verifyAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Optional client override of providers list
  let providers = DEFAULT_PROVIDERS;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (Array.isArray(body.providers) && body.providers.length > 0) {
      providers = body.providers.filter(p => typeof p === 'string').slice(0, 50);
    }
  } catch { /* ignore body parse errors, use defaults */ }

  try {
    const terraRes = await fetchWithTimeout(`${TERRA_API_BASE}/auth/generateWidgetSession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'dev-id': devId,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        reference_id: userId,
        providers: providers.join(','),
        language: 'en',
        auth_success_redirect_url: successUrl,
        auth_failure_redirect_url: failureUrl,
      }),
    });

    if (!terraRes.ok) {
      const errBody = await terraRes.text().catch(() => '');
      console.error('[terra-widget] Terra API error', terraRes.status, errBody);
      return res.status(502).json({ error: 'Terra widget generation failed' });
    }

    const data = await terraRes.json();
    if (!data?.url) {
      return res.status(502).json({ error: 'Terra response missing URL' });
    }
    return res.status(200).json({
      url: data.url,
      session_id: data.session_id,
      expires_in: data.expires_in,
    });
  } catch (err) {
    console.error('[terra-widget] Unexpected error', err);
    return res.status(500).json({ error: 'Failed to generate Terra widget session' });
  }
}
