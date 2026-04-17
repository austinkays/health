import { useState, useMemo, useEffect } from 'react';
import { Sparkles, Moon, Activity, Heart, Pill, TrendingUp, TrendingDown, Minus, Lock, ChevronRight, Calendar, Flame, ArrowLeftRight, Clock } from 'lucide-react';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import InsightsTimeline from '../ai/InsightsTimeline';
import { computeCorrelations } from '../../utils/correlations';
import { getCyclePhaseForDate } from '../../utils/cycles';
import { C } from '../../constants/colors';

const CATEGORY_META = {
  sleep:      { icon: Moon,            border: 'border-salve-lav',   color: C.lav,   label: 'Sleep' },
  exercise:   { icon: Activity,        border: 'border-salve-sage',  color: C.sage,  label: 'Exercise' },
  medication: { icon: Pill,            border: 'border-salve-sage',  color: C.sage,  label: 'Medication' },
  cycle:      { icon: Heart,           border: 'border-salve-amber', color: C.amber, label: 'Cycle' },
  trend:      { icon: TrendingUp,      border: 'border-salve-lav',   color: C.lav,   label: 'Trends' },
  symptom:    { icon: Activity,        border: 'border-salve-rose',  color: C.rose,  label: 'Symptoms' },
  dayofweek:  { icon: Calendar,        border: 'border-salve-amber', color: C.amber, label: 'Day of Week' },
  streak:     { icon: Flame,           border: 'border-salve-sage',  color: C.sage,  label: 'Streaks' },
  comparison: { icon: ArrowLeftRight,  border: 'border-salve-lav',   color: C.lav,   label: 'Comparisons' },
  timeofday:  { icon: Clock,           border: 'border-salve-lav',   color: C.lav,   label: 'Time of Day' },
};

const FILTER_PILLS = ['All', 'Sleep', 'Exercise', 'Medication', 'Cycle', 'Symptoms', 'Trends', 'Day of Week', 'Streaks', 'Comparisons', 'Time of Day'];
const FILTER_MAP = { All: null, Sleep: 'sleep', Exercise: 'exercise', Medication: 'medication', Cycle: 'cycle', Symptoms: 'symptom', Trends: 'trend', 'Day of Week': 'dayofweek', Streaks: 'streak', Comparisons: 'comparison', 'Time of Day': 'timeofday' };

/* ── Mini bar chart ───────────────────────────────────────── */

