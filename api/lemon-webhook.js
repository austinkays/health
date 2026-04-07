// api/lemon-webhook.js
// Handles Lemon Squeezy subscription lifecycle webhooks.
// Verifies HMAC-SHA256 signature, then upserts profiles.tier based on event.
//
// Events handled:
//   subscription_created / subscription_updated / subscription_resumed
//     → tier = 'premium', trial_expires_at = NULL (permanent, no trial limit)
//   subscription_cancelled / subscription_expired / subscription_paused
//     → tier = 'free'
//
// Required env vars:
//   LEMON_WEBHOOK_SECRET    — signing secret from LS dashboard
//   SUPABASE_SERVICE_ROLE_KEY
//   VITE_SUPABASE_URL or SUPABASE_URL

import crypto from 'crypto';

// Read body as raw text so we can verify the signature before parsing
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk.toString()));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret = process.env.LEMON_WEBHOOK_SECRET;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    console.error('[lemon-webhook] Missing env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read raw body BEFORE any parsing
  const rawBody = await readRawBody(req);

  // Verify HMAC-SHA256 signature
  const signature = req.headers['x-signature'];
  if (!signature) return res.status(401).json({ error: 'Missing signature' });

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    console.warn('[lemon-webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventName = payload?.meta?.event_name;
  const userId = payload?.meta?.custom_data?.user_id;

  if (!userId) {
    console.warn('[lemon-webhook] No user_id in custom_data:', eventName);
    return res.status(200).json({ ok: true, note: 'no user_id' });
  }

  // Map event → tier update
  const UPGRADE_EVENTS = new Set([
    'subscription_created',
    'subscription_updated',
    'subscription_resumed',
  ]);
  const DOWNGRADE_EVENTS = new Set([
    'subscription_cancelled',
    'subscription_expired',
    'subscription_paused',
  ]);

  let tierUpdate = null;
  if (UPGRADE_EVENTS.has(eventName)) {
    // Permanent premium — clear trial expiry so server never downgrades them
    tierUpdate = { tier: 'premium', trial_expires_at: null };
  } else if (DOWNGRADE_EVENTS.has(eventName)) {
    tierUpdate = { tier: 'free' };
  } else {
    // Unknown event — acknowledge without acting
    return res.status(200).json({ ok: true, note: `unhandled event: ${eventName}` });
  }

  // Upsert the profile tier via Supabase REST API (service role bypasses RLS)
  try {
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(tierUpdate),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      console.error('[lemon-webhook] Supabase update failed:', updateRes.status, text);
      return res.status(500).json({ error: 'DB update failed' });
    }

    console.log(`[lemon-webhook] ${eventName} → ${tierUpdate.tier} for user ${userId}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[lemon-webhook] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// Tell Vercel/Next not to parse the body — we need raw bytes for HMAC
export const config = { api: { bodyParser: false } };
