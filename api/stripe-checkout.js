// api/stripe-checkout.js
// Handles two actions via ?action= query param:
//
//   POST /api/stripe-checkout?action=checkout
//     Creates a Stripe Checkout Session (hosted checkout).
//     Returns { url } — client redirects to this URL.
//     Required env vars: STRIPE_SECRET_KEY, STRIPE_PREMIUM_PRICE_ID
//
//   POST /api/stripe-checkout?action=portal
//     Creates a Stripe Billing Portal Session for subscription management.
//     Returns { url } — client redirects to this URL.
//     Requires the user to have already checked out (stripe_customer_id in profiles).
//     Required env vars: STRIPE_SECRET_KEY
//
// Both actions also require: SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL or SUPABASE_URL

async function fetchWithTimeout(url, opts, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req, res) {
  // ── CORS ──
  const allowedOrigins = [
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.ALLOWED_ORIGIN,
    'http://localhost:5173',
  ].filter(Boolean);
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = req.query.action;
  if (action !== 'checkout' && action !== 'portal') {
    return res.status(400).json({ error: 'Missing or invalid action. Use ?action=checkout or ?action=portal' });
  }

  // ── Auth ──
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Missing authorization' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server configuration error' });
  if (!stripeKey) return res.status(500).json({ error: 'Billing not configured' });

  // ── Verify auth + get user ──
  let userId, userEmail;
  try {
    const userRes = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const userData = await userRes.json();
    userId = userData.id;
    userEmail = userData.email;
  } catch {
    return res.status(500).json({ error: 'Auth verification failed' });
  }

  const appUrl = origin || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

  // ── Stripe helper ──
  const stripePost = (path, params) =>
    fetchWithTimeout(`https://api.stripe.com/v1${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });

  // ────────────────────────────────────────────────────────────
  // action=checkout
  // ────────────────────────────────────────────────────────────
  if (action === 'checkout') {
    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    if (!priceId) return res.status(500).json({ error: 'Billing not configured' });

    try {
      const sessionRes = await stripePost('/checkout/sessions', {
        mode: 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        customer_email: userEmail,
        'metadata[user_id]': userId,
        allow_promotion_codes: 'true',
        success_url: `${appUrl}/?checkout=success`,
        cancel_url: `${appUrl}/?checkout=cancelled`,
      });

      if (!sessionRes.ok) {
        const err = await sessionRes.json().catch(() => ({}));
        console.error('[stripe-checkout] Stripe error:', err);
        return res.status(502).json({ error: 'Failed to create checkout' });
      }

      const session = await sessionRes.json();
      if (!session.url) return res.status(502).json({ error: 'No checkout URL returned' });

      return res.status(200).json({ url: session.url });
    } catch (err) {
      console.error('[stripe-checkout] Unexpected error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  // ────────────────────────────────────────────────────────────
  // action=portal
  // ────────────────────────────────────────────────────────────
  if (action === 'portal') {
    // Fetch stripe_customer_id from profiles
    let stripeCustomerId;
    try {
      const profileRes = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      if (profileRes.ok) {
        const rows = await profileRes.json();
        stripeCustomerId = rows[0]?.stripe_customer_id;
      }
    } catch {
      return res.status(500).json({ error: 'Failed to fetch profile' });
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account found. Please complete a checkout first.' });
    }

    try {
      const portalRes = await stripePost('/billing_portal/sessions', {
        customer: stripeCustomerId,
        return_url: `${appUrl}/`,
      });

      if (!portalRes.ok) {
        const err = await portalRes.json().catch(() => ({}));
        console.error('[stripe-checkout] Portal error:', err);
        return res.status(502).json({ error: 'Failed to create billing portal session' });
      }

      const portalSession = await portalRes.json();
      if (!portalSession.url) return res.status(502).json({ error: 'No portal URL returned' });

      return res.status(200).json({ url: portalSession.url });
    } catch (err) {
      console.error('[stripe-checkout] Portal unexpected error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  }
}
