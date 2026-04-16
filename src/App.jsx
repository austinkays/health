import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { getSession, onAuthChange } from './services/auth';
import { supabase } from './services/supabase';
import { cache, setupOfflineSync } from './services/cache';
import { db } from './services/db';
import { seedToken, clearTokenCache } from './services/token';
import Auth from './components/Auth';
import Header from './components/layout/Header';
import BottomNav from './components/layout/BottomNav';
import SideNav from './components/layout/SideNav';
import useHealthData from './hooks/useHealthData';
import useInsightRatings from './hooks/useInsightRatings';
import { checkInteractions } from './utils/interactions';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ErrorBoundary from './components/ui/ErrorBoundary';
import OfflineBanner from './components/ui/OfflineBanner';
import SkeletonList from './components/ui/SkeletonCard';
import { ToastProvider, useToast } from './components/ui/Toast';
import { ThemeProvider, useTheme } from './hooks/useTheme';
const SagePopup = lazyWithRetry(() => import('./components/ui/SagePopup'));
const SageIntroChat = lazyWithRetry(() => import('./components/ui/SageIntro'));
import WhatsNewModal, { hasUnseenChanges } from './components/ui/WhatsNewModal';
import OnboardingWizard, { hasCompletedOnboarding, markOnboardingComplete } from './components/ui/OnboardingWizard';
import InstallPrompt from './components/ui/InstallPrompt';
import DemoWelcome, { hasSeenDemoWelcome } from './components/ui/DemoWelcome';
import UpdateBanner from './components/ui/UpdateBanner';
import useSWUpdate from './hooks/useSWUpdate';
import DemoBanner from './components/ui/DemoBanner';
import { setSentryUser, clearSentryUser } from './services/sentry';
import { tabFromPath, highlightFromUrl, pushTabUrl } from './utils/router';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';
import { setDemoMode as setAIDemoMode, setPremiumActive, setAdminActive, isPremiumActive, isAdminActive } from './services/ai';
import { trackEvent, EVENTS, enableAnalytics, disableAnalytics, setupAnalyticsFlush, flush as flushAnalytics } from './services/analytics';
import { clearOuraTokens } from './services/oura';
import { clearDexcomTokens } from './services/dexcom';
import { clearWithingsTokens } from './services/withings';
import { clearFitbitTokens } from './services/fitbit';
import { clearWhoopTokens } from './services/whoop';

// Retry wrapper: if a code-split chunk fails to load (stale deploy),
// do a one-time page reload so the browser fetches the new chunks.
const RETRY_KEY = 'salve:chunk-retry';
const RETRY_TAB_KEY = 'salve:chunk-retry-tab';
function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      if (!sessionStorage.getItem(RETRY_KEY)) {
        sessionStorage.setItem(RETRY_KEY, '1');
        // Preserve the current tab so user doesn't land on Home after reload
        const currentTab = sessionStorage.getItem(RETRY_TAB_KEY);
        if (!currentTab) {
          // Tab is set by onNav before the chunk loads, read from DOM dataset
          const tab = document.documentElement.dataset.salveTab;
          if (tab) sessionStorage.setItem(RETRY_TAB_KEY, tab);
        }
        window.location.reload();
        return new Promise(() => {}); // never resolves, page is reloading
      }
      sessionStorage.removeItem(RETRY_KEY);
      throw new Error('Failed to load section after retry');
    })
  );
}

