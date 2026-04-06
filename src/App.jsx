import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { getSession, onAuthChange } from './services/auth';
import { supabase } from './services/supabase';
import { cache, setupOfflineSync } from './services/cache';
import { db } from './services/db';
import Auth from './components/Auth';
import Header from './components/layout/Header';
import BottomNav from './components/layout/BottomNav';
import SideNav from './components/layout/SideNav';
import useHealthData from './hooks/useHealthData';
import { checkInteractions } from './utils/interactions';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { ToastProvider, useToast } from './components/ui/Toast';
import { ThemeProvider } from './hooks/useTheme';
import SagePopup from './components/ui/SagePopup';
import DemoBanner from './components/ui/DemoBanner';
import { setSentryUser, clearSentryUser } from './services/sentry';
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

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // Sync demo mode to services/ai.js so AI calls route to canned responses
  useEffect(() => { setAIDemoMode(demoMode); }, [demoMode]);
  const [tab, setTab] = useState('dash');
  const [highlightId, setHighlightId] = useState(null);
  const [navOpts, setNavOpts] = useState(null);
  const [navHistory, setNavHistory] = useState([]);
  const [sageOpen, setSageOpen] = useState(false);
  const { data, loading: dataLoading, addItem, updateItem, removeItem, updateSettings, eraseAll, reloadData } = useHealthData(demoMode ? null : session, demoMode);

  // Sync premium status into services/ai.js so isFeatureLocked() sees it.
  // Pro features unlock for premium users regardless of provider choice.
  useEffect(() => {
    setPremiumActive(isPremiumActive(data?.settings));
    setAdminActive(isAdminActive(data?.settings));
  }, [data?.settings]);
  const showToast = useToast();

  const interactions = useMemo(() => checkInteractions(data.meds), [data.meds]);

  // CRUD wrappers that show toast confirmations.
  // In demo mode, every write is blocked with a sign-up nudge.
  const demoBlock = () => {
    showToast('Sign up to save your own data', { type: 'info' });
    throw new Error('demo_mode_blocked');
  };
  const addItemT = async (table, item) => {
    if (demoMode) demoBlock();
    const result = await addItem(table, item);
    showToast('Saved ✓');
    return result;
  };
  const updateItemT = async (table, id, changes) => {
    if (demoMode) demoBlock();
    const result = await updateItem(table, id, changes);
    showToast('Updated ✓');
    return result;
  };
  const removeItemT = async (table, id) => {
    if (demoMode) demoBlock();
    await removeItem(table, id);
    showToast('Deleted');
  };
  const updateSettingsT = async (changes) => {
    if (demoMode) demoBlock();
    return updateSettings(changes);
  };
  const eraseAllT = async () => {
    if (demoMode) { showToast('Demo mode — nothing to erase', { type: 'info' }); return; }
    return eraseAll();
  };

  const onNav = (t, opts) => {
    // Push current tab onto history stack so back button can return here
    if (t !== tab) {
      setNavHistory(prev => [...prev.slice(-19), tab]);
    }
    setTab(t);
    setHighlightId(opts?.highlightId || null);
    setNavOpts(opts || null);
    window.scrollTo(0, 0);
  };

  const onBack = () => {
    setNavHistory(prev => {
      const next = [...prev];
      const prevTab = next.pop() || 'dash';
      setTab(prevTab);
      setHighlightId(null);
      setNavOpts(null);
      window.scrollTo(0, 0);
      return next;
    });
  };

  // Global keyboard shortcuts (desktop)
  useEffect(() => {
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
    if (window.__ouraCode) {
      // Oura OAuth callback — code was stashed by supabase.js, navigate to settings
      setTab('settings');
      getSession().then(s => { setSession(s); if (s?.user?.id) setSentryUser(s.user.id); setAuthLoading(false); });
    } else if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (!error && data.session) {
          setSession(data.session);
        }
        window.history.replaceState({}, '', window.location.pathname);
        setAuthLoading(false);
      });
    } else {
      getSession().then(s => {
        setSession(s);
        if (s?.user?.id) setSentryUser(s.user.id);
        setAuthLoading(false);
      });
    }

    const subscription = onAuthChange((event, s) => {
      // If the session was signed out or the token refresh failed, show expiry notice
      if (!s && (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED')) {
        setSessionExpired(true);
        clearSentryUser();
      } else if (s?.user?.id) {
        setSentryUser(s.user.id);
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
    return (
      <div className="min-h-screen bg-salve-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-salve-textFaint text-sm tracking-widest mb-3">✶ · ✶</div>
          <p className="text-salve-lav font-playfair text-xl">Loading...</p>
        </div>
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

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-salve-bg flex items-center justify-center">
        <LoadingSpinner text="Loading your health data..." />
      </div>
    );
  }

  const renderSection = () => {
    const shared = { data, addItem: addItemT, addItemSilent: addItem, updateItem: updateItemT, removeItem: removeItemT, highlightId };
    switch (tab) {
      case 'dash':        return <Dashboard {...shared} interactions={interactions} onNav={onNav} />;
      case 'meds':        return <Medications {...shared} interactions={interactions} />;
      case 'vitals':      return <Vitals {...shared} />;
      case 'appts':       return <Appointments {...shared} />;
      case 'conditions':  return <Conditions {...shared} />;
      case 'providers':   return <Providers {...shared} />;
      case 'allergies':   return <Allergies {...shared} />;
      case 'journal':     return <Journal {...shared} />;
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
      default:            return <Dashboard {...shared} interactions={interactions} onNav={onNav} />;
    }
  };

  return (
    <div className="min-h-screen overflow-hidden relative">
      <SideNav tab={tab} onNav={onNav} onSearch={() => onNav('search')} onSage={() => setSageOpen(true)} name={data.settings.name} demoMode={demoMode} onExitDemo={() => setDemoMode(false)} />
      <div className="md:ml-[260px]">
        {demoMode && <DemoBanner onExit={() => setDemoMode(false)} />}
        <div className="max-w-[480px] mx-auto pb-24 relative md:max-w-[820px] lg:max-w-[1060px] xl:max-w-[1280px]">
          <Header tab={tab} name={data.settings.name} onBack={onBack} onSearch={() => onNav('search')} onSage={() => setSageOpen(true)} />
          <main className="px-4 md:px-6 lg:px-8">
            <ErrorBoundary onReset={() => { setNavHistory([]); onNav('dash'); }}>
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <LoadingSpinner text="Loading..." />
                </div>
              }>
                <div key={tab} className="section-enter">
                  {renderSection()}
                </div>
              </Suspense>
            </ErrorBoundary>
          </main>
          <BottomNav tab={tab} onNav={onNav} />
        </div>
      </div>
      <SagePopup
        open={sageOpen}
        onClose={() => setSageOpen(false)}
        onOpenFullChat={() => onNav('ai')}
        data={data}
      />
    </div>
  );
}
