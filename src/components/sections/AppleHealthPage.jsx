import { useState, useMemo } from 'react';
import { Apple, Heart, Activity, FlaskConical, Moon, Footprints, Zap, Scale, Thermometer, Droplets, Wind, TrendingUp } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { C } from '../../constants/colors';
import { fmtDate, localISODate } from '../../utils/dates';

/* ── Helpers ────────────────────────────────────────── */

const isAppleHealth = (r) => {
  if (r.source === 'apple_health' || r.source === 'Apple Health') return true;
  if (r.notes?.includes('Apple Health')) return true;
  if (r.notes?.includes('readings. Min:')) return true;
  return false;
};

const VITAL_ICONS = {
  hr: Heart, sleep: Moon, weight: Scale, temp: Thermometer,
  glucose: Droplets, bp: Heart, spo2: Droplets, resp: Wind,
  steps: Footprints, active_energy: Zap,
};

const VITAL_LABELS = {
  hr: 'Heart Rate', sleep: 'Sleep', weight: 'Weight', temp: 'Temperature',
  glucose: 'Glucose', bp: 'Blood Pressure', spo2: 'SpO2', resp: 'Respiratory',
  steps: 'Steps', active_energy: 'Active Energy',
};

const VITAL_UNITS = {
  hr: 'bpm', sleep: 'hrs', weight: 'lbs', temp: '°F',
  glucose: 'mg/dL', bp: 'mmHg', spo2: '%', resp: 'rpm',
  steps: '', active_energy: 'cal',
};

function StatCard({ icon: Icon, label, value, unit, sub, color }) {
  return (
    <div className="bg-salve-card2 border border-salve-border rounded-xl p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon size={12} style={{ color }} />
        <span className="text-[12px] text-salve-textFaint font-montserrat uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[22px] font-playfair font-semibold" style={{ color }}>{value ?? ', '}</span>
        {unit && <span className="text-[13px] text-salve-textFaint">{unit}</span>}
      </div>
      {sub && <span className="text-[12px] text-salve-textFaint leading-snug">{sub}</span>}
    </div>
  );
}

function MiniBar({ label, pct, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-salve-textFaint w-16 text-right font-montserrat">{label}</span>
      <div className="flex-1 h-2 bg-salve-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <span className="text-[12px] text-salve-textMid w-10 font-montserrat">{Math.round(pct)}%</span>
    </div>
  );
}

/* ── Component ──────────────────────────────────────── */

