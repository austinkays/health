// src/components/ui/OnboardingWizard.jsx
// First-run wizard that greets a brand-new user, asks what they're
// tracking and what devices they use, and pre-seeds their Dashboard
// (starred Quick Access tiles + dismissed Getting Started tips) so the
// home screen feels personalized on day one instead of generic.
//
// Show rules (enforced in App.jsx):
//   • Not in demo mode
//   • Not already completed (localStorage `salve:onboarded` = true)
//   • No existing user data (conditions / meds / vitals all empty)
//
// Shows after WhatsNewModal (WhatsNew can close itself; we stack).
// Fully skippable from any screen. Progress is not saved mid-flow —
// if the user closes without finishing, they see it again next load
// unless they explicitly tap "Skip setup".

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Check, X, Sparkles, FileUp } from 'lucide-react';
import { setStarred } from '../../utils/starred';
import { DEXCOM_ENABLED } from '../../services/dexcom';
import { WITHINGS_ENABLED } from '../../services/withings';
import { FITBIT_ENABLED } from '../../services/fitbit';
import { WHOOP_ENABLED } from '../../services/whoop';
import { TERRA_ENABLED } from '../../services/terra';
import { db } from '../../services/db';
import { getPref, setPref } from '../../services/preferences';

const ONBOARDED_KEY = 'salve:onboarded';
const DISMISSED_TIPS_KEY = 'salve:dismissed-tips';

// `onboarded` now lives in profiles.preferences so completion follows the user
// across devices. The localStorage key is retained as a fast-read fallback
// during the window before the server hydrate resolves, and for users carried
// over from the pre-migration version.
export function hasCompletedOnboarding() {
  if (getPref('onboarded', false) === true) return true;
  try {
    return localStorage.getItem(ONBOARDED_KEY) === 'true';
  } catch { return false; }
}

export function markOnboardingComplete() {
  setPref('onboarded', true);
  try { localStorage.setItem(ONBOARDED_KEY, 'true'); } catch { /* */ }
}

export function resetOnboarding() {
  setPref('onboarded', null);
  try { localStorage.removeItem(ONBOARDED_KEY); } catch { /* */ }
}

// What the user might be tracking. Each answer maps to a set of
// Dashboard tile IDs that get starred and tip IDs to dismiss.
const TRACKING_OPTIONS = [
  {
    id: 'chronic_pain',
    label: 'Chronic pain or dysautonomia',
    tiles: ['vitals', 'journal', 'meds', 'labs'],
  },
  {
    id: 'mental_health',
    label: 'ADHD, anxiety, or mental health',
    tiles: ['journal', 'meds', 'todos', 'insights'],
  },
  {
    id: 'sleep',
    label: 'Sleep issues or fatigue',
    tiles: ['vitals', 'sleep', 'journal', 'activities'],
  },
  {
    id: 'digestive',
    label: 'IBS, GERD, or digestive issues',
    tiles: ['journal', 'meds', 'labs', 'insights'],
  },
  {
    id: 'cardiovascular',
    label: 'Heart, blood pressure, cardiovascular',
    tiles: ['vitals', 'labs', 'meds', 'conditions'],
  },
  {
    id: 'cycles',
    label: 'Cycle tracking or fertility',
    tiles: ['cycles', 'journal', 'vitals', 'meds'],
  },
  {
    id: 'med_management',
    label: 'Medication management',
    tiles: ['meds', 'pharmacies', 'interactions', 'conditions'],
  },
  {
    id: 'general',
    label: 'General wellness',
    tiles: ['vitals', 'journal', 'activities', 'meds'],
  },
];

