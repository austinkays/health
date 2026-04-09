// ── Unified Terra API endpoint ──
// Combines the widget-session generator and the webhook receiver into one
// Vercel function so we stay under the Hobby tier 12-function limit.
//
// Routing:
//   POST /api/terra?route=widget   → auth-gated, generates widget URL
//   POST /api/terra?route=webhook  → HMAC-verified webhook from Terra
//
// Configure Terra dashboard webhook URL → /api/terra?route=webhook
// (the ?route=webhook query string is preserved through Vercel rewrites).

import crypto from 'crypto';

const EXTERNAL_TIMEOUT_MS = 15_000;
const TERRA_API_BASE = 'https://api.tryterra.co/v2';

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk.toString()));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
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

function supabaseConfig() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

// ════════════════════════════════════════════════════════════════════════
// ── Widget route ────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const DEFAULT_PROVIDERS = [
  'FITBIT', 'GARMIN', 'WITHINGS', 'DEXCOM', 'OURA', 'POLAR', 'WHOOP',
  'GOOGLE', 'SAMSUNG', 'PELOTON', 'FREESTYLELIBRE', 'OMRON',
  'EIGHTSLEEP', 'COROS', 'SUUNTO',
];

async function handleWidget(req, res) {
  // CORS
  const allowedOrigins = [
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.ALLOWED_ORIGIN,
    'http://localhost:5173',
  ].filter(Boolean);
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const devId = process.env.TERRA_DEV_ID;
  const apiKey = process.env.TERRA_API_KEY;
  const successUrl = process.env.TERRA_AUTH_SUCCESS_URL;
  const failureUrl = process.env.TERRA_AUTH_FAILURE_URL;
  if (!devId || !apiKey || !successUrl || !failureUrl) {
    return res.status(500).json({ error: 'Terra not configured' });
  }

  const userId = await verifyAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  let providers = DEFAULT_PROVIDERS;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (Array.isArray(body.providers) && body.providers.length > 0) {
      providers = body.providers.filter(p => typeof p === 'string').slice(0, 50);
    }
  } catch { /* */ }

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
      console.error('[terra:widget] Terra API error', terraRes.status, errBody);
      return res.status(502).json({ error: 'Terra widget generation failed' });
    }

    const data = await terraRes.json();
    if (!data?.url) return res.status(502).json({ error: 'Terra response missing URL' });
    return res.status(200).json({
      url: data.url,
      session_id: data.session_id,
      expires_in: data.expires_in,
    });
  } catch (err) {
    console.error('[terra:widget] Unexpected error', err);
    return res.status(500).json({ error: 'Failed to generate Terra widget session' });
  }
}

// ════════════════════════════════════════════════════════════════════════
// ── Webhook route ───────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

// Terra signature header format:  t=<timestamp>,v1=<signature>
// Signed payload:                  <timestamp>.<rawBody>
function verifyTerraSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => p.trim().split('='))
  );
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return false;
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const ageMs = Math.abs(Date.now() - ts * 1000);
  if (ageMs > 5 * 60 * 1000) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch { return false; }
}

