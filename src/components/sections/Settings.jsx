import { useState, useRef, useEffect } from 'react';
import { Shield, Sparkles, Star, Apple, LogOut, MapPin, MessageCircle, Bug, Info, Smartphone, Link2, ChevronRight } from 'lucide-react';
import Card from '../ui/Card';
import Field from '../ui/Field';
import SectionTitle from '../ui/SectionTitle';
import Motif from '../ui/Motif';
import { hasAIConsent, revokeAIConsent } from '../ui/AIConsentGate';
import { getAIProvider, setAIProvider, isPremiumActive, isAdminActive, trialDaysRemaining } from '../../services/ai';
// Auto-set AI provider based on tier, no manual model picker needed
import { useTheme } from '../../hooks/useTheme';
import AIProfilePreview from '../ui/AIProfilePreview';
import { CURRENT_VERSION } from '../../constants/changelog';
import WhatsNewModal from '../ui/WhatsNewModal';
import DataManagement from '../settings/DataManagement';
import BillingPanel from '../settings/BillingPanel';
import { signOut } from '../../services/auth';
import { supabase } from '../../services/supabase';
import { startCheckout, BILLING_ENABLED } from '../../services/billing';
import { resetOnboarding } from '../ui/OnboardingWizard';
import { subscribeToPush, unsubscribeFromPush, isSubscribed, getPermissionState, sendTestPush } from '../../services/push';
import { isStandalone, isIOS, isAndroid, isSafari } from '../../utils/platform';

