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
 * Checks whether the current user already has an active push subscription.
 * Returns false if service workers or push manager are unavailable.
 */
export async function isSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
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

  return res.json();
}
