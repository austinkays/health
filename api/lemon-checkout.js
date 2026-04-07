// api/lemon-checkout.js
// Creates a Lemon Squeezy hosted checkout session for the current user.
// Returns { url } — the client redirects to this URL.
// Requires env vars: LEMON_API_KEY, LEMON_STORE_ID, LEMON_PREMIUM_VARIANT_ID
// Also reads: SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL

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

  // Auth
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Missing authorization' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const lemonKey = process.env.LEMON_API_KEY;
  const storeId = process.env.LEMON_STORE_ID;
  const variantId = process.env.LEMON_PREMIUM_VARIANT_ID;

  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server configuration error' });
  if (!lemonKey || !storeId || !variantId) return res.status(500).json({ error: 'Billing not configured' });

  // Verify auth and get user info
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

  // Build redirect URL — back to app settings after checkout
  const appUrl = origin || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
  const successUrl = `${appUrl}/?checkout=success`;
  const cancelUrl = `${appUrl}/?checkout=cancelled`;

  // Create Lemon Squeezy checkout
  try {
    const lsRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${lemonKey}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_options: {
              embed: false,
              media: true,
              logo: true,
            },
            checkout_data: {
              email: userEmail,
              custom: {
                user_id: userId,
              },
            },
            product_options: {
              redirect_url: successUrl,
            },
            preview: false,
          },
          relationships: {
            store: {
              data: { type: 'stores', id: String(storeId) },
            },
            variant: {
              data: { type: 'variants', id: String(variantId) },
            },
          },
        },
      }),
    });

    if (!lsRes.ok) {
      const err = await lsRes.json().catch(() => ({}));
      console.error('[lemon-checkout] Lemon Squeezy error:', err);
      return res.status(502).json({ error: 'Failed to create checkout' });
    }

    const lsData = await lsRes.json();
    const checkoutUrl = lsData?.data?.attributes?.url;
    if (!checkoutUrl) return res.status(502).json({ error: 'No checkout URL returned' });

    return res.status(200).json({ url: checkoutUrl });
  } catch (err) {
    console.error('[lemon-checkout] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
