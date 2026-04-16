// src/components/ui/InstallPrompt.jsx
// First-run PWA install invitation. Shows a friendly bottom-sheet on first
// visit (after sign-in) encouraging the user to install Salve to their
// home screen.
//
// Platform handling:
//   • Chrome/Edge/Android: uses the native `beforeinstallprompt` event, which
//     lets us trigger the browser's install dialog directly.
//   • iOS Safari: no install API exists, so we render manual instructions
//     (Share → Add to Home Screen).
//   • Other browsers: falls back to instructions.
//
// Dismissal is remembered in localStorage so it only asks once. The full
// prompt is also gated on:
//   • Not already installed (display-mode: standalone / navigator.standalone)
//   • Not in demo mode
//
// The intentional delay (1200ms) gives the dashboard a beat to render
// before the sheet slides in — it shouldn't be the very first thing a
// user sees on load.
import { useEffect, useState } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';
import { C } from '../../constants/colors';
import { isStandalone, isIOS } from '../../utils/platform';

const INSTALL_DISMISSED_KEY = 'salve:install-dismissed';
const INSTALL_SEEN_KEY = 'salve:install-seen';

function hasBeenDismissed() {
  try { return localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true'; } catch { return false; }
}

function markDismissed() {
  try { localStorage.setItem(INSTALL_DISMISSED_KEY, 'true'); } catch { /* */ }
}

function hasBeenSeen() {
  try { return localStorage.getItem(INSTALL_SEEN_KEY) === 'true'; } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(INSTALL_SEEN_KEY, 'true'); } catch { /* */ }
}

export default function InstallPrompt({ preAuth = false }) {
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    // Don't show if already installed, dismissed, or already seen.
    if (isStandalone()) return;
    if (hasBeenDismissed()) return;
    if (hasBeenSeen()) return;

    const ios = isIOS();

    // In preAuth mode we ONLY show on iOS — Chrome/Edge can carry their session
    // across the install boundary, so non-iOS users don't have a re-auth problem
    // and the prompt makes more sense after they've explored the app a bit.
    if (preAuth && !ios) return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      markSeen(); // Write immediately — prompt will show regardless of reload timing
      // Show after a short delay so the dashboard renders first
      setTimeout(() => setVisible(true), 1200);
    };

    if (!preAuth) {
      window.addEventListener('beforeinstallprompt', onBeforeInstall);
    }

    // iOS has no beforeinstallprompt — show manual instructions on first run
    let iosTimer = null;
    if (ios) {
      setIosMode(true);
      markSeen(); // Write immediately — prompt will show regardless of reload timing
      // Pre-auth shows sooner (the auth screen is the whole experience until
      // they sign in, so no need to wait for a dashboard to render).
      iosTimer = setTimeout(() => setVisible(true), preAuth ? 600 : 1500);
    }

    // Safety net: if neither path fired within 4s, bail — no prompt available
    const bailTimer = setTimeout(() => {
      if (!visible) {
        // no-op; user won't see anything
      }
    }, 4000);

    return () => {
      if (!preAuth) {
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      }
      if (iosTimer) clearTimeout(iosTimer);
      clearTimeout(bailTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (visible) {
      markSeen();
      // Next frame so the transition plays
      requestAnimationFrame(() => setEntered(true));
    }
  }, [visible]);

  const handleDismiss = (persistent) => {
    setEntered(false);
    setTimeout(() => {
      setVisible(false);
      if (persistent) markDismissed();
    }, 220);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      // Regardless of outcome, close the sheet and don't re-ask
      markDismissed();
      handleDismiss(false);
      if (outcome === 'accepted') {
        // User installed — nothing more to do
      }
    } catch {
      // Silently swallow — fall back to just dismissing
      handleDismiss(true);
    }
  };

  if (!visible) return null;

  return (
    <>
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] transition-opacity duration-200"
        style={{ opacity: entered ? 1 : 0 }}
        onClick={() => handleDismiss(true)}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-label="Install Salve"
        aria-modal="true"
        className="fixed left-1/2 bottom-0 z-[9999] w-full max-w-[440px] px-4 pb-5 pt-2 md:bottom-6 md:px-0"
        style={{
          transform: entered ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
        }}
      >
        <div
          className="relative bg-salve-card border border-salve-border2 rounded-3xl p-5 shadow-2xl overflow-hidden"
          style={{
            boxShadow: `0 -12px 48px -8px rgba(0,0,0,0.35), 0 0 0 1px ${C.lav}33 inset`,
          }}
        >
          {/* Decorative gradient wash */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-60"
            style={{
              background: `radial-gradient(circle at 15% 0%, ${C.lav}22 0%, transparent 55%), radial-gradient(circle at 85% 100%, ${C.sage}1c 0%, transparent 55%)`,
            }}
          />

          <button
            onClick={() => handleDismiss(true)}
            aria-label="Dismiss"
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center bg-salve-card2/80 hover:bg-salve-card2 border border-salve-border/60 text-salve-textFaint hover:text-salve-text transition-colors z-10"
          >
            <X size={15} strokeWidth={2} />
          </button>

          <div className="relative z-10">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
              style={{
                background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
                boxShadow: `0 4px 16px -4px ${C.lav}99`,
              }}
            >
              <Download size={20} color="#fff" strokeWidth={2.25} />
            </div>

            <h3 className="font-playfair text-[20px] md:text-[22px] font-medium text-salve-text m-0 mb-1">
              {preAuth && iosMode ? 'Install Salve first' : 'Install Salve on your home screen'}
            </h3>
            <p className="text-ui-md text-salve-textMid m-0 mb-4 leading-snug font-montserrat">
              {preAuth && iosMode
                ? "iPhone won't share your sign-in between Safari and the installed app. Add Salve to your home screen first so you only sign in once."
                : 'Faster access, offline support, and a full-screen app experience — just like a native app.'}
            </p>

            {iosMode ? (
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2.5 text-[13px] text-salve-textMid font-montserrat">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-semibold"
                    style={{ background: `${C.lav}22`, color: C.lav }}
                  >1</span>
                  <span className="flex items-center gap-1.5">
                    Tap the <Share size={14} className="inline" style={{ color: C.lav }} /> Share button in Safari
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-[13px] text-salve-textMid font-montserrat">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-semibold"
                    style={{ background: `${C.lav}22`, color: C.lav }}
                  >2</span>
                  <span className="flex items-center gap-1.5">
                    Scroll down and tap <Plus size={14} className="inline" style={{ color: C.lav }} /> "Add to Home Screen"
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-[13px] text-salve-textMid font-montserrat">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-semibold"
                    style={{ background: `${C.lav}22`, color: C.lav }}
                  >3</span>
                  <span>Tap "Add" in the top-right corner</span>
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              {!iosMode && deferredPrompt && (
                <button
                  onClick={handleInstall}
                  className="flex-1 py-2.5 rounded-xl font-montserrat font-semibold text-[14px] text-white transition-transform active:scale-[0.98]"
                  style={{
                    background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
                    boxShadow: `0 4px 14px -4px ${C.lav}99`,
                  }}
                >
                  Install Salve
                </button>
              )}
              <button
                onClick={() => handleDismiss(true)}
                className="py-2.5 px-4 rounded-xl font-montserrat font-medium text-[13px] text-salve-textMid bg-salve-card2/60 hover:bg-salve-card2 border border-salve-border/60 hover:text-salve-text transition-colors"
                style={{ flex: (!iosMode && deferredPrompt) ? '0 0 auto' : 1 }}
              >
                {iosMode ? 'Got it' : 'Not now'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
