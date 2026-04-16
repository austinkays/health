import { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, Shield, Sparkles, ChevronDown, ChevronUp, Star, ClipboardCopy, Loader, RefreshCw, Apple, LogOut, MapPin, MessageCircle, Bug, Info, Smartphone } from 'lucide-react';
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
import Wearables from '../settings/Wearables';
import DataManagement from '../settings/DataManagement';
import BillingPanel from '../settings/BillingPanel';
import { signOut } from '../../services/auth';
import { supabase } from '../../services/supabase';
import { startCheckout, BILLING_ENABLED } from '../../services/billing';
import { resetOnboarding } from '../ui/OnboardingWizard';
import { subscribeToPush, unsubscribeFromPush, isSubscribed, getPermissionState, sendTestPush } from '../../services/push';
import { isStandalone, isIOS, isAndroid, isSafari } from '../../utils/platform';

const PREP_PROMPT = `I'm going to send you a file called salve-sync.jsx in my next message. It's the complete source code for a React artifact called "Salve Health Sync", a health-data sync tool that uses MCP connections to pull my medical records and export them as JSON for import into the Salve app.

When the file arrives, do this immediately, no commentary, no questions first:

1. Create a React artifact. Use identifier "salve-health-sync", type "application/vnd.ant.react", title "Salve Health Sync". Put the ENTIRE file contents into the artifact, unchanged. Do not rewrite, refactor, summarize, shorten, or "fix" anything. The code is already complete and working.

2. Do NOT analyze the code, describe what it does, or ask what I want before creating the artifact.

3. After the artifact renders, tell me in one short sentence that it's ready. Then check whether I have any health-related MCP connectors enabled (like Healthex for patient portals, or Function Health for lab panels). If I'm missing connectors the artifact needs, help me set them up step by step: tell me to open Claude settings → Connectors, search for the connector, and complete the OAuth sign-in. Don't assume I know where "Connectors" lives, spell out the exact clicks. Once connected, tell me to click "Pull Health Records" in the artifact.

Ready? I'll attach the file next.`;

const PROJECT_INSTRUCTIONS = `This project is for syncing my health records into Salve (a personal health management app).

The knowledge file salve-sync.jsx is the complete source code for a React artifact called "Salve Health Sync". It uses MCP connections to pull my medical records and export them as JSON that I import into Salve.

Whenever I ask you to sync, pull records, start the sync artifact, or anything similar, do this immediately, no commentary, no questions first:

1. Create a React artifact. Use identifier "salve-health-sync", type "application/vnd.ant.react", title "Salve Health Sync". Put the ENTIRE contents of salve-sync.jsx into the artifact, unchanged. Do not rewrite, refactor, summarize, shorten, or "fix" anything. The code is already complete and working.

2. Do NOT analyze the code, describe what it does, or ask what I want before creating the artifact.

3. After the artifact renders, tell me in one short sentence that it's ready. Then check whether I have any health-related MCP connectors enabled (like Healthex for patient portals, or Function Health for lab panels). If I'm missing connectors the artifact needs, help me set them up step by step: tell me to open Claude settings → Connectors, search for the connector, and complete the OAuth sign-in. Don't assume I know where "Connectors" lives, spell out the exact clicks. Once connected, tell me to click "Pull Health Records" in the artifact.

Dependencies available in the Claude artifacts runtime: react and lucide-react. No other imports needed, no external API calls from the file itself.`;

