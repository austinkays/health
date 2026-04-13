// src/components/ui/UpdateBanner.jsx
//
// Prominent "Update available" banner that drives the PWA refresh flow.
// Two variants, same content, different chrome:
//
//   • variant="mobile"  — sticky banner at the very top of the main
//     content column (above <Header>), full-width, rose/lav gradient,
//     always visible on mobile viewports. Hidden at md+ since desktop
//     users see the sidebar version.
//
//   • variant="desktop" — compact card pinned to the TOP of <SideNav>
//     above the Salve branding. Hidden on mobile viewports where the
//     mobile banner takes over.
//
// Both render nothing when needRefresh is false.
//
// The "Update now" button calls onUpdate which is wired to
// useSWUpdate().updateNow (i.e. updateServiceWorker(true)), which:
//   1. Sends SKIP_WAITING to the waiting SW
//   2. New SW activates, Workbox drops the old precache
//   3. window.location.reload() → fresh index.html → fresh JS chunks
//
// The Dismiss (X) button hides the banner for this session only. A
// future visibility-change / update-check will re-surface it next time,
// so users who tap X can't accidentally get permanently stuck on stale
// code.
import { Download, X, Sparkles } from 'lucide-react';
import { C } from '../../constants/colors';

export default function UpdateBanner({ variant = 'mobile', onUpdate, onDismiss }) {
  if (variant === 'desktop') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="New version available"
        className="hidden md:block mx-3 mt-3 mb-1 relative rounded-xl overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${C.lav}22 0%, ${C.sage}1c 100%)`,
          border: `1px solid ${C.lav}55`,
          boxShadow: `0 2px 12px -4px ${C.lav}55`,
        }}
      >
        <button
          onClick={onDismiss}
          aria-label="Dismiss update banner"
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center bg-transparent hover:bg-salve-card2/60 border-none text-salve-textFaint hover:text-salve-text transition-colors cursor-pointer z-10"
        >
          <X size={11} strokeWidth={2.5} />
        </button>
        <div className="px-3 py-2.5 pr-7">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Sparkles size={11} style={{ color: C.lav }} />
            <span className="text-[10px] tracking-widest uppercase font-montserrat font-bold" style={{ color: C.lav }}>
              Update Ready
            </span>
          </div>
          <p className="text-[12px] text-salve-text font-montserrat leading-snug m-0 mb-2">
            A new version of Salve is ready to install.
          </p>
          <button
            onClick={onUpdate}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-montserrat font-semibold text-[12px] text-white border-none cursor-pointer transition-transform active:scale-[0.98] hover:opacity-95"
            style={{
              background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
              boxShadow: `0 2px 8px -2px ${C.lav}99`,
            }}
          >
            <Download size={12} strokeWidth={2.5} />
            Update now
          </button>
        </div>
      </div>
    );
  }

  // Mobile variant — sticky top-of-page banner
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="New version available"
      className="md:hidden sticky top-0 z-50 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${C.lav}22 0%, ${C.sage}1c 100%)`,
        borderBottom: `1px solid ${C.lav}55`,
        boxShadow: `0 2px 14px -4px ${C.lav}66`,
      }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
            boxShadow: `0 1px 6px -1px ${C.lav}99`,
          }}
        >
          <Sparkles size={13} color="#fff" strokeWidth={2.25} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-salve-text font-montserrat leading-tight">
            Update available
          </div>
          <div className="text-[11px] text-salve-textMid font-montserrat leading-tight">
            Tap update to get the latest version
          </div>
        </div>
        <button
          onClick={onUpdate}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg font-montserrat font-semibold text-[12px] text-white border-none cursor-pointer transition-transform active:scale-[0.98] flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
            boxShadow: `0 2px 8px -2px ${C.lav}aa`,
          }}
        >
          <Download size={12} strokeWidth={2.5} />
          Update
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss update banner"
          className="w-7 h-7 rounded-full flex items-center justify-center bg-transparent hover:bg-salve-card2/60 border-none text-salve-textFaint hover:text-salve-text transition-colors cursor-pointer flex-shrink-0"
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
