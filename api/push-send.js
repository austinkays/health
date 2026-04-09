import webpush from 'web-push';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_EMAIL) {
  webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://salve.health';

/**
 * Verifies a bearer token and returns the user object, or null if invalid.
 * If the token equals the service role key, returns a synthetic service caller sentinel.
 */
async function verifyToken(token) {
  if (!token) return null;

  // Service role caller (cron job or internal server call)
  if (token === SERVICE_ROLE_KEY) {
    return { id: null, role: 'service' };
  }

  // Verify as user JWT via Supabase Auth
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SERVICE_ROLE_KEY,
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user?.id) return null;
    return { id: user.id, role: 'user' };
  } catch {
    return null;
  }
}

/**
 * Fetches push subscriptions for a given user_id from Supabase.
 */
async function getSubscriptions(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=id,endpoint,p256dh,auth`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) return [];
  return res.json();
}

/**
 * Deletes an expired or invalid push subscription by its endpoint.
 */
async function deleteSubscription(endpoint) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );
}

/**
 * Logs a sent notification to the notification_log table (service-role only).
 */
async function logNotification(userId, { title, body, tag, referenceId }) {
  await fetch(`${SUPABASE_URL}/rest/v1/notification_log`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      title,
      body,
      tag: tag || null,
      reference_id: referenceId || null,
      sent_at: new Date().toISOString(),
    }),
  });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const caller = await verifyToken(token);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  // Validate VAPID config
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_EMAIL) {
    console.error('[push-send] VAPID keys not configured');
    return res.status(500).json({ error: 'Push notifications not configured' });
  }

  const { user_id, title, body, tag, url, actions } = req.body || {};

  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  // Users can only push to themselves; service role can specify any user_id
  let targetUserId = user_id;
  if (caller.role === 'user') {
    targetUserId = caller.id;
  } else if (!targetUserId) {
    return res.status(400).json({ error: 'user_id is required for service calls' });
  }

  const subscriptions = await getSubscriptions(targetUserId);
  if (!subscriptions.length) {
    return res.status(200).json({ sent: 0, failed: 0, message: 'No subscriptions found' });
  }

  const payload = JSON.stringify({
    title,
    body,
    tag: tag || 'salve-notification',
    url: url || '/',
    actions: Array.isArray(actions) ? actions.slice(0, 2) : [],
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err) {
        // 410 Gone or 404 = subscription expired/revoked — clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          await deleteSubscription(sub.endpoint);
        } else {
          console.error(`[push-send] Failed to send to ${sub.endpoint}:`, err.message);
        }
        failed++;
      }
    })
  );

  // Log when called by service role (cron scheduler) so cron-reminders can dedup
  if (caller.role === 'service' && sent > 0) {
    await logNotification(targetUserId, { title, body, tag, referenceId: req.body?.reference_id });
  }

  return res.status(200).json({ sent, failed });
}
