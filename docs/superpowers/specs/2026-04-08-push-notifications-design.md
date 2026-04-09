# Push Notifications & Medication Reminders — Design Spec

> Phase 2 of the competitive roadmap. Table stakes for a medication tracking app — Medisafe's core feature, now paywalled. Salve offers it free.

## Overview

PWA Web Push notifications for medication reminders, appointment alerts, refill warnings, journal prompts, and todo due dates. Custom time per medication. Server-side scheduling via Supabase Edge Function on a cron trigger.

## Architecture

```
Client (PWA)                          Server (Supabase + Vercel)
─────────────                         ──────────────────────────
1. Request notification permission
2. Subscribe to push (VAPID)
3. Send PushSubscription to server ──► Store in push_subscriptions table
4. User sets reminder times ─────────► Store in medication_reminders table
                                       
                                       Supabase cron (every 1 min):
                                       ├─ Query due reminders
                                       ├─ web-push to each subscription
                                       └─ Log sent notifications
                                       
5. Service worker receives push
6. Show notification with actions
7. User taps "Taken" ───────────────► Update adherence in journal/vitals
```

## Database Schema

### New table: `push_subscriptions`
```sql
CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);
```

### New table: `medication_reminders`
```sql
CREATE TABLE medication_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  medication_id UUID NOT NULL,
  reminder_time TIME NOT NULL,         -- e.g., '08:30:00'
  enabled BOOLEAN DEFAULT true,
  label TEXT,                          -- optional custom label
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, medication_id, reminder_time)
);
ALTER TABLE medication_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reminders" ON medication_reminders
  FOR ALL USING (auth.uid() = user_id);
```

### New table: `notification_log`
```sql
CREATE TABLE notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,                  -- 'medication', 'appointment', 'refill', 'journal', 'todo'
  reference_id UUID,                  -- medication_id, appointment_id, etc.
  sent_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'sent',          -- 'sent', 'delivered', 'clicked', 'failed'
  error TEXT
);
-- No RLS needed — server-only table, not exposed to client
```

## Environment Variables (New)

| Variable | Where | Purpose |
|----------|-------|---------|
| `VAPID_PUBLIC_KEY` | `.env.local` + Vercel env vars | Web Push VAPID public key (shared with client) |
| `VAPID_PRIVATE_KEY` | Vercel env vars only | Web Push VAPID private key (server-side only) |
| `VAPID_EMAIL` | Vercel env vars only | Contact email for push service (e.g., `mailto:salveapp@proton.me`) |

Generate VAPID keys once: `npx web-push generate-vapid-keys`

## Client Components

### 1. Push Subscription Manager (`src/services/push.js`)

```
subscribeToPush()     — request permission + subscribe + save to Supabase
unsubscribeFromPush() — unsubscribe + delete from Supabase
isSubscribed()        — check if current browser is subscribed
getPermissionState()  — 'granted' | 'denied' | 'default'
```

