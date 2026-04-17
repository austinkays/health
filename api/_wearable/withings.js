// ── Withings ──────────────────────────────────────────────────────────
// OAuth2 token/refresh + data proxy. Withings wraps successful responses
// as { status: 0, body: {...} } and errors as nonzero status codes —
// unwrapWithings normalizes this into standard HTTP-style handling.

import { fetchWithTimeout } from '../_fetch.js';
import { logUsage } from '../_rateLimit.js';

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

export async function withingsHandle(action, req, res, userId) {
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
