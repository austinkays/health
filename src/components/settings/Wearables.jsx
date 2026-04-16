import { useState, useEffect } from 'react';
import { Heart, Loader, RefreshCw, Unlink, ChevronDown, ChevronUp, X } from 'lucide-react';
import Card from '../ui/Card';
import { useToast } from '../ui/Toast';
import { OuraIcon } from '../ui/OuraIcon';
import { isOuraConnected, getOuraAuthUrl, exchangeOuraCode, clearOuraTokens, syncAllOuraData } from '../../services/oura';
import { isDexcomConnected, getDexcomAuthUrl, exchangeDexcomCode, clearDexcomTokens, syncDexcomGlucose, DEXCOM_ENABLED } from '../../services/dexcom';
import { isWithingsConnected, getWithingsAuthUrl, exchangeWithingsCode, clearWithingsTokens, syncWithingsMeasurements, WITHINGS_ENABLED } from '../../services/withings';
import { isFitbitConnected, getFitbitAuthUrl, exchangeFitbitCode, clearFitbitTokens, syncFitbitData, FITBIT_ENABLED } from '../../services/fitbit';
import { isWhoopConnected, getWhoopAuthUrl, exchangeWhoopCode, clearWhoopTokens, syncWhoopData, WHOOP_ENABLED } from '../../services/whoop';
import { getHiddenSources, hideSource } from '../../utils/hiddenSources';