function CopyButton({ text, label, copiedLabel = 'Copied!', ariaLabel }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };
  return (
    <button
      onClick={copy}
      className={`w-full py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors border cursor-pointer font-montserrat ${
        copied
          ? 'bg-salve-sage/15 border-salve-sage/30 text-salve-sage'
          : 'bg-salve-card2 border-salve-border text-salve-textMid hover:border-salve-lav/40 hover:text-salve-lav'
      }`}
      aria-label={ariaLabel || (copied ? 'Copied to clipboard' : label)}
    >
      <ClipboardCopy size={14} />
      {copied ? copiedLabel : label}
    </button>
  );
}

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
  const [expandedSource, setExpandedSource] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const toggleSource = (id) => setExpandedSource(prev => prev === id ? null : id);

  const [userEmail, setUserEmail] = useState('');
  const [locationStatus, setLocationStatus] = useState(null); // null | 'detecting' | 'error' | 'success'
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    }).catch(() => {});
  }, []);

  // Source detection + counts
  const sourceCounts = useMemo(() => {
    const counts = { oura: 0, apple_health: 0, manual: 0, mcp: 0 };
    const all = [
      ...(data.vitals || []),
      ...(data.activities || []),
      ...(data.cycles || []),
    ];
    for (const r of all) {
      const s = (r.source || '').toLowerCase();
      if (s === 'oura') counts.oura++;
      else if (s === 'apple_health' || s === 'apple health' || s.includes('apple')) counts.apple_health++;
      else if (s === 'mcp' || s === 'mcp-sync') counts.mcp++;
      else counts.manual++;
    }
    // MCP sync imports also land in meds/conditions/etc with no source field,
    // so count records imported via merge (rough heuristic: non-empty tables)
    return counts;
  }, [data.vitals, data.activities, data.cycles]);

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
        {/* Quick profile links */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-salve-border/50">
          <button onClick={() => onNav('aboutme')} className="text-[13px] text-salve-lav/70 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0">About you →</button>
          <button onClick={() => onNav('pharmacies')} className="text-[13px] text-salve-lav/70 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0">Pharmacies →</button>
          <button onClick={() => onNav('insurance')} className="text-[13px] text-salve-lav/70 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0">Insurance →</button>
        </div>
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
      {/* ══════════════ 5. Connected Devices ══════════════ */}
      <SectionTitle>Connected Devices</SectionTitle>

      <div className="space-y-2 mb-4">
        {/* ── Claude Health Sync (always first) ── */}
        <Card>
          <button onClick={() => toggleSource('claude')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-lav/15">
                <Sparkles size={16} className="text-salve-lav" />
              </div>
              <div className="text-left">
                <span className="text-[15px] text-salve-text font-medium block">Claude Health Sync</span>
                <span className="text-[12px] text-salve-textFaint">Pull records from MCP providers</span>
              </div>
            </div>
            {expandedSource === 'claude' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
          </button>
          {expandedSource === 'claude' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50 space-y-4">
              {/* ── Recommended: Claude Project (one-time setup) ── */}
              <div className="bg-salve-lav/5 border border-salve-lav/20 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-salve-lav font-montserrat">Highly recommended · saves tokens</span>
                </div>
                <h4 className="text-[15px] text-salve-text font-medium font-montserrat mb-1">Create a Claude Project</h4>
                <p className="text-[13px] text-salve-textFaint leading-relaxed mb-3">
                  The sync file is large and uses significant tokens every time you attach it. A project stores it once, so future syncs are just "sync my records" with no re-uploading.
                </p>

                <ol className="text-[13px] text-salve-textMid space-y-2.5 leading-relaxed list-decimal pl-5 mb-3">
                  <li>
                    On Claude.ai, click <strong className="text-salve-text">Projects</strong> → <strong className="text-salve-text">New project</strong>. Name it "Salve Health Sync".
                  </li>
                  <li>
                    In the <strong className="text-salve-text">What are you trying to achieve?</strong> field, paste the project instructions below.
                    <div className="mt-2">
                      <CopyButton text={PROJECT_INSTRUCTIONS} label="Copy project instructions" copiedLabel="Project instructions copied!" />
                    </div>
                  </li>
                  <li>
                    In the project's <strong className="text-salve-text">Files</strong> section (also called Project knowledge), upload <code className="text-salve-textMid text-[12px]">salve-sync.jsx</code>.
                    <div className="mt-2">
                      <a
                        href="/salve-sync.jsx"
                        download="salve-sync.jsx"
                        className="btn-magic btn-magic-lav w-full py-2.5 rounded-lg font-medium text-xs no-underline
                          bg-gradient-to-r from-salve-lav/20 via-salve-sage/10 to-salve-lav/20
                          border border-salve-lav/30 text-salve-lav
                          flex items-center justify-center gap-2
                          hover:border-salve-lav/50 hover:from-salve-lav/30 hover:to-salve-lav/30"
                      >
                        <Sparkles size={14} className="animate-pulse" />
                        Download salve-sync.jsx
                      </a>
                    </div>
                  </li>
                  <li>
                    Start a <strong className="text-salve-text">new chat</strong> inside that project and say <em className="text-salve-textMid">"sync my health records"</em>. The artifact will render automatically.
                  </li>
                  <li>
                    Pull your records, download the JSON, and import it via <strong className="text-salve-text">Data Management → Import</strong> above.
                  </li>
                </ol>

                <p className="text-[12px] text-salve-textFaint italic leading-relaxed">
                  After setup, future syncs only need step 4 + step 5.
                </p>
              </div>

              {/* ── MCP connectors ── */}
              <div className="bg-salve-card2 border border-salve-border rounded-xl p-3">
                <h4 className="text-[13px] text-salve-text font-semibold uppercase tracking-wider font-montserrat mb-2">MCP connectors</h4>
                <p className="text-[12px] text-salve-textFaint leading-relaxed mb-2">
                  The sync artifact pulls records through MCP connectors like <strong className="text-salve-textMid">Healthex</strong> (patient portals), <strong className="text-salve-textMid">Function Health</strong> (lab panels), and <strong className="text-salve-textMid">Nori Health</strong> (Apple Health + wearables). Claude will detect which connectors you have and walk you through setting up any that are missing.
                </p>
                <p className="text-[12px] text-salve-textFaint italic leading-relaxed">
                  Just start the artifact and follow the prompts. No manual URL configuration needed.
                </p>
              </div>

              {/* ── Fallback: one-off chat ── */}
              <details className="group">
                <summary className="cursor-pointer text-[13px] text-salve-textMid font-montserrat hover:text-salve-text flex items-center gap-1.5">
                  <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                  One-off sync (uses more tokens each time)
                </summary>
                <div className="mt-3 pl-4 space-y-4 border-l-2 border-salve-border/40">
                  <p className="text-[13px] text-salve-textFaint leading-relaxed">
                    Open a new chat on Claude.ai and follow these steps in order.
                  </p>

                  {/* Step 1, Prep prompt */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-salve-lav/20 text-salve-lav text-[12px] font-semibold flex items-center justify-center font-montserrat">1</span>
                      <span className="text-[14px] text-salve-text font-medium font-montserrat">Send the prep prompt</span>
                    </div>
                    <p className="text-[12px] text-salve-textFaint leading-relaxed mb-2 pl-7">
                      Primes Claude so it knows what to do when the file arrives.
                    </p>
                    <div className="pl-7">
                      <CopyButton text={PREP_PROMPT} label="Copy prep prompt" copiedLabel="Prep prompt copied!" />
                    </div>
                  </div>

                  {/* Step 2, Attach file */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-salve-lav/20 text-salve-lav text-[12px] font-semibold flex items-center justify-center font-montserrat">2</span>
                      <span className="text-[14px] text-salve-text font-medium font-montserrat">Attach the file</span>
                    </div>
                    <p className="text-[12px] text-salve-textFaint leading-relaxed mb-2 pl-7">
                      Download it, then attach it as your next message in Claude. You don't need to type anything, Claude already has its instructions from step 1.
                    </p>
                    <div className="pl-7">
                      <a
                        href="/salve-sync.jsx"
                        download="salve-sync.jsx"
                        className="btn-magic w-full py-2.5 rounded-lg font-medium text-xs no-underline
                          bg-salve-card2 border border-salve-border text-salve-textMid
                          flex items-center justify-center gap-2
                          hover:border-salve-lav/40 hover:text-salve-lav"
                      >
                        <Sparkles size={14} />
                        Download salve-sync.jsx
                      </a>
                    </div>
                  </div>

                  {/* Step 3, Import */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-salve-lav/20 text-salve-lav text-[12px] font-semibold flex items-center justify-center font-montserrat">3</span>
                      <span className="text-[14px] text-salve-text font-medium font-montserrat">Import the JSON back here</span>
                    </div>
                    <p className="text-[12px] text-salve-textFaint leading-relaxed pl-7">
                      Pull records in the artifact, download the JSON, and import via Data Management → Import above.
                    </p>
                  </div>
                </div>
              </details>
            </div>
          )}
        </Card>

        <Wearables
          data={data}
          addItem={addItem}
          addItemSilent={addItemSilent}
          reloadData={reloadData}
          onNav={onNav}
          demoMode={demoMode}
          expandedSource={expandedSource}
          setExpandedSource={setExpandedSource}
          toggleSource={toggleSource}
          sourceCounts={sourceCounts}
        />
      </div>

      {/* ══════════════ 6b. Connections link ══════════════ */}
      <Card>
        <button
          onClick={() => onNav('import')}
          className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-lav/15">
              <Upload size={16} className="text-salve-lav" />
            </div>
            <div className="text-left">
              <span className="text-[15px] text-salve-text font-medium block">Connections</span>
              <span className="text-[12px] text-salve-textFaint">Claude Sync, Apple Health, MyChart, and 15+ apps</span>
            </div>
          </div>
          <ChevronDown size={14} className="text-salve-textFaint -rotate-90" />
        </button>
      </Card>

      {/* ══════════════ 7. Data & Privacy ══════════════ */}
      <DataManagement
        eraseAll={eraseAll}
        reloadData={reloadData}
        demoMode={demoMode}
      />

      {/* ══════════════ 8. Install App ══════════════ */}
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

