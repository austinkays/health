// api/delete-account.js
// Permanently deletes the user's auth account + all associated data.
// All user-owned tables reference auth.users(id) with ON DELETE CASCADE,
// so removing the auth row cleans up every row the user ever created.

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Require the user's session token in Authorization header so only the
  // user themselves can delete their own account.
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  const token = authHeader.slice(7);

  // Confirmation word must be in the body — a second layer beyond the UI modal.
  const { confirm } = req.body || {};
  if (confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Confirmation required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Step 1 — verify the bearer token and resolve the user id
  let userId;
  try {
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    });
    if (!verifyRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const userData = await verifyRes.json();
    userId = userData.id;
    if (!userId) return res.status(401).json({ error: 'No user id in session' });
  } catch {
    return res.status(500).json({ error: 'Auth verification failed' });
  }

  // Step 2 — cancel any active Stripe subscriptions so the user isn't billed
  // after their account is gone
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    try {
      // Look up the user's stripe_customer_id from their profile
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
        {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        }
      );
      const profiles = profileRes.ok ? await profileRes.json() : [];
      const customerId = profiles[0]?.stripe_customer_id;

      if (customerId) {
        // List all active/trialing/past_due subscriptions for this customer
        const subRes = await fetch(
          `https://api.stripe.com/v1/customers/${customerId}/subscriptions?status=active&status=trialing&status=past_due`,
          {
            headers: { Authorization: `Basic ${Buffer.from(stripeKey + ':').toString('base64')}` },
          }
        );
        if (subRes.ok) {
          const subs = await subRes.json();
          for (const sub of subs.data || []) {
            await fetch(`https://api.stripe.com/v1/subscriptions/${sub.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Basic ${Buffer.from(stripeKey + ':').toString('base64')}` },
            });
            console.log(`[delete-account] Cancelled Stripe subscription ${sub.id} for ${userId}`);
          }
        }
      }
    } catch (e) {
      // Log but don't block deletion — better to orphan a sub than leave a user stuck
      console.error('[delete-account] Stripe cancellation error (proceeding with deletion):', e);
    }
  }

  // Step 3 — delete the auth user via admin API (cascades to all user data)
  try {
    const deleteRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${userId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      }
    );
    if (!deleteRes.ok) {
      const detail = await deleteRes.text();
      console.error('[delete-account] admin delete failed:', deleteRes.status, detail);
      return res.status(500).json({ error: 'Account deletion failed' });
    }
  } catch (e) {
    console.error('[delete-account] exception:', e);
    return res.status(500).json({ error: 'Account deletion failed' });
  }

  return res.status(200).json({ ok: true, deleted: userId });
}
