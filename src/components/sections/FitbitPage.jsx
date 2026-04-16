import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Loader, Heart, Moon, Activity, Thermometer, Brain, Wind, Footprints, Zap, Flame, TrendingUp, TrendingDown, Minus, ChevronDown, Battery, BatteryLow, BatteryMedium, BatteryFull, Watch, Dumbbell } from 'lucide-react';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import { C } from '../../constants/colors';
import { fmtDate } from '../../utils/dates';
import { isFitbitConnected, syncFitbitData, fetchFitbitDevices, fetchFitbitProfile } from '../../services/fitbit';

const AUTO_SYNC_INTERVAL = 5 * 60_000; // 5 minutes

/* ── Educational tooltips ──────────────────────── */
const INFO = {
  hrv: {
    title: 'What is HRV?',
    body: 'Heart Rate Variability (HRV) measures the variation in time between heartbeats. Higher HRV generally indicates better cardiovascular fitness, stress resilience, and recovery. It fluctuates with stress, alcohol, illness, and exercise.',
  },
  spo2: {
    title: 'What is SpO2?',
    body: 'SpO2 (blood oxygen saturation) measures the percentage of oxygen-carrying hemoglobin in your blood. Normal levels are 95–100%. Consistently low readings may indicate respiratory or cardiovascular conditions. Sleep apnea can cause overnight dips.',
  },
  vo2max: {
    title: 'What is VO2 Max?',
    body: 'VO2 Max estimates your body\'s maximum rate of oxygen consumption during exercise — a key indicator of cardiorespiratory fitness. Higher values indicate better aerobic capacity. It improves with consistent cardiovascular training.',
  },
  azm: {
    title: 'Active Zone Minutes',
    body: 'Active Zone Minutes track time spent in fat-burn, cardio, and peak heart rate zones. The AHA recommends 150 minutes of moderate or 75 minutes of vigorous activity per week. Double minutes are earned in cardio and peak zones.',
  },
  temp: {
    title: 'Skin Temperature',
    body: 'Your Fitbit tracks nightly skin temperature variation from your personal baseline. Small changes (±1°C) are normal. Larger deviations may indicate illness, hormonal changes, or environmental factors. Requires several nights of wear to establish a baseline.',
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
  if (current == null || previous == null) return null;
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
        <span className="text-[22px] font-playfair font-semibold" style={{ color }}>{value ?? '–'}</span>
        {unit && <span className="text-[13px] text-salve-textFaint">{unit}</span>}
      </div>
      {sub && <span className="text-[12px] text-salve-textFaint leading-snug">{sub}</span>}
    </div>
  );
}