// What devices the user has. Each maps to tip IDs we can confidently
// dismiss (because they've now got the device wired up another way).
// We filter to only devices whose integration is currently enabled via
// feature flags so onboarding never advertises something Settings has
// hidden. Apple Health file/paste import is always available, so it's
// always shown. Oura is always on.
const ALL_DEVICE_OPTIONS = [
  { id: 'apple',    label: 'iPhone / Apple Health',              dismissTips: ['connect-oura'], enabled: true },
  { id: 'oura',     label: 'Oura Ring',                          dismissTips: ['connect-oura'], enabled: true },
  { id: 'dexcom',   label: 'Dexcom CGM',                         dismissTips: [],               enabled: DEXCOM_ENABLED },
  { id: 'withings', label: 'Withings (scale, BP cuff, sleep mat)', dismissTips: [],             enabled: WITHINGS_ENABLED },
  { id: 'fitbit',   label: 'Fitbit',                             dismissTips: ['connect-oura'], enabled: FITBIT_ENABLED },
  { id: 'whoop',    label: 'Whoop',                              dismissTips: ['connect-oura'], enabled: WHOOP_ENABLED },
  { id: 'terra',    label: 'Other wearable (via Terra)',         dismissTips: [],               enabled: TERRA_ENABLED },
  { id: 'none',     label: 'None of these',                      dismissTips: [],               enabled: true },
  { id: 'other',    label: 'Something else',                     dismissTips: [],               enabled: true },
];

const DEVICE_OPTIONS = ALL_DEVICE_OPTIONS.filter(opt => opt.enabled);

// Merge multiple tracking selections into a ranked unique tile list.
// Tiles that appear in multiple selections get boosted. Capped at 6.
function computeStarredTiles(selectedTrackingIds) {
  const counts = new Map();
  for (const id of selectedTrackingIds) {
    const opt = TRACKING_OPTIONS.find(o => o.id === id);
    if (!opt) continue;
    opt.tiles.forEach((tile, i) => {
      // First-position tiles get more weight (primary for that category)
      const weight = (4 - Math.min(i, 3));
      counts.set(tile, (counts.get(tile) || 0) + weight);
    });
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);
}

function computeDismissedTips(selectedDeviceIds) {
  const dismissed = new Set();
  for (const id of selectedDeviceIds) {
    const opt = DEVICE_OPTIONS.find(o => o.id === id);
    if (!opt) continue;
    opt.dismissTips.forEach(tip => dismissed.add(tip));
  }
  return [...dismissed].map(id => ({ id, permanent: true }));
}

// ────────────────────────────────────────────────────────────────────

