// CURRENT: Runs daily at 7am UTC (Vercel Hobby plan limit).
// UPGRADE PATH: Vercel Pro ($20/mo) enables "* * * * *" (every minute).
// ALT: Supabase pg_cron can call a Supabase Edge Function every minute for free.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Dedicated secret for authenticating with /api/push-send. Kept separate from
// SUPABASE_SERVICE_ROLE_KEY so push authority is decoupled from DB authority.
const PUSH_INTERNAL_SECRET = process.env.PUSH_INTERNAL_SECRET;

/**
 * Makes an authenticated Supabase REST API request.
 */
async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Returns today's date string in YYYY-MM-DD (UTC).
 */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calls /api/push-send internally using the service role key.
 * Returns { sent, failed } or null on network failure.
 */
async function sendPush(userId, { title, body, tag, url, referenceId }) {
  try {
    // Derive the base URL from SUPABASE_URL is not reliable — use VERCEL_URL if available,
    // otherwise fall back to localhost for local dev.
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const res = await fetch(`${baseUrl}/api/push-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PUSH_INTERNAL_SECRET}`,
      },
      body: JSON.stringify({ user_id: userId, title, body, tag, url, reference_id: referenceId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[cron-reminders] push-send error for user ${userId}:`, data);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[cron-reminders] push-send network error for user ${userId}:`, err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // Verify cron secret — Vercel sets this header automatically when using vercel.json crons,
  // but we also support manual Bearer token format for local testing.
  const authHeader = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!PUSH_INTERNAL_SECRET) {
    console.error('[cron-reminders] PUSH_INTERNAL_SECRET not configured — cannot call push-send');
    return res.status(500).json({ error: 'PUSH_INTERNAL_SECRET not configured' });
  }

  const today = todayUTC();
  console.log(`[cron-reminders] Running for ${today}`);

  let reminders = [];
  try {
    // Fetch all enabled medication reminders
    reminders = await supabaseGet(
      '/medication_reminders?enabled=eq.true&select=id,user_id,medication_id,reminder_time,days_before_refill'
    );
  } catch (err) {
    console.error('[cron-reminders] Failed to fetch reminders:', err.message);
    return res.status(500).json({ error: 'Failed to fetch reminders' });
  }

  if (!reminders.length) {
    console.log('[cron-reminders] No enabled reminders found.');
    return res.status(200).json({ checked: 0, sent: 0 });
  }

  // Fetch today's notification log to avoid duplicate sends
  let alreadySentToday = new Set();
  try {
    const logs = await supabaseGet(
      `/notification_log?sent_at=gte.${today}T00:00:00Z&sent_at=lt.${today}T23:59:59Z&select=reference_id`
    );
    alreadySentToday = new Set(logs.map((l) => l.reference_id).filter(Boolean));
  } catch (err) {
    // Non-fatal — log warning and continue; worst case we send a duplicate
    console.warn('[cron-reminders] Could not fetch notification log (dedup skipped):', err.message);
  }

  // Collect unique medication IDs to look up names in one query
  const medicationIds = [...new Set(reminders.map((r) => r.medication_id).filter(Boolean))];
  let medicationNames = {};
  if (medicationIds.length) {
    try {
      const meds = await supabaseGet(
        `/medications?id=in.(${medicationIds.join(',')})&select=id,name,display_name`
      );
      for (const med of meds) {
        medicationNames[med.id] = med.display_name || med.name;
      }
    } catch (err) {
      console.warn('[cron-reminders] Could not fetch medication names:', err.message);
    }
  }

  let sent = 0;
  const checked = reminders.length;

  for (const reminder of reminders) {
    const reminderId = String(reminder.id);

    // Skip if already sent today for this reminder
    if (alreadySentToday.has(reminderId)) {
      console.log(`[cron-reminders] Skipping reminder ${reminderId} — already sent today`);
      continue;
    }

    const medName = medicationNames[reminder.medication_id] || 'your medication';
    const daysLabel =
      reminder.days_before_refill > 1
        ? `${reminder.days_before_refill} days`
        : reminder.days_before_refill === 1
        ? 'tomorrow'
        : 'today';

    const result = await sendPush(reminder.user_id, {
      title: 'Salve Medication Reminder',
      body: `Time to refill ${medName} — your refill is due ${daysLabel}.`,
      tag: `refill-${reminder.medication_id}`,
      url: '/meds',
      referenceId: reminderId,
    });

    if (result && result.sent > 0) {
      sent++;
      console.log(`[cron-reminders] Sent reminder ${reminderId} for user ${reminder.user_id}`);
    }
  }

  console.log(`[cron-reminders] Done — checked: ${checked}, sent: ${sent}`);

  // ── Feedback notification ─────────────────────────────────────────────
  // Notify admin users about new feedback submitted in the last 24 hours.
  let feedbackCount = 0;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const newFeedback = await supabaseGet(
      `/feedback?created_at=gte.${since}&select=id,type,message&order=created_at.desc&limit=10`
    );
    if (newFeedback.length > 0) {
      // Find admin users to notify
      const admins = await supabaseGet(`/profiles?tier=eq.admin&select=id`);
      for (const admin of admins) {
        const body = newFeedback.length === 1
          ? `New ${newFeedback[0].type}: "${(newFeedback[0].message || '').slice(0, 80)}"`
          : `${newFeedback.length} new feedback submissions in the last 24h`;
        await sendPush(admin.id, {
          title: 'Salve: New Feedback',
          body,
          tag: 'feedback-digest',
          url: '/settings',
        });
      }
      feedbackCount = newFeedback.length;
      console.log(`[cron-reminders] Notified admins about ${feedbackCount} new feedback items`);
    }
  } catch (err) {
    // Non-fatal — feedback notifications are a convenience, not critical
    console.warn('[cron-reminders] Feedback notification failed:', err.message);
  }

  return res.status(200).json({ checked, sent, feedbackCount });
}