async function findConnectionByTerraUserId(terraUserId) {
  const { url, key } = supabaseConfig();
  const res = await fetch(
    `${url}/rest/v1/terra_connections?terra_user_id=eq.${encodeURIComponent(terraUserId)}&select=user_id,provider,status&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function upsertConnection(row) {
  const { url, key } = supabaseConfig();
  await fetch(`${url}/rest/v1/terra_connections?on_conflict=terra_user_id`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
}

async function markConnectionStatus(terraUserId, status) {
  const { url, key } = supabaseConfig();
  await fetch(
    `${url}/rest/v1/terra_connections?terra_user_id=eq.${encodeURIComponent(terraUserId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    }
  );
}

async function touchSync(terraUserId) {
  const { url, key } = supabaseConfig();
  await fetch(
    `${url}/rest/v1/terra_connections?terra_user_id=eq.${encodeURIComponent(terraUserId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        last_webhook_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      }),
    }
  ).catch(() => { /* */ });
}

async function bulkInsertVitals(rows) {
  if (!rows.length) return;
  const { url, key } = supabaseConfig();
  await fetch(`${url}/rest/v1/vitals`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
}

async function bulkInsertActivities(rows) {
  if (!rows.length) return;
  const { url, key } = supabaseConfig();
  await fetch(`${url}/rest/v1/activities`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
}

// ── Data shape mappers (Terra → vitals/activities) ──────────────────────

const KG_TO_LB = 2.20462;
const C_TO_F = (c) => c * 9 / 5 + 32;

function isoDate(s) {
  if (!s) return null;
  try { return new Date(s).toISOString().slice(0, 10); } catch { return null; }
}

function parseBodyEvent(payload, userId) {
  const out = [];
  const items = Array.isArray(payload?.data) ? payload.data : [];
  for (const item of items) {
    const date = isoDate(item?.metadata?.start_time) || isoDate(item?.metadata?.end_time);
    if (!date) continue;

    const m = item.body_metrics || item.measurements_data || {};
    if (typeof m.weight_kg === 'number' && m.weight_kg > 0) {
      out.push({
        user_id: userId, date, type: 'weight',
        value: Math.round(m.weight_kg * KG_TO_LB * 10) / 10,
        unit: 'lbs', source: 'terra', notes: '',
      });
    }
    const measurements = Array.isArray(item.measurements) ? item.measurements : [];
    for (const meas of measurements) {
      const mDate = isoDate(meas?.measurement_time) || date;
      if (typeof meas.weight_kg === 'number' && meas.weight_kg > 0) {
        out.push({
          user_id: userId, date: mDate, type: 'weight',
          value: Math.round(meas.weight_kg * KG_TO_LB * 10) / 10,
          unit: 'lbs', source: 'terra', notes: '',
        });
      }
    }

    const bps = Array.isArray(item.blood_pressure_data) ? item.blood_pressure_data : [];
    for (const bp of bps) {
      const sys = bp.systolic_bp ?? bp.systolic;
      const dia = bp.diastolic_bp ?? bp.diastolic;
      const bpDate = isoDate(bp.timestamp) || date;
      if (typeof sys === 'number' && typeof dia === 'number') {
        out.push({
          user_id: userId, date: bpDate, type: 'bp',
          value: Math.round(sys), value2: Math.round(dia),
          unit: 'mmHg', source: 'terra', notes: '',
        });
      }
    }

    const glucs = Array.isArray(item.glucose_data?.blood_glucose_samples)
      ? item.glucose_data.blood_glucose_samples
      : Array.isArray(item.glucose_data) ? item.glucose_data : [];
    for (const g of glucs) {
      const mg = g.blood_glucose_mg_per_dL ?? g.glucose_mg_per_dL ?? g.value;
      const gDate = isoDate(g.timestamp) || date;
      if (typeof mg === 'number' && mg > 0) {
        out.push({
          user_id: userId, date: gDate, type: 'glucose',
          value: Math.round(mg),
          unit: 'mg/dL', source: 'terra', notes: '',
        });
      }
    }

    const temps = Array.isArray(item.temperature_data?.body_temperature_samples)
      ? item.temperature_data.body_temperature_samples : [];
    for (const t of temps) {
      const c = t.temperature_celsius ?? t.value;
      const tDate = isoDate(t.timestamp) || date;
      if (typeof c === 'number') {
        out.push({
          user_id: userId, date: tDate, type: 'temp',
          value: Math.round(C_TO_F(c) * 10) / 10,
          unit: '°F', source: 'terra', notes: '',
        });
      }
    }
  }
  return out;
}

function parseDailyEvent(payload, userId) {
  const out = [];
  const items = Array.isArray(payload?.data) ? payload.data : [];
  for (const item of items) {
    const date = isoDate(item?.metadata?.start_time) || isoDate(item?.metadata?.end_time);
    if (!date) continue;

    const steps = item?.distance_data?.steps;
    if (typeof steps === 'number' && steps >= 0) {
      out.push({
        user_id: userId, date, type: 'steps',
        value: Math.round(steps), unit: 'steps', source: 'terra', notes: '',
      });
    }

    const restingHr = item?.heart_rate_data?.summary?.resting_hr_bpm;
    if (typeof restingHr === 'number' && restingHr > 0) {
      out.push({
        user_id: userId, date, type: 'hr',
        value: Math.round(restingHr), unit: 'bpm', source: 'terra', notes: 'resting',
      });
    }

    const activeKcal = item?.calories_data?.total_burned_calories
      ?? item?.active_durations_data?.activity_seconds;
    if (typeof activeKcal === 'number' && activeKcal > 0) {
      out.push({
        user_id: userId, date, type: 'active_energy',
        value: Math.round(activeKcal), unit: 'kcal', source: 'terra', notes: '',
      });
    }
  }
  return out;
}

function parseSleepEvent(payload, userId) {
  const out = [];
  const items = Array.isArray(payload?.data) ? payload.data : [];
  for (const item of items) {
    const date = isoDate(item?.metadata?.start_time) || isoDate(item?.metadata?.end_time);
    if (!date) continue;
    const asleepSec = item?.sleep_durations_data?.asleep?.duration_asleep_state_seconds;
    if (typeof asleepSec === 'number' && asleepSec > 0) {
      out.push({
        user_id: userId, date, type: 'sleep',
        value: Math.round((asleepSec / 3600) * 10) / 10,
        unit: 'hrs', source: 'terra', notes: '',
      });
    }
  }
  return out;
}

function parseActivityEvent(payload, userId) {
  const out = [];
  const items = Array.isArray(payload?.data) ? payload.data : [];
  for (const item of items) {
    const date = isoDate(item?.metadata?.start_time) || isoDate(item?.metadata?.end_time);
    if (!date) continue;
    const start = item?.metadata?.start_time;
    const end = item?.metadata?.end_time;
    const durMin = (start && end)
      ? Math.round((new Date(end) - new Date(start)) / 60000) : null;
    out.push({
      user_id: userId, date,
      type: (item?.metadata?.name || item?.metadata?.type || 'workout').toString().toLowerCase().slice(0, 80),
      duration_minutes: durMin,
      distance: item?.distance_data?.distance_meters
        ? Math.round((item.distance_data.distance_meters / 1609.344) * 100) / 100
        : null,
      calories: item?.calories_data?.total_burned_calories
        ? Math.round(item.calories_data.total_burned_calories) : null,
      heart_rate_avg: item?.heart_rate_data?.summary?.avg_hr_bpm
        ? Math.round(item.heart_rate_data.summary.avg_hr_bpm) : null,
      source: 'terra',
      notes: '',
    });
  }
  return out;
}

async function handleWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.TERRA_SIGNING_SECRET;
  const { url, key } = supabaseConfig();
  if (!secret || !url || !key) {
    console.error('[terra:webhook] Missing env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const rawBody = await readRawBody(req);
  const sigHeader = req.headers['terra-signature'] || req.headers['Terra-Signature'];
  if (!verifyTerraSignature(rawBody, sigHeader, secret)) {
    console.warn('[terra:webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const eventType = payload?.type;
  const terraUserId = payload?.user?.user_id;
  const provider = payload?.user?.provider;
  const referenceId = payload?.user?.reference_id;

  if (!eventType) {
    console.warn('[terra:webhook] Missing event type');
    return res.status(200).json({ ok: true, note: 'no type' });
  }

  if (eventType === 'auth' || eventType === 'user_reauth') {
    if (!terraUserId || !referenceId) {
      console.warn('[terra:webhook] auth event missing identifiers');
      return res.status(200).json({ ok: true });
    }
    await upsertConnection({
      user_id: referenceId,
      terra_user_id: terraUserId,
      provider: provider || 'unknown',
      reference_id: referenceId,
      status: 'connected',
      connected_at: new Date().toISOString(),
      last_webhook_at: new Date().toISOString(),
    });
    return res.status(200).json({ ok: true });
  }

  if (eventType === 'deauth' || eventType === 'access_revoked') {
    if (terraUserId) await markConnectionStatus(terraUserId, 'disconnected');
    return res.status(200).json({ ok: true });
  }

  if (!terraUserId) {
    console.warn('[terra:webhook] Data event missing terra user_id', eventType);
    return res.status(200).json({ ok: true });
  }
  const conn = await findConnectionByTerraUserId(terraUserId);
  if (!conn) {
    console.warn('[terra:webhook] Unknown terra user_id', terraUserId, eventType);
    return res.status(200).json({ ok: true, note: 'unknown user' });
  }
  const userId = conn.user_id;

  let vitals = [];
  let activities = [];
  switch (eventType) {
    case 'body':     vitals = parseBodyEvent(payload, userId); break;
    case 'daily':    vitals = parseDailyEvent(payload, userId); break;
    case 'sleep':    vitals = parseSleepEvent(payload, userId); break;
    case 'activity': activities = parseActivityEvent(payload, userId); break;
    default:
      console.log('[terra:webhook] Ignoring event type', eventType);
      return res.status(200).json({ ok: true, note: 'ignored' });
  }

  try {
    if (vitals.length) await bulkInsertVitals(vitals);
    if (activities.length) await bulkInsertActivities(activities);
    touchSync(terraUserId);
    return res.status(200).json({
      ok: true,
      ingested: { vitals: vitals.length, activities: activities.length },
    });
  } catch (err) {
    console.error('[terra:webhook] Insert failed', err);
    return res.status(500).json({ error: 'Failed to ingest data' });
  }
}

// ════════════════════════════════════════════════════════════════════════
// ── Router ──────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  const route = req.query.route;
  if (route === 'widget') return handleWidget(req, res);
  if (route === 'webhook') return handleWebhook(req, res);
  return res.status(400).json({ error: 'Unknown or missing route. Use ?route=widget or ?route=webhook.' });
}
