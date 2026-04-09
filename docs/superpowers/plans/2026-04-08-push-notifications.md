# Push Notifications & Medication Reminders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PWA Web Push notifications for medication reminders with custom per-medication times, plus appointment/refill/todo alerts.

**Architecture:** Client-side push subscription via Web Push API → stored in Supabase. Vercel serverless cron endpoint checks due reminders every minute and sends pushes via `web-push` npm package. Service worker handles push events and notification actions. Starts with Vercel cron (daily on Hobby plan); upgrade path to per-minute cron on Vercel Pro or Supabase pg_cron noted throughout.

**Tech Stack:** Web Push API (browser-native), `web-push` (npm, server-side only), Supabase (RLS tables), Vercel serverless + cron, vite-plugin-pwa (Workbox)

> **Future upgrade paths (noted for when revenue flows):**
> - Vercel Hobby → Pro ($20/mo): enables per-minute cron (`* * * * *`) instead of daily
> - Supabase pg_cron: free alternative for per-minute scheduling, runs inside existing Supabase
> - Supabase Edge Functions: alternative to Vercel serverless for push sending

---

### Task 1: Database Migration — Push Tables

**Files:**
- Create: `supabase/migrations/023_push_notifications.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 023: Push notifications — subscriptions, medication reminders, notification log

-- ── Push subscriptions (one per device per user) ──
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_push_sub_user_id
  BEFORE INSERT ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER update_push_sub_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Medication reminders (custom time per med) ──
CREATE TABLE IF NOT EXISTS medication_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_id uuid NOT NULL,
  reminder_time time NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, medication_id, reminder_time)
);

ALTER TABLE medication_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reminders" ON medication_reminders
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_reminder_user_id
  BEFORE INSERT ON medication_reminders
  FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER update_reminder_updated_at
  BEFORE UPDATE ON medication_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_reminders_user ON medication_reminders(user_id);
CREATE INDEX idx_reminders_time ON medication_reminders(reminder_time) WHERE enabled = true;

-- ── Notification log (server-side tracking, no RLS needed for client) ──
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('medication','appointment','refill','journal','todo')),
  reference_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error text
);

CREATE INDEX idx_notif_log_user_date ON notification_log(user_id, sent_at);

-- ── Add timezone to profiles ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Los_Angeles';

ALTER PUBLICATION supabase_realtime ADD TABLE push_subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE medication_reminders;
```

- [ ] **Step 2: Apply migration to Supabase**

Run this via Supabase dashboard SQL editor or CLI. The migration follows the same pattern as `021_feedback.sql` — RLS, triggers for user_id and updated_at, indexes.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/023_push_notifications.sql
git commit -m "feat(push): add push_subscriptions, medication_reminders, notification_log tables"
```

---

### Task 2: Generate VAPID Keys & Install web-push

**Files:**
- Modify: `package.json` (add web-push dependency)
- Create: `.env.local` entries (VAPID keys)

- [ ] **Step 1: Install web-push**

```bash
cd "C:\Users\austinkays\Documents\App Development\Salve"
npm install web-push --save
```

- [ ] **Step 2: Generate VAPID keys**

```bash
npx web-push generate-vapid-keys
```

This outputs a public key and private key. Save them.

- [ ] **Step 3: Add to `.env.local`**

Append to `.env.local`:
```
VITE_VAPID_PUBLIC_KEY=<the-public-key>
VAPID_PRIVATE_KEY=<the-private-key>
VAPID_EMAIL=mailto:salveapp@proton.me
```

Note: `VITE_VAPID_PUBLIC_KEY` has the VITE_ prefix because the client needs it. The private key does NOT have the prefix — server-only.

- [ ] **Step 4: Add VAPID keys to Vercel env vars**

Add all three variables in Vercel Dashboard → Project → Settings → Environment Variables (Production + Preview):
- `VITE_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_EMAIL`

- [ ] **Step 5: Commit package.json**

```bash
git add package.json package-lock.json
git commit -m "feat(push): add web-push dependency for server-side push notifications"
```

---

### Task 3: Client Push Service (`src/services/push.js`)

**Files:**
- Create: `src/services/push.js`

- [ ] **Step 1: Create the push subscription service**

```js
// src/services/push.js
// Client-side Web Push subscription management.
// Handles permission requests, subscription creation, and Supabase storage.

