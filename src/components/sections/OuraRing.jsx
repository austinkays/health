import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Loader, Heart, Moon, Zap, Wind, Activity, Thermometer, Brain, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Card from '../ui/Card';
import { OuraIcon } from '../ui/OuraIcon';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { C } from '../../constants/colors';
import { fmtDate } from '../../utils/dates';
import { isOuraConnected, syncAllOuraData, fetchOuraSleepSessions, fetchOuraReadiness, fetchOuraTemperature, fetchOuraDailySleep } from '../../services/oura';

const AUTO_SYNC_INTERVAL = 5 * 60_000; // 5 minutes

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
        <span className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider">{label}</span>
        {trend}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[22px] font-playfair font-semibold" style={{ color }}>{value ?? '—'}</span>
        {unit && <span className="text-[11px] text-salve-textFaint">{unit}</span>}
      </div>
      {sub && <span className="text-[10px] text-salve-textFaint leading-snug">{sub}</span>}
    </div>
  );
}

function SleepBar({ label, pct, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-salve-textFaint w-12 text-right font-montserrat">{label}</span>
      <div className="flex-1 h-2 bg-salve-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <span className="text-[10px] text-salve-textMid w-8 font-montserrat">{Math.round(pct)}%</span>
    </div>
  );
}

export default function OuraRing({ data, addItem, onNav }) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);

  const connected = isOuraConnected();

  // Fetch fresh Oura data directly (not from DB — real-time from API)
  const fetchLiveData = useCallback(async () => {
    if (!connected) return;
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const start1 = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);

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
          <span className="text-[10px] text-salve-textFaint font-montserrat">
            {lastSync ? `Synced ${lastSync.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Auto-syncing every 5 min'}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-salve-sage animate-pulse" />
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1 text-[10px] text-salve-sage font-montserrat bg-transparent border-none cursor-pointer hover:underline disabled:opacity-50"
        >
          <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync now'}
        </button>
      </div>

      {/* Today's overview */}
      <div className="grid grid-cols-2 gap-2 mb-3">
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
          sub="Deviation from baseline"
        />
      </div>

      {/* Sleep breakdown */}
      {latest?.sleep && (
        <Card className="mb-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider">Last Night's Sleep</span>
            <span className="text-[10px] text-salve-textFaint">{latest.sleep.day}</span>
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
              <span className="text-[10px] text-salve-textMid font-montserrat">Efficiency: <strong className="text-salve-text">{efficiency}%</strong></span>
            )}
            {latest.sleep.latency != null && (
              <span className="text-[10px] text-salve-textMid font-montserrat">Fell asleep in: <strong className="text-salve-text">{Math.round(latest.sleep.latency / 60)}min</strong></span>
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
                <span className="text-[10px] text-salve-textMid font-montserrat capitalize">{key.replace(/_/g, ' ')}</span>
                <span className={`text-[10px] font-medium ${val >= 70 ? 'text-salve-sage' : val >= 50 ? 'text-salve-amber' : 'text-salve-rose'}`}>{val ?? '—'}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 7-day sleep history */}
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
            <div className="text-[10px] text-salve-textFaint text-center mt-1.5">
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

      <div className="text-center py-2">
        <button
          onClick={() => onNav('settings')}
          className="text-[10px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors"
        >
          Oura Ring settings →
        </button>
      </div>
    </div>
  );
}