/* ── ThemeTile ───────────────────────────────────────────────────────────────
   Compact theme card: theme's own bg, small accent-gradient orb, name with
   optional ✦ sparkle for signature (experimental) themes, light/dark label.
   Active tile gets a lav ring.
──────────────────────────────────────────────────────────────────────────── */
function ThemeTile({ theme, isActive, isSignature, onSelect }) {
  const c = theme.colors;
  const grad = theme.gradient && theme.gradient.length === 3
    ? `linear-gradient(135deg, ${c[theme.gradient[0]]}, ${c[theme.gradient[1]]}, ${c[theme.gradient[2]]})`
    : `linear-gradient(135deg, ${c.lav}, ${c.rose}, ${c.lavDim})`;
  return (
    <button
      onClick={() => onSelect(theme.id)}
      aria-label={`${theme.label} theme${theme.type === 'light' ? ' (light)' : ' (dark)'}${isSignature ? ', signature' : ''}`}
      aria-pressed={isActive}
      style={{ backgroundColor: c.bg, borderColor: isActive ? undefined : c.border }}
      className={`relative px-1.5 py-2 rounded-xl border transition-all font-montserrat text-center cursor-pointer hover:brightness-105 ${
        isActive ? 'ring-2 ring-salve-lav border-transparent' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className="block w-[22px] h-[22px] rounded-full mx-auto mb-1 shadow-sm"
        style={{ background: grad, boxShadow: `0 1px 2px ${c.border2}, 0 2px 6px ${c.border}` }}
      />
      <span className="text-ui-sm font-medium block leading-tight" style={{ color: c.text }}>
        {isSignature && <span className="text-[9px] opacity-70" style={{ color: c.lav }}>✦ </span>}
        {theme.label}
      </span>
      <span className="text-ui-xs block mt-0.5" style={{ color: c.textFaint }}>
        {theme.type === 'light' ? '☀ Light' : '◑ Dark'}
      </span>
    </button>
  );
}

/* ── ThemeSelector ───────────────────────────────────────────────────────────
   All 16 themes in a flat 4-col grid (lights first, then darks, alphabetical
   within each group). Signature (experimental) themes self-identify via a
   subtle ✦ sparkle on the tile — no accordion, no hidden section.
   Free users can preview signature themes live; selection isn't persisted.
──────────────────────────────────────────────────────────────────────────── */
function ThemeSelector({ allThemes, themeId, setTheme, saveTheme, revertTheme, userTier, onUpgrade }) {
  const all = Object.values(allThemes).sort((a, b) => {
    // lights before darks, then alphabetical within each group
    if (a.type !== b.type) return a.type === 'light' ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  const canSavePremium = userTier === 'premium' || userTier === 'admin';

  const handleSelect = (id) => {
    const isExperimental = !!allThemes[id]?.experimental;
    if (isExperimental && !canSavePremium) {
      setTheme(id); // preview only, auto-reverts on unmount
    } else {
      saveTheme(id); // persist immediately
    }
  };

  // When a free user leaves Settings while previewing a signature theme, revert.
  const cleanupRef = useRef(null);
  const isPreviewingPremium = !canSavePremium && allThemes[themeId]?.experimental;
  cleanupRef.current = { isPreviewingPremium, revertTheme };
  useEffect(() => {
    return () => {
      const { isPreviewingPremium, revertTheme } = cleanupRef.current;
      if (isPreviewingPremium) revertTheme();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="grid grid-cols-4 gap-1.5">
        {all.map(t => (
          <ThemeTile
            key={t.id}
            theme={t}
            isActive={themeId === t.id}
            isSignature={!!t.experimental}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* Footer for non-premium users */}
      {!canSavePremium && (
        <p className="mt-3 text-ui-sm text-salve-textFaint font-montserrat leading-relaxed px-1">
          ✦ themes are preview only and reset on reload.
          {BILLING_ENABLED && (
            <>
              {' '}
              <button
                onClick={onUpgrade}
                className="text-salve-lav hover:text-salve-text underline-offset-2 hover:underline bg-transparent border-none p-0 cursor-pointer font-montserrat text-ui-sm"
              >
                Upgrade to save.
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export default function Settings({ data, updateSettings, updateItem, addItem, addItemSilent, eraseAll, reloadData, onNav, demoMode = false }) {
  const s = data.settings;
  const pharmacies = data.pharmacies || [];
  const set = (k, v) => updateSettings({ [k]: v });
  const [aiConsent, setAiConsent] = useState(() => hasAIConsent());
  // Effective tier, factors in trial expiry + localStorage dev override
  const userTier = isAdminActive(s) ? 'admin' : isPremiumActive(s) ? 'premium' : 'free';
  const trialDays = trialDaysRemaining(s);
  const isOnTrial = trialDays != null && trialDays > 0;
  const trialExpired = s?.tier === 'premium' && trialDays === 0;
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      await startCheckout(selectedPlan); // redirects — never returns on success
    } catch (err) {
      setCheckoutError(err.message || 'Could not start checkout. Try again.');
      setCheckoutLoading(false);
    }
  };
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushPermission, setPushPermission] = useState(() => getPermissionState());
  const [pushTestStatus, setPushTestStatus] = useState(null); // {type:'ok'|'err', msg}

  useEffect(() => {
    isSubscribed().then(setPushEnabled);
  }, []);

  const { themeId, committedThemeId, setTheme, saveTheme, revertTheme, hasUnsavedChanges, themes: allThemes } = useTheme();

  // Auto-set AI provider based on tier, premium gets Claude, free gets Gemini
  useEffect(() => {
    const shouldBe = userTier === 'premium' ? 'anthropic' : 'gemini';
    if (getAIProvider() !== shouldBe) setAIProvider(shouldBe);
  }, [userTier]);
  const [showChangelog, setShowChangelog] = useState(false);

  const [userEmail, setUserEmail] = useState('');
  const [locationStatus, setLocationStatus] = useState(null); // null | 'detecting' | 'error' | 'success'
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    }).catch(() => {});
  }, []);

  const preferredPharmacy = pharmacies.find(p => p.is_preferred);

  async function handlePreferredChange(pharmacyId) {
    // Unset the current preferred
    if (preferredPharmacy) {
      await updateItem('pharmacies', preferredPharmacy.id, { is_preferred: false });
    }
    // Set new preferred (if not "none")
    if (pharmacyId) {
      const selected = pharmacies.find(p => p.id === pharmacyId);
      if (selected) {
        await updateItem('pharmacies', selected.id, { is_preferred: true });
        set('pharmacy', selected.name + (selected.address ? `, ${selected.address}` : ''));
      }
    } else {
      set('pharmacy', '');
    }
  }

  return (
    <div className="mt-2">
      <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
      {/* ── Left Column ── */}
      <div>
      {/* ══════════════ 1. Account ══════════════ */}
      <SectionTitle>Account</SectionTitle>
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-salve-text font-medium font-montserrat">{s.name || 'No name set'}</p>
            <p className="text-[13px] text-salve-textFaint font-montserrat">{demoMode ? 'Demo mode' : (userEmail || 'Loading...')}</p>
          </div>
          <button
            onClick={async () => {
              if (demoMode) { window.location.reload(); return; }
              await signOut();
              window.location.reload();
            }}
            className="flex items-center gap-1.5 text-xs text-salve-rose/70 hover:text-salve-rose font-montserrat bg-transparent border border-salve-rose/20 hover:border-salve-rose/40 rounded-lg px-3 py-1.5 cursor-pointer transition-colors"
          >
            <LogOut size={12} /> {demoMode ? 'Exit demo' : 'Sign out'}
          </button>
        </div>
        {/* About you — prominent profile CTA */}
        <button
          onClick={() => onNav('aboutme')}
          className="w-full flex items-center justify-between gap-3 mt-3 pt-3 border-t border-salve-border/50 bg-transparent border-l-0 border-r-0 border-b-0 cursor-pointer group text-left p-0"
        >
          <div>
            <p className="text-sm text-salve-text font-medium font-montserrat group-hover:text-salve-lav transition-colors">About you</p>
            <p className="text-[13px] text-salve-textFaint font-montserrat mt-0.5">Name, location, and the personal context Sage uses</p>
          </div>
          <span className="text-salve-lav/60 group-hover:text-salve-lav group-hover:translate-x-0.5 transition-all font-montserrat text-sm shrink-0">→</span>
        </button>
      </Card>

      {/* ── Plan ── */}
      <BillingPanel
        s={s}
        userTier={userTier}
        trialDays={trialDays}
        isOnTrial={isOnTrial}
        trialExpired={trialExpired}
        handleUpgrade={handleUpgrade}
        checkoutLoading={checkoutLoading}
        checkoutError={checkoutError}
        selectedPlan={selectedPlan}
        setSelectedPlan={setSelectedPlan}
        reloadData={reloadData}
        onNav={onNav}
      />

      {/* ══════════════ 2. Appearance ══════════════ */}
      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <label className="block text-xs font-medium text-salve-textMid mb-2 font-montserrat">Theme</label>
        <ThemeSelector
          allThemes={allThemes}
          themeId={themeId}
          setTheme={setTheme}
          saveTheme={saveTheme}
          revertTheme={revertTheme}
          userTier={userTier}
          onUpgrade={handleUpgrade}
        />
      </Card>
      <Card>
        <label className="block text-xs font-medium text-salve-textMid mb-2 font-montserrat">Units</label>
        <div className="flex gap-2">
          {[
            { value: 'imperial', label: 'Imperial', desc: 'lbs, °F, mi, mg/dL' },
            { value: 'metric', label: 'Metric', desc: 'kg, °C, km, mmol/L' },
          ].map(o => (
            <button
              key={o.value}
              onClick={() => set('unit_system', o.value)}
              className={`flex-1 rounded-xl py-2.5 px-3 text-left border cursor-pointer transition-colors ${
                (s.unit_system || 'imperial') === o.value
                  ? 'border-salve-lav bg-salve-lav/10'
                  : 'border-salve-border bg-transparent'
              }`}
            >
              <span className={`block text-sm font-medium font-montserrat ${
                (s.unit_system || 'imperial') === o.value ? 'text-salve-lav' : 'text-salve-text'
              }`}>{o.label}</span>
              <span className="block text-[11px] text-salve-textFaint font-montserrat mt-0.5">{o.desc}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* ══════════════ 3. Sage ══════════════ */}
      <SectionTitle>Sage</SectionTitle>
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-salve-sage" aria-hidden="true" />
          <span className="text-sm text-salve-text font-medium font-montserrat">Your health assistant</span>
        </div>
        <p className="text-[13px] text-salve-textFaint font-montserrat leading-relaxed mb-3">
          Sage helps with health insights, fills out forms, finds relevant news, and can add or update your records through chat.
        </p>

        {aiConsent ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-salve-sage" />
              <span className="text-[13px] text-salve-textMid font-montserrat">Data sharing enabled</span>
            </div>
            <button
              onClick={() => {
                if (window.confirm('Revoke AI data sharing? Past AI conversations will remain visible but no new data will be sent. You can re-enable anytime.')) {
                  revokeAIConsent();
                  setAiConsent(false);
                }
              }}
              className="text-xs text-salve-rose bg-transparent border-none cursor-pointer font-montserrat hover:underline"
            >
              Revoke
            </button>
          </div>
        ) : (
          <p className="text-[13px] text-salve-textFaint font-montserrat italic">
            AI data sharing will be requested when you first use Sage.
          </p>
        )}
      </Card>

      <div className="flex flex-col items-center gap-1.5 my-1">
        <AIProfilePreview data={data} />
        <button
          onClick={() => onNav('ai')}
          className="text-[12px] text-salve-lav/60 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0"
        >
          Chat with Sage →
        </button>
      </div>

      {/* Sage Memory */}
      {(isPremiumActive() || isAdminActive()) && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-salve-lav" aria-hidden="true" />
            <span className="text-sm text-salve-text font-medium font-montserrat">Sage Memory</span>
          </div>
          <p className="text-[13px] text-salve-textFaint font-montserrat leading-relaxed mb-3">
            Sage remembers facts and preferences from your conversations to personalize future chats.
          </p>
          {data?.settings?.sage_memory ? (
            <>
              <textarea
                readOnly
                value={data.settings.sage_memory}
                rows={Math.min(8, data.settings.sage_memory.split('\n').length + 1)}
                className="w-full bg-salve-bg/60 border border-salve-border rounded-lg px-3 py-2 text-[13px] text-salve-textMid font-montserrat resize-none mb-2"
              />
              <button
                onClick={() => {
                  if (window.confirm('Clear all of Sage\'s memories? This cannot be undone.')) {
                    updateSettings({ sage_memory: '' });
                  }
                }}
                className="text-xs text-salve-rose bg-transparent border-none cursor-pointer font-montserrat hover:underline"
              >
                Clear memory
              </button>
            </>
          ) : (
            <p className="text-[13px] text-salve-textFaint font-montserrat italic">
              No memories yet — Sage will learn as you chat.
            </p>
          )}
        </Card>
      )}

      </div>
      {/* ── Right Column ── */}
      <div>
      {/* ── Notifications ── */}
      <SectionTitle>Notifications</SectionTitle>
      <Card>
          {(() => {
            const standalone = isStandalone();
            const ios = isIOS();
            const android = isAndroid();
            const safari = isSafari();
            // On iOS/macOS Safari outside standalone mode, the Push API doesn't exist.
            // Show install guidance instead of the misleading "Not supported" message.
            const needsInstall = !standalone && (ios || (safari && !android));
            const canEnableNow = !needsInstall && pushPermission !== 'denied' && pushPermission !== 'unsupported';

            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-montserrat font-medium text-salve-text">Push Notifications</p>
                    <p className="text-[13px] text-salve-textFaint font-montserrat mt-0.5">
                      {pushPermission === 'denied'
                        ? 'Blocked by your browser — check site settings to allow'
                        : needsInstall
                          ? 'Available after installing Salve to your home screen'
                          : pushEnabled
                            ? 'Receiving reminders on this device'
                            : 'Get reminders for medications, appointments, and more'}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      setPushLoading(true);
                      try {
                        if (pushEnabled) {
                          await unsubscribeFromPush();
                          setPushEnabled(false);
                        } else {
                          await subscribeToPush();
                          setPushEnabled(true);
                          setPushPermission('granted');
                        }
                      } catch (err) {
                        if (err.message?.includes('denied')) setPushPermission('denied');
                      }
                      setPushLoading(false);
                    }}
                    disabled={pushLoading || (!pushEnabled && !canEnableNow) || demoMode}
                    className={`px-4 py-1.5 rounded-lg border text-xs font-montserrat font-medium transition-colors cursor-pointer ${
                      pushEnabled
                        ? 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-rose/30 hover:text-salve-rose'
                        : 'bg-salve-card border-salve-border text-salve-textMid hover:border-salve-lav/30'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {pushLoading ? '...' : pushEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>

                {/* Platform-specific install guidance */}
                {needsInstall && (
                  <div className="flex gap-2 items-start mt-1 mb-2 px-2.5 py-2 rounded-lg bg-salve-lav/5">
                    <Smartphone size={14} className="text-salve-lav mt-0.5 shrink-0" aria-hidden="true" />
                    <p className="text-xs text-salve-textMid font-montserrat leading-relaxed">
                      {ios
                        ? 'On iPhone and iPad, notifications require Salve to be installed. In Safari, tap the Share button then "Add to Home Screen."'
                        : 'In Safari, notifications work after adding Salve to your Dock. Go to File \u2192 Add to Dock.'}
                    </p>
                  </div>
                )}
                {!standalone && !needsInstall && !pushEnabled && pushPermission !== 'denied' && pushPermission !== 'unsupported' && (
                  <div className="flex gap-2 items-start mt-1 mb-2 px-2.5 py-2 rounded-lg bg-salve-lav/5">
                    <Info size={14} className="text-salve-lav mt-0.5 shrink-0" aria-hidden="true" />
                    <p className="text-xs text-salve-textMid font-montserrat leading-relaxed">
                      {android
                        ? 'For the most reliable notifications, install Salve \u2014 tap \u22EE then "Install app" or "Add to Home Screen."'
                        : 'For notifications even when the browser is closed, install Salve as an app via the install icon in the address bar.'}
                    </p>
                  </div>
                )}

                {/* What you'll receive */}
                {pushEnabled && !demoMode && (
                  <div className="mt-2 mb-1">
                    <p className="text-xs text-salve-textFaint font-montserrat mb-1.5">What you'll receive:</p>
                    <ul className="text-xs text-salve-textMid font-montserrat space-y-0.5 pl-4 list-disc">
                      <li>Medication reminders at your scheduled times</li>
                      <li>Appointment reminders the day before</li>
                      <li>Refill alerts 3 days before they're due</li>
                      <li>Overdue to-do nudges</li>
                    </ul>
                    <button
                      onClick={async () => {
                        setPushTestStatus(null);
                        try {
                          await sendTestPush();
                          setPushTestStatus({ type: 'ok', msg: 'Notification sent — check your device.' });
                        } catch (err) {
                          setPushTestStatus({ type: 'err', msg: err.message || 'Failed to send test notification.' });
                        }
                      }}
                      className="text-[13px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer p-0 mt-2 hover:underline"
                    >
                      Send test notification
                    </button>
                    {pushTestStatus && (
                      <p className={`text-xs font-montserrat mt-1.5 ${pushTestStatus.type === 'ok' ? 'text-salve-sage' : 'text-salve-rose'}`}>
                        {pushTestStatus.msg}
                      </p>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </Card>

      {/* ══════════════ 7. Data & Privacy ══════════════ */}
      <DataManagement
        eraseAll={eraseAll}
        reloadData={reloadData}
        demoMode={demoMode}
      />

      {/* ══════════════ 8. Connections ══════════════ */}
      <Card>
        <button
          onClick={() => onNav('import')}
          className="w-full flex items-center justify-between py-1 group"
          aria-label="Manage Connections"
        >
          <div className="flex items-center gap-2.5">
            <Link2 size={14} className="text-salve-lav flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-medium text-salve-text font-montserrat">Manage Connections</div>
              <p className="text-xs text-salve-textFaint font-montserrat m-0">Wearables, imports, and data sources</p>
            </div>
          </div>
          <ChevronRight size={14} className="text-salve-textFaint group-hover:text-salve-lav transition-colors" />
        </button>
      </Card>

      {/* ══════════════ 9. Install App ══════════════ */}
      <SectionTitle>Install App</SectionTitle>
      <Card>
        <div className="space-y-3">
          <div className="flex items-start gap-2.5">
            <Smartphone size={14} className="text-salve-lav mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-salve-text font-montserrat mb-1">Add Salve to your home screen</div>
              <p className="text-[14px] text-salve-textFaint font-montserrat leading-relaxed m-0">
                Salve works as a full app when installed, faster launch, offline access, and no browser bar.
              </p>
            </div>
          </div>
          <div className="border-t border-salve-border/50 pt-3 space-y-2.5">
            <div className="flex items-start gap-2">
              <Apple size={12} className="text-salve-textMid mt-0.5 flex-shrink-0" />
              <p className="text-[14px] text-salve-textMid font-montserrat leading-relaxed m-0">
                <strong>iPhone/iPad:</strong> Tap the share button <span className="inline-block px-1 py-0.5 bg-salve-card2 rounded text-[12px]">&#x2191;</span> in Safari, then <strong>Add to Home Screen</strong>
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Smartphone size={12} className="text-salve-textMid mt-0.5 flex-shrink-0" />
              <p className="text-[14px] text-salve-textMid font-montserrat leading-relaxed m-0">
                <strong>Android:</strong> Tap the menu <span className="inline-block px-1 py-0.5 bg-salve-card2 rounded text-[12px]">&#8942;</span> in Chrome, then <strong>Add to Home Screen</strong> or <strong>Install App</strong>
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* ══════════════ 9. Support ══════════════ */}
      <SectionTitle>Support</SectionTitle>
      <Card>
        <div className="space-y-3">
          <a
            href="mailto:salveapp@proton.me?subject=Bug Report"
            className="flex items-center gap-2.5 text-sm text-salve-text font-montserrat no-underline hover:text-salve-lav transition-colors"
          >
            <Bug size={14} className="text-salve-textFaint" />
            Report a Bug
          </a>
          <button
            onClick={() => onNav('feedback')}
            className="flex items-center gap-2.5 text-sm text-salve-text font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-lav transition-colors"
          >
            <MessageCircle size={14} className="text-salve-textFaint" />
            Send Feedback
          </button>
          <button
            onClick={() => {
              resetOnboarding();
              window.location.reload();
            }}
            className="flex items-center gap-2.5 text-sm text-salve-text font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-lav transition-colors"
          >
            <Sparkles size={14} className="text-salve-textFaint" />
            Re-run onboarding wizard
          </button>
          <button
            onClick={() => setShowChangelog(true)}
            className="w-full rounded-xl border border-salve-lav/20 bg-salve-lav/6 px-3.5 py-3 text-left transition-colors hover:border-salve-lav/35 hover:bg-salve-lav/10"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-salve-lav/12 text-salve-lav">
                  <Star size={14} />
                </div>
                <div>
                  <div className="text-sm font-medium text-salve-text font-montserrat">What&apos;s New</div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-salve-textFaint font-montserrat">
                    See the latest update and older release notes whenever you want.
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-salve-card px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-salve-textFaint font-montserrat whitespace-nowrap">
                v{CURRENT_VERSION}
              </span>
            </div>
          </button>

        </div>
      </Card>

      </div>
      </div>

      {/* ══════════════ 9. Footer ══════════════ */}
      <div className="text-center mt-6 mb-2">
        <button
          onClick={() => onNav('legal')}
          className="text-[14px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors underline underline-offset-2"
        >
          Privacy, Terms & HIPAA Notice
        </button>
      </div>

      <div className="text-center py-8">
        <div className="flex items-center justify-center gap-1.5 mb-1.5">
          <Motif type="sparkle" size={10} color="#6e6a80" />
          <Motif type="moon" size={14} />
          <Motif type="sparkle" size={10} color="#6e6a80" />
        </div>
        <p className="text-[13px] text-salve-textFaint italic leading-relaxed">
          Personal health reference tool<br />Always consult your healthcare providers
        </p>
      </div>
      {showChangelog && <WhatsNewModal onClose={() => setShowChangelog(false)} />}
    </div>
  );
}

