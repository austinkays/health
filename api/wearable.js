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
//   ?provider=<name>&action=token    POST → exchange auth code for tokens
//   ?provider=<name>&action=refresh  POST → refresh expired access token
//   ?provider=<name>&action=data     GET  → proxy data request to provider
//   ?provider=<name>&action=config   GET  → return client_id + configured
//   ?provider=oura|fitbit&action=webhook — no user auth (provider's servers)
//
// Per-provider logic lives in api/_wearable/<provider>.js modules. This
// file is just CORS + auth + rate-limit + dispatch.

import { checkPersistentRateLimit } from './_rateLimit.js';
import { verifyAuth } from './_auth.js';
import { ouraHandle, ouraWebhookHandle } from './_wearable/oura.js';
import { dexcomHandle } from './_wearable/dexcom.js';
import { withingsHandle } from './_wearable/withings.js';
import { fitbitHandle, fitbitWebhookHandle } from './_wearable/fitbit.js';
import { whoopHandle } from './_wearable/whoop.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();

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
  const action = req.query.action || (req.method === 'GET' ? 'data' : '');

  // ── Fitbit webhook (no user auth — called by Fitbit's servers) ──
  if (provider === 'fitbit' && action === 'webhook') {
    return fitbitWebhookHandle(req, res);
  }

  // ── Oura webhook (no user auth — called by Oura's servers) ──
  if (provider === 'oura' && action === 'webhook') {
    return ouraWebhookHandle(req, res);
  }

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

  try {
    return await handle(action, req, res, userId);
  } catch (e) {
    if (e?.name === 'AbortError') return res.status(504).json({ error: `${provider} API timeout` });
    console.error(`[wearable:${provider}] Internal error`, e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
