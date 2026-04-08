import { useState, useMemo } from 'react';
import { Sparkles, Moon, Activity, Heart, Pill, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import { computeCorrelations } from '../../utils/correlations';
import { getCyclePhaseForDate } from '../../utils/cycles';
import { C } from '../../constants/colors';

const CATEGORY_META = {
  sleep:      { icon: Moon,       border: 'border-salve-lav',   color: C.lav   },
  exercise:   { icon: Activity,   border: 'border-salve-sage',  color: C.sage  },
  medication: { icon: Pill,        border: 'border-salve-sage',  color: C.sage  },
  cycle:      { icon: Heart,      border: 'border-salve-amber', color: C.amber },
  trend:      { icon: TrendingUp, border: 'border-salve-lav',   color: C.lav   },
  symptom:    { icon: Activity,   border: 'border-salve-rose',  color: C.rose  },
};

const FILTER_PILLS = ['All', 'Sleep', 'Exercise', 'Medication', 'Cycle', 'Symptoms', 'Trends'];
const FILTER_MAP = {
  All: null,
  Sleep: 'sleep',
  Exercise: 'exercise',
  Medication: 'medication',
  Cycle: 'cycle',
  Symptoms: 'symptom',
  Trends: 'trend',
};

/* ── Mini bar chart (div-based, no Recharts) ──────────────── */

function MiniBarChart({ values, color }) {
  if (!values || values.length === 0) return null;
  const nums = values.map(v => v.avg ?? v.value ?? 0);
  const max = Math.max(...nums, 1);

  return (
    <div className="flex items-end gap-1.5 mt-3 h-16" role="img" aria-label="Bar chart">
      {values.map((v, i) => {
        const val = v.avg ?? v.value ?? 0;
        const pct = Math.max((val / max) * 100, 4);
        return (
          <div key={i} className="flex flex-col items-center flex-1 min-w-0">
            <span className="text-[10px] text-salve-textMid font-montserrat mb-0.5 truncate">
              {typeof val === 'number' ? (val % 1 ? val.toFixed(1) : val) : val}
            </span>
            <div
              className="w-full rounded-sm"
              style={{ height: `${pct}%`, backgroundColor: color, opacity: 0.26 }}
            />
            <span className="text-[10px] text-salve-textFaint font-montserrat mt-1 truncate max-w-full">
              {v.category || v.label || ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Trend arrow indicator ────────────────────────────────── */

function TrendArrow({ insight }) {
  const { direction, data: d } = insight;
  const totalChange = d?.values?.length > 0
    ? d.values[d.values.length - 1]?.value - d.values[0]?.value
    : null;

  const Icon = direction === 'positive' ? TrendingUp
    : direction === 'negative' ? TrendingDown
    : Minus;

  const colorClass = direction === 'positive' ? 'text-salve-sage'
    : direction === 'negative' ? 'text-salve-rose'
    : 'text-salve-textFaint';

  return (
    <div className="flex items-center gap-2 mt-1">
      <Icon size={14} className={colorClass} />
      {totalChange != null && (
        <span className={`text-[11px] font-montserrat ${colorClass}`}>
          {totalChange > 0 ? '+' : ''}{typeof totalChange === 'number' && totalChange % 1 ? totalChange.toFixed(1) : totalChange}
        </span>
      )}
      <span className="text-[10px] text-salve-textFaint font-montserrat">over 2 weeks</span>
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
        <span className="text-[12px] font-semibold text-salve-text font-montserrat">{insight.title}</span>
      </div>
      <p className="text-[12px] text-salve-textMid font-montserrat leading-relaxed m-0">
        {insight.template}
      </p>
      {isTrend && <TrendArrow insight={insight} />}
      {showChart && !isTrend && <MiniBarChart values={insight.data.values} color={meta.color} />}
      {insight.confidence === 'medium' && (
        <span className="inline-block mt-2 text-[10px] text-salve-textFaint font-montserrat bg-salve-card2/50 px-2 py-0.5 rounded-full">
          Moderate confidence (n={insight.n})
        </span>
      )}
    </div>
  );
}

/* ── Main section ─────────────────────────────────────────── */

export default function Insights({ data }) {
  const [filter, setFilter] = useState('All');

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

  if (allInsights.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        text="Patterns are brewing — keep logging for a few more days. Insights appear after 7 days of overlapping data."
        motif="sparkle"
      />
    );
  }

  return (
    <div className="font-montserrat">
      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {FILTER_PILLS.map(p => (
          <button
            key={p}
            onClick={() => setFilter(p)}
            className={`text-[11px] px-3 py-1.5 rounded-full border font-montserrat transition-colors ${
              filter === p
                ? 'bg-salve-lav/15 border-salve-lav/30 text-salve-lav'
                : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/20'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Correlation / medication / cycle insights */}
      {nonTrends.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
            <Sparkles size={13} className="text-salve-lav" />
            <span className="text-[11px] text-salve-textFaint font-montserrat tracking-wide uppercase">Patterns</span>
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

      {/* Trends section */}
      {trends.length > 0 && (
        <Card className="!p-0 overflow-hidden mt-2">
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
            <TrendingUp size={13} className="text-salve-lav" />
            <span className="text-[11px] text-salve-textFaint font-montserrat tracking-wide uppercase">Trends</span>
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
        <p className="text-center text-[12px] text-salve-textFaint py-8 font-montserrat">
          No insights in this category yet.
        </p>
      )}
    </div>
  );
}