import { supabase } from './supabase';
import { getAuthToken } from './token';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/** Convert VAPID key from base64 URL to Uint8Array (required by pushManager.subscribe) */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Get the current push permission state. */
export function getPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

/** Check if the current browser is push-subscribed. */
export async function isSubscribed() {
  if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/** Request notification permission, subscribe to push, and save to Supabase. */
export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser');
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Push notifications are not configured');
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  // Subscribe via push manager
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userApplicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  // Extract keys for server-side sending
  const subJson = subscription.toJSON();
  const p256dh = subJson.keys?.p256dh || '';
  const auth = subJson.keys?.auth || '';

  // Save to Supabase
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: subJson.endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent,
  }, { onConflict: 'user_id,endpoint' });

  if (error) throw error;
  return subscription;
}

/** Unsubscribe from push and delete from Supabase. */
export async function unsubscribeFromPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      // Delete from Supabase
      await supabase.from('push_subscriptions')
        .delete()
        .eq('endpoint', sub.endpoint);
    }
  } catch (err) {
    console.error('Failed to unsubscribe:', err);
  }
}

/** Send a test push to verify the subscription works. */
export async function sendTestPush() {
  const token = await getAuthToken();
  const res = await fetch('/api/push-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: '🔔 Salve',
      body: 'Push notifications are working!',
      tag: 'test',
    }),
  });
  if (!res.ok) throw new Error('Test push failed');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/push.js
git commit -m "feat(push): add client push subscription service with subscribe/unsubscribe/test"
```

---

### Task 4: Push Send API Endpoint (`api/push-send.js`)

**Files:**
- Create: `api/push-send.js`

- [ ] **Step 1: Create the serverless push sender**

```js
// api/push-send.js
// Vercel serverless: send a Web Push notification to a user's subscribed devices.
// Authenticated — requires Bearer token (user sending test) or service role key (cron).

import webpush from 'web-push';

const VAPID_PUBLIC = process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:salveapp@proton.me';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

async function verifyToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  // Check if it's the service role key (cron calling)
  if (token === SERVICE_KEY) return { id: 'service', role: 'service' };
  // Otherwise verify as user JWT
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'Push notifications not configured' });
  }

  const user = await verifyToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { user_id, title, body, tag, url, actions } = req.body;
  // If called by a user (not service), they can only send to themselves
  const targetUserId = user.role === 'service' ? user_id : user.id;
  if (!targetUserId) return res.status(400).json({ error: 'Missing user_id' });

  // Get user's push subscriptions
  const subsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${targetUserId}&select=endpoint,p256dh,auth`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!subsRes.ok) return res.status(500).json({ error: 'Failed to fetch subscriptions' });
  const subs = await subsRes.json();

  if (subs.length === 0) return res.status(200).json({ sent: 0, message: 'No subscriptions' });

  const payload = JSON.stringify({
    title: title || '💊 Salve',
    body: body || 'Reminder',
    tag: tag || 'salve-notification',
    url: url || '/',
    actions: actions || [],
  });

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, payload);
      sent++;
    } catch (err) {
      failed++;
      // 410 Gone = subscription expired, clean it up
      if (err.statusCode === 410 || err.statusCode === 404) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
          { method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
        ).catch(() => {});
      }
    }
  }

  // Log notification
  if (user.role === 'service' && sent > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/notification_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        user_id: targetUserId,
        type: tag?.startsWith('med-') ? 'medication' : tag || 'medication',
        reference_id: null,
        status: 'sent',
      }),
    }).catch(() => {});
  }

  return res.status(200).json({ sent, failed });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/push-send.js
git commit -m "feat(push): add push-send serverless endpoint with VAPID Web Push delivery"
```

---

### Task 5: Cron Reminder Scheduler (`api/cron-reminders.js`)

**Files:**
- Create: `api/cron-reminders.js`
- Modify: `vercel.json` — add cron config

- [ ] **Step 1: Create the cron endpoint**

