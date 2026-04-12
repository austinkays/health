// api/stripe-checkout.js
// Stripe Checkout session creation + Billing Portal.
// ?action=checkout — creates a Checkout Session, returns { url }
// ?action=portal  — creates a Billing Portal session, returns { url }
//
// Env vars: STRIPE_SECRET_KEY, STRIPE_PREMIUM_PRICE_ID, STRIPE_ANNUAL_PRICE_ID,
//           SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL

export default async function handler(req, res) {
  // CORS
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

  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Missing authorization' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server configuration error' });
  if (!stripeKey) return res.status(500).json({ error: 'Billing not configured' });

  // Verify auth
  let userId, userEmail;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const userData = await userRes.json();
    userId = userData.id;
    userEmail = userData.email;
  } catch {
    return res.status(500).json({ error: 'Auth verification failed' });
  }

  const action = req.query?.action || req.body?.action || 'checkout';
  const appUrl = origin || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

  // ── Portal ──────────────────────────────────────────────
  if (action === 'portal') {
    // Look up stripe_customer_id from profile
    let customerId;
    try {
      const profRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      const profiles = await profRes.json();
      customerId = profiles?.[0]?.stripe_customer_id;
    } catch { /* fall through */ }

    if (!customerId) return res.status(400).json({ error: 'No subscription found' });

    try {
      const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(stripeKey + ':').toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          customer: customerId,
          return_url: appUrl,
        }),
      });

      if (!portalRes.ok) {
        const err = await portalRes.json().catch(() => ({}));
        console.error('[stripe-checkout] Portal error:', err);
        return res.status(502).json({ error: 'Failed to open billing portal' });
      }

      const portal = await portalRes.json();
      return res.status(200).json({ url: portal.url });
    } catch (err) {
      console.error('[stripe-checkout] Portal unexpected error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  // ── Checkout ────────────────────────────────────────────
  const plan = req.body?.plan || 'monthly';
  const priceId = plan === 'annual'
    ? process.env.STRIPE_ANNUAL_PRICE_ID
    : process.env.STRIPE_PREMIUM_PRICE_ID;

  if (!priceId) return res.status(500).json({ error: 'Price not configured' });

  try {
    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
      customer_email: userEmail,
      'metadata[user_id]': userId,
      'subscription_data[metadata][user_id]': userId,
    });

    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(stripeKey + ':').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
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
