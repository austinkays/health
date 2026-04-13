// src/components/ui/DemoWelcome.jsx
//
// First-run walkthrough for demo mode. A 3-screen bottom-sheet modal that
// orients a brand-new visitor before dropping them into the full dashboard
// full of unfamiliar (sample) data.
//
//   Screen 0: "Pick your vibe"
//     Two big theme-preview cards. Tapping one applies the theme live via
//     useTheme().setTheme (which previews only, no localStorage write), so
//     the background and cards behind the modal update instantly. Pair is
//     Cherry Blossom (light) vs Aurora (dark) by default, falling back to
//     Dawnlight vs Midnight for prefers-reduced-motion users so they don't
//     get a heavy animated backdrop on first run.
//
//   Screen 1: "Try these 4 things"
//     Four tappable cards that deep-link into the app's most compelling
//     surfaces (Sage chat, Vitals, Medications, News). Tapping a card
//     closes the modal and navigates there.
//
//   Screen 2: "Make it yours"
//     Sign-up CTA (calls onExitDemo, which returns to Auth) plus a "Keep
//     exploring" secondary action.
//
// Shown once per browser via localStorage key `salve:demo-welcome-seen`.
// Dismissible from any screen via X button or backdrop tap. If the user
// dismisses from step 0 without picking, we apply the default light theme
// (Cherry Blossom, or Dawnlight under reduced motion) so they still get
// a polished first impression instead of plain Lilac.
//
// Theme restoration on demo exit is handled in App.jsx: `exitDemo` calls
// `revertTheme()` before flipping `demoMode` off, which snaps back to the
// user's committed (localStorage-persisted) theme. Because we only ever
// call `setTheme` (preview) and never `saveTheme` (persist), nothing the
// demo visitor picks can clobber a signed-in user's saved preference.
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Leaf, Heart, Pill, Newspaper, ArrowRight, Sparkles } from 'lucide-react';
import { C } from '../../constants/colors';
import { useTheme } from '../../hooks/useTheme';
import { themes } from '../../constants/themes';

const DEMO_WELCOME_KEY = 'salve:demo-welcome-seen';

export function hasSeenDemoWelcome() {
  try { return localStorage.getItem(DEMO_WELCOME_KEY) === 'true'; } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(DEMO_WELCOME_KEY, 'true'); } catch { /* */ }
}

function detectReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch { return false; }
}

// Theme pair selection. Under reduced motion we fall back to the two core
// themes (no heavy animated backdrops) so first-run feels polished rather
// than janky on low-end hardware or for motion-sensitive users.
function getThemePair(reducedMotion) {
  if (reducedMotion) {
    return {
      light: { id: 'dawnlight', label: 'Soft daylight', blurb: 'Warm cream, lavender, berry' },
      dark:  { id: 'midnight',  label: 'Starlit night', blurb: 'Navy, lavender, sage, amber' },
    };
  }
  return {
    light: { id: 'cherry', label: 'Cherry blossom', blurb: 'Pink sky, drifting petals' },
    dark:  { id: 'aurora', label: 'Aurora nights',  blurb: 'Drifting green and violet lights' },
  };
}

