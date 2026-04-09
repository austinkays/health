/**
 * push-handler.js — Service worker push event handler.
 * Imported by the Workbox-generated service worker via importScripts().
 *
 * Add to vite.config.js PWA options:
 *   injectManifest: { injectionPoint: undefined },
 *   strategies: 'injectManifest',
 * and in the service worker entry:
 *   importScripts('/push-handler.js');
 *
 * Or if using generateSW strategy, add to vite-plugin-pwa's
 *   workbox.importScripts: ['/push-handler.js']
 */

/**
 * push — Receive a push message and display a notification.
 *
 * Expected payload shape:
 * {
 *   title: string,
 *   body: string,
 *   tag?: string,
 *   url?: string,
 *   actions?: Array<{ action: string, title: string, icon?: string }>  // max 2
 * }
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    console.error('[push-handler] Failed to parse push payload:', err);
    return;
  }

  const {
    title = 'Salve',
    body = 'You have a new health reminder.',
    tag = 'salve-notification',
    url = '/',
    actions = [],
  } = data;

  const notificationOptions = {
    body,
    icon: '/icon-192.png',
    badge: '/favicon.svg',
    tag,
    // Store the target URL in data so notificationclick can retrieve it
    data: { url },
    // Cap at 2 actions (Web Notification spec limit on most platforms)
    actions: actions.slice(0, 2),
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, notificationOptions));
});

/**
 * notificationclick — Handle a tap on the notification or one of its action buttons.
 *
 * Finds an existing app window and focuses it (navigating to the notification URL),
 * or opens a new window if no app tab is currently open.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Look for an already-open app window
        for (const client of windowClients) {
          // Check if the client URL is within our app's origin
          if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
            // Navigate the existing window to the notification target and bring it to front
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // No existing window found — open a new one
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