- Uses `navigator.serviceWorker.ready` to access the push manager
- VAPID public key from `import.meta.env.VITE_VAPID_PUBLIC_KEY`
- Saves `PushSubscription` (endpoint, p256dh, auth keys) to Supabase `push_subscriptions` table
- Handles permission denied gracefully (shows explanation, doesn't re-prompt)

### 2. Notification Preferences UI (in Settings.jsx)

New section in Settings: "Notifications"
- Toggle: Enable push notifications (triggers permission request)
- Status indicator: Enabled / Disabled / Blocked (browser-level)
- If blocked: "Notifications are blocked. Open browser settings to allow."
- Sub-section: Medication Reminders
  - List of active medications with toggle + time picker per med
  - Add reminder button per medication
  - Multiple reminders per med (e.g., morning + evening for twice-daily)

### 3. Medication Reminder UI (in Medications.jsx)

On each medication card (expanded view):
- "Reminders" row showing scheduled times
- Quick "Add reminder" button
- Time picker (native `<input type="time">`)
- Toggle to enable/disable without deleting

### 4. Service Worker Push Handler

Extend existing `sw.js` (or Workbox-generated SW) to handle push events:

```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'Time for your medication',
    icon: '/icon-192.png',
    badge: '/favicon.svg',
    tag: data.tag || 'medication-reminder',
    data: { url: data.url || '/', action: data.action },
    actions: data.actions || [
      { action: 'taken', title: '✓ Taken' },
      { action: 'snooze', title: 'Snooze 15min' },
    ],
    requireInteraction: true,  // stay visible until user acts
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Salve', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data;
  // Open app and handle action
  event.waitUntil(
    clients.openWindow(data.url || '/')
  );
});
```

## Server Components

### 1. Push Send Endpoint (`api/push-send.js`)

Vercel serverless function that sends a push notification to a specific user:
- Authenticated (Supabase service role key for cron, or user token for test sends)
- Uses `web-push` npm package
- Input: `{ user_id, title, body, tag, actions, url }`
- Queries `push_subscriptions` for user, sends to all subscriptions
- Handles expired/invalid subscriptions (410 Gone → delete from table)
- Logs to `notification_log`

### 2. Cron Scheduler (`api/cron-reminders.js`)

Vercel cron job (runs every minute via `vercel.json` cron config):

```
Every minute:
1. Get current time (UTC)
2. Query medication_reminders WHERE:
   - enabled = true
   - reminder_time matches current HH:MM (with timezone conversion)
   - No notification_log entry for this reminder today
3. For each due reminder:
   - Look up medication name from medications table
   - Look up user's push_subscriptions
   - Send push: "Time for {med_name} {dose}"
   - Log to notification_log
```

**Timezone handling:**
- Store user's timezone in `profiles` table (new column: `timezone TEXT`)
- Convert reminder_time (user's local time) to UTC for comparison
- Default to America/Los_Angeles if not set

**vercel.json cron config:**
```json
{
  "crons": [
    {
      "path": "/api/cron-reminders",
      "schedule": "* * * * *"
    }
  ]
}
```

Note: Vercel Hobby plan supports cron but only runs daily. Vercel Pro supports per-minute cron. For Hobby, alternative is Supabase pg_cron or Edge Function with cron trigger.

### 3. Reminder Types (future extensibility)

The cron job initially handles medication reminders. The architecture supports adding:
- **Appointment reminders**: query appointments table for tomorrow's + today's appointments
- **Refill alerts**: query medications where refill_date is within N days
- **Journal prompt**: daily prompt at user-configured time
- **Todo due dates**: query todos where due_date is today or overdue

Each type is a separate query in the cron function, all using the same `push-send` pathway.

## Notification Types & Content

| Type | Title | Body | Actions | Timing |
|------|-------|------|---------|--------|
| Medication | "💊 {med_name}" | "Time for your {dose} {med_name}" | Taken / Snooze | Per-med custom time |
| Appointment | "📅 {provider}" | "{reason} tomorrow at {time}" | Open / Dismiss | Day before, 9am |
| Refill | "💊 Refill soon" | "{med_name} refill due in {N} days" | Open / Dismiss | 3 days before refill_date |
| Journal | "📝 How are you?" | "Take a moment to check in" | Open / Dismiss | User-configured time |
| Todo | "✓ Due today" | "{todo_title}" | Open / Dismiss | Morning of due_date |

## New Dependencies

| Package | Purpose | Where |
|---------|---------|-------|
| `web-push` | Send Web Push notifications from server | `api/` (server-side only) |

No new client dependencies — Web Push API is native to browsers.

## Files to Create

| File | Purpose |
|------|---------|
| `src/services/push.js` | Client push subscription management |
| `api/push-send.js` | Serverless: send push to a user |
| `api/cron-reminders.js` | Serverless cron: check and send due reminders |
| `supabase/migrations/023_push_notifications.sql` | Schema for push_subscriptions, medication_reminders, notification_log |
| `public/push-sw.js` | Push event handler (injected into service worker) |

## Files to Modify

| File | Change |
|------|--------|
| `src/components/sections/Settings.jsx` | Add Notifications section with push toggle + reminder list |
| `src/components/sections/Medications.jsx` | Add reminder time picker on expanded med cards |
| `vercel.json` | Add cron configuration |
| `vite.config.js` | Inject push handler into service worker |
| `src/services/db.js` | Add CRUD for medication_reminders + push_subscriptions |
| `src/hooks/useHealthData.js` | Load medication_reminders in loadAll |
| `profiles` table | Add timezone column (migration) |

## Edge Cases

- **Multiple devices**: User may have push subscriptions on phone + laptop. Send to all.
- **Expired subscriptions**: Push service returns 410 → delete subscription from DB.
- **Permission denied**: Show explanation, don't re-prompt. Offer to open browser settings.
- **Timezone changes**: User travels → timezone in profile should update (manual or auto-detect).
- **Medication deactivated**: Reminders for inactive meds should auto-disable.
- **Duplicate sends**: notification_log prevents sending the same reminder twice per day.
- **Vercel Hobby cron limit**: Hobby plan only supports daily crons. For per-minute scheduling, use Supabase pg_cron calling an Edge Function, or upgrade to Vercel Pro.
- **Demo mode**: Push subscription should be blocked in demo mode (no user_id to associate).

## Privacy

- Push subscriptions are per-device, stored with RLS
- Notification content is minimal (medication name + dose only — no conditions or health data)
- notification_log is server-only, not exposed to client API
- Push payloads are encrypted by the Web Push protocol (TLS + ECDH)
- User can unsubscribe at any time (deletes all subscriptions)
