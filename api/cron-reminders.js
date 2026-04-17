// Runs every minute via Vercel Pro cron.
// Timezone-aware: only fires reminders whose scheduled hour matches the user's local hour.

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
 * PATCH a single row by id in a Supabase table.
 */
async function supabasePatch(table, id, patch) {
  await fetch(`${SUPABASE_URL}/rest/v1${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  }).catch(() => { /* best-effort */ });
}

/**
 * Returns today's date string in YYYY-MM-DD (UTC).
 */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns today's date string in YYYY-MM-DD in the given IANA timezone.
 */
function todayInTimezone(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Los_Angeles' }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  }
}

/**
 * Returns tomorrow's date string in YYYY-MM-DD in the given IANA timezone.
 */
function tomorrowInTimezone(tz) {
  const todayStr = todayInTimezone(tz);
  const d = new Date(todayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the current hour (0-23) in the given IANA timezone.
 * Falls back to 'America/Los_Angeles' on invalid timezone.
 */
function currentLocalHour(timezone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(fmt.format(new Date()), 10);
  } catch {
    // Invalid timezone string — fall back to PT
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(fmt.format(new Date()), 10);
  }
}

/**
 * Extracts the hour (0-23) from a reminder_time string like "08:00:00" or "14:30".
 */
function reminderHour(timeStr) {
  if (!timeStr) return null;
  const h = parseInt(timeStr.split(':')[0], 10);
  return Number.isFinite(h) ? h : null;
}

/**
 * Formats "08:00:00" or "14:30" into a friendly label like "8:00 AM" or "2:30 PM".
 */
function formatTimeLabel(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  if (!Number.isFinite(h)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
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
      '/medication_reminders?enabled=eq.true&select=id,user_id,medication_id,reminder_time,label'
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

  // Fetch timezones for all users with reminders
  const userIds = [...new Set(reminders.map((r) => r.user_id).filter(Boolean))];
  let userTimezones = {};
  if (userIds.length) {
    try {
      const profiles = await supabaseGet(
        `/profiles?id=in.(${userIds.join(',')})&select=id,timezone`
      );
      for (const p of profiles) {
        userTimezones[p.id] = p.timezone || 'America/Los_Angeles';
      }
    } catch (err) {
      console.warn('[cron-reminders] Could not fetch user timezones:', err.message);
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

    // ── Timezone-aware delivery window ──────────────────────────────────
    // Cron runs every minute (Vercel Pro). Only fire reminders whose
    // scheduled hour matches the user's current local hour (±0 tolerance).
    const userTz = userTimezones[reminder.user_id] || 'America/Los_Angeles';
    const localHour = currentLocalHour(userTz);
    const rHour = reminderHour(reminder.reminder_time);
    if (rHour !== null && rHour !== localHour) continue;

    const medName = medicationNames[reminder.medication_id] || 'your medication';
    const timeLabel = reminder.reminder_time
      ? formatTimeLabel(reminder.reminder_time)
      : '';
    const bodyText = timeLabel
      ? `Time to take ${medName} (${timeLabel})`
      : `Time to take ${medName}`;

    const result = await sendPush(reminder.user_id, {
      title: reminder.label || 'Salve Medication Reminder',
      body: bodyText,
      tag: `dose-${reminder.medication_id}`,
      url: '/meds',
      referenceId: reminderId,
    });

    if (result && result.sent > 0) {
      sent++;
      console.log(`[cron-reminders] Sent reminder ${reminderId} for user ${reminder.user_id}`);
    }
  }

  console.log(`[cron-reminders] Done — checked: ${checked}, sent: ${sent}`);

  // ── Appointment-eve reminders ───────────────────────────────────────
  // At 8 PM local time, remind users about tomorrow's appointments.
  let appointmentsSent = 0;
  try {
    // Get all users who have push subscriptions
    const pushUsers = await supabaseGet('/push_subscriptions?select=user_id');
    const pushUserIds = [...new Set(pushUsers.map((p) => p.user_id).filter(Boolean))];

    if (pushUserIds.length) {
      // Fetch timezones for push users not already in the map
      const missingTzIds = pushUserIds.filter((id) => !userTimezones[id]);
      if (missingTzIds.length) {
        try {
          const profiles = await supabaseGet(
            `/profiles?id=in.(${missingTzIds.join(',')})&select=id,timezone`
          );
          for (const p of profiles) {
            userTimezones[p.id] = p.timezone || 'America/Los_Angeles';
          }
        } catch (err) {
          console.warn('[cron-reminders] Could not fetch extra timezones:', err.message);
        }
      }

      // Find users whose local hour is 20 (8 PM)
      const eveningUsers = pushUserIds.filter(
        (id) => currentLocalHour(userTimezones[id] || 'America/Los_Angeles') === 20
      );

      if (eveningUsers.length) {
        // Get tomorrow's date for each user's timezone
        const userTomorrows = {};
        for (const uid of eveningUsers) {
          userTomorrows[uid] = tomorrowInTimezone(userTimezones[uid] || 'America/Los_Angeles');
        }

        // Fetch appointments for the date range we care about
        const dates = [...new Set(Object.values(userTomorrows))];
        const appointments = await supabaseGet(
          `/appointments?date=in.(${dates.join(',')})&user_id=in.(${eveningUsers.join(',')})&select=id,user_id,date,time,provider,reason`
        );

        for (const appt of appointments) {
          if (appt.date !== userTomorrows[appt.user_id]) continue;
          const refId = `appt-eve-${appt.id}`;
          if (alreadySentToday.has(refId)) continue;

          const provider = appt.provider ? ` with ${appt.provider}` : '';
          const time = appt.time ? ` at ${appt.time}` : '';
          const reason = appt.reason ? ` — ${appt.reason}` : '';

          const result = await sendPush(appt.user_id, {
            title: 'Upcoming Appointment Tomorrow',
            body: `Appointment${provider}${time}${reason}`.slice(0, 200),
            tag: `appt-eve-${appt.id}`,
            url: '/appointments',
            referenceId: refId,
          });
          if (result && result.sent > 0) appointmentsSent++;
        }
      }
    }
    if (appointmentsSent) console.log(`[cron-reminders] Sent ${appointmentsSent} appointment-eve reminders`);
  } catch (err) {
    console.warn('[cron-reminders] Appointment-eve reminders failed:', err.message);
  }

  // ── Overdue todo alerts ─────────────────────────────────────────────
  // At 9 AM local time, alert users about overdue incomplete to-do items.
  let todosSent = 0;
  try {
    const pushUsers = await supabaseGet('/push_subscriptions?select=user_id');
    const pushUserIds = [...new Set(pushUsers.map((p) => p.user_id).filter(Boolean))];

    // Find users whose local hour is 9 (9 AM)
    const morningUsers = pushUserIds.filter(
      (id) => currentLocalHour(userTimezones[id] || 'America/Los_Angeles') === 9
    );

    if (morningUsers.length) {
      // Get today's date per user timezone to compare against due_date
      const userTodays = {};
      for (const uid of morningUsers) {
        userTodays[uid] = todayInTimezone(userTimezones[uid] || 'America/Los_Angeles');
      }

      // Fetch incomplete, non-dismissed todos with due dates for these users
      const todos = await supabaseGet(
        `/todos?completed=eq.false&dismissed=eq.false&due_date=neq.&user_id=in.(${morningUsers.join(',')})&select=id,user_id,title,due_date`
      );

      // Group overdue todos by user
      const overdueByUser = {};
      for (const todo of todos) {
        const userToday = userTodays[todo.user_id];
        if (userToday && todo.due_date && todo.due_date < userToday) {
          if (!overdueByUser[todo.user_id]) overdueByUser[todo.user_id] = [];
          overdueByUser[todo.user_id].push(todo);
        }
      }

      for (const [uid, items] of Object.entries(overdueByUser)) {
        const refId = `todo-overdue-${userTodays[uid]}`;
        if (alreadySentToday.has(refId)) continue;

        const body = items.length === 1
          ? `Overdue: ${items[0].title}`
          : `You have ${items.length} overdue to-do items`;

        const result = await sendPush(uid, {
          title: 'Salve: Overdue To-Do\'s',
          body: body.slice(0, 200),
          tag: 'todo-overdue',
          url: '/todos',
          referenceId: refId,
        });
        if (result && result.sent > 0) todosSent++;
      }
    }
    if (todosSent) console.log(`[cron-reminders] Sent ${todosSent} overdue todo alerts`);
  } catch (err) {
    console.warn('[cron-reminders] Overdue todo alerts failed:', err.message);
  }

  // ── Oura subscription renewal ───────────────────────────────────────
  // Once daily at 06:00 UTC, renew Oura webhook subscriptions expiring
  // within 7 days. Idempotent — safe to run more often.
  let ouraRenewed = 0;
  const OURA_CLIENT_ID = process.env.OURA_CLIENT_ID;
  const OURA_CLIENT_SECRET = process.env.OURA_CLIENT_SECRET;
  const nowUTCHour = new Date().getUTCHours();

  if (OURA_CLIENT_ID && OURA_CLIENT_SECRET && nowUTCHour === 6) {
    try {
      const allSubs = await supabaseGet('/oura_app_subscriptions?select=*');
      const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const dueForRenewal = allSubs.filter((s) => {
        if (!s.expiration_time) return true;
        return Date.parse(s.expiration_time) < horizon;
      });

      for (const sub of dueForRenewal) {
        try {
          const renewRes = await fetch(
            `https://api.ouraring.com/v2/webhook/subscription/renew/${encodeURIComponent(sub.id)}`,
            {
              method: 'PUT',
              headers: { 'x-client-id': OURA_CLIENT_ID, 'x-client-secret': OURA_CLIENT_SECRET },
            }
          );
          if (!renewRes.ok) {
            const body = await renewRes.text().catch(() => '');
            console.warn(`[cron-oura] Renew ${sub.data_type} (${sub.id}) failed ${renewRes.status}: ${body}`);
            await supabasePatch('/oura_app_subscriptions', sub.id, {
              status: 'error',
              last_error: `renew ${renewRes.status}: ${body.slice(0, 200)}`,
            });
            continue;
          }
          const renewed = await renewRes.json();
          await supabasePatch('/oura_app_subscriptions', sub.id, {
            expiration_time: renewed.expiration_time || null,
            status: 'active',
            last_error: null,
          });
          ouraRenewed++;
        } catch (e) {
          console.warn(`[cron-oura] Renew ${sub.data_type} threw:`, e.message);
        }
      }
      if (ouraRenewed || dueForRenewal.length) {
        console.log(`[cron-oura] Renewed ${ouraRenewed}/${dueForRenewal.length} subscriptions`);
      }
    } catch (err) {
      console.warn('[cron-oura] Subscription renewal failed:', err.message);
    }
  }

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

  return res.status(200).json({ checked, sent, feedbackCount, appointmentsSent, todosSent, ouraRenewed });
}
