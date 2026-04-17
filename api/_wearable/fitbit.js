// ── Fitbit ─────────────────────────────────────────────────────────────
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

import { fetchWithTimeout } from '../_fetch.js';
import { logUsage } from '../_rateLimit.js';
import {
  upsertWearableConnection,
  getWearableConnection,
  deleteWearableConnection,
  getConnectionByProviderUserId,
  patchConnectionTokens,
  touchConnectionWebhook,
  bulkInsertVitals,
  bulkInsertActivities,
  vitalAlreadyExists,
  activityAlreadyExists,
} from './shared.js';

const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const FITBIT_API_BASE = 'https://api.fitbit.com';

function basicAuthHeader(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export async function fitbitHandle(action, req, res, userId) {
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

    // Persist tokens in Supabase so the webhook handler can act on the
    // user's behalf when Fitbit pushes updates. Falls through to the
    // client return below even if Supabase write fails — the localStorage
    // flow still works for manual sync in that case, so connect isn't
    // fully blocked by a transient DB hiccup. Phase 4 will make Supabase
    // the authoritative source and drop localStorage.
    const expiresInRaw = Number(tokens.expires_in);
    const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 28800;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    let conn = null;
    try {
      conn = await upsertWearableConnection({
        user_id: userId,
        provider: 'fitbit',
        provider_user_id: tokens.user_id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: tokens.scope || null,
        status: 'connected',
        subscription_ids: [],
        last_error: null,
      });
    } catch (e) {
      console.error('[fitbit:token] wearable_connections upsert failed', e);
    }

    // Register 3 Fitbit webhook subscriptions (activities, sleep, body).
    // Subscription IDs must be unique across ALL of a user's subscriptions
    // (not just per-collection), so we suffix the connection uuid with
    // the collection name rather than reusing the bare uuid. Best-effort
    // on individual failures — log the response body so Vercel runtime
    // logs show the exact Fitbit error if a subscription is rejected.
    if (conn?.id) {
      const collections = ['activities', 'sleep', 'body'];
      const registered = [];
      for (const collection of collections) {
        const subId = `${conn.id}-${collection}`;
        try {
          const subRes = await fetchWithTimeout(
            `${FITBIT_API_BASE}/1/user/-/${collection}/apiSubscriptions/${subId}.json`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            }
          );
          if (subRes.ok) {
            registered.push({ collection, id: subId });
            console.log(`[fitbit:subscribe] ${collection} registered (${subRes.status}) id=${subId}`);
          } else {
            const body = await subRes.text().catch(() => '');
            console.warn(`[fitbit:subscribe] ${collection} failed (${subRes.status}) id=${subId}:`, body);
          }
        } catch (e) {
          console.warn(`[fitbit:subscribe] ${collection} threw id=${subId}`, e);
        }
      }
      if (registered.length > 0) {
        try {
          await upsertWearableConnection({
            user_id: userId,
            provider: 'fitbit',
            provider_user_id: tokens.user_id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expiresAt,
            scope: tokens.scope || null,
            status: 'connected',
            subscription_ids: registered,
            last_error: null,
          });
        } catch (e) {
          console.warn('[fitbit:subscribe] sub-id persist failed', e);
        }
      }
    }

    // Still return tokens to the client — the browser needs them for
    // its own /api/wearable?action=data calls until Phase 4 moves sync
    // server-side. Server write above is the canonical copy; client
    // mirror in localStorage is temporary.
    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      user_id: tokens.user_id,
    });
  }

  if (action === 'status') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
    const conn = await getWearableConnection(userId, 'fitbit');
    if (!conn) return res.json({ connected: false });
    return res.json({
      connected: conn.status === 'connected',
      status: conn.status,
      last_webhook_at: conn.last_webhook_at,
      last_sync_at: conn.last_sync_at,
      expires_at: conn.expires_at,
      subscription_count: Array.isArray(conn.subscription_ids) ? conn.subscription_ids.length : 0,
      last_error: conn.last_error,
    });
  }

  if (action === 'disconnect') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    const conn = await getWearableConnection(userId, 'fitbit');
    if (!conn) return res.json({ ok: true, already_disconnected: true });

    // Delete each subscription from Fitbit's side. Best-effort — a
    // Fitbit-side error shouldn't block the local cleanup, otherwise
    // users get permanently stuck. Log failures for operator visibility.
    const subs = Array.isArray(conn.subscription_ids) ? conn.subscription_ids : [];
    for (const s of subs) {
      if (!s?.collection || !s?.id) continue;
      try {
        const delRes = await fetchWithTimeout(
          `${FITBIT_API_BASE}/1/user/-/${s.collection}/apiSubscriptions/${s.id}.json`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${conn.access_token}` },
          }
        );
        if (!delRes.ok && delRes.status !== 404) {
          const body = await delRes.text().catch(() => '');
          console.warn(`[fitbit:disconnect] sub delete ${s.collection} (${delRes.status}):`, body);
        }
      } catch (e) {
        console.warn(`[fitbit:disconnect] sub delete ${s.collection} threw`, e);
      }
    }

    // Revoke the access token so Fitbit invalidates it server-side.
    // Also best-effort — if it fails the token will still expire on
    // its own (8h), and the row is already gone from our DB.
    try {
      await fetchWithTimeout(`${FITBIT_API_BASE}/oauth2/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuthHeader(clientId, clientSecret),
        },
        body: new URLSearchParams({ token: conn.access_token }),
      });
    } catch (e) {
      console.warn('[fitbit:disconnect] revoke threw', e);
    }

    await deleteWearableConnection(userId, 'fitbit');
    return res.json({ ok: true });
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
      '/1/user/-/spo2/',
      '/1/user/-/br/',
      '/1/user/-/temp/',
      '/1/user/-/hrv/',
      '/1/user/-/cardioscore/',
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

