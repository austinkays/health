import { useState, useRef, useEffect, useMemo } from 'react';
import { Trash2, Download, Upload, ShieldOff, Shield, Sparkles, ChevronDown, ChevronUp, Star, ClipboardCopy, Loader, Unlink, RefreshCw, Apple, LogOut, MapPin, Crown, MessageCircle, Bug, Info, Heart, Smartphone } from 'lucide-react';
import Card from '../ui/Card';
import DropZone from '../ui/DropZone';
import { OuraIcon } from '../ui/OuraIcon';
import Field from '../ui/Field';
import Button from '../ui/Button';
import Motif from '../ui/Motif';
import { exportAll, validateImport, importRestore, importMerge, encryptExport, decryptExport } from '../../services/storage';
import { hasAIConsent, revokeAIConsent } from '../ui/AIConsentGate';
import { getAIProvider, setAIProvider, isPremiumActive, isAdminActive, trialDaysRemaining } from '../../services/ai';
// Auto-set AI provider based on tier, no manual model picker needed
import { useTheme } from '../../hooks/useTheme';
import AIProfilePreview from '../ui/AIProfilePreview';
import AppleHealthImport from '../ui/AppleHealthImport';
import { isOuraConnected, getOuraAuthUrl, exchangeOuraCode, clearOuraTokens, getOuraTokens, syncAllOuraData } from '../../services/oura';
import { isDexcomConnected, getDexcomAuthUrl, exchangeDexcomCode, clearDexcomTokens, syncDexcomGlucose, DEXCOM_ENABLED } from '../../services/dexcom';
import { isWithingsConnected, getWithingsAuthUrl, exchangeWithingsCode, clearWithingsTokens, syncWithingsMeasurements, WITHINGS_ENABLED } from '../../services/withings';
import { isFitbitConnected, getFitbitAuthUrl, exchangeFitbitCode, clearFitbitTokens, syncFitbitData, FITBIT_ENABLED } from '../../services/fitbit';
import { isWhoopConnected, getWhoopAuthUrl, exchangeWhoopCode, clearWhoopTokens, syncWhoopData, WHOOP_ENABLED } from '../../services/whoop';
import { db } from '../../services/db';
import { signOut, deleteAccount } from '../../services/auth';
import { supabase } from '../../services/supabase';
import { startCheckout, openCustomerPortal, BILLING_ENABLED } from '../../services/billing';
import { startTerraConnect, listTerraConnections, disconnectTerraConnection, providerLabel, TERRA_ENABLED } from '../../services/terra';
import { subscribeToPush, unsubscribeFromPush, isSubscribed, getPermissionState, sendTestPush } from '../../services/push';

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
   A theme card uses the theme's own bg as its surface, an orb showing the
   accent gradient, the name, and a light/dark indicator. Premium themes
   show a soft "Premium" pill in the top-right. Active gets a lav ring.
──────────────────────────────────────────────────────────────────────────── */
function ThemeTile({ theme, isActive, isLocked, onSelect }) {
  const c = theme.colors;
  const grad = theme.gradient && theme.gradient.length === 3
    ? `linear-gradient(135deg, ${c[theme.gradient[0]]}, ${c[theme.gradient[1]]}, ${c[theme.gradient[2]]})`
    : `linear-gradient(135deg, ${c.lav}, ${c.rose}, ${c.lavDim})`;
  return (
    <button
      onClick={() => onSelect(theme.id)}
      aria-label={`${theme.label} theme${theme.type === 'light' ? ' (light)' : ' (dark)'}${isLocked ? ', premium' : ''}`}
      aria-pressed={isActive}
      style={{ backgroundColor: c.bg, borderColor: isActive ? undefined : c.border }}
      className={`relative px-2 py-2.5 rounded-xl border transition-all font-montserrat text-center cursor-pointer hover:brightness-105 ${
        isActive ? 'ring-2 ring-salve-lav border-transparent' : ''
      }`}
    >
      {isLocked && (
        <span className="absolute top-1 right-1 bg-salve-lav/15 text-salve-lav rounded-full px-1.5 py-0.5 text-[8px] font-medium leading-none">
          Premium
        </span>
      )}
      <span
        aria-hidden="true"
        className="block w-[30px] h-[30px] rounded-full mx-auto mb-1.5 shadow-sm"
        style={{ background: grad, boxShadow: `0 1px 2px ${c.border2}, 0 3px 8px ${c.border}` }}
      />
      <span className="text-ui-base font-medium block leading-tight" style={{ color: c.text }}>
        {theme.label}
      </span>
      <span className="text-ui-xs block mt-0.5" style={{ color: c.textFaint }}>
        {theme.type === 'light' ? '☀ Light' : '◑ Dark'}
      </span>
    </button>
  );
}