// Code-split section components, loaded only when first visited
const Dashboard = lazyWithRetry(() => import('./components/sections/Dashboard'));
const Medications = lazyWithRetry(() => import('./components/sections/Medications'));
const Vitals = lazyWithRetry(() => import('./components/sections/Vitals'));
const Appointments = lazyWithRetry(() => import('./components/sections/Appointments'));
const Conditions = lazyWithRetry(() => import('./components/sections/Conditions'));
const Providers = lazyWithRetry(() => import('./components/sections/Providers'));
const Allergies = lazyWithRetry(() => import('./components/sections/Allergies'));
const Journal = lazyWithRetry(() => import('./components/sections/Journal'));
const AIPanel = lazyWithRetry(() => import('./components/sections/AIPanel'));
const News = lazyWithRetry(() => import('./components/sections/News'));
const Interactions = lazyWithRetry(() => import('./components/sections/Interactions'));
const Settings = lazyWithRetry(() => import('./components/sections/Settings'));
const Labs = lazyWithRetry(() => import('./components/sections/Labs'));
const Procedures = lazyWithRetry(() => import('./components/sections/Procedures'));
const Immunizations = lazyWithRetry(() => import('./components/sections/Immunizations'));
const CareGaps = lazyWithRetry(() => import('./components/sections/CareGaps'));
const AnesthesiaFlags = lazyWithRetry(() => import('./components/sections/AnesthesiaFlags'));
const Appeals = lazyWithRetry(() => import('./components/sections/Appeals'));
const SurgicalPlanning = lazyWithRetry(() => import('./components/sections/SurgicalPlanning'));
const Insurance = lazyWithRetry(() => import('./components/sections/Insurance'));
const Pharmacies = lazyWithRetry(() => import('./components/sections/Pharmacies'));
const HealthSummary = lazyWithRetry(() => import('./components/sections/HealthSummary'));
const Search = lazyWithRetry(() => import('./components/sections/Search'));
const CycleTracker = lazyWithRetry(() => import('./components/sections/CycleTracker'));
const Todos = lazyWithRetry(() => import('./components/sections/Todos'));
const Genetics = lazyWithRetry(() => import('./components/sections/Genetics'));
const Activities = lazyWithRetry(() => import('./components/sections/Activities'));
const Sleep = lazyWithRetry(() => import('./components/sections/Sleep'));
const Hub = lazyWithRetry(() => import('./components/sections/Hub'));
const OuraRing = lazyWithRetry(() => import('./components/sections/OuraRing'));
const FitbitPage = lazyWithRetry(() => import('./components/sections/FitbitPage'));
const AppleHealthPage = lazyWithRetry(() => import('./components/sections/AppleHealthPage'));
const Legal = lazyWithRetry(() => import('./components/sections/Legal'));
const Feedback = lazyWithRetry(() => import('./components/sections/Feedback'));
const FormHelper = lazyWithRetry(() => import('./components/sections/FormHelper'));
const AboutMe = lazyWithRetry(() => import('./components/sections/AboutMe'));
const Insights = lazyWithRetry(() => import('./components/sections/Insights'));
const ImportPage = lazyWithRetry(() => import('./components/sections/Import'));
const Admin = lazyWithRetry(() => import('./components/sections/Admin'));

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
        <SpeedInsights />
        <Analytics />
      </ToastProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  // Check localStorage synchronously for an existing Supabase session.
  // If one exists, skip the blocking splash, render the app shell immediately
  // with cached data while onAuthStateChange refreshes the token in the background.
  const [session, setSession] = useState(() => {
    try {
      const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (key) {
        const stored = JSON.parse(localStorage.getItem(key));
        // gotrue stores { access_token, refresh_token, user, ... } or wrapped in a session key
        const s = stored?.currentSession || stored;
        if (s?.access_token && s?.user?.id) return s;
      }
    } catch { /* corrupted storage, fall through to auth screen */ }
    return null;
  });
  const [authLoading, setAuthLoading] = useState(() => !session); // skip loading if we found a cached session
  const [sessionExpired, setSessionExpired] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  // Theme revert on demo exit. DemoWelcome previews themes via setTheme
  // (no localStorage write), so calling revertTheme snaps back to the
  // user's committed theme when they leave demo mode.
  const { revertTheme } = useTheme();

  // Seed token cache from the synchronously-read session so useHealthData
  // can start loading immediately without waiting for onAuthStateChange.
  useEffect(() => {
    if (session?.access_token) {
      seedToken(session.access_token);
      cache.setToken(session.access_token);
      cache.prewarm();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps, intentionally runs once with initial session

  // Safety timeout: if Supabase INITIAL_SESSION event hasn't fired after 3 seconds,
  // stop showing the splash and let the user see the sign-in screen.
  // Without this, a stalled token refresh keeps the spinner forever.
  useEffect(() => {
    if (!authLoading) return;
    const timeout = setTimeout(() => setAuthLoading(false), 3000);
    return () => clearTimeout(timeout);
  }, [authLoading]);

  // Sync demo mode to services/ai.js so AI calls route to canned responses.
  // Demo mode also disables analytics so canned demo traffic doesn't pollute stats.
  useEffect(() => {
    setAIDemoMode(demoMode);
    if (demoMode) disableAnalytics();
  }, [demoMode]);

  // Flush analytics queue on page hide so we don't lose the last handful of events
  useEffect(() => setupAnalyticsFlush(), []);
  const [tab, setTab] = useState(() => {
    // Restore tab after a chunk-retry reload so user doesn't land on Home
    const retryTab = sessionStorage.getItem(RETRY_TAB_KEY);
    if (retryTab) {
      sessionStorage.removeItem(RETRY_TAB_KEY);
      return retryTab;
    }
    // Read initial tab from URL path (e.g. /medications → 'meds')
    return tabFromPath() || 'dash';
  });
  const [highlightId, setHighlightId] = useState(() => highlightFromUrl());
  const [notFound, setNotFound] = useState(() => tabFromPath() === null);
  const [navOpts, setNavOpts] = useState(null);
  const [navHistory, setNavHistory] = useState([]);
  const [sageOpen, setSageOpen] = useState(false);
  const [sageIntroOpen, setSageIntroOpen] = useState(false);
  const [feedbackPrefill, setFeedbackPrefill] = useState(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Demo-mode walkthrough modal. Gated on !hasSeenDemoWelcome() so it only
  // appears on the very first demo entry per browser.
  const [showDemoWelcome, setShowDemoWelcome] = useState(false);
  const { data, loading: dataLoading, addItem, updateItem, removeItem, updateSettings, eraseAll, reloadData } = useHealthData(demoMode ? null : session, demoMode);
  const insightRatings = useInsightRatings(session);

  // Show What's New on first load only when the current announcement id changes.
  // This is intentionally separate from ordinary deploys so routine pushes do
  // not auto-popup people unless we mean to announce something.
  useEffect(() => {
    if (!authLoading && (session || demoMode) && hasUnseenChanges()) {
      setShowWhatsNew(true);
    }
  }, [authLoading, session, demoMode]);

  // Show the first-run onboarding wizard for real users who haven't
  // completed it AND who look like a brand-new account. "Brand-new"
  // means: no profile name set AND no records in any meaningful table.
  // If either signal is present, the user is a returning one — mark
  // onboarding complete so a fresh browser doesn't re-prompt them
  // (the localStorage `salve:onboarded` flag is per-browser, so
  // signing in from a new device used to loop users through the wizard
  // every time despite having data on file). Skipped in demo mode.
  useEffect(() => {
    if (authLoading || dataLoading || demoMode || !session) return;
    if (hasCompletedOnboarding()) return;
    const hasName = !!(data?.settings?.name && String(data.settings.name).trim());
    const hasData = hasName
      || (data?.meds?.length || 0) > 0
      || (data?.conditions?.length || 0) > 0
      || (data?.vitals?.length || 0) > 0
      || (data?.journal?.length || 0) > 0
      || (data?.allergies?.length || 0) > 0
      || (data?.providers?.length || 0) > 0
      || (data?.appts?.length || 0) > 0
      || (data?.labs?.length || 0) > 0
      || (data?.todos?.length || 0) > 0
      || (data?.cycles?.length || 0) > 0
      || (data?.activities?.length || 0) > 0
      || (data?.immunizations?.length || 0) > 0
      || (data?.procedures?.length || 0) > 0
      || (data?.pharmacies?.length || 0) > 0
      || (data?.genetic_results?.length || 0) > 0;
    if (hasData) {
      // Returning user on a fresh browser: persist completion so we
      // never re-prompt on this device.
      markOnboardingComplete();
      return;
    }
    setShowOnboarding(true);
  }, [
    authLoading, dataLoading, demoMode, session,
    data?.settings?.name,
    data?.meds?.length, data?.conditions?.length, data?.vitals?.length, data?.journal?.length,
    data?.allergies?.length, data?.providers?.length, data?.appts?.length, data?.labs?.length,
    data?.todos?.length, data?.cycles?.length, data?.activities?.length, data?.immunizations?.length,
    data?.procedures?.length, data?.pharmacies?.length, data?.genetic_results?.length,
  ]);

  // Sync premium status into services/ai.js so isFeatureLocked() sees it.
  // Pro features unlock for premium users regardless of provider choice.
  useEffect(() => {
    setPremiumActive(isPremiumActive(data?.settings));
    setAdminActive(isAdminActive(data?.settings));
  }, [data?.settings]);
  const showToast = useToast();

  // Service-worker update flow. Lights up the UpdateBanner when a new
  // deploy is detected so users never stay stuck on stale code.
  const { needRefresh, updateNow, dismissUpdate } = useSWUpdate();

  // Track offline state so Header knows when OfflineBanner is above it
  // and can skip its own safe-area-inset-top to avoid a doubled gap.
  // OfflineBanner still tracks its own state internally for its content;
  // this is purely a layout signal.
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const interactions = useMemo(() => checkInteractions(data.meds), [data.meds]);

  // CRUD wrappers that show toast confirmations.
  // Wrapped in useCallback so child components don't re-render on every parent render.
  const addItemT = useCallback(async (table, item) => {
    if (demoMode) { showToast('Sign up to save your own data', { type: 'info' }); return; }
    const result = await addItem(table, item);
    showToast('Saved ✓');
    return result;
  }, [addItem, demoMode, showToast]);
  const updateItemT = useCallback(async (table, id, changes) => {
    if (demoMode) { showToast('Sign up to save your own data', { type: 'info' }); return; }
    const result = await updateItem(table, id, changes);
    showToast('Updated ✓');
    return result;
  }, [updateItem, demoMode, showToast]);
  const removeItemT = useCallback(async (table, id) => {
    if (demoMode) { showToast('Sign up to save your own data', { type: 'info' }); return; }
    await removeItem(table, id);
    showToast('Deleted');
  }, [removeItem, demoMode, showToast]);
  const updateSettingsT = useCallback(async (changes) => {
    if (demoMode) { showToast('Sign up to save your own data', { type: 'info' }); return; }
    return updateSettings(changes);
  }, [updateSettings, demoMode, showToast]);
  const eraseAllT = useCallback(async () => {
    if (demoMode) { showToast('Demo mode, nothing to erase', { type: 'info' }); return; }
    return eraseAll();
  }, [eraseAll, demoMode, showToast]);

  const onNav = useCallback((t, opts) => {
    setTab(prev => {
      if (t !== prev) {
        setNavHistory(h => [...h.slice(-19), prev]);
        trackEvent(`${EVENTS.SECTION_OPENED}:${t}`);
      }
      return t;
    });
    // Stamp on DOM so lazyWithRetry can read it during chunk-fail reload
    document.documentElement.dataset.salveTab = t;
    const hId = opts?.highlightId || null;
    setHighlightId(hId);
    setNavOpts(opts || null);
    // Sync URL with navigation
    pushTabUrl(t, hId);
    window.scrollTo(0, 0);
  }, []);

  const onBack = useCallback(() => {
    // Use browser back when we have history entries — this triggers
    // the popstate listener below which handles state updates.
    // Fall back to manual navHistory if browser history is empty.
    if (window.history.state?.tab) {
      window.history.back();
    } else {
      setNavHistory(prev => {
        const next = [...prev];
        const prevTab = next.pop() || 'dash';
        setTab(prevTab);
        setHighlightId(null);
        setNavOpts(null);
        pushTabUrl(prevTab, null, true);
        window.scrollTo(0, 0);
        return next;
      });
    }
  }, []);

  // ── Browser back/forward support ──
  // When the user presses the browser back/forward buttons, popstate fires
  // and we sync the tab state from the URL.
  useEffect(() => {
    const handlePopState = () => {
      const newTab = tabFromPath();
      const newHighlight = highlightFromUrl();
      if (newTab === null) {
        setNotFound(true);
      } else {
        setNotFound(false);
        setTab(newTab);
      }
      setHighlightId(newHighlight);
      setNavOpts(null);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync initial URL on mount (replaceState so we don't add a duplicate entry)
  useEffect(() => {
    pushTabUrl(tab, highlightId, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable callbacks for layout components (avoid re-renders from inline arrows)
  const openSearch = useCallback(() => onNav('search'), [onNav]);
  const openSage = useCallback(() => setSageOpen(true), []);
  const exitDemo = useCallback(() => {
    // Revert any theme the user previewed during the demo walkthrough
    // so their persisted preference (or default Lilac) comes back.
    revertTheme();
    setDemoMode(false);
  }, [revertTheme]);
  const closeSage = useCallback(() => setSageOpen(false), []);

  // Global keyboard shortcuts (desktop)
  useEffect(() => {
    const NAV_KEYS = { '1': 'dash', '2': 'meds', '3': 'vitals', '4': 'ai', '5': 'news', '6': 'formhelper', '7': 'journal', '8': 'import', '9': 'settings' };
    const handler = (e) => {
      // Cmd/Ctrl + K → open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onNav('search');
      }
      // Escape → close Sage popup
      if (e.key === 'Escape' && sageOpen) {
        setSageOpen(false);
      }
      // 1–6 → jump to main nav sections (desktop only, no modifier, not in inputs)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && NAV_KEYS[e.key]) {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          onNav(NAV_KEYS[e.key]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sageOpen]);

  // Time-aware ambiance, shift accent warmth throughout the day
  useEffect(() => {
    const applyAmbiance = () => {
      const h = new Date().getHours();
      const el = document.documentElement;
      el.classList.remove('ambiance-morning', 'ambiance-day', 'ambiance-evening', 'ambiance-night');
      if (h >= 5 && h < 12) el.classList.add('ambiance-morning');
      else if (h >= 12 && h < 17) el.classList.add('ambiance-day');
      else if (h >= 17 && h < 21) el.classList.add('ambiance-evening');
      else el.classList.add('ambiance-night');
    };
    applyAmbiance();
    const id = setInterval(applyAmbiance, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const checkout = params.get('checkout');
    // Handle Stripe checkout redirect
    if (checkout) {
      window.history.replaceState({}, '', window.location.pathname);
      if (checkout === 'success') {
        setTimeout(() => showToast('Welcome to Premium! Your plan has been upgraded. 🎉', { type: 'success' }), 800);
      }
    }
    if (window.__ouraCode) {
      // Oura OAuth callback, navigate to settings; session arrives via INITIAL_SESSION below
      setTab('settings');
      pushTabUrl('settings', null, true);
    }

    if (code) {
      // Exchange OAuth code for session; the resulting session will be picked up
      // by the INITIAL_SESSION / SIGNED_IN event from onAuthStateChange below.
      supabase.auth.exchangeCodeForSession(code).then(() => {
        window.history.replaceState({}, '', window.location.pathname);
      });
    }

    // Avoid calling getSession() here, it competes with onAuthStateChange for
    // the gotrue storage lock and causes a 5-second stall in React Strict Mode.
    // INITIAL_SESSION fires immediately and provides the same initial session.
    const subscription = onAuthChange((event, s) => {
      if (event === 'SIGNED_OUT' && !s) {
        // User explicitly signed out, clear everything
        setSessionExpired(true);
        setSageOpen(false);
        setSageIntroOpen(false);
        clearSentryUser();
        clearTokenCache();
        flushAnalytics();
        disableAnalytics();
        // Clear wearable OAuth tokens to prevent cross-user data contamination
        // if another user signs in on the same device
        clearOuraTokens();
        clearDexcomTokens();
        clearWithingsTokens();
        clearFitbitTokens();
        clearWhoopTokens();
        localStorage.removeItem('salve:oura-baseline');
      } else if (event === 'TOKEN_REFRESHED' && !s) {
        // Transient null during token refresh, do NOT flash auth screen.
        // The next event will have the refreshed session.
        return;
      } else if (s?.user?.id) {
        setSentryUser(s.user.id);
        // Seed the token cache so services don't call getSession() independently.
        seedToken(s.access_token);
        // Pre-derive the cache encryption key while React is re-rendering,
        // so cache.read() in useHealthData finds the key already cached.
        cache.setToken(s.access_token);
        cache.prewarm();
        // Closed-beta: if there's a pending invite code stashed by Auth.jsx
        // before the magic link, claim it now that we have an authenticated
        // session. Permanently binds the code to this user.
        try {
          const pending = localStorage.getItem('salve:pending-invite');
          if (pending) {
            supabase.rpc('claim_beta_invite', { code_in: pending })
              .then(({ error }) => {
                if (error) {
                  // RPC rejected the code (invalid, already claimed, expired).
                  // Drop it so we don't retry a dead code on every sign-in.
                  // Log it so the issue is visible rather than silent.
                  console.warn('[beta-invite] claim rejected:', error.message || error);
                  localStorage.removeItem('salve:pending-invite');
                } else {
                  localStorage.removeItem('salve:pending-invite');
                }
              })
              .catch((err) => {
                // Network / transport failure — keep the pending code so the
                // next sign-in retries. Surface the error so silent loss of
                // trial grants is detectable.
                console.warn('[beta-invite] claim network error, will retry next sign-in:', err?.message || err);
              });
          }
        } catch { /* localStorage unavailable, nothing to claim */ }
        // Enable analytics for this (real, non-demo) user. Log first-time
        // sign-in exactly once per browser via a guard key.
        enableAnalytics();
        // Track the user's current theme so the admin panel's theme
        // distribution chart reflects actual usage (not just change frequency).
        try {
          const activeTheme = localStorage.getItem('salve:theme') || 'lilac';
          trackEvent(EVENTS.THEME_ACTIVE + ':' + activeTheme);
        } catch { /* ignore */ }
        try {
          const FIRST_KEY = `salve:first-signin:${s.user.id}`;
          if (!localStorage.getItem(FIRST_KEY)) {
            localStorage.setItem(FIRST_KEY, '1');
            trackEvent(EVENTS.SIGNED_IN_FIRST_TIME);
          }
          // Stamp first-visit timestamp for time-based nudges (theme
          // suggestion card, etc.). Only written once per browser.
          if (!localStorage.getItem('salve:installed-at')) {
            localStorage.setItem('salve:installed-at', Date.now().toString());
          }
        } catch { /* localStorage may be unavailable */ }
      }
      setSession(s);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Clear chunk-retry flag on successful mount (proves new chunks loaded fine)
  useEffect(() => {
    sessionStorage.removeItem(RETRY_KEY);
  }, []);

  // Global unhandled promise rejection handler
  useEffect(() => {
    function handleRejection(event) {
      console.error('Unhandled promise rejection:', event.reason);
    }
    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);

  // Set cache token when session changes & wire up offline sync
  useEffect(() => {
    if (session?.access_token) {
      cache.setToken(session.access_token);
    } else {
      cache.clearToken();
    }
  }, [session]);

  useEffect(() => {
    const cleanup = setupOfflineSync(async (pending) => {
      for (const op of pending) {
        try {
          if (op.action === 'add' && op.table && op.item) {
            await db[op.table]?.add(op.item);
          } else if (op.action === 'update' && op.table && op.id && op.changes) {
            await db[op.table]?.update(op.id, op.changes);
          } else if (op.action === 'remove' && op.table && op.id) {
            await db[op.table]?.remove(op.id);
          }
        } catch (err) {
          console.error('Failed to flush pending op:', op, err);
        }
      }
      cache.clearPending();
    });
    return cleanup;
  }, []);

  if (authLoading) {
    // Match the HTML splash in index.html so the transition feels like one continuous screen
    return (
      <div className="min-h-screen bg-salve-bg flex flex-col items-center justify-center" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>
        <div className="text-[22px] font-semibold tracking-[0.08em] text-salve-text mb-2">SALVE</div>
        <div className="text-xs text-salve-textMid opacity-60">Loading your health data...</div>
        <div className="mt-5 w-8 h-8 border-2 border-salve-border border-t-salve-lav rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && !demoMode) {
    return (
      <>
        <Auth
          sessionExpired={sessionExpired}
          onAuthSuccess={() => setSessionExpired(false)}
          onEnterDemo={() => {
            setDemoMode(true);
            setTab('dash');
            pushTabUrl('dash', null, true);
            // First-run walkthrough, only show if the user hasn't seen it
            // already in this browser.
            if (!hasSeenDemoWelcome()) setShowDemoWelcome(true);
          }}
        />
        {/* Pre-auth install nudge for iOS Safari only. iPhone won't share the
            sign-in between Safari and the standalone PWA, so installing
            BEFORE signing in saves the user from authenticating twice.
            InstallPrompt internally no-ops when not iOS / already standalone. */}
        <InstallPrompt preAuth />
      </>
    );
  }

  const renderSection = () => {
    const shared = { data, addItem: addItemT, addItemSilent: addItem, updateItem: updateItemT, removeItem: removeItemT, highlightId };
    switch (tab) {
      case 'dash':        return <Dashboard {...shared} interactions={interactions} onNav={onNav} onSage={() => setSageOpen(true)} onSageIntro={() => setSageIntroOpen(true)} dataLoading={dataLoading} insightRatings={insightRatings} />;
      case 'meds':        return <Medications {...shared} interactions={interactions} onNav={onNav} />;
      case 'vitals':      return <Vitals {...shared} onNav={onNav} />;
      case 'appts':       return <Appointments {...shared} />;
      case 'conditions':  return <Conditions {...shared} onNav={onNav} />;
      case 'providers':   return <Providers {...shared} />;
      case 'allergies':   return <Allergies {...shared} />;
      case 'journal':     return <Journal {...shared} onNav={onNav} />;
      case 'ai':          return <AIPanel {...shared} updateSettings={updateSettingsT} demoMode={demoMode} insightRatings={insightRatings} />;
      case 'news':        return <News {...shared} demoMode={demoMode} />;
      case 'interactions':return <Interactions interactions={interactions} meds={data.meds} />;
      case 'settings':    return <Settings data={data} updateSettings={updateSettingsT} updateItem={updateItemT} addItem={addItemT} addItemSilent={addItem} eraseAll={eraseAllT} reloadData={reloadData} onNav={onNav} demoMode={demoMode} />;
      // Comprehensive sections
      case 'labs':        return <Labs {...shared} />;
      case 'procedures':  return <Procedures {...shared} />;
      case 'immunizations':return <Immunizations {...shared} />;
      case 'care_gaps':   return <CareGaps {...shared} />;
      case 'anesthesia':  return <AnesthesiaFlags {...shared} />;
      case 'appeals':     return <Appeals {...shared} />;
      case 'surgical':    return <SurgicalPlanning {...shared} />;
      case 'insurance':   return <Insurance {...shared} />;
      case 'pharmacies': return <Pharmacies {...shared} />;
      case 'cycles':     return <CycleTracker {...shared} quickLog={navOpts?.quickLog} />;
      case 'todos':      return <Todos {...shared} />;
      case 'genetics':   return <Genetics {...shared} />;
      case 'activities': return <Activities {...shared} />;
      case 'insights':   return <Insights data={data} onNav={onNav} />;
      case 'sleep':      return <Sleep {...shared} />;
      // Hub category pages
      case 'hub_records':  return <Hub hubId="records" data={data} onNav={onNav} />;
      case 'hub_care':     return <Hub hubId="care" data={data} onNav={onNav} />;
      case 'hub_tracking': return <Hub hubId="tracking" data={data} onNav={onNav} />;
      case 'hub_safety':   return <Hub hubId="safety" data={data} onNav={onNav} />;
      case 'hub_plans':    return <Hub hubId="plans" data={data} onNav={onNav} />;
      case 'hub_devices':  return <Hub hubId="devices" data={data} onNav={onNav} />;
      case 'oura':         return <OuraRing data={data} addItem={addItem} onNav={onNav} />;
      case 'fitbit':       return <FitbitPage data={data} addItem={addItem} onNav={onNav} />;
      case 'apple_health': return <AppleHealthPage data={data} onNav={onNav} />;
      case 'summary':    return <HealthSummary data={data} onNav={onNav} />;
      case 'search':     return <Search data={data} onNav={onNav} />;
      case 'legal':      return <Legal onNav={onNav} />;
      case 'feedback':   return <Feedback {...shared} prefill={feedbackPrefill} onPrefillConsumed={() => setFeedbackPrefill(null)} />;
      case 'formhelper': return <FormHelper {...shared} onNav={onNav} />;
      case 'aboutme':    return <AboutMe {...shared} updateSettings={updateSettingsT} onSageIntro={() => setSageIntroOpen(true)} />;
      case 'import':     return <ImportPage data={data} reloadData={reloadData} onNav={onNav} demoMode={demoMode} />;
      case 'admin':      return <Admin data={data} onNav={onNav} />;
      default:            return <Dashboard {...shared} interactions={interactions} onNav={onNav} onSage={() => setSageOpen(true)} />;
    }
  };

  return (
    <div className="min-h-screen overflow-hidden relative">
      <SideNav
        tab={tab}
        onNav={onNav}
        onSearch={openSearch}
        onSage={openSage}
        name={data.settings.name}
        demoMode={demoMode}
        onExitDemo={exitDemo}
        updateAvailable={needRefresh}
        onUpdate={updateNow}
        onDismissUpdate={dismissUpdate}
      />
      <div className="md:ml-[260px]">
        {needRefresh && <UpdateBanner variant="mobile" onUpdate={updateNow} onDismiss={dismissUpdate} />}
        <OfflineBanner />
        {demoMode && <DemoBanner onExit={exitDemo} />}
        <div className="max-w-[480px] mx-auto pb-24 relative md:max-w-[820px] lg:max-w-[1060px] xl:max-w-[1280px]">
          <Header tab={tab} name={data.settings.name} onBack={onBack} onSearch={openSearch} onSage={openSage} onNotifications={() => onNav('settings')} topBannerActive={needRefresh || demoMode || isOffline} />
          <main className="px-fluid-page">
            <ErrorBoundary resetKey={tab} onReset={() => { setNavHistory([]); onNav('dash'); }} onReport={({ error, resetKey }) => {
              setFeedbackPrefill({ type: 'bug', message: `[Auto] Crash in "${resetKey}" section: ${error}` });
              onNav('feedback');
            }}>
              <Suspense fallback={<SkeletonList count={3} />}>
                {notFound ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                    <span className="text-display-2xl font-playfair text-salve-text">404</span>
                    <p className="text-ui-lg text-salve-textMid font-montserrat">This page doesn't exist</p>
                    <button
                      onClick={() => { setNotFound(false); onNav('dash'); }}
                      className="mt-2 px-5 py-2.5 rounded-xl bg-salve-lav/10 border border-salve-lav/30 text-salve-lav text-ui-md font-montserrat font-medium hover:bg-salve-lav/20 transition-colors cta-lift"
                    >
                      Go Home
                    </button>
                  </div>
                ) : renderSection()}
              </Suspense>
            </ErrorBoundary>
          </main>
          <BottomNav tab={tab} onNav={onNav} />
        </div>
      </div>
      {sageOpen && (
        <Suspense fallback={null}>
          <SagePopup
            open={sageOpen}
            onClose={closeSage}
            onOpenFullChat={() => onNav('ai')}
            data={data}
          />
        </Suspense>
      )}
      {sageIntroOpen && (
        <Suspense fallback={null}>
          <SageIntroChat
            data={data}
            addItem={addItem}
            updateItem={updateItem}
            removeItem={removeItem}
            updateSettings={updateSettings}
            onClose={() => { setSageIntroOpen(false); reloadData(); }}
            onNav={onNav}
          />
        </Suspense>
      )}
      {showWhatsNew && !showDemoWelcome && <WhatsNewModal onClose={() => setShowWhatsNew(false)} />}
      {showOnboarding && <OnboardingWizard name={data?.settings?.name} updateSettings={updateSettings} onClose={() => setShowOnboarding(false)} />}
      {/* PWA install invitation. Only for signed-in (non-demo) users, deferred
          until after the onboarding wizard has been completed to avoid
          stacking modals on first run. */}
      {!demoMode && session && !showOnboarding && !showWhatsNew && hasCompletedOnboarding() && <InstallPrompt />}
      {demoMode && showDemoWelcome && (
        <DemoWelcome onClose={() => setShowDemoWelcome(false)} />
      )}
    </div>
  );
}
