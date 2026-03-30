import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { getSession, onAuthChange } from './services/auth';
import { supabase } from './services/supabase';
import { cache, setupOfflineSync } from './services/cache';
import { db } from './services/db';
import Auth from './components/Auth';
import Header from './components/layout/Header';
import BottomNav from './components/layout/BottomNav';
import useHealthData from './hooks/useHealthData';
import { checkInteractions } from './utils/interactions';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ErrorBoundary from './components/ui/ErrorBoundary';

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

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [tab, setTab] = useState('dash');
  const { data, loading: dataLoading, addItem, updateItem, removeItem, updateSettings, eraseAll, reloadData } = useHealthData(session);

  const interactions = useMemo(() => checkInteractions(data.meds), [data.meds]);

  const onNav = (t) => {
    setTab(t);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
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
        setAuthLoading(false);
      });
    }

    const subscription = onAuthChange((event, s) => {
      // If the session was signed out or the token refresh failed, show expiry notice
      if (!s && (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED')) {
        setSessionExpired(true);
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

  if (!session) {
    return <Auth sessionExpired={sessionExpired} onAuthSuccess={() => setSessionExpired(false)} />;
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-salve-bg flex items-center justify-center">
        <LoadingSpinner text="Loading your health data..." />
      </div>
    );
  }

  const renderSection = () => {
    const shared = { data, addItem, updateItem, removeItem };
    switch (tab) {
      case 'dash':        return <Dashboard {...shared} interactions={interactions} onNav={onNav} />;
      case 'meds':        return <Medications {...shared} interactions={interactions} />;
      case 'vitals':      return <Vitals {...shared} />;
      case 'appts':       return <Appointments {...shared} />;
      case 'conditions':  return <Conditions {...shared} />;
      case 'providers':   return <Providers {...shared} />;
      case 'allergies':   return <Allergies {...shared} />;
      case 'journal':     return <Journal {...shared} />;
      case 'ai':          return <AIPanel data={data} />;
      case 'interactions':return <Interactions interactions={interactions} meds={data.meds} />;
      case 'settings':    return <Settings data={data} updateSettings={updateSettings} eraseAll={eraseAll} reloadData={reloadData} />;
      // Comprehensive sections
      case 'labs':        return <Labs {...shared} />;
      case 'procedures':  return <Procedures {...shared} />;
      case 'immunizations':return <Immunizations {...shared} />;
      case 'care_gaps':   return <CareGaps {...shared} />;
      case 'anesthesia':  return <AnesthesiaFlags {...shared} />;
      case 'appeals':     return <Appeals {...shared} />;
      case 'surgical':    return <SurgicalPlanning {...shared} />;
      case 'insurance':   return <Insurance {...shared} />;
      default:            return <Dashboard {...shared} interactions={interactions} onNav={onNav} />;
    }
  };

  return (
    <div className="min-h-screen bg-salve-bg">
      <div className="max-w-[480px] mx-auto pb-24 relative">
        <Header tab={tab} name={data.settings.name} onBack={() => onNav('dash')} />
        <main className="px-4">
          <ErrorBoundary onReset={() => onNav('dash')}>
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner text="Loading..." />
              </div>
            }>
              {renderSection()}
            </Suspense>
          </ErrorBoundary>
        </main>
        <BottomNav tab={tab} onNav={onNav} />
      </div>
    </div>
  );
}
