// api/stripe-webhook.js
// Handles Stripe subscription lifecycle webhooks.
// Verifies HMAC-SHA256 signature (Stripe-Signature header), then updates
// profiles.tier based on event type.
//
// Events handled:
//   checkout.session.completed
//     → tier = 'premium', trial_expires_at = NULL (permanent)
//     → stores stripe_customer_id + stripe_subscription_id on profile
//   customer.subscription.updated
//     → active/trialing  → tier = 'premium'
//     → canceled/past_due/unpaid/paused → tier = 'free'
//   customer.subscription.deleted
//     → tier = 'free'
//
// Required env vars:
//   STRIPE_WEBHOOK_SECRET     — signing secret from Stripe dashboard → Webhooks
//   SUPABASE_SERVICE_ROLE_KEY
//   VITE_SUPABASE_URL or SUPABASE_URL

import crypto from 'crypto';

// Read body as raw buffer so we can verify the HMAC before parsing
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Stripe-Signature header format: t=<timestamp>,v1=<hex_sig>[,v1=<hex_sig>...]
// Payload signed: "<timestamp>.<rawBody>"
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;

  const parts = {};
  for (const part of sigHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx);
      const val = part.slice(idx + 1);
      if (!parts[key]) parts[key] = [];
      parts[key].push(val);
    }
  }

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) return false;

  // Replay protection: reject if timestamp is >5 minutes old
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  return signatures.some(sig => {
    try {
      const sigBuf = Buffer.from(sig, 'hex');
      return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}

async function updateProfile(supabaseUrl, serviceKey, userId, patch) {
  const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  return res;
}

// Look up a user by their Stripe customer ID
async function findUserByCustomer(supabaseUrl, serviceKey, stripeCustomerId) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&select=id`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.id || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    console.error('[stripe-webhook] Missing env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read raw body BEFORE any parsing
  const rawBody = await readRawBody(req);

  // Verify Stripe signature
  const sigHeader = req.headers['stripe-signature'];
  if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
    console.warn('[stripe-webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { type, data } = event;
  const obj = data?.object;

  // ── checkout.session.completed ──────────────────────────────────────────────
  if (type === 'checkout.session.completed') {
    // Only act on paid subscription checkouts
    if (obj?.mode !== 'subscription' || obj?.payment_status !== 'paid') {
      return res.status(200).json({ ok: true, note: 'non-subscription or unpaid checkout' });
    }

    const userId = obj?.metadata?.user_id;
    if (!userId) {
      console.warn('[stripe-webhook] checkout.session.completed: no user_id in metadata');
      return res.status(200).json({ ok: true, note: 'no user_id in metadata' });
    }

    const stripeCustomerId = obj?.customer;
    const stripeSubscriptionId = obj?.subscription;

    try {
      const updateRes = await updateProfile(supabaseUrl, serviceKey, userId, {
        tier: 'premium',
        trial_expires_at: null,
        stripe_customer_id: stripeCustomerId || null,
        stripe_subscription_id: stripeSubscriptionId || null,
      });

      if (!updateRes.ok) {
        const text = await updateRes.text();
        console.error('[stripe-webhook] Supabase update failed:', updateRes.status, text);
        return res.status(500).json({ error: 'DB update failed' });
      }

      console.log(`[stripe-webhook] checkout.session.completed → premium for user ${userId}`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[stripe-webhook] Unexpected error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  // ── customer.subscription.updated ──────────────────────────────────────────
  if (type === 'customer.subscription.updated') {
    const stripeCustomerId = obj?.customer;
    const status = obj?.status;

    if (!stripeCustomerId) {
      return res.status(200).json({ ok: true, note: 'no customer id' });
    }

    const ACTIVE_STATUSES = new Set(['active', 'trialing']);
    const INACTIVE_STATUSES = new Set(['canceled', 'past_due', 'unpaid', 'paused', 'incomplete_expired']);
    const newTier = ACTIVE_STATUSES.has(status) ? 'premium' : INACTIVE_STATUSES.has(status) ? 'free' : null;

    if (newTier === null) {
      // e.g. 'incomplete' — don't act, wait for a more definitive event
      return res.status(200).json({ ok: true, note: `unhandled subscription status: ${status}` });
    }

    try {
      const userId = await findUserByCustomer(supabaseUrl, serviceKey, stripeCustomerId);
      if (!userId) {
        console.warn(`[stripe-webhook] subscription.updated: no profile for customer ${stripeCustomerId}`);
        return res.status(200).json({ ok: true, note: 'no matching profile' });
      }

      const patch = newTier === 'premium'
        ? { tier: 'premium', trial_expires_at: null, stripe_subscription_id: obj?.id || null }
        : { tier: 'free' };

      const updateRes = await updateProfile(supabaseUrl, serviceKey, userId, patch);
      if (!updateRes.ok) {
        const text = await updateRes.text();
        console.error('[stripe-webhook] Supabase update failed:', updateRes.status, text);
        return res.status(500).json({ error: 'DB update failed' });
      }

      console.log(`[stripe-webhook] subscription.updated (${status}) → ${newTier} for user ${userId}`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[stripe-webhook] Unexpected error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  // ── customer.subscription.deleted ──────────────────────────────────────────
  if (type === 'customer.subscription.deleted') {
    const stripeCustomerId = obj?.customer;
    if (!stripeCustomerId) {
      return res.status(200).json({ ok: true, note: 'no customer id' });
    }

    try {
      const userId = await findUserByCustomer(supabaseUrl, serviceKey, stripeCustomerId);
      if (!userId) {
        console.warn(`[stripe-webhook] subscription.deleted: no profile for customer ${stripeCustomerId}`);
        return res.status(200).json({ ok: true, note: 'no matching profile' });
      }

      const updateRes = await updateProfile(supabaseUrl, serviceKey, userId, { tier: 'free' });
      if (!updateRes.ok) {
        const text = await updateRes.text();
        console.error('[stripe-webhook] Supabase update failed:', updateRes.status, text);
        return res.status(500).json({ error: 'DB update failed' });
      }

      console.log(`[stripe-webhook] subscription.deleted → free for user ${userId}`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[stripe-webhook] Unexpected error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  // Unknown event — acknowledge silently to prevent Stripe retry storms
  return res.status(200).json({ ok: true, note: `unhandled event: ${type}` });
}

// Tell Vercel not to parse the body — we need raw bytes for HMAC
export const config = { api: { bodyParser: false } };