// ── Fitbit Subscription Webhook ──────────────────────────────────────
// Handles two request types from Fitbit's servers (no user auth):
//
// 1. GET  ?verify=<code> — Fitbit verifies your endpoint by sending your
//    subscriber verification code. Respond 204 if it matches, 404 if not.
//
// 2. POST — Fitbit sends a JSON array of update notifications when user
//    data changes. Respond 204 immediately. Each notification has:
//    { collectionType, date, ownerId, ownerType, subscriptionId }
//
// Env var: FITBIT_SUBSCRIBER_VERIFY — the verification code you set in
// the Fitbit developer dashboard under your subscriber.

// ── Fitbit webhook ingestion helpers ───────────────────────────────
// Server-side equivalents of the transforms in src/services/fitbit.js
// (syncFitbitData). Phase 3 of the live-push migration uses these to
// take an incoming notification, fetch the day's data for the relevant
// collection, and upsert into vitals/activities so the user sees fresh
// data without manual sync.

async function getValidFitbitAccessToken(conn) {
  const expiresAt = conn.expires_at ? Date.parse(conn.expires_at) : 0;
  const now = Date.now();
  if (expiresAt && expiresAt - now > 5 * 60 * 1000) {
    return conn.access_token;
  }

  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  if (!clientId || !clientSecret || !conn.refresh_token) return conn.access_token;

  const res = await fetchWithTimeout(FITBIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(clientId, clientSecret),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.warn('[fitbit:refresh] failed', res.status, err);
    return conn.access_token;
  }
  const tokens = await res.json();
  const expiresIn = Number.isFinite(Number(tokens.expires_in)) && Number(tokens.expires_in) > 0
    ? Number(tokens.expires_in) : 28800;
  await patchConnectionTokens(conn.user_id, 'fitbit', {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  });
  return tokens.access_token;
}