export default function OnboardingWizard({ name, updateSettings, onClose }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [nameInput, setNameInput] = useState(name || '');
  const [tracking, setTracking] = useState(new Set());
  const [devices, setDevices] = useState(new Set());
  const [otherDevice, setOtherDevice] = useState('');

  useEffect(() => {
    // Next frame so the transition plays
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = (completed) => {
    setVisible(false);
    // Always mark complete on close — even if they skipped, we respect
    // that choice and don't re-prompt every load.
    markOnboardingComplete();

    if (completed) {
      // Save the name if they entered one (and it's different from what
      // was already on file). Skipping the name step leaves the existing
      // value untouched.
      const trimmed = nameInput.trim();
      if (trimmed && trimmed !== (name || '') && typeof updateSettings === 'function') {
        try { updateSettings({ name: trimmed }); } catch { /* */ }
      }

      // Write starred tiles + dismissed tips
      const tiles = computeStarredTiles([...tracking]);
      if (tiles.length > 0) setStarred(tiles);

      const dismissed = computeDismissedTips([...devices]);
      if (dismissed.length > 0) {
        try {
          const existing = JSON.parse(localStorage.getItem(DISMISSED_TIPS_KEY) || '[]');
          const merged = [...existing];
          for (const rec of dismissed) {
            if (!merged.find(r => r.id === rec.id)) merged.push(rec);
          }
          localStorage.setItem(DISMISSED_TIPS_KEY, JSON.stringify(merged));
        } catch { /* */ }
      }

      // If the user typed a device request, submit as feedback (fire-and-forget)
      if (otherDevice.trim()) {
        db.feedback.add({ type: 'suggestion', message: `Device request from onboarding: ${otherDevice.trim()}` }).catch(() => {});
      }
    }
    setTimeout(onClose, 220);
  };

  const toggleTracking = (id) => {
    setTracking(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleDevice = (id) => {
    setDevices(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const suggestedTiles = computeStarredTiles([...tracking]);

  return (
    <div
      className={`fixed inset-0 z-[9998] flex items-center justify-center px-4 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className={`relative bg-salve-card border border-salve-border rounded-2xl w-full max-w-[460px] max-h-[88vh] overflow-y-auto px-6 py-7 shadow-xl transition-transform duration-200 ${visible ? 'scale-100' : 'scale-95'}`}
      >
        {/* Close (skip) button */}
        <button
          onClick={() => handleClose(false)}
          aria-label="Skip setup"
          className="absolute top-3 right-3 text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer p-1.5 flex"
        >
          <X size={16} />
        </button>

        {/* ── Step 0: Welcome ── */}
        {step === 0 && (
          <div className="text-center">
            <div className="text-salve-textFaint tracking-widest mb-3 text-ui-sm" aria-hidden="true">
              <span className="twinkle">✶</span>
              <span className="mx-2">·</span>
              <span className="twinkle" style={{ animationDelay: '1.2s' }}>✶</span>
            </div>
            <h2 className="font-playfair text-display-lg font-semibold text-salve-text mb-2">
              Welcome{name ? `, ${name}` : ''}
            </h2>
            <p className="text-ui-lg text-salve-textMid font-montserrat leading-relaxed mb-6">
              Let's set up your home in about 60 seconds. Pick what fits your situation. You can change anything later.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setStep(1)}
                className="cta-lift w-full bg-salve-lav text-salve-bg font-medium rounded-lg py-3 text-ui-lg hover:bg-salve-lavDim cursor-pointer"
              >
                Get started →
              </button>
              <button
                onClick={() => handleClose(false)}
                className="w-full bg-transparent border-none text-salve-textFaint hover:text-salve-text cursor-pointer py-2 text-ui-sm"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: What should we call you? ── */}
        {step === 1 && (
          <div>
            <div className="mb-4">
              <div className="text-ui-xs text-salve-textFaint font-montserrat tracking-widest uppercase mb-1">Step 1 of 4</div>
              <h2 className="font-playfair text-display-md font-semibold text-salve-text m-0">
                What should we call you?
              </h2>
              <p className="text-ui-base text-salve-textMid mt-1 leading-relaxed">
                Just a first name or nickname is fine. You can change it any time.
              </p>
            </div>

            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setStep(2); }}
              placeholder="Your first name or a nickname"
              autoFocus
              maxLength={60}
              className="w-full bg-salve-card2 border border-salve-border rounded-lg px-3.5 py-2.5 text-ui-base text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint mb-5"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setStep(0)}
                className="flex items-center gap-1 text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer px-3 py-2 text-ui-base font-montserrat"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={() => setStep(2)}
                className="cta-lift flex-1 bg-salve-lav text-salve-bg font-medium rounded-lg py-2.5 text-ui-base hover:bg-salve-lavDim cursor-pointer flex items-center justify-center gap-1"
              >
                {nameInput.trim() ? 'Next' : 'Skip'} <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: What are you tracking? ── */}
        {step === 2 && (
          <div>
            <div className="mb-4">
              <div className="text-ui-xs text-salve-textFaint font-montserrat tracking-widest uppercase mb-1">Step 2 of 4</div>
              <h2 className="font-playfair text-display-md font-semibold text-salve-text m-0">
                What are you tracking?
              </h2>
              <p className="text-ui-base text-salve-textMid mt-1 leading-relaxed">
                Pick any that apply. We'll surface the right sections on your home screen.
              </p>
            </div>

            <div className="space-y-2 mb-5">
              {TRACKING_OPTIONS.map(opt => {
                const checked = tracking.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleTracking(opt.id)}
                    aria-pressed={checked}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left font-montserrat cursor-pointer transition-colors ${
                      checked
                        ? 'bg-salve-lav/10 border-salve-lav/40 text-salve-text'
                        : 'bg-salve-card2 border-salve-border text-salve-textMid hover:border-salve-border2'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      checked ? 'bg-salve-lav border-salve-lav' : 'border-salve-border2'
                    }`}>
                      {checked && <Check size={11} className="text-salve-bg" strokeWidth={3} />}
                    </span>
                    <span className="text-ui-base">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer px-3 py-2 text-ui-base font-montserrat"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="cta-lift flex-1 bg-salve-lav text-salve-bg font-medium rounded-lg py-2.5 text-ui-base hover:bg-salve-lavDim cursor-pointer flex items-center justify-center gap-1"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: What devices do you use? ── */}
        {step === 3 && (
          <div>
            <div className="mb-4">
              <div className="text-ui-xs text-salve-textFaint font-montserrat tracking-widest uppercase mb-1">Step 3 of 4</div>
              <h2 className="font-playfair text-display-md font-semibold text-salve-text m-0">
                What devices do you use?
              </h2>
              <p className="text-ui-base text-salve-textMid mt-1 leading-relaxed">
                Pick any you have. Nothing syncs until you set it up, and you can skip this step if you'd rather just type things in.
              </p>
            </div>

            <div className="space-y-2 mb-4">
              {DEVICE_OPTIONS.map(opt => {
                const checked = devices.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleDevice(opt.id)}
                    aria-pressed={checked}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left font-montserrat cursor-pointer transition-colors ${
                      checked
                        ? 'bg-salve-sage/10 border-salve-sage/40 text-salve-text'
                        : 'bg-salve-card2 border-salve-border text-salve-textMid hover:border-salve-border2'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      checked ? 'bg-salve-sage border-salve-sage' : 'border-salve-border2'
                    }`}>
                      {checked && <Check size={11} className="text-salve-bg" strokeWidth={3} />}
                    </span>
                    <span className="text-ui-base">{opt.label}</span>
                  </button>
                );
              })}
              {devices.has('other') && (
                <input
                  type="text"
                  value={otherDevice}
                  onChange={e => setOtherDevice(e.target.value)}
                  placeholder="Which device or app? (e.g., Garmin, Samsung Health)"
                  maxLength={100}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-salve-sage/40 bg-salve-card2 text-salve-text text-ui-base font-montserrat placeholder:text-salve-textFaint/60 focus:outline-none focus:ring-1 focus:ring-salve-sage/50"
                />
              )}
            </div>

            {/* Generic import callout: works even without a wearable */}
            <div className="bg-salve-card2 border border-salve-border rounded-lg p-3.5 mb-5 flex gap-3 items-start">
              <div className="w-8 h-8 rounded-lg bg-salve-lav/15 flex items-center justify-center flex-shrink-0">
                <FileUp size={16} className="text-salve-lav" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-playfair text-ui-lg font-semibold text-salve-text mb-1">
                  No wearable? You can still import.
                </div>
                <p className="text-ui-base text-salve-textMid leading-relaxed m-0">
                  Salve can pull in records from most healthcare portals and health apps that let you export your data. Tap Settings, then Data, then Import after finishing setup. If you're not sure how to export from a specific app, ask Sage once you're in and she can walk you through it.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer px-3 py-2 text-ui-base font-montserrat"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="cta-lift flex-1 bg-salve-lav text-salve-bg font-medium rounded-lg py-2.5 text-ui-base hover:bg-salve-lavDim cursor-pointer flex items-center justify-center gap-1"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: All set ── */}
        {step === 4 && (
          <div>
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-salve-sage/15 flex items-center justify-center mx-auto mb-3">
                <Sparkles size={20} className="text-salve-sage" />
              </div>
              <h2 className="font-playfair text-display-lg font-semibold text-salve-text m-0">
                You're all set{nameInput.trim() ? `, ${nameInput.trim()}` : (name ? `, ${name}` : '')}
              </h2>
              <p className="text-ui-base text-salve-textMid mt-2 leading-relaxed">
                We've personalized your home based on what you told us. You can always customize it from the Dashboard.
              </p>
            </div>

            {suggestedTiles.length > 0 && (
              <div className="bg-salve-card2 border border-salve-border rounded-lg p-4 mb-5">
                <div className="text-ui-xs text-salve-textFaint font-montserrat tracking-wider uppercase mb-2">Pinned to your home</div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedTiles.map(id => (
                    <span
                      key={id}
                      className="bg-salve-lav/10 border border-salve-lav/30 text-salve-lav text-ui-sm font-montserrat px-2.5 py-1 rounded-full capitalize"
                    >
                      {id.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-1 text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer px-3 py-2 text-ui-base font-montserrat"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={() => handleClose(true)}
                className="cta-lift flex-1 bg-salve-lav text-salve-bg font-medium rounded-lg py-3 text-ui-lg hover:bg-salve-lavDim cursor-pointer"
              >
                Enter Salve →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
