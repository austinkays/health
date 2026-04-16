import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RefreshCw, Loader, Heart, Moon, Zap, Wind, Activity, Thermometer, Brain, TrendingUp, TrendingDown, Minus, ChevronDown, AlertCircle } from 'lucide-react';
import Card from '../ui/Card';
import { OuraIcon } from '../ui/OuraIcon';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { C } from '../../constants/colors';
import { fmtDate, localISODate, todayISO } from '../../utils/dates';
import { isOuraConnected, syncAllOuraData, fetchOuraSleepSessions, fetchOuraReadiness, fetchOuraTemperature, fetchOuraDailySleep, getIntradayHRToday } from '../../services/oura';

const AUTO_SYNC_INTERVAL = 5 * 60_000; // 5 minutes

/* ── Educational tooltips ──────────────────────── */
const INFO = {
  readiness: {
    title: 'What is Readiness?',
    body: 'Readiness measures how recovered your body is and how prepared you are for the day ahead. It considers your recent sleep, activity, body temperature, and resting heart rate. Scores above 70 mean you\'re well-recovered; below 60 suggests taking it easy.',
  },
  sleep: {
    title: 'Sleep Stages',
    body: 'Deep sleep restores your body and strengthens immunity. REM sleep consolidates memory and emotional processing. Light sleep transitions between stages. A healthy night typically has 15–20% deep, 20–25% REM, and 50–60% light sleep.',
  },
  hrv: {
    title: 'What is HRV?',
    body: 'Heart Rate Variability measures the variation in time between heartbeats. Higher HRV generally indicates better cardiovascular fitness and stress resilience. It fluctuates with stress, alcohol, illness, and exercise recovery.',
  },
  temp: {
    title: 'Temperature Deviation',
    body: 'Oura tracks how your skin temperature deviates from your personal baseline. Small variations (±0.5°C) are normal. Larger deviations may indicate illness, hormonal changes, or recovery needs. Note: not all Oura ring models support temperature tracking.',
  },
};

