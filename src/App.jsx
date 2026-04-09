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
import { checkInteractions } from './utils/interactions';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ErrorBoundary from './components/ui/ErrorBoundary';
import OfflineBanner from './components/ui/OfflineBanner';
import SkeletonList from './components/ui/SkeletonCard';
import { ToastProvider, useToast } from './components/ui/Toast';
import { ThemeProvider } from './hooks/useTheme';
import SagePopup from './components/ui/SagePopup';
const SageIntroChat = lazyWithRetry(() => import('./components/ui/SageIntro'));
import WhatsNewModal, { hasUnseenChanges } from './components/ui/WhatsNewModal';
import DemoBanner from './components/ui/DemoBanner';
import { setSentryUser, clearSentryUser } from './services/sentry';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { setDemoMode as setAIDemoMode, setPremiumActive, setAdminActive, isPremiumActive, isAdminActive } from './services/ai';

// Retry wrapper: if a code-split chunk fails to load (stale deploy),
// do a one-time page reload so the browser fetches the new chunks.
const RETRY_KEY = 'salve:chunk-retry';
function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      if (!sessionStorage.getItem(RETRY_KEY)) {
        sessionStorage.setItem(RETRY_KEY, '1');
        window.location.reload();
        return new Promise(() => {}); // never resolves — page is reloading
      }
      sessionStorage.removeItem(RETRY_KEY);
      throw new Error('Failed to load section after retry');
    })
  );
}