export default function AppleHealthPage({ data, onNav }) {
  const [filter, setFilter] = useState('all');

  const ahVitals = useMemo(() => (data.vitals || []).filter(isAppleHealth), [data.vitals]);
  const ahActivitiesAll = useMemo(() => (data.activities || []).filter(isAppleHealth), [data.activities]);
  // Filter out passive/tiny activities, real workouts only
  const ahActivities = useMemo(() => ahActivitiesAll.filter(a => {
    const t = (a.type || '').toLowerCase();
    if (t === 'daily activity' || t === 'daily_activity') return false;
    if (a.duration_minutes && Number(a.duration_minutes) < 5) return false;
    return true;
  }), [ahActivitiesAll]);
  const ahLabs = useMemo(() => (data.labs || []).filter(l => l.source === 'apple_health'), [data.labs]);
  const hasData = ahVitals.length > 0 || ahActivities.length > 0 || ahLabs.length > 0;

  // Latest vitals by type
  const latestByType = useMemo(() => {
    const map = {};
    const sorted = [...ahVitals].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const v of sorted) {
      if (!map[v.type]) map[v.type] = v;
    }
    return map;
  }, [ahVitals]);

  // 7-day aggregates
  const weekAgo = useMemo(() => localISODate(new Date(Date.now() - 7 * 86400000)), []);
  const recentVitals = useMemo(() => ahVitals.filter(v => v.date >= weekAgo), [ahVitals, weekAgo]);
  const recentActivities = useMemo(() => ahActivities.filter(a => a.date >= weekAgo), [ahActivities, weekAgo]);

  const weekStats = useMemo(() => {
    const hrs = recentVitals.filter(v => v.type === 'hr');
    const avgHR = hrs.length > 0 ? Math.round(hrs.reduce((s, v) => s + parseFloat(v.value || 0), 0) / hrs.length) : null;

    const sleeps = recentVitals.filter(v => v.type === 'sleep');
    const avgSleep = sleeps.length > 0 ? (sleeps.reduce((s, v) => s + parseFloat(v.value || 0), 0) / sleeps.length).toFixed(1) : null;

    const totalWorkouts = recentActivities.filter(a => a.type && a.type !== 'Daily Activity').length;
    const totalCals = recentActivities.reduce((s, a) => s + (parseFloat(a.calories) || 0), 0);

    return { avgHR, avgSleep, totalWorkouts, totalCals: totalCals > 0 ? Math.round(totalCals) : null };
  }, [recentVitals, recentActivities]);

  // Vitals by type distribution
  const typeCounts = useMemo(() => {
    const counts = {};
    for (const v of ahVitals) {
      counts[v.type] = (counts[v.type] || 0) + 1;
    }
    return counts;
  }, [ahVitals]);

  const totalRecords = ahVitals.length + ahActivities.length + ahLabs.length;

  // Filter pills
  const filters = [
    { id: 'all', label: 'Overview' },
    { id: 'vitals', label: `Vitals (${ahVitals.length})` },
    { id: 'activities', label: `Workouts (${ahActivities.length})` },
    ...(ahLabs.length > 0 ? [{ id: 'labs', label: `Labs (${ahLabs.length})` }] : []),
  ];

  if (!hasData) {
    return (
      <div className="mt-2">
        <EmptyState icon={Apple} text="No Apple Health data imported yet" motif="sparkle" />
        <div className="text-center mt-3">
          <button
            onClick={() => onNav('import')}
            className="text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline"
          >Import in Connections →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {/* Source info bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Apple size={11} className="text-salve-lav" />
          <span className="text-[12px] text-salve-textFaint font-montserrat">
            {totalRecords.toLocaleString()} records imported
          </span>
        </div>
        <button
          onClick={() => onNav('import')}
          className="text-[12px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer hover:underline"
        >
          Import more →
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 rounded-full text-[12px] font-montserrat whitespace-nowrap border transition-colors cursor-pointer ${
              filter === f.id
                ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav'
                : 'bg-salve-card2 border-salve-border text-salve-textFaint hover:text-salve-textMid'
            }`}
          >{f.label}</button>
        ))}
      </div>

      {/* Overview */}
      {filter === 'all' && (
        <>
          {/* Weekly summary stats */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <StatCard icon={Heart} label="Avg HR" color={C.rose} value={weekStats.avgHR} unit="bpm" sub="7-day average" />
            <StatCard icon={Moon} label="Avg Sleep" color={C.lav} value={weekStats.avgSleep} unit="hrs" sub="7-day average" />
            <StatCard icon={Activity} label="Workouts" color={C.sage} value={weekStats.totalWorkouts} sub="Last 7 days" />
            <StatCard icon={Zap} label="Calories" color={C.amber} value={weekStats.totalCals?.toLocaleString()} unit="cal" sub="7-day total" />
          </div>

          {/* Data type breakdown */}
          <Card className="mb-3">
            <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider block mb-2.5">Data Breakdown</span>
            <div className="space-y-2">
              {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <MiniBar
                  key={type}
                  label={VITAL_LABELS[type] || type}
                  pct={(count / Math.max(...Object.values(typeCounts))) * 100}
                  color={type === 'hr' ? C.rose : type === 'sleep' ? C.lav : type === 'weight' ? C.amber : C.sage}
                />
              ))}
              {ahActivities.length > 0 && (
                <MiniBar
                  label="Workouts"
                  pct={(ahActivities.length / Math.max(...Object.values(typeCounts), ahActivities.length)) * 100}
                  color={C.sage}
                />
              )}
              {ahLabs.length > 0 && (
                <MiniBar
                  label="Labs"
                  pct={(ahLabs.length / Math.max(...Object.values(typeCounts), ahLabs.length)) * 100}
                  color={C.lav}
                />
              )}
            </div>
          </Card>

          {/* Latest readings */}
          <Card className="mb-3">
            <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider block mb-2.5">Latest Readings</span>
            <div className="space-y-2">
              {Object.entries(latestByType).slice(0, 8).map(([type, v]) => {
                const Icon = VITAL_ICONS[type] || TrendingUp;
                return (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={12} className="text-salve-textFaint" />
                      <span className="text-[13px] text-salve-textMid font-montserrat">{VITAL_LABELS[type] || type}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] text-salve-text font-medium font-montserrat">
                        {type === 'bp' ? `${v.value}/${v.value2}` : v.value}
                      </span>
                      <span className="text-[9px] text-salve-textFaint">{VITAL_UNITS[type]}</span>
                      <span className="text-[9px] text-salve-textFaint">{fmtDate(v.date)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {/* Vitals list */}
      {filter === 'vitals' && (
        <div className="space-y-1.5">
          {[...ahVitals].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 50).map((v, i) => {
            const Icon = VITAL_ICONS[v.type] || TrendingUp;
            return (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-salve-card2 border border-salve-border rounded-lg">
                <div className="flex items-center gap-2">
                  <Icon size={12} className="text-salve-textFaint" />
                  <div>
                    <span className="text-[13px] text-salve-text font-montserrat">{VITAL_LABELS[v.type] || v.type}</span>
                    <span className="text-[9px] text-salve-textFaint ml-1.5">{fmtDate(v.date)}</span>
                  </div>
                </div>
                <span className="text-[13px] text-salve-text font-medium font-montserrat">
                  {v.type === 'bp' ? `${v.value}/${v.value2}` : v.value} {VITAL_UNITS[v.type]}
                </span>
              </div>
            );
          })}
          {ahVitals.length > 50 && (
            <p className="text-[12px] text-salve-textFaint text-center py-2 italic font-montserrat">
              Showing latest 50 of {ahVitals.length} records
            </p>
          )}
        </div>
      )}

      {/* Activities list */}
      {filter === 'activities' && (
        <div className="space-y-1.5">
          {[...ahActivities].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 50).map((a, i) => (
            <div key={i} className="px-3 py-2 bg-salve-card2 border border-salve-border rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-salve-text font-medium font-montserrat">{a.type || 'Workout'}</span>
                <span className="text-[9px] text-salve-textFaint">{fmtDate(a.date)}</span>
              </div>
              <div className="flex gap-3 mt-0.5">
                {a.duration_minutes && <span className="text-[12px] text-salve-textMid">{a.duration_minutes} min</span>}
                {a.calories && <span className="text-[12px] text-salve-textMid">{a.calories} cal</span>}
                {a.distance && <span className="text-[12px] text-salve-textMid">{a.distance} km</span>}
                {a.heart_rate_avg && <span className="text-[12px] text-salve-textMid">{a.heart_rate_avg} bpm</span>}
              </div>
            </div>
          ))}
          {ahActivities.length > 50 && (
            <p className="text-[12px] text-salve-textFaint text-center py-2 italic font-montserrat">
              Showing latest 50 of {ahActivities.length} records
            </p>
          )}
        </div>
      )}

      {/* Labs list */}
      {filter === 'labs' && (
        <div className="space-y-1.5">
          {[...ahLabs].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 50).map((l, i) => (
            <div key={i} className="px-3 py-2 bg-salve-card2 border border-salve-border rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-salve-text font-medium font-montserrat">{l.test_name || 'Lab'}</span>
                <div className="flex items-center gap-1.5">
                  {l.flag && l.flag !== 'normal' && (
                    <Badge label={l.flag} color={l.flag === 'high' || l.flag === 'abnormal' ? C.rose : C.amber} bg={(l.flag === 'high' || l.flag === 'abnormal' ? C.rose : C.amber) + '20'} />
                  )}
                  <span className="text-[9px] text-salve-textFaint">{fmtDate(l.date)}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-0.5">
                <span className="text-[12px] text-salve-textMid">{l.result} {l.unit}</span>
                {l.range && <span className="text-[12px] text-salve-textFaint">Ref: {l.range}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center py-2">
        <button
          onClick={() => onNav('import')}
          className="text-[12px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors"
        >
          Manage imports →
        </button>
      </div>
    </div>
  );
}
