// ── Whoop ─────────────────────────────────────────────────────────────
// OAuth2 token/refresh + data proxy. Requires 'offline' scope to get a
// refresh_token. App approval required before credentials are granted.

import { fetchWithTimeout } from '../_fetch.js';
import { logUsage } from '../_rateLimit.js';

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';

export async function whoopHandle(action, req, res, userId) {
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