function BarChart({ data, maxVal, colorFn, label }) {
  if (!data || data.length < 2) return null;
  return (
    <Card className="mb-3">
      <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider block mb-2.5">{label}</span>
      <div className="flex items-end gap-1 h-20">
        {data.map((d, i) => {
          const pct = maxVal > 0 ? Math.min(100, (d.value / maxVal) * 100) : 0;
          const isLast = i === data.length - 1;
          const color = colorFn ? colorFn(d.value) : C.lav;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
              <span className="text-[8px] text-salve-textFaint font-montserrat">{d.label}</span>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: d.value > 0 ? `${Math.max(pct, 4)}%` : '2px',
                  background: d.value > 0 ? (isLast ? color : color + '55') : C.border,
                  minHeight: d.value > 0 ? '4px' : '2px',
                }}
              />
              <span className="text-[8px] text-salve-textFaint font-montserrat">{d.day}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BatteryIcon({ level }) {
  if (level == null) return <Battery size={14} className="text-salve-textFaint" />;
  if (level === 'High' || level === 'Full') return <BatteryFull size={14} className="text-salve-sage" />;
  if (level === 'Medium') return <BatteryMedium size={14} className="text-salve-amber" />;
  if (level === 'Low' || level === 'Empty') return <BatteryLow size={14} className="text-salve-rose" />;
  return <Battery size={14} className="text-salve-textFaint" />;
}

export default function FitbitPage({ data, addItem, onNav }) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [devices, setDevices] = useState(null);
  const [loading, setLoading] = useState(true);

  const connected = isFitbitConnected();

  // Fetch device info
  const fetchDeviceInfo = useCallback(async () => {
    if (!connected) return;
    try {
      const devs = await fetchFitbitDevices();
      setDevices(Array.isArray(devs) ? devs : []);
    } catch { /* silent */ }
  }, [connected]);

  // Auto-sync on mount
  useEffect(() => {
    if (!connected) { setLoading(false); return; }

    fetchDeviceInfo();

    // Sync vitals to DB (2-day window for periodic)
    syncFitbitData(data.vitals || [], addItem, 7, data.activities || [])
      .then(() => setLastSync(new Date()))
      .catch(() => {})
      .finally(() => setLoading(false));

    // Periodic refresh
    const interval = setInterval(() => {
      syncFitbitData(data.vitals || [], addItem, 2, data.activities || [])
        .then(() => setLastSync(new Date()))
        .catch(() => {});
      fetchDeviceInfo();
    }, AUTO_SYNC_INTERVAL);

    return () => clearInterval(interval);
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual sync
  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncFitbitData(data.vitals || [], addItem, 30, data.activities || []);
      await fetchDeviceInfo();
      setLastSync(new Date());
    } catch { /* toast handles errors */ }
    finally { setSyncing(false); }
  };

  // Parse latest Fitbit data from vitals already synced to DB
  const latest = useMemo(() => {
    const fitbitVitals = (data.vitals || []).filter(v => v.source === 'fitbit');
    const fitbitActivities = (data.activities || []).filter(a => a.source === 'fitbit');

    const byType = (type) => fitbitVitals
      .filter(v => v.type === type)
      .sort((a, b) => b.date.localeCompare(a.date));

    const last7 = (type) => {
      const sorted = byType(type);
      const days = [];
      const seen = new Set();
      for (const v of sorted) {
        if (seen.has(v.date) || days.length >= 7) continue;
        seen.add(v.date);
        days.push(v);
      }
      return days.reverse();
    };

    const latestOf = (type) => byType(type)[0] || null;
    const prevOf = (type) => byType(type)[1] || null;

    // 7-day avg
    const avg7 = (type) => {
      const items = last7(type);
      if (items.length === 0) return null;
      return Math.round(items.reduce((s, v) => s + v.value, 0) / items.length * 10) / 10;
    };

    // Recent activities
    const recentActivities = fitbitActivities
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7);

    return {
      sleep: latestOf('sleep'), prevSleep: prevOf('sleep'),
      hr: latestOf('hr'), prevHr: prevOf('hr'),
      steps: latestOf('steps'), prevSteps: prevOf('steps'),
      spo2: latestOf('spo2'),
      hrv: latestOf('hrv'), prevHrv: prevOf('hrv'),
      resp: latestOf('resp'),
      temp: latestOf('temp'),
      weight: latestOf('weight'),
      azm: latestOf('azm'),
      avgSleep: avg7('sleep'),
      avgSteps: avg7('steps'),
      avgHr: avg7('hr'),
      sleepHistory: last7('sleep'),
      stepsHistory: last7('steps'),
      hrHistory: last7('hr'),
      hrvHistory: last7('hrv'),
      recentActivities,
    };
  }, [data.vitals, data.activities]);

  if (!connected) {
    return (
      <div className="mt-2">
        <EmptyState icon={Watch} text="Fitbit not connected" motif="sparkle" />
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
        <span className="text-xs text-salve-textFaint font-montserrat">Loading Fitbit data...</span>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {/* Sync bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Watch size={11} className="text-salve-sage" />
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

      {/* Primary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard
          icon={Moon} label="Sleep" color={C.lav}
          value={latest.sleep?.value} unit="hrs"
          sub={latest.avgSleep ? `7d avg: ${latest.avgSleep}` : null}
          trend={trendIcon(latest.sleep?.value, latest.prevSleep?.value)}
        />
        <StatCard
          icon={Heart} label="Resting HR" color={C.rose}
          value={latest.hr?.value} unit="bpm"
          sub={latest.avgHr ? `7d avg: ${latest.avgHr}` : null}
          trend={trendIcon(latest.hr?.value, latest.prevHr?.value)}
        />
        <StatCard
          icon={Footprints} label="Steps" color={C.sage}
          value={latest.steps?.value?.toLocaleString()} unit=""
          sub={latest.avgSteps ? `7d avg: ${Math.round(latest.avgSteps).toLocaleString()}` : null}
          trend={trendIcon(latest.steps?.value, latest.prevSteps?.value)}
        />
        <StatCard
          icon={Wind} label="SpO2" color={C.amber}
          value={latest.spo2?.value} unit="%"
          sub={latest.spo2?.notes || null}
        />
      </div>

      {/* Secondary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard
          icon={Activity} label="HRV" color={C.lav}
          value={latest.hrv?.value} unit="ms"
          sub={latest.hrv?.notes || null}
          trend={trendIcon(latest.hrv?.value, latest.prevHrv?.value)}
        />
        <StatCard
          icon={Wind} label="Breathing" color={C.sage}
          value={latest.resp?.value} unit="rpm"
        />
        <StatCard
          icon={Thermometer} label="Skin Temp" color={C.amber}
          value={latest.temp?.value} unit="°F"
          sub={latest.temp?.notes || null}
        />
        <StatCard
          icon={Flame} label="Zone Min" color={C.rose}
          value={latest.azm?.value} unit="min"
          sub={latest.azm?.notes || null}
        />
      </div>

      {/* Device info */}
      {devices && devices.length > 0 && (
        <Card className="mb-3 !p-3.5">
          <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider block mb-2">Devices</span>
          <div className="space-y-2">
            {devices.map((d, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Watch size={14} className="text-salve-textMid" />
                  <div>
                    <span className="text-sm text-salve-text font-montserrat font-medium block">{d.deviceVersion || d.type || 'Fitbit'}</span>
                    {d.lastSyncTime && (
                      <span className="text-[11px] text-salve-textFaint font-montserrat">
                        Last sync: {fmtDate(d.lastSyncTime.slice(0, 10))}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <BatteryIcon level={d.batteryLevel || d.battery} />
                  <span className="text-[12px] text-salve-textFaint font-montserrat">{d.batteryLevel || d.battery || ''}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 7-day charts */}
      <div className="md:grid md:grid-cols-2 md:gap-4">
        <BarChart
          data={latest.stepsHistory.map(v => ({
            date: v.date, value: v.value,
            label: v.value >= 1000 ? `${(v.value / 1000).toFixed(1)}k` : String(v.value),
            day: new Date(v.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short' }).slice(0, 2),
          }))}
          maxVal={Math.max(...latest.stepsHistory.map(v => v.value), 10000)}
          colorFn={v => v >= 10000 ? C.sage : v >= 5000 ? C.lav : C.textFaint}
          label="7-Day Steps"
        />
        <BarChart
          data={latest.sleepHistory.map(v => ({
            date: v.date, value: v.value,
            label: v.value.toFixed(1),
            day: new Date(v.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short' }).slice(0, 2),
          }))}
          maxVal={10}
          colorFn={() => C.lav}
          label="7-Day Sleep"
        />
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-4">
        <BarChart
          data={latest.hrHistory.map(v => ({
            date: v.date, value: v.value,
            label: String(v.value),
            day: new Date(v.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short' }).slice(0, 2),
          }))}
          maxVal={Math.max(...latest.hrHistory.map(v => v.value), 100)}
          colorFn={() => C.rose}
          label="7-Day Resting HR"
        />
        <BarChart
          data={latest.hrvHistory.map(v => ({
            date: v.date, value: v.value,
            label: String(v.value),
            day: new Date(v.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short' }).slice(0, 2),
          }))}
          maxVal={Math.max(...latest.hrvHistory.map(v => v.value), 80)}
          colorFn={() => C.lav}
          label="7-Day HRV"
        />
      </div>

      {/* Recent activities */}
      {latest.recentActivities.length > 0 && (
        <Card className="mb-3">
          <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider block mb-2.5">Recent Workouts</span>
          <div className="space-y-2">
            {latest.recentActivities.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-salve-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <Dumbbell size={12} className="text-salve-sage" />
                  <div>
                    <span className="text-sm text-salve-text font-montserrat font-medium">{a.type}</span>
                    <span className="text-[11px] text-salve-textFaint font-montserrat ml-2">{fmtDate(a.date)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[12px] text-salve-textMid font-montserrat">
                  {a.duration_minutes > 0 && <span>{a.duration_minutes}min</span>}
                  {a.calories > 0 && <span>{a.calories}cal</span>}
                  {a.distance > 0 && <span>{a.distance}mi</span>}
                  {a.heart_rate_avg > 0 && <span className="text-salve-rose">{a.heart_rate_avg}bpm</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Educational info */}
      <Card className="mb-3 space-y-2.5">
        <InfoCard info={INFO.hrv} />
        <InfoCard info={INFO.spo2} />
        <InfoCard info={INFO.azm} />
        <InfoCard info={INFO.vo2max} />
        <InfoCard info={INFO.temp} />
      </Card>

      <div className="text-center py-2">
        <button
          onClick={() => onNav('settings')}
          className="text-[12px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors"
        >
          Fitbit settings →
        </button>
      </div>
    </div>
  );
}
