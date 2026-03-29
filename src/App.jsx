import { useState, useEffect, useMemo, useCallback } from 'react';
import { getSession, onAuthChange } from './services/auth';
import { supabase } from './services/supabase';
import Auth from './components/Auth';
import Header from './components/layout/Header';
import BottomNav from './components/layout/BottomNav';
import useHealthData from './hooks/useHealthData';
import useSafetyScan from './hooks/useSafetyScan';
import { checkInteractions } from './utils/interactions';

import Dashboard from './components/sections/Dashboard';
import Medications from './components/sections/Medications';
import Vitals from './components/sections/Vitals';
import Appointments from './components/sections/Appointments';
import Conditions from './components/sections/Conditions';
import Providers from './components/sections/Providers';
import Allergies from './components/sections/Allergies';
import Journal from './components/sections/Journal';
import AIPanel from './components/sections/AIPanel';
import Interactions from './components/sections/Interactions';
import Settings from './components/sections/Settings';
import LoadingSpinner from './components/ui/LoadingSpinner';

// New comprehensive sections
import Labs from './components/sections/Labs';
import Procedures from './components/sections/Procedures';
import Immunizations from './components/sections/Immunizations';
import CareGaps from './components/sections/CareGaps';
import AnesthesiaFlags from './components/sections/AnesthesiaFlags';
import Appeals from './components/sections/Appeals';
import SurgicalPlanning from './components/sections/SurgicalPlanning';
import Insurance from './components/sections/Insurance';

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState('dash');
  const { data, loading: dataLoading, addItem, updateItem, removeItem, updateSettings, eraseAll, reloadData } = useHealthData(session);

  const interactions = useMemo(() => checkInteractions(data.meds), [data.meds]);
  const safetyScan = useSafetyScan(data, interactions);

  const SAFETY_TABLES = useMemo(() => new Set(['medications', 'conditions', 'allergies']), []);

  const addItemWithSafety = useCallback(async (table, item) => {
    const result = await addItem(table, item);
    if (SAFETY_TABLES.has(table)) safetyScan.triggerScan();
    return result;
  }, [addItem, safetyScan, SAFETY_TABLES]);

  const updateItemWithSafety = useCallback(async (table, id, changes) => {
    const result = await updateItem(table, id, changes);
    if (SAFETY_TABLES.has(table)) safetyScan.triggerScan();
    return result;
  }, [updateItem, safetyScan, SAFETY_TABLES]);

  const removeItemWithSafety = useCallback(async (table, id) => {
    const result = await removeItem(table, id);
    if (SAFETY_TABLES.has(table)) safetyScan.triggerScan();
    return result;
  }, [removeItem, safetyScan, SAFETY_TABLES]);

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

    const subscription = onAuthChange(s => {
      setSession(s);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
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
    return <Auth />;
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-salve-bg flex items-center justify-center">
        <LoadingSpinner text="Loading your health data..." />
      </div>
    );
  }

  const renderSection = () => {
    const shared = { data, addItem: addItemWithSafety, updateItem: updateItemWithSafety, removeItem: removeItemWithSafety };
    switch (tab) {
      case 'dash':        return <Dashboard {...shared} interactions={interactions} safetyScan={safetyScan} onNav={onNav} />;
      case 'meds':        return <Medications {...shared} interactions={interactions} />;
      case 'vitals':      return <Vitals {...shared} />;
      case 'appts':       return <Appointments {...shared} />;
      case 'conditions':  return <Conditions {...shared} />;
      case 'providers':   return <Providers {...shared} />;
      case 'allergies':   return <Allergies {...shared} />;
      case 'journal':     return <Journal {...shared} />;
      case 'ai':          return <AIPanel data={data} safetyScan={safetyScan} />;
      case 'interactions':return <Interactions interactions={interactions} meds={data.meds} safetyScan={safetyScan} />;
      case 'settings':    return <Settings data={data} updateSettings={updateSettings} eraseAll={eraseAll} reloadData={reloadData} triggerScan={safetyScan.triggerScan} />;
      // Comprehensive sections
      case 'labs':        return <Labs {...shared} />;
      case 'procedures':  return <Procedures {...shared} />;
      case 'immunizations':return <Immunizations {...shared} />;
      case 'care_gaps':   return <CareGaps {...shared} />;
      case 'anesthesia':  return <AnesthesiaFlags {...shared} />;
      case 'appeals':     return <Appeals {...shared} />;
      case 'surgical':    return <SurgicalPlanning {...shared} />;
      case 'insurance':   return <Insurance {...shared} />;
      default:            return <Dashboard {...shared} interactions={interactions} safetyScan={safetyScan} onNav={onNav} />;
    }
  };

  return (
    <div className="min-h-screen bg-salve-bg">
      <div className="max-w-[480px] mx-auto pb-24 relative">
        <Header tab={tab} name={data.settings.name} onBack={() => onNav('dash')} />
        <div className="px-4">
          {renderSection()}
        </div>
        <p className="text-center text-salve-textFaint text-[11px] tracking-wide py-4 font-montserrat">
          built with <span className="text-salve-rose">♥</span> for my best friend & soulmate
        </p>
        <BottomNav tab={tab} onNav={onNav} />
      </div>
    </div>
  );
}