// Fetch one day's worth of data for a Fitbit collection. Returns the
// raw API response or null on error. Matching what syncFitbitData does
// client-side, just for a single date.
async function fetchFitbitDay(token, collectionType, date) {
  const calls = {
    activities: [
      `/1/user/-/activities/date/${date}.json`,
      `/1/user/-/activities/heart/date/${date}/1d.json`,
    ],
    sleep: [`/1.2/user/-/sleep/date/${date}.json`],
    body: [`/1/user/-/body/log/weight/date/${date}.json`],
  };
  const paths = calls[collectionType];
  if (!paths) return null;

  const results = await Promise.all(paths.map(p =>
    fetchWithTimeout(`${FITBIT_API_BASE}${p}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : null).catch(() => null)
  ));
  return results;
}

// Transform Fitbit's day-summary responses into Salve vitals/activities
// rows tagged source='fitbit'. Mirrors the field shapes used by the
// legacy syncFitbitData() in src/services/fitbit.js so charts render
// identically whether the data arrived via webhook or manual sync.
function transformFitbitDay(collectionType, date, responses) {
  const out = { vitals: [], activities: [] };
  if (!Array.isArray(responses)) return out;

  if (collectionType === 'activities') {
    const [summary, hrData] = responses;

    // Daily steps + active calories from the summary object
    const summaryObj = summary?.summary || {};
    const steps = Number(summaryObj.steps);
    if (Number.isFinite(steps) && steps > 0) {
      out.vitals.push({
        date, type: 'steps', value: String(steps), value2: '', unit: 'steps',
        source: 'fitbit', notes: '',
      });
    }
    const activeCal = Number(summaryObj.activityCalories);
    if (Number.isFinite(activeCal) && activeCal > 0) {
      out.vitals.push({
        date, type: 'active_energy', value: String(activeCal), value2: '', unit: 'cal',
        source: 'fitbit', notes: '',
      });
    }

    // Resting heart rate from the heart day record
    const hrDays = Array.isArray(hrData?.['activities-heart']) ? hrData['activities-heart'] : [];
    const todayHr = hrDays.find(d => d.dateTime === date);
    const rhr = todayHr?.value?.restingHeartRate;
    if (typeof rhr === 'number' && rhr > 0) {
      out.vitals.push({
        date, type: 'hr', value: String(Math.round(rhr)), value2: '', unit: 'bpm',
        source: 'fitbit', notes: 'Resting',
      });
    }
  }

  if (collectionType === 'sleep') {
    const [sleepData] = responses;
    const sessions = Array.isArray(sleepData?.sleep) ? sleepData.sleep : [];
    let totalMinutes = 0;
    for (const s of sessions) {
      if (s.dateOfSleep === date) {
        totalMinutes += Number(s.minutesAsleep) || 0;
      }
    }
    if (totalMinutes > 0) {
      const hrs = Math.round((totalMinutes / 60) * 10) / 10;
      out.vitals.push({
        date, type: 'sleep', value: String(hrs), value2: '', unit: 'hrs',
        source: 'fitbit', notes: '',
      });
    }
  }

  if (collectionType === 'body') {
    const [weightData] = responses;
    const weights = Array.isArray(weightData?.weight) ? weightData.weight : [];
    // Take the most recent entry for the day if multiple
    const todayWeights = weights.filter(w => w.date === date);
    if (todayWeights.length > 0) {
      const latest = todayWeights[todayWeights.length - 1];
      const lbs = typeof latest.weight === 'number'
        ? Math.round(latest.weight * 2.20462 * 10) / 10
        : null;
      if (lbs !== null) {
        out.vitals.push({
          date, type: 'weight', value: String(lbs), value2: '', unit: 'lbs',
          source: 'fitbit', notes: '',
        });
      }
    }
  }

  return out;
}

export async function fitbitWebhookHandle(req, res) {
  const verifyCode = process.env.FITBIT_SUBSCRIBER_VERIFY;

  // Verification challenge — Fitbit GET with ?verify=<code>
  if (req.method === 'GET') {
    const challenge = req.query.verify;
    if (!challenge || !verifyCode) return res.status(404).end();
    if (challenge === verifyCode) return res.status(204).end();
    return res.status(404).end();
  }

  // Notification — Fitbit POST with JSON array of updates.
  // Must respond 204 within 5 seconds — Fitbit retries on other codes.
  // Pattern: respond IMMEDIATELY, then continue processing in-function.
  // Vercel keeps the function alive until handler return, so the heavy
  // work runs after the response with the remainder of maxDuration=30.
  if (req.method === 'POST') {
    const notifications = Array.isArray(req.body) ? req.body : [];
    if (notifications.length === 0) {
      return res.status(204).end();
    }
    console.log(`[fitbit:webhook] received ${notifications.length} notification(s):`,
      notifications.map(n => `${n.collectionType}:${n.date}:${n.ownerId}`).join(', ')
    );

    // Respond 204 first so Fitbit doesn't time out
    res.status(204).end();

    // Now do the actual ingestion. Errors are logged per-notification
    // — we never throw past this point because there's no response to
    // affect; the user's already gotten 204.
    let totalVitals = 0;
    let totalActivities = 0;
    for (const n of notifications) {
      try {
        const { collectionType, date, ownerId } = n || {};
        if (!collectionType || !date || !ownerId) {
          console.warn('[fitbit:webhook] missing fields, skipping');
          continue;
        }

        const conn = await getConnectionByProviderUserId('fitbit', ownerId);
        if (!conn) {
          console.warn(`[fitbit:webhook] no wearable_connections for fitbit user_id=${ownerId}`);
          continue;
        }

        let token;
        try { token = await getValidFitbitAccessToken(conn); }
        catch (e) {
          console.warn(`[fitbit:webhook] token refresh failed for user=${conn.user_id}`, e);
          continue;
        }

        let responses;
        try { responses = await fetchFitbitDay(token, collectionType, date); }
        catch (e) {
          console.warn(`[fitbit:webhook] day fetch failed`, e?.message || e);
          continue;
        }
        if (!responses) continue;

        const { vitals, activities } = transformFitbitDay(collectionType, date, responses);

        const vitalsToInsert = [];
        for (const row of vitals) {
          const exists = await vitalAlreadyExists(conn.user_id, row.date, row.type, 'fitbit');
          if (!exists) vitalsToInsert.push({ ...row, user_id: conn.user_id });
        }
        const activitiesToInsert = [];
        for (const row of activities) {
          const exists = await activityAlreadyExists(conn.user_id, row.date, row.type, 'fitbit', row.duration_minutes);
          if (!exists) activitiesToInsert.push({ ...row, user_id: conn.user_id });
        }

        if (vitalsToInsert.length) await bulkInsertVitals(vitalsToInsert);
        if (activitiesToInsert.length) await bulkInsertActivities(activitiesToInsert);
        totalVitals += vitalsToInsert.length;
        totalActivities += activitiesToInsert.length;

        await touchConnectionWebhook(conn.user_id, 'fitbit');
      } catch (e) {
        console.error('[fitbit:webhook] notification handler threw', e);
      }
    }

    console.log(`[fitbit:webhook] processed ${notifications.length} notification(s), wrote ${totalVitals} vitals + ${totalActivities} activities`);
    return;
  }

  return res.status(405).end();
}
