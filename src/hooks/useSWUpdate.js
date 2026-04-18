// src/hooks/useSWUpdate.js
//
// PWA update orchestration. The short version:
//
// When a new service worker is waiting, we don't immediately show a
// banner. Instead we wait for a "safe opportunity" and silently reload
// the tab so the user returns to fresh code with zero UI friction.
//
// Safe opportunities, in order of preference:
//
//   1. Tab becomes hidden (user tabs away, locks the phone, switches
//      apps). Silent reload happens while they aren't looking. When
//      they come back, they see the fresh app. This is the ~95% case.
//
//   2. Tab has been continuously visible + idle (no input / keydown /
//      pointerdown / scroll) for 5 minutes AND no input / textarea /
//      contenteditable has focus. Catches the rare "Dashboard left
//      open all afternoon" case without interrupting active typing.
//
//   3. Fallback banner: if 12 hours have passed without ever finding a
//      safe moment (pathological long session), we finally surface the
//      in-app banner so the user at least knows there's an update
//      waiting. They can tap it whenever they're ready.
//
// Why this matters: small fixes shipped throughout the day used to
// trigger an "Update available" banner on every open tab, training
// users to tap the same button over and over. The WhatsNewModal system
// already handles meaningful-change communication via the changelog
// file, so users never miss real news even when updates happen
// silently — WhatsNewModal auto-shows on their next page load, which
// is now automatic.
//
// Safety guards:
//   • Skip reload while an input / textarea / contenteditable has focus
//     (would lose unsaved form state — typing a journal entry, filling
//     a medication form, etc.).
//   • Hidden-tab reload is always safe (nothing is focused and the user
//     isn't looking at the page).
//   • Encrypted localStorage data cache (hc:cache) survives reloads, so
//     the user's records are not affected.
import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_POLL_MS = 60 * 60 * 1000;          // 60 min — poll for new SWs
const IDLE_RELOAD_MS = 5 * 60 * 1000;           // 5 min of idle = safe to reload
const FALLBACK_BANNER_MS = 12 * 60 * 60 * 1000; // 12 hr worst case → show banner

export default function useSWUpdate() {
  const [showBanner, setShowBanner] = useState(false);
  const needRefreshAtRef = useRef(null);
  const idleTimerRef = useRef(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Periodic update check while the tab is open, so long-lived tabs
      // notice new deploys without requiring a close+reopen.
      const interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => { /* offline is fine */ });
        }
      }, UPDATE_POLL_MS);

      // Re-check on visibility / focus so returning to a stale tab
      // triggers an immediate update check.
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => { /* */ });
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);

      registration.__salveCleanup = () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      };
    },
    onRegisterError(err) {
      // eslint-disable-next-line no-console
      console.warn('[sw] registration failed:', err);
    },
  });

  // Record the moment we first notice an update so the 12-hour fallback
  // deadline is honored even across re-renders of this effect.
  useEffect(() => {
    if (needRefresh && !needRefreshAtRef.current) {
      needRefreshAtRef.current = Date.now();
    }
  }, [needRefresh]);

  // Auto-update orchestration. Runs whenever there's a waiting SW.
  useEffect(() => {
    if (!needRefresh) return;

    function hasFocusedInput() {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function silentReload() {
      // SKIP_WAITING + location.reload() from vite-plugin-pwa.
      updateServiceWorker(true);
      // Fallback: if the waiting SW was already evicted and
      // controllerchange never fires, force a plain reload.
      setTimeout(() => window.location.reload(), 2000);
    }

    // ── Opportunity 1: tab becomes hidden ──
    // Always safe — no focused input and the user isn't looking. The
    // reload happens in the background; when they return, the fresh
    // HTML loads and references the new content-hashed JS chunks.
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        silentReload();
      }
    }

    // ── Opportunity 2: user idle for 5 min with no focused input ──
    // Catches the "never tabs away" case. If a text field has focus we
    // just wait — the next idle window will catch us.
    function resetIdleTimer() {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (!hasFocusedInput()) silentReload();
      }, IDLE_RELOAD_MS);
    }

    // ── Opportunity 3: fallback banner after 12 hours ──
    // Last-resort surfacing so users in a pathological single-session
    // loop still get a way to grab the update manually.
    const firstSeen = needRefreshAtRef.current || Date.now();
    const elapsed = Date.now() - firstSeen;
    const bannerDelay = Math.max(0, FALLBACK_BANNER_MS - elapsed);
    const bannerTimer = setTimeout(() => setShowBanner(true), bannerDelay);

    document.addEventListener('visibilitychange', onVisibilityChange);
    const idleEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    idleEvents.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      idleEvents.forEach(e => window.removeEventListener(e, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      clearTimeout(bannerTimer);
    };
  }, [needRefresh, updateServiceWorker]);

  // HMR cleanup: re-mounting the hook shouldn't leak listeners from a
  // prior registration.
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
    // The banner only surfaces in the exceptional 12+ hour stuck case.
    // Small fixes silently reload on tab-hidden or idle — users never
    // see a prompt. Bigger updates are communicated via WhatsNewModal
    // on the next page load, which is now automatic.
    needRefresh: showBanner,
    updateNow: () => {
      updateServiceWorker(true);
      // Fallback: if updateServiceWorker didn't trigger a reload within
      // 2 seconds (e.g. the waiting SW was already evicted, or the
      // controllerchange event never fires), force a plain reload so
      // the user isn't stuck tapping a dead button.
      setTimeout(() => window.location.reload(), 2000);
    },
    dismissUpdate: () => {
      setShowBanner(false);
      // Intentionally NOT clearing needRefresh — if the user dismisses
      // the banner, we still want silent auto-reload on their next
      // safe window (tab away, go idle, etc.) so they don't stay
      // stranded on old code.
    },
  };
}
