// api/terra-webhook.js
// Receives webhook events from Terra and ingests them into the user's
// vitals / activities tables. Verifies the HMAC signature on every
// request before processing.
//
// Event types we handle:
//   auth          → register a new terra_connections row
//   deauth        → mark connection disconnected
//   user_reauth   → re-confirm an existing connection
//   body          → vitals (weight, bmi, body_fat, blood_pressure, glucose, temp)
//   daily         → vitals (steps, resting_hr, hrv, active_energy)
//   sleep         → vitals (sleep duration in hours)
//   activity      → activities (workout)
//
// Anything else is logged and ignored.
//
// Required env vars:
//   TERRA_SIGNING_SECRET
//   SUPABASE_SERVICE_ROLE_KEY
//   VITE_SUPABASE_URL or SUPABASE_URL

import crypto from 'crypto';

// ── Helpers ─────────────────────────────────────────────────────────────

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk.toString()));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

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

  // Reject signatures older than 5 minutes (replay protection)
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
  } catch {
    return false;
  }
}

// ── Supabase REST helpers (no SDK to keep cold-start small) ─────────────

function supabaseConfig() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
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
      apikey: key,
      Authorization: `Bearer ${key}`,
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
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
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
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        last_webhook_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      }),
    }
  ).catch(() => { /* fire-and-forget */ });
}

async function bulkInsertVitals(rows) {
  if (!rows.length) return;
  const { url, key } = supabaseConfig();
  await fetch(`${url}/rest/v1/vitals`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
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
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
}

// ── Data shape mappers ──────────────────────────────────────────────────

const KG_TO_LB = 2.20462;
const C_TO_F = (c) => c * 9 / 5 + 32;

function isoDate(s) {
  if (!s) return null;
  try { return new Date(s).toISOString().slice(0, 10); } catch { return null; }
}

// "body" event → vitals (weight, BMI, body fat, blood pressure, glucose, temp)
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
    // Some payloads stash measurements differently
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

    // Blood pressure
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

    // Glucose readings (CGM users — Dexcom, FreeStyle Libre, etc.)
    const glucs = Array.isArray(item.glucose_data?.blood_glucose_samples)
      ? item.glucose_data.blood_glucose_samples
      : Array.isArray(item.glucose_data)
        ? item.glucose_data
        : [];
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

    // Body temperature
    const temps = Array.isArray(item.temperature_data?.body_temperature_samples)
      ? item.temperature_data.body_temperature_samples
      : [];
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

// "daily" event → vitals (steps, resting HR, HRV, active energy)
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

    const hrv = item?.heart_rate_data?.summary?.avg_hrv_rmssd;
    // (we don't currently have an hrv vital type — skip silently)
    void hrv;

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

// "sleep" event → vitals (sleep duration in hours)
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

// "activity" event → activities (workouts)
function parseActivityEvent(payload, userId) {
  const out = [];
  const items = Array.isArray(payload?.data) ? payload.data : [];
  for (const item of items) {
    const date = isoDate(item?.metadata?.start_time) || isoDate(item?.metadata?.end_time);
    if (!date) continue;
    const start = item?.metadata?.start_time;
    const end = item?.metadata?.end_time;
    const durMin = (start && end)
      ? Math.round((new Date(end) - new Date(start)) / 60000)
      : null;
    out.push({
      user_id: userId, date,
      type: (item?.metadata?.name || item?.metadata?.type || 'workout').toString().toLowerCase().slice(0, 80),
      duration_minutes: durMin,
      distance: item?.distance_data?.distance_meters
        ? Math.round((item.distance_data.distance_meters / 1609.344) * 100) / 100
        : null,
      calories: item?.calories_data?.total_burned_calories
        ? Math.round(item.calories_data.total_burned_calories)
        : null,
      heart_rate_avg: item?.heart_rate_data?.summary?.avg_hr_bpm
        ? Math.round(item.heart_rate_data.summary.avg_hr_bpm)
        : null,
      source: 'terra',
      notes: '',
    });
  }
  return out;
}

// ── Handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.TERRA_SIGNING_SECRET;
  const { url, key } = supabaseConfig();
  if (!secret || !url || !key) {
    console.error('[terra-webhook] Missing env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const rawBody = await readRawBody(req);
  const sigHeader = req.headers['terra-signature'] || req.headers['Terra-Signature'];
  if (!verifyTerraSignature(rawBody, sigHeader, secret)) {
    console.warn('[terra-webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const eventType = payload?.type;
  const terraUserId = payload?.user?.user_id;
  const provider = payload?.user?.provider;
  const referenceId = payload?.user?.reference_id;

  // Always 200 to webhook events we don't recognize so Terra doesn't retry
  // forever. Log for debugging.
  if (!eventType) {
    console.warn('[terra-webhook] Missing event type');
    return res.status(200).json({ ok: true, note: 'no type' });
  }

  // Auth event: register the connection
  if (eventType === 'auth' || eventType === 'user_reauth') {
    if (!terraUserId || !referenceId) {
      console.warn('[terra-webhook] auth event missing identifiers');
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

  // Deauth event
  if (eventType === 'deauth' || eventType === 'access_revoked') {
    if (terraUserId) await markConnectionStatus(terraUserId, 'disconnected');
    return res.status(200).json({ ok: true });
  }

  // Data events: look up our user_id from the terra_user_id
  if (!terraUserId) {
    console.warn('[terra-webhook] Data event missing terra user_id', eventType);
    return res.status(200).json({ ok: true });
  }
  const conn = await findConnectionByTerraUserId(terraUserId);
  if (!conn) {
    console.warn('[terra-webhook] Unknown terra user_id', terraUserId, eventType);
    return res.status(200).json({ ok: true, note: 'unknown user' });
  }
  const userId = conn.user_id;

  let vitals = [];
  let activities = [];
  switch (eventType) {
    case 'body':
      vitals = parseBodyEvent(payload, userId);
      break;
    case 'daily':
      vitals = parseDailyEvent(payload, userId);
      break;
    case 'sleep':
      vitals = parseSleepEvent(payload, userId);
      break;
    case 'activity':
      activities = parseActivityEvent(payload, userId);
      break;
    default:
      console.log('[terra-webhook] Ignoring event type', eventType);
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
    console.error('[terra-webhook] Insert failed', err);
    return res.status(500).json({ error: 'Failed to ingest data' });
  }
}
