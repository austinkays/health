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
//     Four informational cards highlighting the app's most compelling
//     surfaces (Sage chat, Vitals, Medications, News). These are NOT
//     interactive — tapping them does nothing. The user advances through
//     the walkthrough via Back/Next, and discovers these surfaces
//     organically via the Dashboard / SideNav after the modal closes.
//     Early versions navigated immediately on tap, but that yanked users
//     out of the walkthrough mid-orientation.
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

export default function DemoWelcome({ onExitDemo, onClose }) {
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
                  />
                  <FeatureCard
                    icon={<Heart size={18} color="#fff" strokeWidth={2.25} />}
                    tint={C.rose}
                    title="Explore Vitals"
                    blurb="Trends and charts"
                  />
                  <FeatureCard
                    icon={<Pill size={18} color="#fff" strokeWidth={2.25} />}
                    tint={C.lav}
                    title="Medications"
                    blurb="Drug info and refills"
                  />
                  <FeatureCard
                    icon={<Newspaper size={18} color="#fff" strokeWidth={2.25} />}
                    tint={C.amber}
                    title="Read news"
                    blurb="Personalized feed"
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

// Live theme-preview card. Renders a scaled-down "real" version of the
// theme using its own bg + gradient + accent colors, so what the user
// sees IS the theme they'll get (not a decoration on top of salve-card).
// Mirrors the ThemeTile pattern in Settings.jsx but larger and richer
// since this is a first-impression moment.
function ThemeCard({ themeId, label, blurb, selected, onClick }) {
  const theme = themes[themeId];
  if (!theme) return null;
  const colors = theme.colors;
  const gradKeys = theme.gradient && theme.gradient.length === 3
    ? theme.gradient
    : ['lav', 'sage', 'amber'];
  const grad = gradKeys.map(k => colors[k]).filter(Boolean);
  const orbGradient = grad.length >= 3
    ? `linear-gradient(135deg, ${grad[0]}, ${grad[1]}, ${grad[2]})`
    : `linear-gradient(135deg, ${colors.lav}, ${colors.sage})`;

  const isLight = theme.type === 'light';
  const ariaLabel = `${theme.label || label} theme, ${isLight ? 'light' : 'dark'}`;

  // Accent dot trio: surface the three primary accents from the palette
  // so users can glance at the color language of the theme.
  const accentDots = [colors.lav, colors.sage, colors.amber, colors.rose]
    .filter(Boolean)
    .slice(0, 3);

  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all hover:brightness-105 ${
        selected ? 'scale-[1.02]' : 'active:scale-[0.98]'
      }`}
      style={{
        backgroundColor: colors.bg,
        border: selected
          ? `2px solid ${C.lav}`
          : `1px solid ${colors.border2 || colors.border || 'rgba(255,255,255,0.12)'}`,
        boxShadow: selected
          ? `0 0 0 3px ${C.lav}33, 0 8px 24px -6px ${C.lav}80`
          : `0 2px 10px -4px ${colors.border2 || 'rgba(0,0,0,0.3)'}`,
      }}
    >
      <div
        className="relative h-[148px] px-3.5 py-3 flex flex-col justify-between text-left overflow-hidden"
      >
        {/* Soft ambient gradient wash echoing the theme's signature */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-60 pointer-events-none"
          style={{
            background: grad.length >= 3
              ? `radial-gradient(circle at 15% 10%, ${grad[0]}44 0%, transparent 55%), radial-gradient(circle at 85% 90%, ${grad[1]}3a 0%, transparent 55%), radial-gradient(circle at 50% 50%, ${grad[2]}22 0%, transparent 70%)`
              : `linear-gradient(135deg, ${colors.lav}26, ${colors.sage}1a)`,
          }}
        />

        {/* Light/dark chip */}
        <div
          aria-hidden="true"
          className="relative self-end text-[9px] font-montserrat font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none"
          style={{
            color: colors.textMid || colors.text,
            backgroundColor: `${colors.card2 || colors.card || '#fff'}cc`,
            border: `1px solid ${colors.border || 'rgba(0,0,0,0.1)'}`,
          }}
        >
          {isLight ? '☀ Light' : '◑ Dark'}
        </div>

        {/* Gradient orb — the hero element, pulled straight from the theme's own gradient keys */}
        <div className="relative flex items-center justify-center flex-1">
          <div
            className="w-[54px] h-[54px] rounded-full"
            style={{
              background: orbGradient,
              boxShadow: `0 2px 8px ${colors.border2 || 'rgba(0,0,0,0.25)'}, 0 6px 22px -4px ${grad[0] || colors.lav}99, inset 0 1px 2px rgba(255,255,255,0.25)`,
            }}
          />
        </div>

        {/* Label + blurb + accent dots */}
        <div className="relative">
          <div
            className="text-[13px] font-semibold font-playfair leading-tight mb-0.5"
            style={{ color: colors.text }}
          >
            {label}
          </div>
          <div
            className="text-[10px] font-montserrat leading-tight mb-1.5"
            style={{ color: colors.textFaint || colors.textMid }}
          >
            {blurb}
          </div>
          <div className="flex items-center gap-1" aria-hidden="true">
            {accentDots.map((color, i) => (
              <span
                key={i}
                className="block w-2 h-2 rounded-full"
                style={{
                  backgroundColor: color,
                  boxShadow: `0 1px 2px ${colors.border2 || 'rgba(0,0,0,0.2)'}`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

// Non-interactive informational card. Used on step 1 to show what the
// user can explore, but tapping it does nothing — the walkthrough
// continues via Back/Next only. See the file header for why.
function FeatureCard({ icon, tint, title, blurb }) {
  return (
    <div className="relative flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-salve-card2/50 border border-salve-border/60 text-left">
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
    </div>
  );
}