function InfoCard({ info }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left bg-transparent border-none p-0 cursor-pointer"
      aria-expanded={open}
    >
      <div className="flex items-center gap-1.5">
        <Brain size={10} className="text-salve-lav" />
        <span className="text-[12px] text-salve-lav font-montserrat font-medium">{info.title}</span>
        <ChevronDown size={10} className={`text-salve-lav transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <p className="text-[12px] text-salve-textMid font-montserrat leading-relaxed mt-1.5 ml-4">{info.body}</p>
      )}
    </button>
  );
}

function trendIcon(current, previous) {
  if (!current || !previous) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.5) return <Minus size={10} className="text-salve-textFaint" />;
  return diff > 0
    ? <TrendingUp size={10} className="text-salve-sage" />
    : <TrendingDown size={10} className="text-salve-amber" />;
}

function StatCard({ icon: Icon, label, value, unit, sub, color, trend }) {
  return (
    <div className="bg-salve-card2 border border-salve-border rounded-xl p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon size={12} style={{ color }} />
        <span className="text-[12px] text-salve-textFaint font-montserrat uppercase tracking-wider">{label}</span>
        {trend}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[22px] font-playfair font-semibold" style={{ color }}>{value ?? ', '}</span>
        {unit && <span className="text-[13px] text-salve-textFaint">{unit}</span>}
      </div>
      {sub && <span className="text-[12px] text-salve-textFaint leading-snug">{sub}</span>}
    </div>
  );
}

function SleepBar({ label, pct, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-salve-textFaint w-12 text-right font-montserrat">{label}</span>
      <div className="flex-1 h-2 bg-salve-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <span className="text-[12px] text-salve-textMid w-8 font-montserrat">{Math.round(pct)}%</span>
    </div>
  );
}

/**
 * Lightweight SVG sparkline for intraday HR data.
 * No Recharts dependency — just a polyline with gradient fill.
 */
function IntradayHRChart({ readings }) {
  const W = 400;
  const H = 80;
  const PAD = 2;

  const bpms = readings.map(r => r.bpm).filter(Boolean);
  if (bpms.length < 3) return null;

  const min = Math.min(...bpms) - 5;
  const max = Math.max(...bpms) + 5;
  const range = max - min || 1;

  const points = bpms.map((bpm, i) => {
    const x = PAD + (i / (bpms.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - ((bpm - min) / range) * (H - 2 * PAD);
    return `${x},${y}`;
  });

  const polyline = points.join(' ');
  // Closed path for gradient fill
  const fillPath = `M${PAD},${H} ${points.map((p, i) => (i === 0 ? 'L' : '') + p).join(' L')} L${W - PAD},${H} Z`;

  // Time labels (first, mid, last)
  const fmtTime = (ts) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    catch { return ''; }
  };
  const firstTime = fmtTime(readings[0]?.time);
  const lastTime = fmtTime(readings[readings.length - 1]?.time);
  const midTime = fmtTime(readings[Math.floor(readings.length / 2)]?.time);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none" role="img" aria-label={`Heart rate today: ${bpms.length} readings, range ${Math.min(...bpms)}-${Math.max(...bpms)} bpm`}>
        <defs>
          <linearGradient id="hr-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.rose} stopOpacity="0.3" />
            <stop offset="100%" stopColor={C.rose} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#hr-fill)" />
        <polyline points={polyline} fill="none" stroke={C.rose} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between px-1 -mt-1">
        <span className="text-[9px] text-salve-textFaint font-montserrat">{firstTime}</span>
        <span className="text-[9px] text-salve-textFaint font-montserrat">{midTime}</span>
        <span className="text-[9px] text-salve-textFaint font-montserrat">{lastTime}</span>
      </div>
    </div>
  );
}

export default function OuraRing({ data, addItem, onNav }) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);

  const connected = isOuraConnected();

  // Fetch fresh Oura data directly (not from DB, real-time from API)
  const fetchLiveData = useCallback(async () => {
    if (!connected) return;
    try {
      const end = todayISO();
      const start7 = localISODate(new Date(Date.now() - 7 * 86400000));
      const start1 = localISODate(new Date(Date.now() - 1 * 86400000));

      const [sleepSessions, dailySleep, readiness, temperature] = await Promise.allSettled([
        fetchOuraSleepSessions(start7, end),
        fetchOuraDailySleep(start7, end),
        fetchOuraReadiness(start7, end),
        fetchOuraTemperature(start7, end),
      ]);

      setLiveData({
        sleep: sleepSessions.status === 'fulfilled' ? sleepSessions.value : [],
        dailySleep: dailySleep.status === 'fulfilled' ? dailySleep.value : [],
        readiness: readiness.status === 'fulfilled' ? readiness.value : [],
        temperature: temperature.status === 'fulfilled' ? temperature.value : [],
      });
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [connected]);

  // Auto-sync on mount + save to DB
  useEffect(() => {
    if (!connected) { setLoading(false); return; }

    // Fetch live data immediately
    fetchLiveData();

    // Sync to DB
    const baseline = parseFloat(localStorage.getItem('salve:oura-baseline')) || 97.7;
    syncAllOuraData(data, addItem, 7, baseline)
      .then(() => setLastSync(new Date()))
      .catch(() => {});

    // Periodic refresh
    const interval = setInterval(() => {
      fetchLiveData();
      syncAllOuraData(data, addItem, 2, baseline)
        .then(() => setLastSync(new Date()))
        .catch(() => {});
    }, AUTO_SYNC_INTERVAL);

    return () => clearInterval(interval);
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual sync
  const handleSync = async () => {
    setSyncing(true);
    const baseline = parseFloat(localStorage.getItem('salve:oura-baseline')) || 97.7;
    try {
      await syncAllOuraData(data, addItem, 30, baseline);
      await fetchLiveData();
      setLastSync(new Date());
    } catch { /* toast handles errors */ }
    finally { setSyncing(false); }
  };

  // ── Intraday HR (5-min intervals, near-real-time) ──
  const [intradayHR, setIntradayHR] = useState(null);
  const intradayTimerRef = useRef(null);

  useEffect(() => {
    if (!connected) return;

    const fetchIntraday = () => {
      getIntradayHRToday()
        .then(hr => { if (hr) setIntradayHR(hr); })
        .catch(() => {}); // silent — intraday not available on all ring models
    };

    // Fetch immediately
    fetchIntraday();

    // Poll every 5 minutes, but only when tab is visible
    const poll = () => {
      if (document.visibilityState === 'visible') fetchIntraday();
    };
    intradayTimerRef.current = setInterval(poll, AUTO_SYNC_INTERVAL);

    return () => { if (intradayTimerRef.current) clearInterval(intradayTimerRef.current); };
  }, [connected]);

  // Parse latest data
  const latest = useMemo(() => {
    if (!liveData) return null;

    // Latest sleep (most recent by day)
    const sleepByDay = {};
    for (const s of liveData.sleep) {
      if (!s.day) continue;
      const dur = s.total_sleep_duration || 0;
      if (!sleepByDay[s.day] || dur > (sleepByDay[s.day].total_sleep_duration || 0)) {
        sleepByDay[s.day] = s;
      }
    }
    const sleepDays = Object.keys(sleepByDay).sort().reverse();
    const latestSleep = sleepByDay[sleepDays[0]] || null;
    const prevSleep = sleepByDay[sleepDays[1]] || null;

    // Latest readiness
    const readinessSorted = [...liveData.readiness].sort((a, b) => (b.day || '').localeCompare(a.day || ''));
    const latestReadiness = readinessSorted[0] || null;
    const prevReadiness = readinessSorted[1] || null;

    // Latest daily sleep score
    const dailySleepSorted = [...liveData.dailySleep].sort((a, b) => (b.day || '').localeCompare(a.day || ''));
    const latestDailySleep = dailySleepSorted[0] || null;

    // Latest temperature
    const tempSorted = [...liveData.temperature].sort((a, b) => (b.day || '').localeCompare(a.day || ''));
    const latestTemp = tempSorted[0] || null;

    // 7-day averages
    const avgSleepHrs = sleepDays.length > 0
      ? sleepDays.slice(0, 7).reduce((s, d) => s + ((sleepByDay[d]?.total_sleep_duration || 0) / 3600), 0) / Math.min(7, sleepDays.length)
      : null;
    const avgReadiness = readinessSorted.length > 0
      ? readinessSorted.slice(0, 7).reduce((s, r) => s + (r.score || 0), 0) / Math.min(7, readinessSorted.length)
      : null;

    return {
      sleep: latestSleep,
      prevSleep,
      readiness: latestReadiness,
      prevReadiness,
      dailySleep: latestDailySleep,
      temp: latestTemp,
      avgSleepHrs,
      avgReadiness,
      sleepHistory: sleepDays.slice(0, 7).map(d => sleepByDay[d]).reverse(),
      readinessHistory: readinessSorted.slice(0, 7).reverse(),
    };
  }, [liveData]);

  if (!connected) {
    return (
      <div className="mt-2">
        <EmptyState icon={OuraIcon} text="Oura Ring not connected" motif="sparkle" />
        <div className="text-center mt-3">
          <button
            onClick={() => onNav('settings')}
            className="text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline"
          >Connect in Settings →</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-2 flex flex-col items-center justify-center py-16 gap-3">
        <Loader size={20} className="animate-spin text-salve-sage" />
        <span className="text-xs text-salve-textFaint font-montserrat">Loading Oura data...</span>
      </div>
    );
  }

  const sleepHrs = latest?.sleep?.total_sleep_duration ? Math.round((latest.sleep.total_sleep_duration / 3600) * 10) / 10 : null;
  const prevSleepHrs = latest?.prevSleep?.total_sleep_duration ? Math.round((latest.prevSleep.total_sleep_duration / 3600) * 10) / 10 : null;
  const rhr = latest?.sleep?.lowest_heart_rate;
  const hrv = latest?.sleep?.average_hrv ? Math.round(latest.sleep.average_hrv) : null;
  const efficiency = latest?.sleep?.efficiency;
  const readinessScore = latest?.readiness?.score;
  const prevReadinessScore = latest?.prevReadiness?.score;
  const sleepScore = latest?.dailySleep?.score;
  const tempDev = latest?.temp?.temperature_deviation;

  return (
    <div className="mt-2">
      {/* Sync bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <OuraIcon size={11} className="text-salve-sage" />
          <span className="text-[12px] text-salve-textFaint font-montserrat">
            {lastSync ? `Synced ${lastSync.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Auto-syncing every 5 min'}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-salve-sage text-salve-sage pulse-dot" />
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1 text-[12px] text-salve-sage font-montserrat bg-transparent border-none cursor-pointer hover:underline disabled:opacity-50"
        >
          <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync now'}
        </button>
      </div>

      {/* Today's overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard
          icon={Moon} label="Sleep" color={C.lav}
          value={sleepHrs} unit="hrs"
          sub={sleepScore ? `Score: ${sleepScore}/100` : null}
          trend={trendIcon(sleepHrs, prevSleepHrs)}
        />
        <StatCard
          icon={Zap} label="Readiness" color={C.sage}
          value={readinessScore} unit="/100"
          sub={latest?.avgReadiness ? `7d avg: ${Math.round(latest.avgReadiness)}` : null}
          trend={trendIcon(readinessScore, prevReadinessScore)}
        />
        <StatCard
          icon={Heart} label="Resting HR" color={C.rose}
          value={rhr} unit="bpm"
          sub={hrv ? `HRV: ${hrv}ms` : null}
        />
        <StatCard
          icon={Thermometer} label="Temp" color={C.amber}
          value={tempDev != null ? (tempDev > 0 ? '+' : '') + tempDev.toFixed(2) : null} unit="°C"
          sub={tempDev != null ? 'Deviation from baseline' : 'Not available'}
        />
      </div>

      {/* Intraday Heart Rate — live 5-min readings */}
      {intradayHR && intradayHR.readings.length > 2 && (
        <Card className="mb-3 !p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Heart size={12} className="text-salve-rose" />
              <span className="text-[12px] text-salve-textFaint font-montserrat uppercase tracking-wider">Live Heart Rate</span>
              <span className="w-1.5 h-1.5 rounded-full bg-salve-rose pulse-dot" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[22px] font-playfair font-semibold text-salve-rose">{intradayHR.current}</span>
              <span className="text-[12px] text-salve-textFaint">bpm</span>
            </div>
          </div>

          {/* Mini stats row */}
          <div className="flex gap-4 mb-2.5">
            <span className="text-[11px] text-salve-textFaint font-montserrat">
              Min <strong className="text-salve-text">{intradayHR.min}</strong>
            </span>
            <span className="text-[11px] text-salve-textFaint font-montserrat">
              Avg <strong className="text-salve-text">{intradayHR.avg}</strong>
            </span>
            <span className="text-[11px] text-salve-textFaint font-montserrat">
              Max <strong className="text-salve-text">{intradayHR.max}</strong>
            </span>
            <span className="text-[11px] text-salve-textFaint font-montserrat ml-auto">
              {intradayHR.readings.length} readings today
            </span>
          </div>

          {/* SVG sparkline chart — 5-min intraday HR */}
          <IntradayHRChart readings={intradayHR.readings} />
        </Card>
      )}

      {/* Temp not available hint */}
      {tempDev == null && liveData?.temperature?.length === 0 && (
        <div className="flex items-start gap-2 px-3 py-2 mb-3 bg-salve-card2 border border-salve-border rounded-lg">
          <AlertCircle size={12} className="text-salve-amber mt-0.5 shrink-0" />
          <span className="text-[12px] text-salve-textMid font-montserrat leading-relaxed">
            Temperature data isn't available. This requires a Gen3 Oura Ring and may take a few days of consistent wear to calibrate your baseline.
          </span>
        </div>
      )}

      {/* BBT Baseline config */}
      <Card className="mb-3 !p-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-salve-textFaint font-montserrat uppercase tracking-wider">BBT Baseline</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            step="0.1"
            value={parseFloat(localStorage.getItem('salve:oura-baseline')) || 97.7}
            onChange={e => {
              const v = parseFloat(e.target.value);
              if (v && v > 90 && v < 105) localStorage.setItem('salve:oura-baseline', String(v));
            }}
            className="w-20 bg-salve-card2 border border-salve-border rounded-lg px-2 py-1.5 text-sm text-salve-text font-montserrat outline-none focus:border-salve-lav text-center"
          />
          <span className="text-[13px] text-salve-textFaint font-montserrat">°F</span>
          <p className="flex-1 text-[12px] text-salve-textFaint font-montserrat leading-relaxed">
            Oura measures deviation from your baseline. Average waking BBT is ~97.7°F. Adjust if yours differs.
          </p>
        </div>
      </Card>

      {/* Educational info */}
      <Card className="mb-3 space-y-2.5">
        <InfoCard info={INFO.readiness} />
        <InfoCard info={INFO.sleep} />
        <InfoCard info={INFO.hrv} />
        <InfoCard info={INFO.temp} />
      </Card>

      {/* Sleep + Readiness breakdown */}
      <div className="md:grid md:grid-cols-2 md:gap-4">
      {latest?.sleep && (
        <Card className="mb-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider">Last Night's Sleep</span>
            <span className="text-[12px] text-salve-textFaint">{latest.sleep.day}</span>
          </div>
          <div className="space-y-2">
            {latest.sleep.deep_sleep_duration != null && (
              <SleepBar label="Deep" pct={(latest.sleep.deep_sleep_duration / (latest.sleep.total_sleep_duration || 1)) * 100} color={C.lav} />
            )}
            {latest.sleep.rem_sleep_duration != null && (
              <SleepBar label="REM" pct={(latest.sleep.rem_sleep_duration / (latest.sleep.total_sleep_duration || 1)) * 100} color={C.sage} />
            )}
            {latest.sleep.light_sleep_duration != null && (
              <SleepBar label="Light" pct={(latest.sleep.light_sleep_duration / (latest.sleep.total_sleep_duration || 1)) * 100} color={C.amber} />
            )}
            {latest.sleep.awake_time != null && (
              <SleepBar label="Awake" pct={(latest.sleep.awake_time / (latest.sleep.total_sleep_duration || 1)) * 100} color={C.rose} />
            )}
          </div>
          <div className="flex gap-3 mt-2.5 pt-2 border-t border-salve-border/50">
            {efficiency != null && (
              <span className="text-[12px] text-salve-textMid font-montserrat">Efficiency: <strong className="text-salve-text">{efficiency}%</strong></span>
            )}
            {latest.sleep.latency != null && (
              <span className="text-[12px] text-salve-textMid font-montserrat">Fell asleep in: <strong className="text-salve-text">{Math.round(latest.sleep.latency / 60)}min</strong></span>
            )}
          </div>
        </Card>
      )}

      {/* Readiness contributors */}
      {latest?.readiness?.contributors && (
        <Card className="mb-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider">Readiness Breakdown</span>
            <Badge label={`${readinessScore}/100`} color={readinessScore >= 70 ? C.sage : readinessScore >= 50 ? C.amber : C.rose} bg={(readinessScore >= 70 ? C.sage : readinessScore >= 50 ? C.amber : C.rose) + '20'} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {Object.entries(latest.readiness.contributors).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[12px] text-salve-textMid font-montserrat capitalize">{key.replace(/_/g, ' ')}</span>
                <span className={`text-[12px] font-medium ${val >= 70 ? 'text-salve-sage' : val >= 50 ? 'text-salve-amber' : 'text-salve-rose'}`}>{val ?? ', '}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      </div>

      {/* 7-day history */}
      <div className="md:grid md:grid-cols-2 md:gap-4">
      {latest?.sleepHistory?.length > 1 && (
        <Card className="mb-3">
          <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider block mb-2.5">7-Day Sleep</span>
          <div className="flex items-end gap-1 h-20">
            {latest.sleepHistory.map((s, i) => {
              const hrs = (s.total_sleep_duration || 0) / 3600;
              const maxHrs = 10;
              const pct = Math.min(100, (hrs / maxHrs) * 100);
              const isLast = i === latest.sleepHistory.length - 1;
              return (
                <div key={s.day} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[8px] text-salve-textFaint font-montserrat">{hrs.toFixed(1)}</span>
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${pct}%`,
                      background: isLast ? C.lav : C.lav + '40',
                      minHeight: '4px',
                    }}
                  />
                  <span className="text-[8px] text-salve-textFaint font-montserrat">
                    {new Date(s.day + 'T00:00:00').toLocaleDateString([], { weekday: 'short' }).slice(0, 2)}
                  </span>
                </div>
              );
            })}
          </div>
          {latest.avgSleepHrs && (
            <div className="text-[12px] text-salve-textFaint text-center mt-1.5">
              7-day avg: <strong className="text-salve-text">{latest.avgSleepHrs.toFixed(1)} hrs</strong>
            </div>
          )}
        </Card>
      )}

      {/* 7-day readiness history */}
      {latest?.readinessHistory?.length > 1 && (
        <Card className="mb-3">
          <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider block mb-2.5">7-Day Readiness</span>
          <div className="flex items-end gap-1 h-20">
            {latest.readinessHistory.map((r, i) => {
              const score = r.score || 0;
              const isLast = i === latest.readinessHistory.length - 1;
              const color = score >= 70 ? C.sage : score >= 50 ? C.amber : C.rose;
              return (
                <div key={r.day} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[8px] text-salve-textFaint font-montserrat">{score}</span>
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${score}%`,
                      background: isLast ? color : color + '40',
                      minHeight: '4px',
                    }}
                  />
                  <span className="text-[8px] text-salve-textFaint font-montserrat">
                    {new Date(r.day + 'T00:00:00').toLocaleDateString([], { weekday: 'short' }).slice(0, 2)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      </div>

      <div className="text-center py-2">
        <button
          onClick={() => onNav('settings')}
          className="text-[12px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors"
        >
          Oura Ring settings →
        </button>
      </div>
    </div>
  );
}