```js
// api/cron-reminders.js
// Vercel cron: check for due medication reminders and send push notifications.
//
// CURRENT: Runs daily at 7am UTC (Vercel Hobby plan limit).
// UPGRADE PATH: Vercel Pro ($20/mo) enables "* * * * *" (every minute).
//   When upgraded, change vercel.json cron schedule and remove the
//   hourly-batch logic below — just check current minute.
// ALT: Supabase pg_cron can call a Supabase Edge Function every minute for free.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseQuery(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...options.headers,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  // Verify cron secret (Vercel sets this automatically for cron endpoints)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  // On Hobby plan this runs once daily — send ALL reminders for today.
  // On Pro plan with per-minute cron, this would check just the current minute.
  const reminders = await supabaseQuery(
    'medication_reminders?enabled=eq.true&select=id,user_id,medication_id,reminder_time,label'
  );
  if (!reminders || reminders.length === 0) {
    return res.status(200).json({ message: 'No active reminders', sent: 0 });
  }

  // Get today's date for dedup check
  const today = new Date().toISOString().slice(0, 10);

  // Check which reminders have already been sent today
  const sentToday = await supabaseQuery(
    `notification_log?type=eq.medication&sent_at=gte.${today}T00:00:00Z&select=reference_id`
  );
  const sentIds = new Set((sentToday || []).map(n => n.reference_id));

  // Get medication names for the notification body
  const medIds = [...new Set(reminders.map(r => r.medication_id))];
  const meds = await supabaseQuery(
    `medications?id=in.(${medIds.join(',')})&select=id,name,display_name,dose`
  );
  const medMap = new Map((meds || []).map(m => [m.id, m]));

  let totalSent = 0;
  for (const reminder of reminders) {
    // Skip if already sent today
    if (sentIds.has(reminder.id)) continue;

    const med = medMap.get(reminder.medication_id);
    if (!med) continue;

    const medName = med.display_name || med.name;
    const timeStr = reminder.reminder_time?.slice(0, 5) || '';

    // Send push via our push-send endpoint (internal call)
    try {
      const pushRes = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/push-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          user_id: reminder.user_id,
          title: `💊 ${medName}`,
          body: `Time for your ${med.dose || ''} ${medName} (${timeStr})`.trim(),
          tag: `med-${reminder.medication_id}`,
          url: '/meds',
          actions: [
            { action: 'taken', title: '✓ Taken' },
            { action: 'dismiss', title: 'Dismiss' },
          ],
        }),
      });
      if (pushRes.ok) {
        const result = await pushRes.json();
        totalSent += result.sent || 0;
        // Log with reminder ID as reference for dedup
        await supabaseQuery('notification_log', {
          method: 'POST',
          body: JSON.stringify({
            user_id: reminder.user_id,
            type: 'medication',
            reference_id: reminder.id,
            status: 'sent',
          }),
        });
      }
    } catch (err) {
      console.error(`Failed to send reminder ${reminder.id}:`, err.message);
    }
  }

  return res.status(200).json({ checked: reminders.length, sent: totalSent });
}
```

- [ ] **Step 2: Add cron config to vercel.json**

Add the `crons` key at the top level of `vercel.json`:

```json
"crons": [
  {
    "path": "/api/cron-reminders",
    "schedule": "0 7 * * *"
  }
]
```

This runs daily at 7am UTC (midnight PT) on Hobby plan. When upgrading to Vercel Pro, change to `"* * * * *"` for per-minute checks.

Also add `api/cron-reminders.js` to the functions config:

```json
"api/cron-reminders.js": {
  "maxDuration": 30
}
```

- [ ] **Step 3: Commit**

```bash
git add api/cron-reminders.js vercel.json
git commit -m "feat(push): add cron reminder scheduler with daily batch (Hobby) + Pro upgrade path"
```

---

### Task 6: Service Worker Push Handler

**Files:**
- Modify: `vite.config.js` — add push handler injection into Workbox SW

The Workbox-generated service worker needs custom code to handle push events and notification clicks. vite-plugin-pwa supports this via the `workbox.importScripts` option or by switching to `injectManifest` mode.

- [ ] **Step 1: Create the push handler script**

Create `public/push-handler.js`:

```js
// public/push-handler.js
// Injected into the Workbox service worker to handle Web Push events.

self.addEventListener('push', (event) => {
  let data = { title: 'Salve', body: 'Reminder' };
  try { data = event.data?.json() || data; } catch { /* use defaults */ }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/favicon.svg',
    tag: data.tag || 'salve',
    data: { url: data.url || '/', action: data.action },
    actions: (data.actions || []).slice(0, 2), // max 2 actions on most platforms
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open new tab
      return clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 2: Configure Workbox to import the push handler**

In `vite.config.js`, add `importScripts` to the workbox config inside the `VitePWA({})` call:

```js
workbox: {
  skipWaiting: true,
  clientsClaim: true,
  globPatterns: ['**/*.html', '**/*.css'],
  importScripts: ['/push-handler.js'],  // ← ADD THIS LINE
  runtimeCaching: [
    // ... existing entries ...
  ],
},
```

- [ ] **Step 3: Commit**

```bash
git add public/push-handler.js vite.config.js
git commit -m "feat(push): add service worker push handler for notifications + click actions"
```

---

### Task 7: DB Service + Data Wiring

**Files:**
- Modify: `src/services/db.js` — add CRUD for push_subscriptions + medication_reminders
- Modify: `src/hooks/useHealthData.js` — load medication_reminders

- [ ] **Step 1: Add CRUD entries to db.js**

After the `feedback` crud line (around line 157), add:

```js
  push_subscriptions: crud('push_subscriptions'),
  medication_reminders: crud('medication_reminders', { orderBy: 'reminder_time', ascending: true }),
```

Add `medication_reminders` to the `_loadAllFallback` parallel query list and to `eraseAll` (but NOT push_subscriptions — those should persist across data erasure).

In `_loadAllFallback()`, add to the Promise.all array:
```js
db.medication_reminders.list(),
```

And in the result destructuring, add:
```js
medication_reminders: v(nextIndex, []),
```

In `eraseAll()`, add `'medication_reminders'` to the tables array (but NOT `push_subscriptions` or `notification_log`).

Also in the `_loadAllImpl` RPC result mapping, add:
```js
medication_reminders: cleanAll(d.medication_reminders),
```

- [ ] **Step 2: Add medication_reminders to useHealthData initial state**

In `useHealthData.js`, add to the initial state object:
```js
medication_reminders: [],
```

- [ ] **Step 3: Commit**

```bash
git add src/services/db.js src/hooks/useHealthData.js
git commit -m "feat(push): wire medication_reminders into db service + useHealthData"
```

---

### Task 8: Settings UI — Notification Preferences

**Files:**
- Modify: `src/components/sections/Settings.jsx`

Add a "Notifications" section to Settings with a push toggle, status indicator, and test button.

- [ ] **Step 1: Add imports and notification state**

Add to Settings.jsx imports:
```js
import { subscribeToPush, unsubscribeFromPush, isSubscribed, getPermissionState, sendTestPush } from '../../services/push';
```

Add state inside the Settings component:
```js
const [pushEnabled, setPushEnabled] = useState(false);
const [pushLoading, setPushLoading] = useState(false);
const [pushPermission, setPushPermission] = useState(() => getPermissionState());