export default function Wearables({
  data,
  addItem,
  addItemSilent,
  reloadData,
  onNav,
  demoMode,
  expandedSource,
  setExpandedSource,
  toggleSource,
  sourceCounts,
}) {
  const showToast = useToast();
  const [hiddenSources, setHiddenSources] = useState(() => getHiddenSources());
  const handleHideSource = (id) => {
    hideSource(id);
    setHiddenSources(getHiddenSources());
    if (expandedSource === id) setExpandedSource(null);
  };

  // Oura state
  const [ouraConnected, setOuraConnected] = useState(() => isOuraConnected());
  const [ouraLoading, setOuraLoading] = useState(false);
  const [ouraError, setOuraError] = useState(null);
  const [ouraSuccess, setOuraSuccess] = useState(null);
  const [ouraSyncing, setOuraSyncing] = useState(false);
  const [ouraBaseline] = useState(() => localStorage.getItem('salve:oura-baseline') || '97.7');

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

      const parts = [];
      const errors = [];
      for (const [key, val] of Object.entries(results)) {
        if (val.error) { errors.push(`${key}: ${val.error}`); continue; }
        if (val.added > 0) parts.push(`${val.added} ${key}`);
      }

      if (parts.length > 0) {
        const total = Object.values(results).reduce((n, v) => n + (v.added || 0), 0);
        setOuraSuccess(`Synced ${parts.join(', ')} from Oura.${errors.length ? '\nFailed: ' + errors.join('; ') : ''}`);
        showToast(`${total} new from Oura ✓`);
        await reloadData?.();
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

  // Dexcom state
  const [dexcomConnected, setDexcomConnected] = useState(() => isDexcomConnected());
  const [dexcomLoading, setDexcomLoading] = useState(false);
  const [dexcomError, setDexcomError] = useState(null);
  const [dexcomSuccess, setDexcomSuccess] = useState(null);
  const [dexcomSyncing, setDexcomSyncing] = useState(false);

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
      const { added, skipped } = await syncDexcomGlucose(data.vitals || [], addItemSilent, 14);
      setDexcomSuccess(added > 0
        ? `Synced ${added} day${added !== 1 ? 's' : ''} of glucose data${skipped > 0 ? ` (${skipped} already had readings)` : ''}.`
        : 'No new readings to sync.');
      if (added > 0) showToast(`${added} new from Dexcom ✓`);
      reloadData?.();
    } catch (e) {
      setDexcomError(e.message);
    } finally {
      setDexcomSyncing(false);
    }
  }

  // Withings state
  const [withingsConnected, setWithingsConnected] = useState(() => isWithingsConnected());
  const [withingsLoading, setWithingsLoading] = useState(false);
  const [withingsError, setWithingsError] = useState(null);
  const [withingsSuccess, setWithingsSuccess] = useState(null);
  const [withingsSyncing, setWithingsSyncing] = useState(false);

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
      const { added } = await syncWithingsMeasurements(data.vitals || [], addItemSilent, 30);
      setWithingsSuccess(added > 0
        ? `Imported ${added} new measurement${added !== 1 ? 's' : ''}.`
        : 'Already up to date — no new measurements.');
      if (added > 0) showToast(`${added} new from Withings ✓`);
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
      const { added } = await syncFitbitData(data.vitals || [], addItemSilent, 30, data.activities || []);
      setFitbitSuccess(added > 0
        ? `Imported ${added} new record${added !== 1 ? 's' : ''} from Fitbit.`
        : 'Already up to date — no new data.');
      if (added > 0) showToast(`${added} new from Fitbit ✓`);
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
      const { added } = await syncWhoopData(data.vitals || [], addItemSilent, 30);
      setWhoopSuccess(added > 0
        ? `Imported ${added} new vital${added !== 1 ? 's' : ''} from Whoop.`
        : 'Already up to date — no new data.');
      if (added > 0) showToast(`${added} new from Whoop ✓`);
      reloadData?.();
    } catch (e) {
      setWhoopError(e.message);
    } finally {
      setWhoopSyncing(false);
    }
  }

  const HideableSource = ({ id, label, children }) => {
    if (hiddenSources.includes(id)) return null;
    return (
      <div className="relative">
        {children}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleHideSource(id); }}
          aria-label={`Hide ${label}`}
          title={`Hide ${label}`}
          className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center bg-salve-card2/90 backdrop-blur-sm text-salve-textFaint hover:text-salve-rose hover:bg-salve-rose/15 transition-colors cursor-pointer border-none p-0"
        >
          <X size={11} />
        </button>
      </div>
    );
  };

  return (
    <>
      {/* ── Oura Ring ── */}
      <HideableSource id="oura" label="Oura Ring">
      <Card>
        <button onClick={() => toggleSource('oura')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ouraConnected ? 'bg-salve-sage/15' : 'bg-salve-card2'}`}>
              <OuraIcon size={16} className={ouraConnected ? 'text-salve-sage' : 'text-salve-textFaint'} />
            </div>
            <div className="text-left">
              <span className="text-[15px] text-salve-text font-medium block">Oura Ring</span>
              <span className="text-[12px] text-salve-textFaint">
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
                  <button onClick={() => onNav('oura')} className="text-[12px] text-salve-sage font-montserrat bg-transparent border-none cursor-pointer hover:underline">View Oura data →</button>
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
                <p className="text-[15px] text-salve-textMid leading-relaxed mb-3">
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
      </HideableSource>

      {/* ── Dexcom CGM ── */}
      {DEXCOM_ENABLED && (
        <HideableSource id="dexcom" label="Dexcom CGM">
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
                    Connect your Dexcom CGM to import glucose readings. Sage uses these to spot correlations between blood sugar and your symptoms, especially helpful for dysautonomia, POTS, and reactive hypoglycemia.
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
        </HideableSource>
      )}

      {/* ── Withings ── */}
      {WITHINGS_ENABLED && (
        <HideableSource id="withings" label="Withings">
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
        </HideableSource>
      )}

      {/* ── Fitbit ── */}
      {FITBIT_ENABLED && (
        <HideableSource id="fitbit" label="Fitbit">
        <Card>
          <button onClick={() => toggleSource('fitbit')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${fitbitConnected ? 'bg-salve-sage/15' : 'bg-salve-card2'}`}>
                <Heart size={14} className={fitbitConnected ? 'text-salve-sage' : 'text-salve-textFaint'} />
              </div>
              <div className="text-left">
                <span className="text-ui-lg text-salve-text font-medium block">Fitbit</span>
                <span className="text-ui-xs text-salve-textFaint">
                  {fitbitConnected ? 'Connected · sleep, HR, HRV, steps, SpO2, workouts' : 'Sleep, HR, HRV, steps, SpO2, workouts, temperature'}
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
                <div className="space-y-2">
                  <button
                    onClick={() => onNav('fitbit')}
                    className="w-full py-2 rounded-lg bg-salve-lav/10 border border-salve-lav/30 text-salve-lav text-xs font-medium font-montserrat flex items-center justify-center gap-1.5 hover:bg-salve-lav/20 transition-colors cursor-pointer"
                  >
                    View Fitbit data →
                  </button>
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
                </div>
              ) : (
                <>
                  <p className="text-ui-base text-salve-textMid leading-relaxed mb-3">
                    Connect your Fitbit to import sleep, heart rate, HRV, steps, SpO2, breathing rate, skin temperature, workouts, Active Zone Minutes, and weight. Works with any Fitbit tracker or watch.
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
        </HideableSource>
      )}

      {/* ── Whoop ── */}
      {WHOOP_ENABLED && (
        <HideableSource id="whoop" label="Whoop">
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
                    Connect your Whoop to import recovery score, HRV (RMSSD ms), resting heart rate, and sleep. Especially valuable for dysautonomia and POTS. HRV is the key marker for autonomic nervous system function.
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
        </HideableSource>
      )}
    </>
  );
}