function MiniBarChart({ values, color }) {
  if (!values || values.length === 0) return null;
  const nums = values.map(v => v.avg ?? v.value ?? 0);
  const max = Math.max(...nums, 1);
  return (
    <div className="flex items-end gap-2 mt-3 h-14" role="img" aria-label="Comparison chart">
      {values.map((v, i) => {
        const val = v.avg ?? v.value ?? 0;
        const pct = Math.max((val / max) * 100, 6);
        return (
          <div key={i} className="flex flex-col items-center flex-1 min-w-0">
            <span className="text-[13px] font-medium font-montserrat mb-1" style={{ color }}>
              {typeof val === 'number' ? (val % 1 ? val.toFixed(1) : val) : val}
            </span>
            <div className="w-full rounded-md transition-all" style={{ height: `${pct}%`, backgroundColor: color, opacity: 0.2 }} />
            <span className="text-[12px] text-salve-textFaint font-montserrat mt-1.5 truncate max-w-full text-center leading-tight">
              {v.category || v.label || ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Trend arrow ─────────────────────────────────────────── */

function TrendArrow({ insight }) {
  const td = insight.data?.values?.[0];
  if (!td) return null;
  const { direction, totalChange } = td;
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  // Use the insight's overall direction for coloring (positive = good, negative = concerning)
  const colorClass = insight.direction === 'positive' ? 'text-salve-sage'
    : insight.direction === 'negative' ? 'text-salve-rose'
    : 'text-salve-textFaint';
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <Icon size={14} className={colorClass} />
      {totalChange != null && (
        <span className={`text-[13px] font-medium font-montserrat ${colorClass}`}>
          {totalChange > 0 ? '+' : ''}{typeof totalChange === 'number' ? totalChange.toFixed(1) : totalChange}
        </span>
      )}
      <span className="text-[12px] text-salve-textFaint font-montserrat">over 2 weeks</span>
    </div>
  );
}

/* ── Insight card ─────────────────────────────────────────── */

function InsightCard({ insight }) {
  const meta = CATEGORY_META[insight.category] || CATEGORY_META.trend;
  const Icon = meta.icon;
  const showChart = insight.data && (insight.data.type === 'bar' || insight.data.type === 'comparison') && insight.data.values?.length > 0;
  const isTrend = insight.type === 'trend';

  return (
    <div className={`border-l-2 ${meta.border} pl-3.5 py-2.5`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={13} style={{ color: meta.color }} className="flex-shrink-0" />
        <span className="text-[14px] font-semibold text-salve-text font-montserrat capitalize">{insight.title}</span>
      </div>
      <p className="text-[12.5px] text-salve-textMid font-montserrat leading-relaxed m-0">
        {insight.template}
      </p>
      {isTrend && <TrendArrow insight={insight} />}
      {showChart && !isTrend && <MiniBarChart values={insight.data.values} color={meta.color} />}
      {insight.n && (
        <span className="inline-block mt-2 text-[12px] text-salve-textFaint/60 font-montserrat">
          Based on {insight.n} days of data
        </span>
      )}
    </div>
  );
}

/* ── Unlock prompt cards ─────────────────────────────────── */

const UNLOCK_HINTS = [
  {
    key: 'sleep',
    icon: Moon,
    title: 'Sleep & symptom patterns',
    description: 'See how your sleep affects pain, mood, and energy the next day.',
    requirement: (data) => {
      const sleepDays = new Set((data.vitals || []).filter(v => v.type === 'sleep').map(v => v.date)).size;
      const painDays = new Set((data.vitals || []).filter(v => v.type === 'pain').map(v => v.date)).size;
      const moodDays = new Set((data.vitals || []).filter(v => v.type === 'mood').map(v => v.date)).size;
      const otherDays = Math.max(painDays, moodDays);
      return { have: Math.min(sleepDays, otherDays), need: 7, what: sleepDays < 7 ? 'Log sleep in Vitals' : 'Log pain or mood in Vitals' };
    },
    color: C.lav,
  },
  {
    key: 'exercise',
    icon: Activity,
    title: 'Exercise impact',
    description: 'Discover how workouts affect your mood, energy, and pain.',
    requirement: (data) => {
      const actDays = new Set((data.activities || []).map(a => a.date)).size;
      const moodDays = new Set((data.vitals || []).filter(v => v.type === 'mood' || v.type === 'energy').map(v => v.date)).size;
      return { have: Math.min(actDays, moodDays), need: 7, what: actDays < 3 ? 'Log workouts in Activities' : 'Log mood or energy in Vitals' };
    },
    color: C.sage,
  },
  {
    key: 'medication',
    icon: Pill,
    title: 'Medication effects',
    description: 'See how your symptoms changed after starting each medication.',
    requirement: (data) => {
      const medsWithDate = (data.meds || []).filter(m => m.active !== false && m.start_date).length;
      const vitalDays = new Set((data.vitals || []).map(v => v.date)).size;
      return { have: medsWithDate > 0 ? Math.min(vitalDays, 14) : 0, need: 14, what: medsWithDate === 0 ? 'Add start dates to your medications' : 'Log vitals for 2 weeks around a med start' };
    },
    color: C.sage,
  },
  {
    key: 'cycle',
    icon: Heart,
    title: 'Cycle phase patterns',
    description: 'See how mood, energy, and pain shift across your cycle.',
    requirement: (data) => {
      const cycleDays = (data.cycles || []).filter(c => c.type === 'period').length;
      return { have: cycleDays, need: 5, what: cycleDays === 0 ? 'Start tracking your cycle' : 'Log at least one full period' };
    },
    color: C.amber,
  },
  {
    key: 'symptom',
    icon: Activity,
    title: 'Symptom triggers',
    description: 'Find which symptoms appear more on poor-sleep or high-stress days.',
    requirement: (data) => {
      const journalWithSymptoms = (data.journal || []).filter(e => (e.symptoms || []).length > 0).length;
      return { have: journalWithSymptoms, need: 5, what: 'Log symptoms in your journal entries' };
    },
    color: C.rose,
  },
];

function UnlockSection({ data, unlockedCategories }) {
  const locked = UNLOCK_HINTS.filter(h => !unlockedCategories.has(h.key));
  if (locked.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-px bg-salve-border/40" />
        <span className="text-[12px] font-montserrat font-medium text-salve-textFaint uppercase tracking-wider">Unlock more insights</span>
        <div className="flex-1 h-px bg-salve-border/40" />
      </div>
      <div className="space-y-2">
        {locked.map(hint => {
          const req = hint.requirement(data);
          const pct = Math.min(100, Math.round((req.have / req.need) * 100));
          const Icon = hint.icon;
          return (
            <div key={hint.key} className="px-3.5 py-3 rounded-xl bg-salve-card2/30 border border-salve-border/30">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-salve-card flex items-center justify-center flex-shrink-0 mt-0.5" style={{ borderColor: hint.color + '33', borderWidth: 1 }}>
                  <Icon size={13} style={{ color: hint.color, opacity: 0.6 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[14px] font-medium font-montserrat text-salve-text">{hint.title}</span>
                    {pct < 100 && <Lock size={10} className="text-salve-textFaint/40" />}
                  </div>
                  <p className="text-[13px] text-salve-textFaint font-montserrat leading-relaxed m-0 mb-2">
                    {hint.description}
                  </p>
                  {/* Progress bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-salve-card overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: hint.color, opacity: 0.5 }} />
                    </div>
                    <span className="text-[12px] text-salve-textFaint font-montserrat tabular-nums">{req.have}/{req.need}</span>
                  </div>
                  <p className="text-[12px] font-montserrat mt-1 m-0" style={{ color: hint.color }}>
                    {req.what}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main section ─────────────────────────────────────────── */

export default function Insights({ data, onNav, insightRatings, initialTab }) {
  const [filter, setFilter] = useState('All');
  const [tab, setTab] = useState(initialTab === 'history' ? 'history' : 'patterns');

  // App.jsx passes initialTab='history' when the user deep-links from
  // Dashboard's "See past insights" link. Stays in sync on tab change.
  useEffect(() => {
    if (initialTab === 'history' || initialTab === 'patterns') setTab(initialTab);
  }, [initialTab]);

  const allInsights = useMemo(
    () => computeCorrelations(data, getCyclePhaseForDate),
    [data]
  );

  const filtered = useMemo(() => {
    const cat = FILTER_MAP[filter];
    if (!cat) return allInsights;
    return allInsights.filter(ins => ins.category === cat);
  }, [allInsights, filter]);

  const trends = useMemo(() => filtered.filter(i => i.type === 'trend'), [filtered]);
  const nonTrends = useMemo(() => filtered.filter(i => i.type !== 'trend'), [filtered]);

  // Which insight categories have fired (to hide from unlock section)
  const unlockedCategories = useMemo(() => {
    const cats = new Set();
    allInsights.forEach(i => { if (i.type !== 'trend') cats.add(i.category); });
    return cats;
  }, [allInsights]);

  const totalNonTrend = allInsights.filter(i => i.type !== 'trend').length;
  const hasHistory = (data?.generated_insights?.length || 0) > 0;

  // Patterns / History tab switcher. Renders when either view has content so
  // users can discover the history tab even before enough data for patterns.
  const tabBar = (hasHistory || allInsights.length > 0) ? (
    <div className="flex gap-2 mb-4 border-b border-salve-border/60">
      <button
        onClick={() => setTab('patterns')}
        className={`text-[13px] font-montserrat pb-2 px-1 border-b-2 transition-colors cursor-pointer bg-transparent ${
          tab === 'patterns' ? 'border-salve-lav text-salve-lav' : 'border-transparent text-salve-textFaint hover:text-salve-text'
        }`}
      >Patterns</button>
      <button
        onClick={() => setTab('history')}
        className={`text-[13px] font-montserrat pb-2 px-1 border-b-2 transition-colors cursor-pointer bg-transparent ${
          tab === 'history' ? 'border-salve-lav text-salve-lav' : 'border-transparent text-salve-textFaint hover:text-salve-text'
        }`}
      >History{hasHistory ? ` (${data.generated_insights.length})` : ''}</button>
    </div>
  ) : null;

  if (tab === 'history') {
    return (
      <div className="mt-2 font-montserrat">
        {tabBar}
        <InsightsTimeline data={data} insightRatings={insightRatings} />
      </div>
    );
  }

  if (allInsights.length === 0) {
    return (
      <div className="mt-4">
        {tabBar}
        <div className="text-center mb-6 px-4">
          <Sparkles size={28} className="text-salve-lav mx-auto mb-3" />
          <h3 className="text-base font-montserrat font-medium text-salve-text mb-1">Insights are brewing</h3>
          <p className="text-[14px] text-salve-textFaint font-montserrat leading-relaxed max-w-sm mx-auto">
            Salve finds patterns in your health data automatically. The more you log, the smarter it gets. Here's what to track to unlock your first insights:
          </p>
        </div>
        <UnlockSection data={data} unlockedCategories={new Set()} />
      </div>
    );
  }

  return (
    <div className="mt-2 font-montserrat">
      {tabBar}
      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {FILTER_PILLS.map(p => {
          const cat = FILTER_MAP[p];
          const count = cat ? allInsights.filter(i => i.category === cat).length : allInsights.length;
          return (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`text-[13px] px-3 py-1.5 rounded-full border font-montserrat transition-colors cursor-pointer ${
                filter === p
                  ? 'bg-salve-lav/15 border-salve-lav/30 text-salve-lav'
                  : count === 0
                    ? 'bg-salve-card border-salve-border/50 text-salve-textFaint/40 cursor-default'
                    : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/20 cursor-pointer'
              }`}
              disabled={count === 0 && p !== 'All'}
            >
              {p}{count > 0 && p !== 'All' ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {/* Summary line */}
      {filter === 'All' && totalNonTrend > 0 && (
        <p className="text-[13px] text-salve-textFaint font-montserrat mb-3 px-0.5">
          Salve found {totalNonTrend} pattern{totalNonTrend !== 1 ? 's' : ''} and {trends.length} trend{trends.length !== 1 ? 's' : ''} in your data.
        </p>
      )}

      {/* Correlation / medication / cycle insights */}
      {nonTrends.length > 0 && (
        <Card className="!p-0 overflow-hidden mb-3">
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
            <Sparkles size={13} className="text-salve-lav" />
            <span className="text-[13px] text-salve-textFaint font-montserrat tracking-wide uppercase">Patterns</span>
          </div>
          {nonTrends.map((ins, i) => (
            <div key={ins.id}>
              {i > 0 && <div className="border-t border-salve-border/50 mx-4" />}
              <div className="px-4 py-1">
                <InsightCard insight={ins} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Trends */}
      {trends.length > 0 && (
        <Card className="!p-0 overflow-hidden mb-3">
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
            <TrendingUp size={13} className="text-salve-lav" />
            <span className="text-[13px] text-salve-textFaint font-montserrat tracking-wide uppercase">Trends</span>
          </div>
          {trends.map((ins, i) => (
            <div key={ins.id}>
              {i > 0 && <div className="border-t border-salve-border/50 mx-4" />}
              <div className="px-4 py-1">
                <InsightCard insight={ins} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-[14px] text-salve-textFaint py-8 font-montserrat">
          No insights in this category yet.
        </p>
      )}

      {/* Unlock more insights, shows locked categories with progress */}
      {filter === 'All' && <UnlockSection data={data} unlockedCategories={unlockedCategories} />}
    </div>
  );
}