/* ── ThemeSelector ───────────────────────────────────────────────────────────
   Core themes in a 3-col grid (always — no md:6 jump). Premium themes inside
   a <details> accordion. Free users can preview live; selection isn't saved
   for premium themes. Footer line + upgrade link shown to non-premium.
──────────────────────────────────────────────────────────────────────────── */
function ThemeSelector({ allThemes, themeId, setTheme, saveTheme, revertTheme, userTier, onUpgrade }) {
  const core = Object.values(allThemes).filter(t => !t.experimental)
    .sort((a, b) => (a.type === 'light' ? 0 : 1) - (b.type === 'light' ? 0 : 1));
  const experimental = Object.values(allThemes).filter(t => t.experimental)
    .sort((a, b) => (a.type === 'light' ? 0 : 1) - (b.type === 'light' ? 0 : 1));
  const canSavePremium = userTier === 'premium' || userTier === 'admin';

  // Auto-save on click. Free users previewing premium themes get the live
  // theme applied to the DOM but the selection isn't persisted.
  const handleSelect = (id) => {
    const isExperimental = !!allThemes[id]?.experimental;
    if (isExperimental && !canSavePremium) {
      setTheme(id); // preview only, auto-reverts on unmount
    } else {
      saveTheme(id); // persist immediately
    }
  };

  // When a free user leaves Settings while previewing a premium theme, revert.
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
      {/* Core themes — always 3-col */}
      <div className="grid grid-cols-3 gap-2">
        {core.map(t => (
          <ThemeTile
            key={t.id}
            theme={t}
            isActive={themeId === t.id}
            isLocked={false}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* Premium themes accordion */}
      {experimental.length > 0 && (
        <details className="mt-4 group">
          <summary className="flex items-center gap-1.5 text-ui-base text-salve-lav font-montserrat cursor-pointer select-none list-none px-1 py-1.5 hover:text-salve-text transition-colors">
            <Sparkles size={12} className="text-salve-lav" aria-hidden="true" />
            <span>Premium themes</span>
            <ChevronDown size={14} className="text-salve-lav ml-auto group-open:rotate-180 transition-transform" aria-hidden="true" />
          </summary>
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            {experimental.map(t => (
              <ThemeTile
                key={t.id}
                theme={t}
                isActive={themeId === t.id}
                isLocked={!canSavePremium}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </details>
      )}

      {/* Footer for non-premium users — wraps naturally, no em dashes */}
      {!canSavePremium && (
        <p className="mt-3 text-ui-sm text-salve-textFaint font-montserrat leading-relaxed px-1">
          Preview only. Themes reset on reload.
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
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [deleteStage, setDeleteStage] = useState('idle'); // 'idle' | 'confirm' | 'deleting' | 'error'
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteError, setDeleteError] = useState(null);
  const [dedupStatus, setDedupStatus] = useState(null); // null | 'running' | { results }
  const [aiConsent, setAiConsent] = useState(() => hasAIConsent());
  // Effective tier, factors in trial expiry + localStorage dev override
  const userTier = isAdminActive(s) ? 'admin' : isPremiumActive(s) ? 'premium' : 'free';
  const trialDays = trialDaysRemaining(s);
  const isOnTrial = trialDays != null && trialDays > 0;
  const trialExpired = s?.tier === 'premium' && trialDays === 0;
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      await startCheckout(); // redirects, never returns on success
    } catch (err) {
      setCheckoutError(err.message || 'Could not start checkout. Try again.');
      setCheckoutLoading(false);
    }
  };
  const [tierOverride, setTierOverride] = useState(() => {
    try { return localStorage.getItem('salve:tier-override') || ''; } catch { return ''; }
  });
  const applyOverride = (val) => {
    try {
      if (val) localStorage.setItem('salve:tier-override', val);
      else localStorage.removeItem('salve:tier-override');
    } catch { /* ignore */ }
    setTierOverride(val);
    window.location.reload();
  };
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushPermission, setPushPermission] = useState(() => getPermissionState());

  useEffect(() => {
    isSubscribed().then(setPushEnabled);
  }, []);

  const { themeId, committedThemeId, setTheme, saveTheme, revertTheme, hasUnsavedChanges, themes: allThemes } = useTheme();

  // Auto-set AI provider based on tier, premium gets Claude, free gets Gemini
  useEffect(() => {
    const shouldBe = userTier === 'premium' ? 'anthropic' : 'gemini';
    if (getAIProvider() !== shouldBe) setAIProvider(shouldBe);
  }, [userTier]);
  const [dataExpanded, setDataExpanded] = useState(false);
  const [expandedSource, setExpandedSource] = useState(null);
  const toggleSource = (id) => setExpandedSource(prev => prev === id ? null : id);

  const [userEmail, setUserEmail] = useState('');
  const [locationStatus, setLocationStatus] = useState(null); // null | 'detecting' | 'error' | 'success'
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    }).catch(() => {});
  }, []);

  // Source detection + counts
  const hasAppleHealth = (data.vitals || []).some(v => v.source === 'apple_health' || v.source === 'Apple Health')
    || (data.activities || []).some(a => a.source === 'apple_health' || a.source === 'Apple Health');

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

  // Oura state
  const [ouraConnected, setOuraConnected] = useState(() => isOuraConnected());
  const [ouraLoading, setOuraLoading] = useState(false);
  const [ouraError, setOuraError] = useState(null);
  const [ouraSuccess, setOuraSuccess] = useState(null);
  const [ouraSyncing, setOuraSyncing] = useState(false);
  const [ouraBaseline, setOuraBaseline] = useState(() => localStorage.getItem('salve:oura-baseline') || '97.7');

  // Terra state — list of currently-connected providers via Terra aggregator
  const [terraConnections, setTerraConnections] = useState([]);
  const [terraLoading, setTerraLoading] = useState(false);
  const [terraError, setTerraError] = useState(null);
  useEffect(() => {
    if (!TERRA_ENABLED || demoMode) return;
    listTerraConnections().then(setTerraConnections).catch(() => { /* ignore on first load */ });
  }, [demoMode]);
  const handleTerraConnect = async () => {
    setTerraError(null);
    setTerraLoading(true);
    try {
      await startTerraConnect(); // full redirect — never returns on success
    } catch (err) {
      setTerraError(err.message || 'Could not start device connection');
      setTerraLoading(false);
    }
  };
  const handleTerraDisconnect = async (id) => {
    try {
      await disconnectTerraConnection(id);
      setTerraConnections(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setTerraError(err.message || 'Could not disconnect');
    }
  };

  // Dexcom CGM state
  const [dexcomConnected, setDexcomConnected] = useState(() => isDexcomConnected());
  const [dexcomLoading, setDexcomLoading] = useState(false);
  const [dexcomError, setDexcomError] = useState(null);
  const [dexcomSuccess, setDexcomSuccess] = useState(null);
  const [dexcomSyncing, setDexcomSyncing] = useState(false);

  // Withings state
  const [withingsConnected, setWithingsConnected] = useState(() => isWithingsConnected());
  const [withingsLoading, setWithingsLoading] = useState(false);
  const [withingsError, setWithingsError] = useState(null);
  const [withingsSuccess, setWithingsSuccess] = useState(null);
  const [withingsSyncing, setWithingsSyncing] = useState(false);

  // Dexcom OAuth callback
  useEffect(() => {
    const code = window.__dexcomCode;
    if (!code) return;
    delete window.__dexcomCode;
    setDexcomLoading(true);
    exchangeDexcomCode(code)
      .then(() => {
        setDexcomConnected(true);
        setDexcomSuccess('Dexcom CGM connected!');
        setDexcomError(null);
      })
      .catch(e => setDexcomError(e.message))
      .finally(() => setDexcomLoading(false));
  }, []);

  async function connectDexcom() {
    setDexcomLoading(true);
    setDexcomError(null);
    try {
      const url = await getDexcomAuthUrl();
      if (!url) {
        setDexcomError('Dexcom is not configured on this server');
        setDexcomLoading(false);
        return;
      }
      window.location.href = url;
    } catch (e) {
      setDexcomError(e.message);
      setDexcomLoading(false);
    }
  }

  function disconnectDexcom() {
    clearDexcomTokens();
    setDexcomConnected(false);
    setDexcomSuccess(null);
    setDexcomError(null);
  }

  async function handleDexcomSync() {
    setDexcomSyncing(true);
    setDexcomError(null);
    setDexcomSuccess(null);
    try {
      const { added, skipped } = await syncDexcomGlucose(data.vitals || [], addItem, 14);
      setDexcomSuccess(added > 0
        ? `Synced ${added} day${added !== 1 ? 's' : ''} of glucose data${skipped > 0 ? ` (${skipped} already had readings)` : ''}.`
        : 'No new readings to sync.');
      reloadData?.();
    } catch (e) {
      setDexcomError(e.message);
    } finally {
      setDexcomSyncing(false);
    }
  }

  // Withings OAuth callback
  useEffect(() => {
    const code = window.__withingsCode;
    if (!code) return;
    delete window.__withingsCode;
    setWithingsLoading(true);
    exchangeWithingsCode(code)
      .then(() => {
        setWithingsConnected(true);
        setWithingsSuccess('Withings connected!');
        setWithingsError(null);
      })
      .catch(e => setWithingsError(e.message))
      .finally(() => setWithingsLoading(false));
  }, []);

  async function connectWithings() {
    setWithingsLoading(true);
    setWithingsError(null);
    try {
      const url = await getWithingsAuthUrl();
      if (!url) {
        setWithingsError('Withings is not configured on this server');
        setWithingsLoading(false);
        return;
      }
      window.location.href = url;
    } catch (e) {
      setWithingsError(e.message);
      setWithingsLoading(false);
    }
  }

  function disconnectWithings() {
    clearWithingsTokens();
    setWithingsConnected(false);
    setWithingsSuccess(null);
    setWithingsError(null);
  }

  async function handleWithingsSync() {
    setWithingsSyncing(true);
    setWithingsError(null);
    setWithingsSuccess(null);
    try {
      const { added } = await syncWithingsMeasurements(data.vitals || [], addItem, 30);
      setWithingsSuccess(added > 0
        ? `Imported ${added} new measurement${added !== 1 ? 's' : ''}.`
        : 'Already up to date — no new measurements.');
      reloadData?.();
    } catch (e) {
      setWithingsError(e.message);
    } finally {
      setWithingsSyncing(false);
    }
  }

  // Fitbit state
  const [fitbitConnected, setFitbitConnected] = useState(() => isFitbitConnected());
  const [fitbitLoading, setFitbitLoading] = useState(false);
  const [fitbitError, setFitbitError] = useState(null);
  const [fitbitSuccess, setFitbitSuccess] = useState(null);
  const [fitbitSyncing, setFitbitSyncing] = useState(false);

  useEffect(() => {
    const code = window.__fitbitCode;
    if (!code) return;
    delete window.__fitbitCode;
    setFitbitLoading(true);
    exchangeFitbitCode(code)
      .then(() => {
        setFitbitConnected(true);
        setFitbitSuccess('Fitbit connected!');
        setFitbitError(null);
      })
      .catch(e => setFitbitError(e.message))
      .finally(() => setFitbitLoading(false));
  }, []);

  async function connectFitbit() {
    setFitbitLoading(true);
    setFitbitError(null);
    try {
      const url = await getFitbitAuthUrl();
      if (!url) {
        setFitbitError('Fitbit is not configured on this server');
        setFitbitLoading(false);
        return;
      }
      window.location.href = url;
    } catch (e) {
      setFitbitError(e.message);
      setFitbitLoading(false);
    }
  }

  function disconnectFitbit() {
    clearFitbitTokens();
    setFitbitConnected(false);
    setFitbitSuccess(null);
    setFitbitError(null);
  }

  async function handleFitbitSync() {
    setFitbitSyncing(true);
    setFitbitError(null);
    setFitbitSuccess(null);
    try {
      const { added } = await syncFitbitData(data.vitals || [], addItem, 30);
      setFitbitSuccess(added > 0
        ? `Imported ${added} new vital${added !== 1 ? 's' : ''} from Fitbit.`
        : 'Already up to date — no new data.');
      reloadData?.();
    } catch (e) {
      setFitbitError(e.message);
    } finally {
      setFitbitSyncing(false);
    }
  }

  // Whoop state
  const [whoopConnected, setWhoopConnected] = useState(() => isWhoopConnected());
  const [whoopLoading, setWhoopLoading] = useState(false);
  const [whoopError, setWhoopError] = useState(null);
  const [whoopSuccess, setWhoopSuccess] = useState(null);
  const [whoopSyncing, setWhoopSyncing] = useState(false);

  useEffect(() => {
    const code = window.__whoopCode;
    if (!code) return;
    delete window.__whoopCode;
    setWhoopLoading(true);
    exchangeWhoopCode(code)
      .then(() => {
        setWhoopConnected(true);
        setWhoopSuccess('Whoop connected!');
        setWhoopError(null);
      })
      .catch(e => setWhoopError(e.message))
      .finally(() => setWhoopLoading(false));
  }, []);

  async function connectWhoop() {
    setWhoopLoading(true);
    setWhoopError(null);
    try {
      const url = await getWhoopAuthUrl();
      if (!url) {
        setWhoopError('Whoop is not configured on this server');
        setWhoopLoading(false);
        return;
      }
      window.location.href = url;
    } catch (e) {
      setWhoopError(e.message);
      setWhoopLoading(false);
    }
  }

  function disconnectWhoop() {
    clearWhoopTokens();
    setWhoopConnected(false);
    setWhoopSuccess(null);
    setWhoopError(null);
  }

  async function handleWhoopSync() {
    setWhoopSyncing(true);
    setWhoopError(null);
    setWhoopSuccess(null);
    try {
      const { added } = await syncWhoopData(data.vitals || [], addItem, 30);
      setWhoopSuccess(added > 0
        ? `Imported ${added} new vital${added !== 1 ? 's' : ''} from Whoop.`
        : 'Already up to date — no new data.');
      reloadData?.();
    } catch (e) {
      setWhoopError(e.message);
    } finally {
      setWhoopSyncing(false);
    }
  }

  // Handle OAuth callback (code stashed by supabase.js before Supabase init)
  useEffect(() => {
    const code = window.__ouraCode;
    if (code) {
      delete window.__ouraCode;
      setOuraLoading(true);
      exchangeOuraCode(code)
        .then(() => {
          setOuraConnected(true);
          setOuraSuccess('Oura Ring connected successfully!');
          setOuraError(null);
        })
        .catch(e => setOuraError(e.message))
        .finally(() => setOuraLoading(false));
    }
  }, []);

  async function connectOura() {
    setOuraLoading(true);
    setOuraError(null);
    try {
      const url = await getOuraAuthUrl();
      if (!url) {
        setOuraError('Oura integration is not configured. Add OURA_CLIENT_ID and OURA_CLIENT_SECRET to Vercel env vars.');
        return;
      }
      window.location.href = url;
    } catch (e) {
      setOuraError(e.message);
    } finally {
      setOuraLoading(false);
    }
  }

  function disconnectOura() {
    clearOuraTokens();
    setOuraConnected(false);
    setOuraSuccess(null);
  }

  async function handleOuraSync() {
    setOuraSyncing(true);
    setOuraError(null);
    setOuraSuccess(null);
    try {
      const baseline = parseFloat(ouraBaseline) || 97.7;
      const results = await syncAllOuraData(data, addItemSilent, 30, baseline);

      // Build summary
      const parts = [];
      const errors = [];
      for (const [key, val] of Object.entries(results)) {
        if (val.error) { errors.push(`${key}: ${val.error}`); continue; }
        if (val.added > 0) parts.push(`${val.added} ${key}`);
      }

      if (parts.length > 0) {
        setOuraSuccess(`Synced ${parts.join(', ')} from Oura.${errors.length ? '\nFailed: ' + errors.join('; ') : ''}`);
        await reloadData();
      } else {
        setOuraSuccess(`Nothing new to sync.${errors.length ? '\nFailed: ' + errors.join('; ') : ''}`);
      }
    } catch (e) {
      if (e.message.includes('expired') || e.message.includes('reconnect')) {
        setOuraConnected(false);
      }
      setOuraError(e.message);
    } finally {
      setOuraSyncing(false);
    }
  }

  function saveOuraBaseline(v) {
    setOuraBaseline(v);
    localStorage.setItem('salve:oura-baseline', v);
  }

  // Import state
  const [importFile, setImportFile] = useState(null);
  const [importData, setImportData] = useState(null);
  const [importValidation, setImportValidation] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportError, setExportError] = useState(null);
  const [importPassphrase, setImportPassphrase] = useState('');
  const fileInputRef = useRef(null);

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

  function processImportFile(file) {
    if (!file) return;

    setImportResult(null);
    setImportError(null);
    setImportData(null);
    setImportValidation(null);

    if (!file.name.endsWith('.json')) {
      setImportError('Please select a .json file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);

        // Check if file is encrypted
        if (parsed._encrypted) {
          setImportFile(file.name);
          setImportData(parsed);
          setImportValidation({ encrypted: true });
          return;
        }

        const validation = validateImport(parsed);

        if (!validation.valid) {
          setImportError(validation.error);
          return;
        }

        setImportFile(file.name);
        setImportData(parsed);
        setImportValidation(validation);
      } catch {
        setImportError('Could not parse file. Make sure it is valid JSON.');
      }
    };
    reader.readAsText(file);
  }

  function handleFileSelect(e) {
    processImportFile(e.target.files?.[0]);
  }

  async function executeImport() {
    if (!importValidation) return;

    setImporting(true);
    setImportError(null);

    try {
      if (importValidation.mode === 'merge') {
        const stats = await importMerge(importValidation.normalized);
        const addedTotal = Object.values(stats.added).reduce((s, n) => s + n, 0);
        const skippedTotal = Object.values(stats.skipped).reduce((s, n) => s + n, 0);

        const parts = [];
        for (const [key, count] of Object.entries(stats.added)) {
          parts.push(`${count} ${key}`);
        }

        setImportResult(
          addedTotal > 0
            ? `Added ${parts.join(', ')}. Skipped ${skippedTotal} existing records.`
            : `All ${skippedTotal} records already exist. Nothing new to add.`
        );

        await reloadData();
      } else {
        await importRestore(importValidation.normalized);
        setImportResult('Full restore complete. Reloading...');
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      setImportData(null);
      setImportValidation(null);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setImportError('Import failed: ' + e.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    const exported = await exportAll();
    const json = JSON.stringify(exported, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salve-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleEncryptedExport() {
    if (!exportPassphrase || exportPassphrase.length < 6) {
      setExportError('Passphrase must be at least 6 characters.');
      return;
    }
    setExportError(null);
    try {
      const exported = await exportAll();
      const encrypted = await encryptExport(exported, exportPassphrase);
      const blob = new Blob([encrypted], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `salve-backup-encrypted-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportPassphrase('');
    } catch {
      setExportError('Encryption failed.');
    }
  }

  function cancelImport() {
    setImportData(null);
    setImportValidation(null);
    setImportFile(null);
    setImportError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
            <p className="text-[11px] text-salve-textFaint font-montserrat">{demoMode ? 'Demo mode' : (userEmail || 'Loading...')}</p>
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
      </Card>

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
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-montserrat font-medium text-salve-text">Push Notifications</p>
              <p className="text-[11px] text-salve-textFaint font-montserrat mt-0.5">
                {pushPermission === 'denied'
                  ? 'Blocked by your browser, check browser settings to allow'
                  : pushPermission === 'unsupported'
                    ? 'Not supported in this browser'
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
              disabled={pushLoading || (!pushEnabled && (pushPermission === 'denied' || pushPermission === 'unsupported')) || demoMode}
              className={`px-4 py-1.5 rounded-lg border text-xs font-montserrat font-medium transition-colors cursor-pointer ${
                pushEnabled
                  ? 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-rose/30 hover:text-salve-rose'
                  : 'bg-salve-card border-salve-border text-salve-textMid hover:border-salve-lav/30'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {pushLoading ? '...' : pushEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
          {pushEnabled && !demoMode && (
            <button
              onClick={async () => { try { await sendTestPush(); } catch {} }}
              className="text-[11px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer p-0 hover:underline"
            >
              Send test notification
            </button>
          )}
        </Card>

      {/* ══════════════ 3. Sage ══════════════ */}
      <SectionTitle>Sage</SectionTitle>
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-salve-sage" aria-hidden="true" />
          <span className="text-sm text-salve-text font-medium font-montserrat">Your health assistant</span>
        </div>
        <p className="text-[11px] text-salve-textFaint font-montserrat leading-relaxed mb-3">
          Sage helps with health insights, fills out forms, finds relevant news, and can add or update your records through chat.
        </p>

        {aiConsent ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-salve-sage" />
              <span className="text-[11px] text-salve-textMid font-montserrat">Data sharing enabled</span>
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
          <p className="text-[11px] text-salve-textFaint font-montserrat italic">
            AI data sharing will be requested when you first use Sage.
          </p>
        )}
      </Card>

      <div className="flex flex-col items-center gap-1.5 my-1">
        <AIProfilePreview data={data} />
        <button
          onClick={() => onNav('ai')}
          className="text-[10px] text-salve-lav/60 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0"
        >
          Chat with Sage →
        </button>
      </div>

      {/* ══════════════ 4. Premium ══════════════ */}
      <SectionTitle>Premium</SectionTitle>
      <Card>
        <div className="flex items-center gap-2.5 mb-2">
          <Crown size={16} className={userTier === 'admin' ? 'text-salve-amber' : userTier === 'premium' ? 'text-salve-amber' : 'text-salve-textFaint'} />
          <div>
            <span className="text-sm text-salve-text font-medium font-montserrat">
              {userTier === 'admin' ? 'Admin Tier' : userTier === 'premium' ? (isOnTrial ? 'Free Trial' : 'Premium') : 'Free Plan'}
            </span>
            <span className={`text-[10px] ml-2 px-1.5 py-0.5 rounded-full font-medium ${userTier === 'admin' ? 'bg-salve-amber/15 text-salve-amber' : userTier === 'premium' ? 'bg-salve-amber/15 text-salve-amber' : 'bg-salve-card2 text-salve-textFaint'}`}>
              {userTier === 'admin' ? 'Active' : userTier === 'premium' ? (isOnTrial ? `${trialDays} day${trialDays === 1 ? '' : 's'} left` : 'Active') : 'Current'}
            </span>
          </div>
        </div>
        {userTier === 'admin' && (
          <p className="text-[11px] text-salve-textMid font-montserrat leading-relaxed mt-1.5">
            All features unlocked. House Consultation uses both Claude and Gemini simultaneously for dual-AI differential analysis.
          </p>
        )}
        {isOnTrial && (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-salve-textMid font-montserrat leading-relaxed">
              You're on a free Premium trial with full access to every feature. No payment needed.
            </p>
            {BILLING_ENABLED && (
              <>
                <button
                  onClick={handleUpgrade}
                  disabled={checkoutLoading}
                  className="w-full py-2 rounded-xl text-[12px] font-medium font-montserrat bg-salve-lav/15 border border-salve-lav/30 text-salve-lav hover:bg-salve-lav/25 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {checkoutLoading ? 'Opening checkout…' : 'Upgrade to keep access after trial →'}
                </button>
                {checkoutError && <p className="text-[11px] text-salve-rose font-montserrat">{checkoutError}</p>}
              </>
            )}
          </div>
        )}
        {trialExpired && (
          <div className="space-y-2 mt-2">
            <p className="text-[11px] text-salve-rose font-montserrat leading-relaxed">
              Your trial ended. You're now on the free plan.
            </p>
            {BILLING_ENABLED ? (
              <>
                <p className="text-[11px] text-salve-textMid font-montserrat leading-relaxed">
                  Upgrading keeps advanced insights, experimental themes, and unlimited access.
                </p>
                <button
                  onClick={handleUpgrade}
                  disabled={checkoutLoading}
                  className="w-full py-2 rounded-xl text-[12px] font-medium font-montserrat bg-salve-lav text-white hover:bg-salve-lav/80 transition-colors disabled:opacity-60 cursor-pointer border-0"
                >
                  {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Premium →'}
                </button>
                {checkoutError && <p className="text-[11px] text-salve-rose font-montserrat">{checkoutError}</p>}
              </>
            ) : (
              <p className="text-[11px] text-salve-textMid font-montserrat leading-relaxed">
                Premium upgrades aren't open yet. We'll let you know when they are.
              </p>
            )}
          </div>
        )}
        {userTier === 'free' && !trialExpired && (
          <div className="mt-2 space-y-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-montserrat">
              <div className="text-salve-textFaint font-medium col-span-2 border-b border-salve-border/50 pb-1 mb-0.5">Free vs Premium</div>
              <span className="text-salve-textMid">Sage AI assistant</span>
              <span className="text-salve-sage text-right">✓ Included</span>
              <span className="text-salve-textMid">Smarter AI models</span>
              <span className="text-salve-lav text-right">Premium</span>
              <span className="text-salve-textMid">Connections & patterns</span>
              <span className="text-salve-lav text-right">Premium</span>
              <span className="text-salve-textMid">Care gaps & cost savings</span>
              <span className="text-salve-lav text-right">Premium</span>
              <span className="text-salve-textMid">Experimental themes</span>
              <span className="text-salve-lav text-right">Premium</span>
              <span className="text-salve-textMid">Daily AI limit</span>
              <span className="text-salve-textFaint text-right">10 / day → Unlimited</span>
            </div>
            {BILLING_ENABLED ? (
              <>
                <button
                  onClick={handleUpgrade}
                  disabled={checkoutLoading}
                  className="w-full py-2 rounded-xl text-[12px] font-medium font-montserrat bg-salve-lav text-white hover:bg-salve-lav/80 transition-colors disabled:opacity-60 cursor-pointer border-0"
                >
                  {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Premium →'}
                </button>
                {checkoutError && <p className="text-[11px] text-salve-rose font-montserrat">{checkoutError}</p>}
              </>
            ) : (
              <p className="text-[11px] text-salve-textFaint font-montserrat italic leading-relaxed">
                Premium upgrades aren't open yet. We'll let you know when they are.
              </p>
            )}
          </div>
        )}
        {userTier === 'premium' && !isOnTrial && BILLING_ENABLED && (
          <button
            onClick={openCustomerPortal}
            className="mt-2 text-[11px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-textMid transition-colors p-0"
          >
            Manage subscription →
          </button>
        )}
        {/* Dev-mode tier override, lets you preview the free/expired state without waiting */}
        {import.meta.env.DEV && (
          <div className="mt-3 pt-3 border-t border-salve-border">
            <p className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-1.5">Dev: tier override</p>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => applyOverride('')}
                className={`text-[10px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === '' ? 'border-salve-lav/50 bg-salve-lav/10 text-salve-lav' : 'border-salve-border text-salve-textFaint'}`}
              >
                Actual ({s?.tier === 'premium' && isOnTrial ? 'trial' : s?.tier || 'free'})
              </button>
              <button
                onClick={() => applyOverride('free')}
                className={`text-[10px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === 'free' ? 'border-salve-rose/50 bg-salve-rose/10 text-salve-rose' : 'border-salve-border text-salve-textFaint'}`}
              >
                Force free
              </button>
              <button
                onClick={() => applyOverride('premium')}
                className={`text-[10px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === 'premium' ? 'border-salve-lav/50 bg-salve-lav/10 text-salve-lav' : 'border-salve-border text-salve-textFaint'}`}
              >
                Force premium
              </button>
              <button
                onClick={() => applyOverride('admin')}
                className={`text-[10px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === 'admin' ? 'border-salve-amber/50 bg-salve-amber/10 text-salve-amber' : 'border-salve-border text-salve-textFaint'}`}
              >
                Force admin
              </button>
            </div>
          </div>
        )}
      </Card>

      </div>
      {/* ── Right Column ── */}
      <div>
      {/* ══════════════ 5. Profile ══════════════ */}
      <SectionTitle>Profile</SectionTitle>
      <Card>
        <Field label="Your Name" value={s.name || ''} onChange={v => set('name', v)} placeholder="How should we greet you?" />
      </Card>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 mb-1">
        <button onClick={() => onNav('aboutme')} className="text-[11px] text-salve-lav/70 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0">About you →</button>
        <button onClick={() => onNav('pharmacies')} className="text-[11px] text-salve-lav/70 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0">Pharmacies →</button>
        <button onClick={() => onNav('insurance')} className="text-[11px] text-salve-lav/70 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0">Insurance →</button>
      </div>

      {/* ══════════════ 6. Connected Sources ══════════════ */}
      <SectionTitle>Connected Sources</SectionTitle>

      <div className="space-y-2 mb-4">
        {/* ── Claude Health Sync (always first) ── */}
        <Card>
          <button onClick={() => toggleSource('claude')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-lav/15">
                <Sparkles size={16} className="text-salve-lav" />
              </div>
              <div className="text-left">
                <span className="text-[13px] text-salve-text font-medium block">Claude Health Sync</span>
                <span className="text-[10px] text-salve-textFaint">Pull records from MCP providers</span>
              </div>
            </div>
            {expandedSource === 'claude' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
          </button>
          {expandedSource === 'claude' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50 space-y-4">
              {/* ── Recommended: Claude Project (one-time setup) ── */}
              <div className="bg-salve-lav/5 border border-salve-lav/20 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-salve-lav font-montserrat">Highly recommended · saves tokens</span>
                </div>
                <h4 className="text-[13px] text-salve-text font-medium font-montserrat mb-1">Create a Claude Project</h4>
                <p className="text-[11px] text-salve-textFaint leading-relaxed mb-3">
                  The sync file is large and uses significant tokens every time you attach it. A project stores it once, so future syncs are just "sync my records" with no re-uploading.
                </p>

                <ol className="text-[11px] text-salve-textMid space-y-2.5 leading-relaxed list-decimal pl-5 mb-3">
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
                    In the project's <strong className="text-salve-text">Files</strong> section (also called Project knowledge), upload <code className="text-salve-textMid text-[10px]">salve-sync.jsx</code>.
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

                <p className="text-[10px] text-salve-textFaint italic leading-relaxed">
                  After setup, future syncs only need step 4 + step 5.
                </p>
              </div>

              {/* ── MCP connectors ── */}
              <div className="bg-salve-card2 border border-salve-border rounded-xl p-3">
                <h4 className="text-[11px] text-salve-text font-semibold uppercase tracking-wider font-montserrat mb-2">MCP connectors</h4>
                <p className="text-[10px] text-salve-textFaint leading-relaxed mb-2">
                  The sync artifact pulls records through MCP connectors like <strong className="text-salve-textMid">Healthex</strong> (patient portals) and <strong className="text-salve-textMid">Function Health</strong> (lab panels). Claude will detect which connectors you have and walk you through setting up any that are missing.
                </p>
                <p className="text-[10px] text-salve-textFaint italic leading-relaxed">
                  Just start the artifact and follow the prompts. No manual URL configuration needed.
                </p>
              </div>

              {/* ── Fallback: one-off chat ── */}
              <details className="group">
                <summary className="cursor-pointer text-[11px] text-salve-textMid font-montserrat hover:text-salve-text flex items-center gap-1.5">
                  <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                  One-off sync (uses more tokens each time)
                </summary>
                <div className="mt-3 pl-4 space-y-4 border-l-2 border-salve-border/40">
                  <p className="text-[11px] text-salve-textFaint leading-relaxed">
                    Open a new chat on Claude.ai and follow these steps in order.
                  </p>

                  {/* Step 1, Prep prompt */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-salve-lav/20 text-salve-lav text-[10px] font-semibold flex items-center justify-center font-montserrat">1</span>
                      <span className="text-[12px] text-salve-text font-medium font-montserrat">Send the prep prompt</span>
                    </div>
                    <p className="text-[10px] text-salve-textFaint leading-relaxed mb-2 pl-7">
                      Primes Claude so it knows what to do when the file arrives.
                    </p>
                    <div className="pl-7">
                      <CopyButton text={PREP_PROMPT} label="Copy prep prompt" copiedLabel="Prep prompt copied!" />
                    </div>
                  </div>

                  {/* Step 2, Attach file */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-salve-lav/20 text-salve-lav text-[10px] font-semibold flex items-center justify-center font-montserrat">2</span>
                      <span className="text-[12px] text-salve-text font-medium font-montserrat">Attach the file</span>
                    </div>
                    <p className="text-[10px] text-salve-textFaint leading-relaxed mb-2 pl-7">
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
                      <span className="w-5 h-5 rounded-full bg-salve-lav/20 text-salve-lav text-[10px] font-semibold flex items-center justify-center font-montserrat">3</span>
                      <span className="text-[12px] text-salve-text font-medium font-montserrat">Import the JSON back here</span>
                    </div>
                    <p className="text-[10px] text-salve-textFaint leading-relaxed pl-7">
                      Pull records in the artifact, download the JSON, and import via Data Management → Import above.
                    </p>
                  </div>
                </div>
              </details>
            </div>
          )}
        </Card>

        {/* ── Oura Ring ── */}
        <Card>
          <button onClick={() => toggleSource('oura')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ouraConnected ? 'bg-salve-sage/15' : 'bg-salve-card2'}`}>
                <OuraIcon size={16} className={ouraConnected ? 'text-salve-sage' : 'text-salve-textFaint'} />
              </div>
              <div className="text-left">
                <span className="text-[13px] text-salve-text font-medium block">Oura Ring</span>
                <span className="text-[10px] text-salve-textFaint">
                  {ouraConnected
                    ? `Connected${sourceCounts.oura > 0 ? ` · ${sourceCounts.oura} records` : ''}`
                    : 'Sleep, readiness, temperature, workouts'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {ouraConnected && (
                <span className="w-2 h-2 rounded-full bg-salve-sage" />
              )}
              {expandedSource === 'oura' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
            </div>
          </button>
          {expandedSource === 'oura' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50">
              {ouraConnected ? (
                <>
                  <div className="flex justify-end mb-2">
                    <button onClick={() => onNav('oura')} className="text-[10px] text-salve-sage font-montserrat bg-transparent border-none cursor-pointer hover:underline">View Oura data →</button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleOuraSync}
                      disabled={ouraSyncing}
                      className="flex-1 py-2 rounded-lg bg-salve-sage/15 border border-salve-sage/30 text-salve-sage text-xs font-medium font-montserrat
                        flex items-center justify-center gap-1.5 hover:bg-salve-sage/25 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {ouraSyncing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {ouraSyncing ? 'Syncing...' : 'Sync All Data'}
                    </button>
                    <button
                      onClick={disconnectOura}
                      className="py-2 px-3 rounded-lg border border-salve-border text-salve-textFaint text-xs font-montserrat
                        flex items-center gap-1.5 hover:border-salve-rose/40 hover:text-salve-rose transition-colors cursor-pointer"
                    >
                      <Unlink size={12} /> Disconnect
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13px] text-salve-textMid leading-relaxed mb-3">
                    Connect your Oura Ring to import sleep, readiness, heart rate, temperature, and workout data.
                  </p>
                  <button
                    onClick={connectOura}
                    disabled={ouraLoading}
                    className="w-full py-2.5 rounded-xl bg-salve-card2 border border-salve-border text-salve-lav font-medium text-sm font-montserrat
                      hover:bg-salve-border transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {ouraLoading ? <Loader size={16} className="animate-spin" /> : <OuraIcon size={16} />}
                    {ouraLoading ? 'Connecting...' : 'Connect Oura Ring'}
                  </button>
                </>
              )}
              {ouraError && (
                <div className="mt-2.5 p-2.5 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-xs">{ouraError}</div>
              )}
              {ouraSuccess && (
                <div className="mt-2.5 p-2.5 rounded-lg bg-salve-sage/10 border border-salve-sage/30 text-salve-sage text-xs whitespace-pre-line">{ouraSuccess}</div>
              )}
            </div>
          )}
        </Card>

        {/* ── Dexcom CGM ── */}
        {DEXCOM_ENABLED && (
          <Card>
            <button onClick={() => toggleSource('dexcom')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${dexcomConnected ? 'bg-salve-rose/15' : 'bg-salve-card2'}`}>
                  <Heart size={14} className={dexcomConnected ? 'text-salve-rose' : 'text-salve-textFaint'} />
                </div>
                <div className="text-left">
                  <span className="text-ui-lg text-salve-text font-medium block">Dexcom CGM</span>
                  <span className="text-ui-xs text-salve-textFaint">
                    {dexcomConnected ? 'Connected · daily glucose averages' : 'Continuous glucose monitoring'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {dexcomConnected && <span className="w-2 h-2 rounded-full bg-salve-rose" />}
                {expandedSource === 'dexcom' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
              </div>
            </button>
            {expandedSource === 'dexcom' && (
              <div className="mt-3 pt-3 border-t border-salve-border/50">
                {dexcomConnected ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleDexcomSync}
                      disabled={dexcomSyncing || demoMode}
                      className="flex-1 py-2 rounded-lg bg-salve-rose/15 border border-salve-rose/30 text-salve-rose text-xs font-medium font-montserrat flex items-center justify-center gap-1.5 hover:bg-salve-rose/25 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {dexcomSyncing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {dexcomSyncing ? 'Syncing…' : 'Sync last 14 days'}
                    </button>
                    <button
                      onClick={disconnectDexcom}
                      className="py-2 px-3 rounded-lg border border-salve-border text-salve-textFaint text-xs font-montserrat flex items-center gap-1.5 hover:border-salve-rose/40 hover:text-salve-rose transition-colors cursor-pointer"
                    >
                      <Unlink size={12} /> Disconnect
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-ui-base text-salve-textMid leading-relaxed mb-3">
                      Connect your Dexcom CGM to import glucose readings. Sage uses these to spot correlations between blood sugar and your symptoms — especially helpful for dysautonomia, POTS, and reactive hypoglycemia.
                    </p>
                    <button
                      onClick={connectDexcom}
                      disabled={dexcomLoading || demoMode}
                      className="w-full py-2.5 rounded-xl bg-salve-card2 border border-salve-border text-salve-rose font-medium text-sm font-montserrat hover:bg-salve-border transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {dexcomLoading ? <Loader size={16} className="animate-spin" /> : <Heart size={16} />}
                      {dexcomLoading ? 'Connecting…' : 'Connect Dexcom CGM'}
                    </button>
                  </>
                )}
                {dexcomError && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-xs">{dexcomError}</div>
                )}
                {dexcomSuccess && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-salve-sage/10 border border-salve-sage/30 text-salve-sage text-xs">{dexcomSuccess}</div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ── Withings ── */}
        {WITHINGS_ENABLED && (
          <Card>
            <button onClick={() => toggleSource('withings')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${withingsConnected ? 'bg-salve-lav/15' : 'bg-salve-card2'}`}>
                  <Heart size={14} className={withingsConnected ? 'text-salve-lav' : 'text-salve-textFaint'} />
                </div>
                <div className="text-left">
                  <span className="text-ui-lg text-salve-text font-medium block">Withings</span>
                  <span className="text-ui-xs text-salve-textFaint">
                    {withingsConnected ? 'Connected · scale, BP, sleep, temp' : 'Smart scale, BP cuff, sleep mat, thermometer'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {withingsConnected && <span className="w-2 h-2 rounded-full bg-salve-lav" />}
                {expandedSource === 'withings' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
              </div>
            </button>
            {expandedSource === 'withings' && (
              <div className="mt-3 pt-3 border-t border-salve-border/50">
                {withingsConnected ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleWithingsSync}
                      disabled={withingsSyncing || demoMode}
                      className="flex-1 py-2 rounded-lg bg-salve-lav/15 border border-salve-lav/30 text-salve-lav text-xs font-medium font-montserrat flex items-center justify-center gap-1.5 hover:bg-salve-lav/25 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {withingsSyncing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {withingsSyncing ? 'Syncing…' : 'Sync last 30 days'}
                    </button>
                    <button
                      onClick={disconnectWithings}
                      className="py-2 px-3 rounded-lg border border-salve-border text-salve-textFaint text-xs font-montserrat flex items-center gap-1.5 hover:border-salve-rose/40 hover:text-salve-rose transition-colors cursor-pointer"
                    >
                      <Unlink size={12} /> Disconnect
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-ui-base text-salve-textMid leading-relaxed mb-3">
                      Connect your Withings devices to auto-import weight, blood pressure, heart rate, body temperature, and SpO2. Great for POTS, hypertension, and chronic illness tracking.
                    </p>
                    <button
                      onClick={connectWithings}
                      disabled={withingsLoading || demoMode}
                      className="w-full py-2.5 rounded-xl bg-salve-card2 border border-salve-border text-salve-lav font-medium text-sm font-montserrat hover:bg-salve-border transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {withingsLoading ? <Loader size={16} className="animate-spin" /> : <Heart size={16} />}
                      {withingsLoading ? 'Connecting…' : 'Connect Withings'}
                    </button>
                  </>
                )}
                {withingsError && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-xs">{withingsError}</div>
                )}
                {withingsSuccess && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-salve-sage/10 border border-salve-sage/30 text-salve-sage text-xs">{withingsSuccess}</div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ── Fitbit ── */}
        {FITBIT_ENABLED && (
          <Card>
            <button onClick={() => toggleSource('fitbit')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${fitbitConnected ? 'bg-salve-sage/15' : 'bg-salve-card2'}`}>
                  <Heart size={14} className={fitbitConnected ? 'text-salve-sage' : 'text-salve-textFaint'} />
                </div>
                <div className="text-left">
                  <span className="text-ui-lg text-salve-text font-medium block">Fitbit</span>
                  <span className="text-ui-xs text-salve-textFaint">
                    {fitbitConnected ? 'Connected · sleep, HR, steps, weight' : 'Sleep, resting HR, steps, weight'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {fitbitConnected && <span className="w-2 h-2 rounded-full bg-salve-sage" />}
                {expandedSource === 'fitbit' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
              </div>
            </button>
            {expandedSource === 'fitbit' && (
              <div className="mt-3 pt-3 border-t border-salve-border/50">
                {fitbitConnected ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleFitbitSync}
                      disabled={fitbitSyncing || demoMode}
                      className="flex-1 py-2 rounded-lg bg-salve-sage/15 border border-salve-sage/30 text-salve-sage text-xs font-medium font-montserrat flex items-center justify-center gap-1.5 hover:bg-salve-sage/25 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {fitbitSyncing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {fitbitSyncing ? 'Syncing…' : 'Sync last 30 days'}
                    </button>
                    <button
                      onClick={disconnectFitbit}
                      className="py-2 px-3 rounded-lg border border-salve-border text-salve-textFaint text-xs font-montserrat flex items-center gap-1.5 hover:border-salve-rose/40 hover:text-salve-rose transition-colors cursor-pointer"
                    >
                      <Unlink size={12} /> Disconnect
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-ui-base text-salve-textMid leading-relaxed mb-3">
                      Connect your Fitbit to import sleep duration, resting heart rate, daily steps, and weight. Works with any Fitbit tracker or watch.
                    </p>
                    <button
                      onClick={connectFitbit}
                      disabled={fitbitLoading || demoMode}
                      className="w-full py-2.5 rounded-xl bg-salve-card2 border border-salve-border text-salve-sage font-medium text-sm font-montserrat hover:bg-salve-border transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {fitbitLoading ? <Loader size={16} className="animate-spin" /> : <Heart size={16} />}
                      {fitbitLoading ? 'Connecting…' : 'Connect Fitbit'}
                    </button>
                  </>
                )}
                {fitbitError && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-xs">{fitbitError}</div>
                )}
                {fitbitSuccess && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-salve-sage/10 border border-salve-sage/30 text-salve-sage text-xs">{fitbitSuccess}</div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ── Whoop ── */}
        {WHOOP_ENABLED && (
          <Card>
            <button onClick={() => toggleSource('whoop')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${whoopConnected ? 'bg-salve-amber/15' : 'bg-salve-card2'}`}>
                  <Heart size={14} className={whoopConnected ? 'text-salve-amber' : 'text-salve-textFaint'} />
                </div>
                <div className="text-left">
                  <span className="text-ui-lg text-salve-text font-medium block">Whoop</span>
                  <span className="text-ui-xs text-salve-textFaint">
                    {whoopConnected ? 'Connected · recovery, HRV, sleep' : 'Recovery score, HRV, resting HR, sleep'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {whoopConnected && <span className="w-2 h-2 rounded-full bg-salve-amber" />}
                {expandedSource === 'whoop' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
              </div>
            </button>
            {expandedSource === 'whoop' && (
              <div className="mt-3 pt-3 border-t border-salve-border/50">
                {whoopConnected ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleWhoopSync}
                      disabled={whoopSyncing || demoMode}
                      className="flex-1 py-2 rounded-lg bg-salve-amber/15 border border-salve-amber/30 text-salve-amber text-xs font-medium font-montserrat flex items-center justify-center gap-1.5 hover:bg-salve-amber/25 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {whoopSyncing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {whoopSyncing ? 'Syncing…' : 'Sync last 30 days'}
                    </button>
                    <button
                      onClick={disconnectWhoop}
                      className="py-2 px-3 rounded-lg border border-salve-border text-salve-textFaint text-xs font-montserrat flex items-center gap-1.5 hover:border-salve-rose/40 hover:text-salve-rose transition-colors cursor-pointer"
                    >
                      <Unlink size={12} /> Disconnect
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-ui-base text-salve-textMid leading-relaxed mb-3">
                      Connect your Whoop to import recovery score, HRV (RMSSD ms), resting heart rate, and sleep. Especially valuable for dysautonomia and POTS — HRV is the key marker for autonomic nervous system function.
                    </p>
                    <button
                      onClick={connectWhoop}
                      disabled={whoopLoading || demoMode}
                      className="w-full py-2.5 rounded-xl bg-salve-card2 border border-salve-border text-salve-amber font-medium text-sm font-montserrat hover:bg-salve-border transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {whoopLoading ? <Loader size={16} className="animate-spin" /> : <Heart size={16} />}
                      {whoopLoading ? 'Connecting…' : 'Connect Whoop'}
                    </button>
                  </>
                )}
                {whoopError && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-xs">{whoopError}</div>
                )}
                {whoopSuccess && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-salve-sage/10 border border-salve-sage/30 text-salve-sage text-xs">{whoopSuccess}</div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ── Apple Health ── */}
        <Card>
          <button onClick={() => toggleSource('apple')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasAppleHealth ? 'bg-salve-lav/15' : 'bg-salve-card2'}`}>
                <Apple size={16} className={hasAppleHealth ? 'text-salve-lav' : 'text-salve-textFaint'} />
              </div>
              <div className="text-left">
                <span className="text-[13px] text-salve-text font-medium block">Apple Health</span>
                <span className="text-[10px] text-salve-textFaint">
                  {hasAppleHealth ? `${sourceCounts.apple_health} records imported` : 'Vitals, workouts, labs from iPhone'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {hasAppleHealth && <span className="w-2 h-2 rounded-full bg-salve-lav" />}
              {expandedSource === 'apple' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
            </div>
          </button>
          {expandedSource === 'apple' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50">
              {hasAppleHealth && (
                <div className="flex justify-end mb-2">
                  <button onClick={() => onNav('apple_health')} className="text-[10px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer hover:underline">View Apple Health data →</button>
                </div>
              )}
              <AppleHealthImport data={data} reloadData={reloadData} />
            </div>
          )}
        </Card>

        {/* ── Terra (Fitbit, Garmin, Withings, Dexcom, etc.) ── */}
        {TERRA_ENABLED && (
          <Card>
            <button onClick={() => toggleSource('terra')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-sage/15">
                  <Heart size={14} className="text-salve-sage" />
                </div>
                <div className="text-left">
                  <span className="text-ui-lg text-salve-text font-medium block">Connect a device</span>
                  <span className="text-ui-xs text-salve-textFaint">Fitbit, Garmin, Withings, Dexcom CGM, Whoop, Polar, and more</span>
                </div>
              </div>
              {expandedSource === 'terra' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
            </button>
            {expandedSource === 'terra' && (
              <div className="mt-3 pt-3 border-t border-salve-border/50 space-y-3">
                {terraConnections.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-ui-xs text-salve-textFaint font-montserrat uppercase tracking-wider">Connected</div>
                    {terraConnections.map(conn => (
                      <div key={conn.id} className="flex items-center justify-between bg-salve-card2 border border-salve-border rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full ${conn.status === 'connected' ? 'bg-salve-sage' : 'bg-salve-textFaint'} flex-shrink-0`} />
                          <div className="min-w-0">
                            <div className="text-ui-base text-salve-text font-medium truncate">{providerLabel(conn.provider)}</div>
                            <div className="text-ui-xs text-salve-textFaint">
                              {conn.last_sync_at
                                ? `Last sync: ${new Date(conn.last_sync_at).toLocaleDateString()}`
                                : conn.status === 'connected' ? 'Waiting for first sync…' : 'Disconnected'}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleTerraDisconnect(conn.id)}
                          aria-label={`Disconnect ${providerLabel(conn.provider)}`}
                          className="text-ui-xs text-salve-rose bg-transparent border-none cursor-pointer hover:underline font-montserrat flex-shrink-0 ml-2"
                        >
                          Disconnect
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-ui-sm text-salve-textMid font-montserrat leading-relaxed">
                  Connect a wearable, CGM, scale, or BP cuff. Salve uses Terra to handle the OAuth and pulls fresh data automatically as your device records it. Steps, sleep, weight, glucose, blood pressure, and workouts all flow into your Vitals and Activities sections.
                </p>
                {terraError && (
                  <p className="text-ui-sm text-salve-rose font-montserrat">{terraError}</p>
                )}
                <button
                  onClick={handleTerraConnect}
                  disabled={terraLoading || demoMode}
                  className="w-full py-2.5 rounded-lg text-ui-base font-medium font-montserrat bg-salve-sage/15 border border-salve-sage/30 text-salve-sage hover:bg-salve-sage/25 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {terraLoading ? 'Opening picker…' : terraConnections.length > 0 ? '+ Connect another device' : 'Connect a device →'}
                </button>
                {demoMode && (
                  <p className="text-ui-xs text-salve-textFaint italic font-montserrat text-center">
                    Demo mode — sign up to connect your own devices.
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ── Flo ── */}
        <Card>
          <button onClick={() => toggleSource('flo')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-rose/15">
                <Heart size={16} className="text-salve-rose" />
              </div>
              <div className="text-left">
                <span className="text-[13px] text-salve-text font-medium block">Flo</span>
                <span className="text-[10px] text-salve-textFaint">Import cycle data from Flo GDPR export</span>
              </div>
            </div>
            {expandedSource === 'flo' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
          </button>
          {expandedSource === 'flo' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50">
              <p className="text-[11px] text-salve-textMid font-montserrat leading-relaxed mb-2">
                Import your cycle history from Flo. Go to Flo → Profile → Settings → Request My Data, then upload the JSON file in the Cycle Tracker section.
              </p>
              <button
                onClick={() => onNav('cycles')}
                className="text-xs text-salve-rose font-montserrat bg-transparent border border-salve-rose/30 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-salve-rose/10 transition-colors"
              >
                Go to Cycle Tracker →
              </button>
            </div>
          )}
        </Card>
      </div>

      {/* ══════════════ 7. Data & Privacy ══════════════ */}
      <SectionTitle
        action={
          <button
            onClick={() => setDataExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-salve-textMid hover:text-salve-lav transition-colors bg-transparent border-none cursor-pointer font-montserrat"
            aria-expanded={dataExpanded}
            aria-label={dataExpanded ? 'Collapse data management' : 'Expand data management'}
          >
            {dataExpanded ? 'Collapse' : 'Expand'}
            {dataExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        }
      >
        Data & Privacy
      </SectionTitle>

      {!dataExpanded && (
        <Card>
          <button
            onClick={() => setDataExpanded(true)}
            className="w-full text-left bg-transparent border-none cursor-pointer p-0 font-montserrat"
          >
            <p className="text-[13px] text-salve-textMid leading-relaxed">
              Backup, restore, import, and erase your data.
            </p>
            <p className="text-[11px] text-salve-textFaint mt-1 flex items-center gap-1">
              Tap to expand <ChevronDown size={12} />
            </p>
          </button>
        </Card>
      )}

      {dataExpanded && (
        <Card>
          {/* ── Download Backup ── */}
          <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-3 block">Download Backup</span>
          <p className="text-[13px] text-salve-textMid mb-3 leading-relaxed">
            Save all your health data as a JSON file. Use this to restore later or transfer to another device.
          </p>
          <button
            onClick={handleExport}
            className="w-full py-3 rounded-xl bg-salve-card2 border border-salve-border text-salve-lav font-medium text-sm
              hover:bg-salve-border transition-colors flex items-center justify-center gap-2"
          >
            <Download size={16} />
            Download Backup
          </button>

          <div className="mt-3.5 pt-3.5 border-t border-salve-border/50">
            <p className="text-[13px] text-salve-textMid mb-2.5 leading-relaxed">
              Or download an encrypted backup protected with a passphrase.
            </p>
            <input
              type="password"
              value={exportPassphrase}
              onChange={e => { setExportPassphrase(e.target.value); setExportError(null); }}
              placeholder="Set a passphrase (min 6 chars)"
              className="w-full bg-salve-bg border border-salve-border rounded-lg px-3 py-2 text-sm text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint mb-2.5"
            />
            {exportError && <p className="text-xs text-salve-rose mb-2">{exportError}</p>}
            <button
              onClick={handleEncryptedExport}
              disabled={!exportPassphrase}
              className="w-full py-3 rounded-xl bg-salve-card2 border border-salve-border text-salve-sage font-medium text-sm
                hover:bg-salve-border transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Shield size={16} />
              Download Encrypted Backup
            </button>
          </div>

          {/* ── Import Data ── */}
          <div className="mt-5 pt-5 border-t border-salve-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-3 block">Import Data</span>
            <p className="text-[13px] text-salve-textMid mb-3 leading-relaxed">
              Upload a backup file or a health sync file.
            </p>

            <DropZone
              onFile={processImportFile}
              accept=".json"
              label="Drop backup file here"
              hint="Or click to browse, accepts .json backups"
              className="mb-3"
            />

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="block w-full text-sm text-salve-textMid md:hidden
                file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:text-sm file:font-medium file:bg-salve-card2 file:text-salve-lav
                file:cursor-pointer hover:file:bg-salve-border cursor-pointer"
            />

            {importError && (
              <div className="mt-3 p-3 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-sm">
                {importError}
              </div>
            )}

            {importValidation && importValidation.encrypted && (
              <div className="mt-4 p-4 rounded-xl bg-salve-card2 border border-salve-border">
                <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-2 block">Encrypted Backup</span>
                <p className="text-[13px] text-salve-textMid mb-3">Enter the passphrase to decrypt this backup file.</p>
                <input
                  type="password"
                  value={importPassphrase}
                  onChange={e => setImportPassphrase(e.target.value)}
                  placeholder="Passphrase"
                  className="w-full bg-salve-bg border border-salve-border rounded-lg px-3 py-2 text-sm text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint mb-3"
                />
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      if (!importPassphrase) { setImportError('Passphrase is required.'); return; }
                      setImportError(null);
                      try {
                        const decrypted = await decryptExport(importData, importPassphrase);
                        const validation = validateImport(decrypted);
                        if (!validation.valid) { setImportError(validation.error); return; }
                        setImportData(decrypted);
                        setImportValidation(validation);
                        setImportPassphrase('');
                      } catch {
                        setImportError('Incorrect passphrase or corrupted file.');
                      }
                    }}
                    className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-salve-lav/20 text-salve-lav hover:bg-salve-lav/30 transition-colors"
                  >
                    Decrypt
                  </button>
                  <button onClick={cancelImport} className="px-4 py-2.5 rounded-lg border border-salve-border text-salve-textMid text-sm hover:bg-salve-card2 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {importValidation && !importValidation.encrypted && (
              <div className="mt-4 p-4 rounded-xl bg-salve-card2 border border-salve-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint">
                    {importValidation.mode === 'merge' ? 'Sync Preview' : 'Restore Preview'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-md ${
                    importValidation.mode === 'merge'
                      ? 'bg-salve-sage/20 text-salve-sage'
                      : 'bg-salve-amber/20 text-salve-amber'
                  }`}>
                    {importValidation.mode === 'merge' ? 'Add new only' : 'Full overwrite'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {Object.entries(importValidation.preview).map(([key, count]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-salve-textMid capitalize">{key}</span>
                      <span className="text-salve-text">{count}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={executeImport}
                    disabled={importing}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                      importValidation.mode === 'merge'
                        ? 'bg-salve-sage/20 text-salve-sage hover:bg-salve-sage/30'
                        : 'bg-salve-amber/20 text-salve-amber hover:bg-salve-amber/30'
                    } disabled:opacity-50`}
                  >
                    <Upload size={14} />
                    {importing ? 'Importing...' : importValidation.mode === 'merge' ? 'Merge New Records' : 'Restore All Data'}
                  </button>
                  <button
                    onClick={cancelImport}
                    className="px-4 py-2.5 rounded-lg border border-salve-border text-salve-textMid text-sm hover:bg-salve-card2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                {importValidation.mode === 'restore' && (
                  <p className="mt-3 text-xs text-salve-rose/80 leading-relaxed">
                    This will replace all current data. Any records not in this file will be lost.
                  </p>
                )}
              </div>
            )}

            {importResult && (
              <div className="mt-3 p-3 rounded-lg bg-salve-sage/10 border border-salve-sage/30 text-salve-sage text-sm">
                {importResult}
              </div>
            )}
          </div>

          {/* ── Remove Duplicates ── */}
          <div className="mt-4">
            <p className="text-[11px] text-salve-textFaint mb-2 font-montserrat">
              Duplicate entries can appear when wearable data syncs multiple times.
            </p>
            <button
              onClick={async () => {
                setDedupStatus('running');
                try {
                  const results = await db.removeDuplicates();
                  setDedupStatus({ results });
                  if (results.some(r => r.removed > 0)) reloadData();
                } catch { setDedupStatus({ results: [] }); }
              }}
              disabled={dedupStatus === 'running'}
              className="flex items-center gap-1.5 text-xs text-salve-lav font-montserrat bg-transparent border border-salve-lav/30 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-salve-lav/10 disabled:opacity-50 transition-colors"
            >
              {dedupStatus === 'running' ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {dedupStatus === 'running' ? 'Scanning...' : 'Remove Duplicates'}
            </button>
            {dedupStatus && dedupStatus !== 'running' && (
              <p className="text-[11px] text-salve-textMid mt-1.5 font-montserrat">
                {dedupStatus.results.length > 0
                  ? dedupStatus.results.map(r => `${r.removed} duplicate${r.removed > 1 ? 's' : ''} removed from ${r.table}`).join('. ') + '.'
                  : 'No duplicates found.'}
              </p>
            )}
          </div>

          {/* ── Danger Zone: erase data + delete account (hidden in demo mode) ── */}
          {!demoMode && (
          <>
          <div className="mt-5 pt-5 border-t border-salve-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-3 block">Danger Zone</span>
            <p className="text-[13px] text-salve-textMid mb-3 leading-relaxed">
              All data is synced to your account and available across devices.
            </p>
            {showEraseConfirm ? (
              <div className="bg-salve-rose/10 border border-salve-rose/30 rounded-xl p-3.5">
                <p className="text-[13px] text-salve-rose font-medium mb-2.5">
                  Permanently erase ALL health data? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button variant="danger" onClick={eraseAll} className="text-xs">
                    <Trash2 size={14} /> Yes, Erase Everything
                  </Button>
                  <Button variant="ghost" onClick={() => setShowEraseConfirm(false)} className="text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setShowEraseConfirm(true)} className="text-xs">
                <Trash2 size={14} /> Erase All Data
              </Button>
            )}
          </div>

          {/* ── Delete Account (permanent, removes auth.users row + cascades) ── */}
          <div className="mt-4 pt-4 border-t border-salve-border">
            <h4 className="text-[13px] font-medium text-salve-text mb-1 font-montserrat">Delete Account</h4>
            <p className="text-xs text-salve-textFaint mb-3 leading-relaxed">
              Permanently deletes your account and all associated data. You will be signed out. This cannot be undone.
            </p>
            {deleteStage === 'idle' && (
              <Button variant="danger" onClick={() => setDeleteStage('confirm')} className="text-xs">
                <Trash2 size={14} /> Delete My Account
              </Button>
            )}
            {deleteStage === 'confirm' && (
              <div className="bg-salve-rose/10 border border-salve-rose/30 rounded-xl p-3.5">
                <p className="text-[13px] text-salve-rose font-medium mb-2">
                  Type <span className="font-mono">DELETE</span> to confirm permanent deletion.
                </p>
                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder="DELETE"
                  aria-label="Type DELETE to confirm"
                  className="w-full mb-2.5 px-3 py-2 rounded-lg border border-salve-rose/30 bg-salve-card text-salve-text text-sm font-montserrat outline-none focus:border-salve-rose/60"
                />
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    disabled={deleteInput !== 'DELETE'}
                    onClick={async () => {
                      setDeleteStage('deleting');
                      setDeleteError(null);
                      try {
                        await deleteAccount();
                        // Account is gone, force a clean reload
                        window.location.href = '/';
                      } catch (err) {
                        setDeleteError(err.message || 'Deletion failed');
                        setDeleteStage('error');
                      }
                    }}
                    className="text-xs"
                  >
                    <Trash2 size={14} /> Permanently Delete
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setDeleteStage('idle'); setDeleteInput(''); }}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {deleteStage === 'deleting' && (
              <p className="text-[13px] text-salve-textMid italic">Deleting your account…</p>
            )}
            {deleteStage === 'error' && (
              <div className="bg-salve-rose/10 border border-salve-rose/30 rounded-xl p-3.5">
                <p className="text-[13px] text-salve-rose mb-2">{deleteError}</p>
                <Button
                  variant="ghost"
                  onClick={() => { setDeleteStage('idle'); setDeleteInput(''); setDeleteError(null); }}
                  className="text-xs"
                >
                  Try again
                </Button>
              </div>
            )}
          </div>
          </>
          )}
        </Card>
      )}

      {/* ══════════════ 8. Install App ══════════════ */}
      <SectionTitle>Install App</SectionTitle>
      <Card>
        <div className="space-y-3">
          <div className="flex items-start gap-2.5">
            <Smartphone size={14} className="text-salve-lav mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-salve-text font-montserrat mb-1">Add Salve to your home screen</div>
              <p className="text-[12px] text-salve-textFaint font-montserrat leading-relaxed m-0">
                Salve works as a full app when installed, faster launch, offline access, and no browser bar.
              </p>
            </div>
          </div>
          <div className="border-t border-salve-border/50 pt-3 space-y-2.5">
            <div className="flex items-start gap-2">
              <Apple size={12} className="text-salve-textMid mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-salve-textMid font-montserrat leading-relaxed m-0">
                <strong>iPhone/iPad:</strong> Tap the share button <span className="inline-block px-1 py-0.5 bg-salve-card2 rounded text-[10px]">&#x2191;</span> in Safari, then <strong>Add to Home Screen</strong>
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Smartphone size={12} className="text-salve-textMid mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-salve-textMid font-montserrat leading-relaxed m-0">
                <strong>Android:</strong> Tap the menu <span className="inline-block px-1 py-0.5 bg-salve-card2 rounded text-[10px]">&#8942;</span> in Chrome, then <strong>Add to Home Screen</strong> or <strong>Install App</strong>
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
          <div className="flex items-center gap-2.5 text-sm text-salve-textFaint font-montserrat">
            <Info size={14} />
            Salve v1.1.0
          </div>
        </div>
      </Card>

      </div>
      </div>

      {/* ══════════════ 9. Footer ══════════════ */}
      <div className="text-center mt-6 mb-2">
        <button
          onClick={() => onNav('legal')}
          className="text-[12px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors underline underline-offset-2"
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
        <p className="text-[11px] text-salve-textFaint italic leading-relaxed">
          Personal health reference tool<br />Always consult your healthcare providers
        </p>
      </div>
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="flex justify-between items-center mt-6 mb-3">
      <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0">{children}</h2>
      {action}
    </div>
  );
}