export default function DemoWelcome({ onNav, onSage, onExitDemo, onClose }) {
  const { setTheme, themeId } = useTheme();
  const [step, setStep] = useState(0);
  const [entered, setEntered] = useState(false);
  const pickedRef = useRef(false);

  const reducedMotion = useMemo(() => detectReducedMotion(), []);
  const pair = useMemo(() => getThemePair(reducedMotion), [reducedMotion]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const pickTheme = (id) => {
    pickedRef.current = true;
    setTheme(id);
  };

  const dismiss = () => {
    // If the user bailed from the theme picker without choosing, apply a
    // sensible default so the demo looks good anyway.
    if (!pickedRef.current) {
      setTheme(pair.light.id);
      pickedRef.current = true;
    }
    markSeen();
    setEntered(false);
    setTimeout(() => { onClose?.(); }, 220);
  };

  const handleFeature = (action) => {
    markSeen();
    setEntered(false);
    setTimeout(() => {
      onClose?.();
      action?.();
    }, 200);
  };

  const handleSignUp = () => {
    markSeen();
    setEntered(false);
    setTimeout(() => {
      onClose?.();
      // Note: onExitDemo is expected to call revertTheme so the user's
      // persisted theme preference comes back on the Auth screen.
      onExitDemo?.();
    }, 200);
  };

  return (
    <>
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] transition-opacity duration-200"
        style={{ opacity: entered ? 1 : 0 }}
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-label="Welcome to the Salve demo"
        aria-modal="true"
        className="fixed left-0 right-0 bottom-0 z-[9999] px-4 pb-5 pt-2 md:left-1/2 md:right-auto md:bottom-6 md:max-w-[460px] md:-translate-x-1/2 md:px-0"
        style={{
          transform: entered ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
        }}
      >
        <div
          className="relative bg-salve-card border border-salve-border2 rounded-3xl p-5 shadow-2xl overflow-hidden"
          style={{
            boxShadow: `0 -12px 48px -8px rgba(0,0,0,0.4), 0 0 0 1px ${C.lav}33 inset`,
          }}
        >
          {/* Decorative gradient wash */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-60"
            style={{
              background: `radial-gradient(circle at 15% 0%, ${C.lav}26 0%, transparent 55%), radial-gradient(circle at 85% 100%, ${C.sage}20 0%, transparent 55%)`,
            }}
          />

          <button
            onClick={dismiss}
            aria-label="Dismiss welcome"
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center bg-salve-card2/80 hover:bg-salve-card2 border border-salve-border/60 text-salve-textFaint hover:text-salve-text transition-colors z-10 cursor-pointer"
          >
            <X size={15} strokeWidth={2} />
          </button>

          <div className="relative z-10">
            {/* Step indicator dots */}
            <div className="flex items-center gap-1.5 mb-4" aria-hidden="true">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="h-1 rounded-full transition-all duration-300"
                  style={{
                    width: i === step ? 20 : 6,
                    background: i === step ? C.lav : `${C.lav}44`,
                  }}
                />
              ))}
            </div>

            {step === 0 && (
              <div>
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                  style={{
                    background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
                    boxShadow: `0 4px 16px -4px ${C.lav}99`,
                  }}
                >
                  <Sparkles size={20} color="#fff" strokeWidth={2.25} />
                </div>
                <h3 className="font-playfair text-[22px] md:text-[24px] font-medium text-salve-text m-0 mb-1 leading-tight">
                  Welcome to the Salve demo
                </h3>
                <p className="text-ui-sm text-salve-textMid m-0 mb-4 leading-snug font-montserrat">
                  Everything you see here is sample data from a fictional user named <span className="text-salve-text font-semibold">Jordan</span>. Nothing is saved, nothing is real. Pick your vibe to get started.
                </p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <ThemeCard
                    themeId={pair.light.id}
                    label={pair.light.label}
                    blurb={pair.light.blurb}
                    selected={themeId === pair.light.id && pickedRef.current}
                    onClick={() => pickTheme(pair.light.id)}
                  />
                  <ThemeCard
                    themeId={pair.dark.id}
                    label={pair.dark.label}
                    blurb={pair.dark.blurb}
                    selected={themeId === pair.dark.id && pickedRef.current}
                    onClick={() => pickTheme(pair.dark.id)}
                  />
                </div>

                <button
                  onClick={() => setStep(1)}
                  disabled={!pickedRef.current}
                  className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl font-montserrat font-semibold text-[14px] text-white border-none transition-transform active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed enabled:cursor-pointer"
                  style={{
                    background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
                    boxShadow: pickedRef.current ? `0 4px 14px -4px ${C.lav}99` : 'none',
                  }}
                >
                  {pickedRef.current ? 'Show me around' : 'Pick a theme to continue'}
                  {pickedRef.current && <ArrowRight size={15} strokeWidth={2.25} />}
                </button>
              </div>
            )}

            {step === 1 && (
              <div>
                <h3 className="font-playfair text-[20px] md:text-[22px] font-medium text-salve-text m-0 mb-1 leading-tight">
                  Try these 4 things
                </h3>
                <p className="text-ui-sm text-salve-textMid m-0 mb-4 leading-snug font-montserrat">
                  The best places to start exploring Jordan's health profile.
                </p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <FeatureCard
                    icon={<Leaf size={18} color="#fff" strokeWidth={2.25} />}
                    tint={C.sage}
                    title="Chat with Sage"
                    blurb="AI health companion"
                    onClick={() => handleFeature(onSage)}
                  />
                  <FeatureCard
                    icon={<Heart size={18} color="#fff" strokeWidth={2.25} />}
                    tint={C.rose}
                    title="Explore Vitals"
                    blurb="Trends and charts"
                    onClick={() => handleFeature(() => onNav?.('vitals'))}
                  />
                  <FeatureCard
                    icon={<Pill size={18} color="#fff" strokeWidth={2.25} />}
                    tint={C.lav}
                    title="Medications"
                    blurb="Drug info and refills"
                    onClick={() => handleFeature(() => onNav?.('meds'))}
                  />
                  <FeatureCard
                    icon={<Newspaper size={18} color="#fff" strokeWidth={2.25} />}
                    tint={C.amber}
                    title="Read news"
                    blurb="Personalized feed"
                    onClick={() => handleFeature(() => onNav?.('news'))}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(0)}
                    className="py-2.5 px-4 rounded-xl font-montserrat font-medium text-[13px] text-salve-textMid bg-salve-card2/60 hover:bg-salve-card2 border border-salve-border/60 hover:text-salve-text transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-montserrat font-semibold text-[13px] text-white border-none cursor-pointer transition-transform active:scale-[0.98]"
                    style={{
                      background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
                      boxShadow: `0 4px 14px -4px ${C.lav}99`,
                    }}
                  >
                    Next
                    <ArrowRight size={14} strokeWidth={2.25} />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                  style={{
                    background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
                    boxShadow: `0 4px 16px -4px ${C.lav}99`,
                  }}
                >
                  <Heart size={20} color="#fff" strokeWidth={2.25} />
                </div>
                <h3 className="font-playfair text-[22px] md:text-[24px] font-medium text-salve-text m-0 mb-2 leading-tight">
                  Make it yours
                </h3>
                <p className="text-ui-md text-salve-textMid m-0 mb-5 leading-snug font-montserrat">
                  Like what you see? Sign up to start tracking your own health. It takes 30 seconds, and your data stays encrypted and private.
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleSignUp}
                    className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl font-montserrat font-semibold text-[14px] text-white border-none cursor-pointer transition-transform active:scale-[0.98]"
                    style={{
                      background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
                      boxShadow: `0 4px 14px -4px ${C.lav}99`,
                    }}
                  >
                    Sign up
                    <ArrowRight size={15} strokeWidth={2.25} />
                  </button>
                  <button
                    onClick={dismiss}
                    className="w-full py-2.5 rounded-xl font-montserrat font-medium text-[13px] text-salve-textMid bg-salve-card2/60 hover:bg-salve-card2 border border-salve-border/60 hover:text-salve-text transition-colors cursor-pointer"
                  >
                    Keep exploring
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Live theme-preview card. Pulls the real theme palette from constants/themes
// so the swatch reflects the actual background + gradient the user will get
// when they pick it.
function ThemeCard({ themeId, label, blurb, selected, onClick }) {
  const theme = themes[themeId];
  if (!theme) return null;
  const colors = theme.colors;
  const gradKeys = theme.gradient || ['lav', 'sage', 'amber'];
  const grad = gradKeys.map(k => colors[k]).filter(Boolean);
  const previewBg = colors.bg || colors.card || '#1a1a1a';
  const headingColor = colors.text || '#fff';
  const subColor = colors.textMid || '#aaa';

  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all active:scale-[0.98]"
      style={{
        border: selected ? `2px solid ${C.lav}` : `1px solid ${C.border2 || 'rgba(255,255,255,0.12)'}`,
        boxShadow: selected ? `0 0 0 3px ${C.lav}33, 0 4px 16px -4px ${C.lav}66` : 'none',
      }}
    >
      <div
        className="relative h-[86px] p-3 flex flex-col justify-between text-left"
        style={{
          background: previewBg,
        }}
      >
        {/* Gradient accent strip to evoke the theme's character */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-70 pointer-events-none"
          style={{
            background: grad.length >= 3
              ? `radial-gradient(circle at 20% 20%, ${grad[0]}55 0%, transparent 55%), radial-gradient(circle at 80% 80%, ${grad[1]}55 0%, transparent 55%), radial-gradient(circle at 50% 50%, ${grad[2]}33 0%, transparent 60%)`
              : `linear-gradient(135deg, ${grad[0] || colors.lav}33, ${grad[1] || colors.sage}22)`,
          }}
        />
        <div className="relative">
          <div
            className="text-[12px] font-semibold font-playfair leading-tight"
            style={{ color: headingColor }}
          >
            {label}
          </div>
        </div>
        <div
          className="relative text-[10px] font-montserrat leading-tight"
          style={{ color: subColor }}
        >
          {blurb}
        </div>
      </div>
    </button>
  );
}

function FeatureCard({ icon, tint, title, blurb, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-salve-card2/50 hover:bg-salve-card2 border border-salve-border/60 hover:border-salve-border2 text-left cursor-pointer transition-all active:scale-[0.98]"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: `linear-gradient(135deg, ${tint}, ${tint}cc)`,
          boxShadow: `0 2px 10px -2px ${tint}aa`,
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-salve-text font-montserrat leading-tight">
          {title}
        </div>
        <div className="text-[10px] text-salve-textMid font-montserrat leading-tight mt-0.5">
          {blurb}
        </div>
      </div>
    </button>
  );
}
