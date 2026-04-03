import { useState, useMemo } from 'react';
import { Heart, Droplets, Sun, Calendar, TrendingUp } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { C } from '../../constants/colors';
import { fmtDate } from '../../utils/dates';
import { computeCycleStats, getDayOfCycle, predictNextPeriod } from '../../utils/cycles';

/* ── Helpers ────────────────────────────────────────── */

const FLOW_COLORS = { Light: C.rose + '60', Medium: C.rose + '90', Heavy: C.rose, Spotting: C.amber };
const TYPE_ICONS = { period: Droplets, symptom: Sun, ovulation: Heart, bbt: TrendingUp, cervical_mucus: Droplets, fertility_marker: Heart };
const TYPE_LABELS = { period: 'Period', symptom: 'Symptom', ovulation: 'Ovulation', bbt: 'BBT', cervical_mucus: 'Cervical Mucus', fertility_marker: 'Fertility Marker' };

function StatCard({ icon: Icon, label, value, unit, sub, color }) {
  return (
    <div className="bg-salve-card2 border border-salve-border rounded-xl p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon size={12} style={{ color }} />
        <span className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[22px] font-playfair font-semibold" style={{ color }}>{value ?? '—'}</span>
        {unit && <span className="text-[11px] text-salve-textFaint">{unit}</span>}
      </div>
      {sub && <span className="text-[10px] text-salve-textFaint leading-snug">{sub}</span>}
    </div>
  );
}

/* ── Component ──────────────────────────────────────── */

