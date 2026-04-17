// ── Dexcom CGM ────────────────────────────────────────────────────────
// OAuth2 token/refresh + data proxy for continuous glucose monitoring.
// Sandbox vs production controlled by DEXCOM_USE_SANDBOX env var.

import { fetchWithTimeout } from '../_fetch.js';
import { logUsage } from '../_rateLimit.js';

const DEXCOM_API_BASE = process.env.DEXCOM_USE_SANDBOX === 'true'
  ? 'https://sandbox-api.dexcom.com'
  : 'https://api.dexcom.com';
const DEXCOM_TOKEN_URL = `${DEXCOM_API_BASE}/v2/oauth2/token`;
const DEXCOM_DATA_BASE = `${DEXCOM_API_BASE}/v3/users/self`;

export async function dexcomHandle(action, req, res, userId) {
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
