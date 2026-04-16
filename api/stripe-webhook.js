// api/stripe-webhook.js
// Handles Stripe subscription lifecycle webhooks.
// Verifies Stripe-Signature header (HMAC-SHA256 with timestamp replay protection).
//
// Events handled:
//   checkout.session.completed        → store stripe_customer_id, upgrade to premium
//   customer.subscription.updated     → sync tier based on subscription status
//   customer.subscription.deleted     → downgrade to free
//
// Env vars: STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL

import crypto from 'crypto';

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk.toString()));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(',').map(p => { const [k, v] = p.split('='); return [k, v]; })
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  // Replay protection: reject events older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (isNaN(age) || age > 300) return false;

  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
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

  const rawBody = await readRawBody(req);
  const sigHeader = req.headers['stripe-signature'];

  if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
    console.warn('[stripe-webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const type = event.type;
  const obj = event.data?.object;

  // Guard once here rather than sprinkling `obj?.` through every branch.
  // Stripe normally always sends `data.object`, but a malformed or unknown
  // event shouldn't take down the handler with a TypeError. 200-OK so Stripe
  // doesn't redeliver indefinitely.
  if (!obj) {
    console.warn(`[stripe-webhook] ${type}: event.data.object missing; acknowledging to avoid retry storm`);
    return res.status(200).json({ ok: true, note: 'malformed event' });
  }

  // Helper: update profile by user_id
  async function updateProfile(userId, updates) {
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
        body: JSON.stringify(updates),
      }
    );
    if (!updateRes.ok) {
      const text = await updateRes.text();
      console.error(`[stripe-webhook] DB update failed for ${userId}:`, updateRes.status, text);
      return false;
    }
    return true;
  }

  try {
    if (type === 'checkout.session.completed') {
      const userId = obj.metadata?.user_id;
      if (!userId) {
        console.warn('[stripe-webhook] checkout.session.completed without user_id');
        return res.status(200).json({ ok: true, note: 'no user_id' });
      }

      const customerId = obj.customer;
      const subscriptionId = obj.subscription;

      const ok = await updateProfile(userId, {
        tier: 'premium',
        trial_expires_at: null,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
      });

      console.log(`[stripe-webhook] checkout.session.completed → premium for ${userId} (ok=${ok})`);
      return res.status(200).json({ ok });
    }

    if (type === 'customer.subscription.updated') {
      const userId = obj.metadata?.user_id;
      if (!userId) {
        console.warn('[stripe-webhook] subscription.updated without user_id');
        return res.status(200).json({ ok: true, note: 'no user_id in metadata' });
      }

      const status = obj.status; // active, trialing, canceled, past_due, unpaid, paused
      const ACTIVE_STATUSES = new Set(['active', 'trialing']);

      const tier = ACTIVE_STATUSES.has(status) ? 'premium' : 'free';
      const updates = { tier };
      if (tier === 'premium') updates.trial_expires_at = null;

      const ok = await updateProfile(userId, updates);
      console.log(`[stripe-webhook] subscription.updated (${status}) → ${tier} for ${userId}`);
      return res.status(200).json({ ok });
    }

    if (type === 'customer.subscription.deleted') {
      const userId = obj.metadata?.user_id;
      if (!userId) {
        console.warn('[stripe-webhook] subscription.deleted without user_id');
        return res.status(200).json({ ok: true, note: 'no user_id in metadata' });
      }

      const ok = await updateProfile(userId, { tier: 'free', stripe_subscription_id: null });
      console.log(`[stripe-webhook] subscription.deleted → free for ${userId}`);
      return res.status(200).json({ ok });
    }

    if (type === 'invoice.payment_failed') {
      // Payment failed — Stripe will retry per dunning settings. We don't
      // downgrade immediately (the subscription.updated/deleted events handle
      // that), but log it for observability. If you want to show a banner in-app,
      // set a flag on the profile here.
      const customerId = obj.customer;
      const subscriptionId = obj.subscription;
      console.warn(`[stripe-webhook] invoice.payment_failed for customer=${customerId} sub=${subscriptionId}`);

      // Optional: look up user by stripe_customer_id and flag for in-app banner
      if (customerId) {
        const lookupRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${customerId}&select=id`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        if (lookupRes.ok) {
          const profiles = await lookupRes.json();
          if (profiles[0]?.id) {
            await updateProfile(profiles[0].id, { payment_failed: true });
            console.log(`[stripe-webhook] Flagged payment_failed for user ${profiles[0].id}`);
          }
        }
      }
      return res.status(200).json({ ok: true });
    }

    // Unhandled event type — acknowledge
    return res.status(200).json({ ok: true, note: `unhandled: ${type}` });
  } catch (err) {
    console.error('[stripe-webhook] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

export const config = { api: { bodyParser: false } };