export default function FloPage({ data, onNav }) {
  const [filter, setFilter] = useState('all');

  const cycles = data.cycles || [];
  const hasData = cycles.length > 0;

  // Stats
  const rawStats = useMemo(() => computeCycleStats(cycles), [cycles]);
  const currentDay = useMemo(() => getDayOfCycle(rawStats), [rawStats]);
  const nextPeriod = useMemo(() => predictNextPeriod(rawStats), [rawStats]);
  const daysUntilNext = useMemo(() => {
    if (!nextPeriod) return null;
    const diff = Math.ceil((new Date(nextPeriod + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000);
    return diff >= 0 ? diff : null;
  }, [nextPeriod]);

  // Avg period length (consecutive period days per cycle)
  const avgPeriodLength = useMemo(() => {
    const periodDays = cycles.filter(c => c.type === 'period').map(c => c.date).sort();
    if (periodDays.length < 2) return null;
    const runs = [];
    let runLen = 1;
    for (let i = 1; i < periodDays.length; i++) {
      const diff = (new Date(periodDays[i] + 'T00:00:00') - new Date(periodDays[i - 1] + 'T00:00:00')) / 86400000;
      if (diff <= 2) { runLen++; } else { runs.push(runLen); runLen = 1; }
    }
    runs.push(runLen);
    return runs.length > 0 ? Math.round(runs.reduce((a, b) => a + b, 0) / runs.length) : null;
  }, [cycles]);

  // Group by type
  const typeCounts = useMemo(() => {
    const counts = {};
    for (const c of cycles) {
      counts[c.type] = (counts[c.type] || 0) + 1;
    }
    return counts;
  }, [cycles]);

  // Common symptoms
  const topSymptoms = useMemo(() => {
    const counts = {};
    for (const c of cycles) {
      if (c.type === 'symptom' && c.symptom) {
        counts[c.symptom] = (counts[c.symptom] || 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [cycles]);

  // Recent period days
  const recentPeriods = useMemo(() => {
    return cycles
      .filter(c => c.type === 'period')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 7);
  }, [cycles]);

  // Filtered entries
  const filtered = useMemo(() => {
    if (filter === 'all') return cycles;
    return cycles.filter(c => c.type === filter);
  }, [cycles, filter]);

  const filters = [
    { id: 'all', label: `All (${cycles.length})` },
    ...(typeCounts.period ? [{ id: 'period', label: `Period (${typeCounts.period})` }] : []),
    ...(typeCounts.symptom ? [{ id: 'symptom', label: `Symptoms (${typeCounts.symptom})` }] : []),
    ...(typeCounts.ovulation ? [{ id: 'ovulation', label: `Ovulation (${typeCounts.ovulation})` }] : []),
    ...(typeCounts.bbt ? [{ id: 'bbt', label: `BBT (${typeCounts.bbt})` }] : []),
  ];

  if (!hasData) {
    return (
      <div className="mt-2">
        <EmptyState icon={Heart} text="No cycle data yet" motif="sparkle" />
        <div className="text-center mt-3 space-y-2">
          <button
            onClick={() => onNav('cycles')}
            className="text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline block mx-auto"
          >Track cycles →</button>
          <button
            onClick={() => onNav('settings')}
            className="text-xs text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat hover:underline block mx-auto"
          >Import Flo data in Settings →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {/* Source info bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Heart size={11} className="text-salve-rose" />
          <span className="text-[10px] text-salve-textFaint font-montserrat">
            {cycles.length} cycle records
          </span>
        </div>
        <button
          onClick={() => onNav('cycles')}
          className="text-[10px] text-salve-rose font-montserrat bg-transparent border-none cursor-pointer hover:underline"
        >
          Full tracker →
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 rounded-full text-[10px] font-montserrat whitespace-nowrap border transition-colors cursor-pointer ${
              filter === f.id
                ? 'bg-salve-rose/20 border-salve-rose/40 text-salve-rose'
                : 'bg-salve-card2 border-salve-border text-salve-textFaint hover:text-salve-textMid'
            }`}
          >{f.label}</button>
        ))}
      </div>

      {/* Overview - stats */}
      {filter === 'all' && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <StatCard
              icon={Calendar} label="Avg Cycle" color={C.rose}
              value={rawStats.avgLength || null} unit="days"
              sub={rawStats.periodStarts?.length ? `${rawStats.periodStarts.length} cycles tracked` : null}
            />
            <StatCard
              icon={Droplets} label="Avg Period" color={C.rose}
              value={avgPeriodLength} unit="days"
              sub="Average duration"
            />
            <StatCard
              icon={Heart} label="Cycle Day" color={C.lav}
              value={currentDay || null}
              sub={daysUntilNext != null ? `${daysUntilNext} days until next` : null}
            />
            <StatCard
              icon={TrendingUp} label="Total Records" color={C.sage}
              value={cycles.length}
              sub={`${Object.keys(typeCounts).length} data types`}
            />
          </div>

          {/* Common symptoms */}
          {topSymptoms.length > 0 && (
            <Card className="mb-3">
              <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider block mb-2.5">Common Symptoms</span>
              <div className="flex flex-wrap gap-1.5">
                {topSymptoms.map(([symptom, count]) => (
                  <div key={symptom} className="flex items-center gap-1 px-2 py-1 bg-salve-card2 border border-salve-border rounded-lg">
                    <span className="text-[10px] text-salve-text font-montserrat">{symptom}</span>
                    <span className="text-[9px] text-salve-textFaint">×{count}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Recent period days */}
          {recentPeriods.length > 0 && (
            <Card className="mb-3">
              <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider block mb-2.5">Recent Period Days</span>
              <div className="flex gap-1.5 flex-wrap">
                {recentPeriods.map((p, i) => (
                  <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: (FLOW_COLORS[p.value] || C.rose) + '20' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: FLOW_COLORS[p.value] || C.rose }} />
                    <span className="text-[10px] text-salve-text font-montserrat">{fmtDate(p.date)}</span>
                    {p.value && <span className="text-[9px] text-salve-textFaint">{p.value}</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Type breakdown */}
          <Card className="mb-3">
            <span className="text-xs font-medium text-salve-textFaint font-montserrat uppercase tracking-wider block mb-2.5">Data Types</span>
            <div className="space-y-1.5">
              {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {(() => { const Icon = TYPE_ICONS[type] || Heart; return <Icon size={12} className="text-salve-textFaint" />; })()}
                    <span className="text-[11px] text-salve-textMid font-montserrat capitalize">{TYPE_LABELS[type] || type}</span>
                  </div>
                  <span className="text-[11px] text-salve-text font-medium font-montserrat">{count}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Filtered entries list */}
      {filter !== 'all' && (
        <div className="space-y-1.5">
          {[...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 50).map((c, i) => {
            const Icon = TYPE_ICONS[c.type] || Heart;
            return (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-salve-card2 border border-salve-border rounded-lg">
                <div className="flex items-center gap-2">
                  <Icon size={12} className="text-salve-textFaint" />
                  <div>
                    <span className="text-[11px] text-salve-text font-montserrat capitalize">
                      {c.type === 'symptom' ? c.symptom : TYPE_LABELS[c.type] || c.type}
                    </span>
                    <span className="text-[9px] text-salve-textFaint ml-1.5">{fmtDate(c.date)}</span>
                  </div>
                </div>
                {c.value && (
                  <Badge
                    label={c.value}
                    color={c.type === 'period' ? C.rose : C.lav}
                    bg={(c.type === 'period' ? C.rose : C.lav) + '20'}
                  />
                )}
              </div>
            );
          })}
          {filtered.length > 50 && (
            <p className="text-[10px] text-salve-textFaint text-center py-2 italic font-montserrat">
              Showing latest 50 of {filtered.length} records
            </p>
          )}
        </div>
      )}

      <div className="text-center py-2 space-y-1">
        <button
          onClick={() => onNav('cycles')}
          className="text-[10px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-rose transition-colors block mx-auto"
        >
          Full Cycle Tracker →
        </button>
      </div>
    </div>
  );
}
