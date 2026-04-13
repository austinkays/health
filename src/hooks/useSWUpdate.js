// src/hooks/useSWUpdate.js
//
// Wraps vite-plugin-pwa's `useRegisterSW` with Salve-specific behavior:
//
//   1. Poll for SW updates every 60 minutes (so long-lived tabs still
//      eventually notice a new deploy without requiring the user to
//      close + reopen the app).
//   2. Re-check on focus / visibility change so returning to a stale
//      tab triggers an immediate update check.
//   3. Expose `needRefresh`, `updateNow()`, and `dismissUpdate()` for
//      the UpdateBanner component.
//
// How updateNow() actually refreshes everything the user has cached:
//   • virtual:pwa-register sends { type: 'SKIP_WAITING' } to the waiting
//     Service Worker, which calls skipWaiting() and activates.
//   • The new SW's activate handler (from Workbox) nukes the old
//     precache — fresh HTML + CSS become the current SW's cache.
//   • `updateServiceWorker(true)` then does window.location.reload()
//     which fetches the new index.html from the fresh precache. That
//     new HTML references the new content-hashed JS chunks (e.g.
//     Dashboard-<newhash>.js), so the browser's HTTP cache misses and
//     downloads them.
//   • Encrypted localStorage cache (hc:cache) stays — it's a read-
//     through data cache, not code — so we don't lose the user's data.
//
// No stale JS, no stale HTML, no data loss. One tap.
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

export default function useSWUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Periodic update check while the tab is open.
      const interval = setInterval(() => {
        // Only poll while the document is visible to avoid background
        // network chatter (mobile data / battery).
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => { /* offline is fine */ });
        }
      }, CHECK_INTERVAL_MS);

      // Refresh check whenever the tab regains focus.
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => { /* offline is fine */ });
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);

      // Store cleanup on the registration so HMR doesn't leak listeners.
      registration.__salveCleanup = () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      };
    },
    onRegisterError(err) {
      // Non-fatal — app still works without a SW, just no offline / no
      // install prompt. Surface in console for debugging.
      // eslint-disable-next-line no-console
      console.warn('[sw] registration failed:', err);
    },
  });

  // Safety: if HMR re-mounts the hook, run any prior cleanup.
  useEffect(() => {
    return () => {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg && typeof reg.__salveCleanup === 'function') {
            reg.__salveCleanup();
          }
        }).catch(() => { /* */ });
      }
    };
  }, []);

  return {
    needRefresh,
    updateNow: () => updateServiceWorker(true),
    dismissUpdate: () => setNeedRefresh(false),
  };
}