useEffect(() => {
  isSubscribed().then(setPushEnabled);
}, []);
```

- [ ] **Step 2: Add the Notifications section JSX**

Insert a new section in Settings (after the Appearance section, before Profile). Use the app's existing section pattern:

```jsx
{/* ── Notifications ── */}
<div className="mb-6">
  <h3 className="text-xs font-montserrat font-semibold text-salve-textFaint uppercase tracking-widest mb-3">Notifications</h3>
  <Card>
    <div className="flex items-center justify-between mb-3">
      <div>
        <p className="text-sm font-montserrat font-medium text-salve-text">Push Notifications</p>
        <p className="text-[11px] text-salve-textFaint font-montserrat">
          {pushPermission === 'denied'
            ? 'Blocked by browser — open browser settings to allow'
            : pushEnabled
              ? 'Receiving medication reminders on this device'
              : 'Get reminders for medications, appointments, and more'}
        </p>
      </div>
      <button
        onClick={async () => {
          setPushLoading(true);
          try {
            if (pushEnabled) {
              await unsubscribeFromPush();
              setPushEnabled(false);
            } else {
              await subscribeToPush();
              setPushEnabled(true);
              setPushPermission('granted');
            }
          } catch (err) {
            if (err.message?.includes('denied')) setPushPermission('denied');
            else console.error('Push toggle failed:', err);
          }
          setPushLoading(false);
        }}
        disabled={pushLoading || pushPermission === 'denied' || demoMode}
        className={`px-4 py-1.5 rounded-lg border text-xs font-montserrat font-medium transition-colors cursor-pointer ${
          pushEnabled
            ? 'bg-salve-sage/20 border-salve-sage/40 text-salve-sage'
            : 'bg-salve-card border-salve-border text-salve-textMid hover:border-salve-lav/30'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {pushLoading ? 'Working...' : pushEnabled ? 'Enabled ✓' : 'Enable'}
      </button>
    </div>
    {pushEnabled && (
      <button
        onClick={async () => { try { await sendTestPush(); } catch {} }}
        className="text-[11px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer p-0 hover:underline"
      >
        Send test notification
      </button>
    )}
  </Card>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/sections/Settings.jsx
git commit -m "feat(push): add notification toggle + test button in Settings"
```

---

### Task 9: Medication Reminder UI

**Files:**
- Modify: `src/components/sections/Medications.jsx`

Add reminder time picker on expanded medication cards.

- [ ] **Step 1: Add reminder management to medication expanded view**

In the expanded medication detail area, after the existing fields (pharmacy, refill date, etc.), add a "Reminders" row. This needs to:
- Show existing reminders for this med (from `data.medication_reminders`)
- Allow adding a new reminder with a time picker
- Allow toggling/removing existing reminders

Add to the expanded card section of each medication:

```jsx
{/* Reminders */}
<div className="mt-2.5 pt-2.5 border-t border-salve-border/40">
  <div className="flex items-center justify-between mb-1.5">
    <span className="text-[11px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Reminders</span>
    <button
      onClick={() => {
        const time = prompt('Reminder time (HH:MM, 24hr format):', '08:00');
        if (time && /^\d{2}:\d{2}$/.test(time)) {
          addItem('medication_reminders', { medication_id: med.id, reminder_time: time + ':00', enabled: true });
        }
      }}
      className="text-[11px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer p-0 hover:underline flex items-center gap-0.5"
    >
      <Plus size={11} /> Add
    </button>
  </div>
  {(data.medication_reminders || [])
    .filter(r => r.medication_id === med.id)
    .map(r => (
      <div key={r.id} className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-montserrat text-salve-text">{r.reminder_time?.slice(0, 5)}</span>
          <span className={`text-[10px] font-montserrat ${r.enabled ? 'text-salve-sage' : 'text-salve-textFaint'}`}>
            {r.enabled ? 'Active' : 'Paused'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateItem('medication_reminders', r.id, { enabled: !r.enabled })}
            className="text-[10px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-lav"
          >
            {r.enabled ? 'Pause' : 'Enable'}
          </button>
          <button
            onClick={() => removeItem('medication_reminders', r.id)}
            className="text-[10px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-rose"
          >
            Remove
          </button>
        </div>
      </div>
    ))}
  {(data.medication_reminders || []).filter(r => r.medication_id === med.id).length === 0 && (
    <p className="text-[10px] text-salve-textFaint/60 font-montserrat italic">No reminders set</p>
  )}
</div>
```

Note: The `prompt()` for time input is a v1 shortcut. A proper `<input type="time">` inline picker would be better UX — but this gets the feature working. Can be polished in a follow-up.

- [ ] **Step 2: Commit**

```bash
git add src/components/sections/Medications.jsx
git commit -m "feat(push): add medication reminder time management on expanded med cards"
```

---

### Task 10: Build, Verify, Push

**Files:** None new — verification only.

- [ ] **Step 1: Build check**

```bash
npx vite build --mode development 2>&1 | tail -10
```

Expected: Clean build. `push-handler.js` should be copied to dist. `web-push` should NOT be in client bundles (it's server-side only via `api/`).

- [ ] **Step 2: Verify web-push is not bundled client-side**

```bash
grep -r "web-push" dist/ 2>/dev/null | head -5
```

Expected: No matches. `web-push` is only imported in `api/push-send.js` which runs server-side.

- [ ] **Step 3: Verify push-handler.js is in dist**

```bash
ls -la dist/push-handler.js
```

Expected: File exists (copied from `public/`).

- [ ] **Step 4: Push all commits**

```bash
git push
```

- [ ] **Step 5: Apply migration**

After push, apply migration `023_push_notifications.sql` to Supabase via the dashboard SQL editor. Also update the `load_all_data` RPC function if it exists to include `medication_reminders`.

- [ ] **Step 6: Add VAPID env vars to Vercel**

If not already done in Task 2: add `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` to Vercel project env vars.

> **Upgrade notes for future:**
> - When you upgrade to Vercel Pro, change `vercel.json` cron from `"0 7 * * *"` to `"* * * * *"`
> - Remove the daily-batch logic in `cron-reminders.js` — just check current minute
> - Alternative: use Supabase pg_cron (free) to call a Supabase Edge Function every minute
> - Consider adding appointment reminders (day before), refill alerts (3 days before), and journal prompts to the cron function
