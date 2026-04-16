import { supabase } from './supabase';
import { getAuthToken } from './token';

/**
 * Converts a base64 VAPID public key string to a Uint8Array
 * required by pushManager.subscribe({ applicationServerKey }).
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Returns the current notification permission state.
 * Returns 'unsupported' if the Notification API is not available.
 */
export function getPermissionState() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

/**
 * Checks whether the current user already has an active push subscription
 * that matches the current VAPID key. Returns false if the subscription
 * is missing, the Push API is unavailable, or the VAPID key has changed
 * since the subscription was created (stale subscription).
 */
export async function isSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;

    // Detect VAPID key mismatch — if the key changed, the subscription is invalid
    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (vapidPublicKey && subscription.options?.applicationServerKey) {
      const currentKey = urlBase64ToUint8Array(vapidPublicKey);
      const subKey = new Uint8Array(subscription.options.applicationServerKey);
      if (currentKey.length !== subKey.length || !currentKey.every((b, i) => b === subKey[i])) {
        // VAPID key changed — old subscription is useless. Clean it up.
        console.warn('[push] VAPID key mismatch — clearing stale subscription');
        await subscription.unsubscribe();
        await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Requests notification permission, creates a push subscription, and persists
 * it to the Supabase `push_subscriptions` table for the authenticated user.
 * Throws if permission is denied or subscription fails.
 */
export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error('VAPID public key is not configured.');
  }

  const registration = await navigator.serviceWorker.ready;

  // Clear any existing subscription first — handles VAPID key rotation gracefully.
  // If the old subscription was bound to a different key, pushManager.subscribe()
  // would throw "Registration failed - A subscription with a different
  // applicationServerKey already exists."
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const { endpoint, keys } = subscription.toJSON();
  const { p256dh, auth } = keys;

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'user_id,endpoint' }
    );

  if (error) throw new Error(`Failed to save push subscription: ${error.message}`);

  return subscription;
}

/**
 * Unsubscribes the current device from push notifications and removes the
 * subscription record from Supabase.
 */
export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const { endpoint } = subscription;

  await subscription.unsubscribe();

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (error) {
    console.warn('[push] Failed to remove subscription from Supabase:', error.message);
  }
}

/**
 * Sends a test push notification to the current user's subscribed devices
 * by calling the /api/push-send serverless endpoint.
 */
export async function sendTestPush() {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch('/api/push-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: 'Salve notifications are active',
      body: 'You will now receive medication reminders and health alerts.',
      tag: 'test',
      url: '/',
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Push send failed (${res.status})`);
  }

  const data = await res.json();

  // Server returns 200 even when all sends fail — check the body
  if (data.sent === 0 && data.failed > 0) {
    throw new Error('Notification failed to deliver — try disabling and re-enabling push.');
  }
  if (data.sent === 0 && data.message) {
    throw new Error(data.message); // "No subscriptions found"
  }

  return data;
}