// Code-split section components — loaded only when first visited
const Dashboard = lazyWithRetry(() => import('./components/sections/Dashboard'));
const Medications = lazyWithRetry(() => import('./components/sections/Medications'));
const Vitals = lazyWithRetry(() => import('./components/sections/Vitals'));
const Appointments = lazyWithRetry(() => import('./components/sections/Appointments'));
const Conditions = lazyWithRetry(() => import('./components/sections/Conditions'));
const Providers = lazyWithRetry(() => import('./components/sections/Providers'));
const Allergies = lazyWithRetry(() => import('./components/sections/Allergies'));
const Journal = lazyWithRetry(() => import('./components/sections/Journal'));
const AIPanel = lazyWithRetry(() => import('./components/sections/AIPanel'));
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
const AppleHealthPage = lazyWithRetry(() => import('./components/sections/AppleHealthPage'));
const Legal = lazyWithRetry(() => import('./components/sections/Legal'));
const Feedback = lazyWithRetry(() => import('./components/sections/Feedback'));
const FormHelper = lazyWithRetry(() => import('./components/sections/FormHelper'));
const AboutMe = lazyWithRetry(() => import('./components/sections/AboutMe'));
const Insights = lazyWithRetry(() => import('./components/sections/Insights'));

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
        <SpeedInsights />
      </ToastProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  // Check localStorage synchronously for an existing Supabase session.
  // If one exists, skip the blocking splash — render the app shell immediately
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
    } catch { /* corrupted storage — fall through to auth screen */ }
    return null;
  });
  const [authLoading, setAuthLoading] = useState(() => !session); // skip loading if we found a cached session
  const [sessionExpired, setSessionExpired] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // Seed token cache from the synchronously-read session so useHealthData
  // can start loading immediately without waiting for onAuthStateChange.
  useEffect(() => {
    if (session?.access_token) {
      seedToken(session.access_token);
      cache.setToken(session.access_token);
      cache.prewarm();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally runs once with initial session

  // Safety timeout: if Supabase INITIAL_SESSION event hasn't fired after 3 seconds,
  // stop showing the splash and let the user see the sign-in screen.
  // Without this, a stalled token refresh keeps the spinner forever.
  useEffect(() => {
    if (!authLoading) return;
    const timeout = setTimeout(() => setAuthLoading(false), 3000);
    return () => clearTimeout(timeout);
  }, [authLoading]);

  // Sync demo mode to services/ai.js so AI calls route to canned responses
  useEffect(() => { setAIDemoMode(demoMode); }, [demoMode]);
  const [tab, setTab] = useState('dash');
  const [highlightId, setHighlightId] = useState(null);
  const [navOpts, setNavOpts] = useState(null);
  const [navHistory, setNavHistory] = useState([]);
  const [sageOpen, setSageOpen] = useState(false);
  const [sageIntroOpen, setSageIntroOpen] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const { data, loading: dataLoading, addItem, updateItem, removeItem, updateSettings, eraseAll, reloadData } = useHealthData(demoMode ? null : session, demoMode);

  // Show What's New modal on first load if version changed
  useEffect(() => {
    if (!authLoading && (session || demoMode) && hasUnseenChanges()) {
      setShowWhatsNew(true);
    }
  }, [authLoading, session, demoMode]);

  // Sync premium status into services/ai.js so isFeatureLocked() sees it.
  // Pro features unlock for premium users regardless of provider choice.
  useEffect(() => {
    setPremiumActive(isPremiumActive(data?.settings));
    setAdminActive(isAdminActive(data?.settings));
  }, [data?.settings]);
  const showToast = useToast();

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
    if (demoMode) { showToast('Demo mode — nothing to erase', { type: 'info' }); return; }
    return eraseAll();
  }, [eraseAll, demoMode, showToast]);

  const onNav = useCallback((t, opts) => {
    setTab(prev => {
      if (t !== prev) setNavHistory(h => [...h.slice(-19), prev]);
      return t;
    });
    setHighlightId(opts?.highlightId || null);
    setNavOpts(opts || null);
    window.scrollTo(0, 0);
  }, []);

  const onBack = useCallback(() => {
    setNavHistory(prev => {
      const next = [...prev];
      const prevTab = next.pop() || 'dash';
      setTab(prevTab);
      setHighlightId(null);
      setNavOpts(null);
      window.scrollTo(0, 0);
      return next;
    });
  }, []);

  // Stable callbacks for layout components (avoid re-renders from inline arrows)
  const openSearch = useCallback(() => onNav('search'), [onNav]);
  const openSage = useCallback(() => setSageOpen(true), []);
  const exitDemo = useCallback(() => setDemoMode(false), []);
  const closeSage = useCallback(() => setSageOpen(false), []);

  // Global keyboard shortcuts (desktop)
  useEffect(() => {
    const NAV_KEYS = { '1': 'dash', '2': 'meds', '3': 'vitals', '4': 'ai', '5': 'formhelper', '6': 'journal', '7': 'settings' };
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

  // Time-aware ambiance — shift accent warmth throughout the day
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
    // Handle Lemon Squeezy checkout redirect
    if (checkout) {
      window.history.replaceState({}, '', window.location.pathname);
      if (checkout === 'success') {
        setTimeout(() => showToast('Welcome to Premium! Your plan has been upgraded. 🎉', { type: 'success' }), 800);
      }
    }
    if (window.__ouraCode) {
      // Oura OAuth callback — navigate to settings; session arrives via INITIAL_SESSION below
      setTab('settings');
    }

    if (code) {
      // Exchange OAuth code for session; the resulting session will be picked up
      // by the INITIAL_SESSION / SIGNED_IN event from onAuthStateChange below.
      supabase.auth.exchangeCodeForSession(code).then(() => {
        window.history.replaceState({}, '', window.location.pathname);
      });
    }

    // Avoid calling getSession() here — it competes with onAuthStateChange for
    // the gotrue storage lock and causes a 5-second stall in React Strict Mode.
    // INITIAL_SESSION fires immediately and provides the same initial session.
    const subscription = onAuthChange((event, s) => {
      if (!s && (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED')) {
        setSessionExpired(true);
        setSageOpen(false);
        setSageIntroOpen(false);
        clearSentryUser();
        clearTokenCache();
      } else if (s?.user?.id) {
        setSentryUser(s.user.id);
        // Seed the token cache so services don't call getSession() independently.
        seedToken(s.access_token);
        // Pre-derive the cache encryption key while React is re-rendering,
        // so cache.read() in useHealthData finds the key already cached.
        cache.setToken(s.access_token);
        cache.prewarm();
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
      <Auth
        sessionExpired={sessionExpired}
        onAuthSuccess={() => setSessionExpired(false)}
        onEnterDemo={() => { setDemoMode(true); setTab('dash'); }}
      />
    );
  }

  const renderSection = () => {
    const shared = { data, addItem: addItemT, addItemSilent: addItem, updateItem: updateItemT, removeItem: removeItemT, highlightId };
    switch (tab) {
      case 'dash':        return <Dashboard {...shared} interactions={interactions} onNav={onNav} onSage={() => setSageOpen(true)} onSageIntro={() => setSageIntroOpen(true)} dataLoading={dataLoading} />;
      case 'meds':        return <Medications {...shared} interactions={interactions} onNav={onNav} />;
      case 'vitals':      return <Vitals {...shared} />;
      case 'appts':       return <Appointments {...shared} />;
      case 'conditions':  return <Conditions {...shared} onNav={onNav} />;
      case 'providers':   return <Providers {...shared} />;
      case 'allergies':   return <Allergies {...shared} />;
      case 'journal':     return <Journal {...shared} onNav={onNav} />;
      case 'ai':          return <AIPanel {...shared} updateSettings={updateSettingsT} demoMode={demoMode} />;
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
      case 'apple_health': return <AppleHealthPage data={data} onNav={onNav} />;
      case 'summary':    return <HealthSummary data={data} onNav={onNav} />;
      case 'search':     return <Search data={data} onNav={onNav} />;
      case 'legal':      return <Legal onNav={onNav} />;
      case 'feedback':   return <Feedback {...shared} />;
      case 'formhelper': return <FormHelper {...shared} onNav={onNav} />;
      case 'aboutme':    return <AboutMe {...shared} updateSettings={updateSettingsT} onSageIntro={() => setSageIntroOpen(true)} />;
      default:            return <Dashboard {...shared} interactions={interactions} onNav={onNav} onSage={() => setSageOpen(true)} />;
    }
  };

  return (
    <div className="min-h-screen overflow-hidden relative">
      <SideNav tab={tab} onNav={onNav} onSearch={openSearch} onSage={openSage} name={data.settings.name} demoMode={demoMode} onExitDemo={exitDemo} />
      <div className="md:ml-[260px]">
        <OfflineBanner />
        {demoMode && <DemoBanner onExit={exitDemo} />}
        <div className="max-w-[480px] mx-auto pb-24 relative md:max-w-[820px] lg:max-w-[1060px] xl:max-w-[1280px]">
          <Header tab={tab} name={data.settings.name} onBack={onBack} onSearch={openSearch} onSage={openSage} />
          <main className="px-4 md:px-6 lg:px-8">
            <ErrorBoundary onReset={() => { setNavHistory([]); onNav('dash'); }}>
              <Suspense fallback={<SkeletonList count={3} />}>
                {renderSection()}
              </Suspense>
            </ErrorBoundary>
          </main>
          <BottomNav tab={tab} onNav={onNav} />
        </div>
      </div>
      {sageOpen && (
        <SagePopup
          open={sageOpen}
          onClose={closeSage}
          onOpenFullChat={() => onNav('ai')}
          data={data}
        />
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
      {showWhatsNew && <WhatsNewModal onClose={() => setShowWhatsNew(false)} />}
    </div>
  );
}
