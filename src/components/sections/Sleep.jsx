import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Moon, ChevronDown, Clock, Heart, Brain, TrendingUp, TrendingDown, Minus, Loader, Apple, BedDouble, Sunrise, AlertCircle } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { OuraIcon } from '../ui/OuraIcon';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { fmtDate, todayISO } from '../../utils/dates';
import { isOuraConnected, fetchOuraSleepSessions, fetchOuraDailySleep } from '../../services/oura';

/* ── helpers ── */

const SOURCE_ICON = { oura: OuraIcon, apple_health: Apple };
const SOURCE_LABEL = { oura: 'Oura', apple_health: 'Apple Health', manual: 'Manual' };
const sourceColor = () => ({ oura: C.sage, apple_health: C.lav, manual: C.textFaint });
const FILTER_PILLS = ['All', 'Oura', 'Apple Health', 'Manual'];
const FILTER_KEY = { All: null, Oura: 'oura', 'Apple Health': 'apple_health', Manual: 'manual' };

const getSource = (v) => {
  const raw = v.source || 'manual';
  if (raw === 'Apple Health' || raw === 'apple_health') return 'apple_health';
  return raw;
};

const secToHrs = (s) => (s ? +(s / 3600).toFixed(1) : 0);
const secToMin = (s) => (s ? Math.round(s / 60) : 0);
const msToMin = (s) => (s ? Math.round(s / 60000) : 0);

const qualityLabel = (hrs) => {
  if (hrs < 6) return { text: 'Poor', color: C.lavDim };
  if (hrs <= 9) return { text: 'Good', color: C.lav };
  return { text: 'Long', color: C.lavDim };
};

const dayAbbr = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()];
};

const barColor = (hrs) => {
  if (hrs < 6) return C.lavDim;
  return C.lav;
};

/* ── sub-components ── */

function SleepBar({ label, pct, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-salve-textMid font-montserrat w-10">{label}</span>
      <div className="flex-1 h-3 bg-salve-card2 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
      <span className="text-[10px] text-salve-text font-montserrat w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

function MetricBox({ label, value, unit, icon: Icon, color }) {
  return (
    <div className="bg-salve-card2 rounded-lg p-2.5 text-center">
      {Icon && <Icon size={12} className="mx-auto mb-1" style={{ color }} />}
      <div className="text-sm font-medium text-salve-text font-montserrat">
        {value ?? '\u2014'}<span className="text-[10px] text-salve-textFaint ml-0.5">{unit}</span>
      </div>
      <div className="text-[9px] text-salve-textFaint font-montserrat mt-0.5">{label}</div>
    </div>
  );
}

function InfoCard({ title, body }) {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen(!open)} className="w-full text-left bg-transparent border-none p-0 cursor-pointer" aria-expanded={open}>
      <div className="flex items-center gap-1.5">
        <Brain size={10} className="text-salve-lav" />
        <span className="text-[10px] text-salve-lav font-montserrat font-medium">{title}</span>
        <ChevronDown size={10} className={`text-salve-lav transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && <p className="text-[10px] text-salve-textMid font-montserrat leading-relaxed mt-1.5 ml-4">{body}</p>}
    </button>
  );
}

function SourceBadge({ source }) {
  const Icon = SOURCE_ICON[source];
  const label = SOURCE_LABEL[source] || 'Manual';
  const colors = sourceColor();
  const color = colors[source] || colors.manual;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-montserrat rounded-full px-1.5 py-0.5 bg-salve-card2" style={{ color }}>
      {Icon ? <Icon size={10} /> : <BedDouble size={10} />}
      {label}
    </span>
  );
}

/* ── main component ── */

export default function Sleep({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [filter, setFilter] = useState('All');
  const [expandedId, setExpandedId] = useState(highlightId || null);
  const [form, setForm] = useState({ date: todayISO(), hours: '', notes: '' });
  const [ouraSession, setOuraSession] = useState(null);
  const [ouraScore, setOuraScore] = useState(null);
  const [ouraLoading, setOuraLoading] = useState(false);
  const { confirmId, askDelete, cancelDelete, doDelete } = useConfirmDelete();
  const highlightRef = useRef(null);

  /* sleep records from vitals */
  const sleepRecords = useMemo(
    () => (data.vitals || []).filter(v => v.type === 'sleep').sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [data.vitals],
  );

  const filtered = useMemo(() => {
    const key = FILTER_KEY[filter];
    if (!key) return sleepRecords;
    return sleepRecords.filter(v => getSource(v) === key);
  }, [sleepRecords, filter]);

  /* last night */
  const lastNight = sleepRecords[0];
  const lastHrs = lastNight ? parseFloat(lastNight.value) || 0 : null;
  const lastQuality = lastHrs !== null ? qualityLabel(lastHrs) : null;

  /* fetch Oura live data on mount */
  useEffect(() => {
    if (!isOuraConnected()) return;
    setOuraLoading(true);
    const end = todayISO();
    const start = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    Promise.all([
      fetchOuraSleepSessions(start, end).catch(() => []),
      fetchOuraDailySleep(start, end).catch(() => []),
    ]).then(([sessions, daily]) => {
      if (sessions?.length) setOuraSession(sessions[sessions.length - 1]);
      if (daily?.length) setOuraScore(daily[daily.length - 1]);
    }).finally(() => setOuraLoading(false));
  }, []);

  /* highlight deep-link scroll */
  useEffect(() => {
    if (highlightId) {
      setExpandedId(highlightId);
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }, [highlightId]);

  /* 7-day chart data */
  const chartData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      const rec = sleepRecords.find(r => r.date === iso);
      const hrs = rec ? parseFloat(rec.value) || 0 : 0;
      days.push({ day: dayAbbr(iso), date: iso, hrs, fill: barColor(hrs) });
    }
    return days;
  }, [sleepRecords]);

  /* weekly stats */
  const weeklyStats = useMemo(() => {
    const last7 = chartData.map(d => d.hrs);
    const valid = last7.filter(h => h > 0);
    if (!valid.length) return null;
    const sum = valid.reduce((a, b) => a + b, 0);
    const avg = sum / valid.length;
    const best = Math.max(...valid);
    const worst = Math.min(...valid);
    const mean = sum / last7.length;
    const variance = last7.reduce((a, h) => a + (h - mean) ** 2, 0) / last7.length;
    const stdDev = Math.sqrt(variance);
    const consistency = Math.max(0, Math.min(100, Math.round(100 - stdDev * 20)));
    const debt = 7 * 8 - sum;
    return { avg: avg.toFixed(1), best: best.toFixed(1), worst: worst.toFixed(1), consistency, debt };
  }, [chartData]);

  /* Oura stage breakdown */
  const stageBreakdown = useMemo(() => {
    if (!ouraSession) return null;
    const total = (ouraSession.total_sleep_duration || 0) + (ouraSession.awake_time || 0);
    if (!total) return null;
    const pct = (s) => ((s || 0) / total) * 100;
    return {
      deep: pct(ouraSession.deep_sleep_duration),
      rem: pct(ouraSession.rem_sleep_duration),
      light: pct(ouraSession.light_sleep_duration),
      awake: pct(ouraSession.awake_time),
      efficiency: ouraSession.efficiency,
      latency: msToMin(ouraSession.latency),
    };
  }, [ouraSession]);

  /* form handlers */
  const resetForm = () => { setForm({ date: todayISO(), hours: '', notes: '' }); setSubView(null); };

  const handleSave = () => {
    const hrs = parseFloat(form.hours);
    if (!form.date || !hrs || hrs <= 0) return;
    addItem('vitals', { date: form.date, type: 'sleep', value: String(hrs), value2: '', unit: 'hrs', source: 'manual', notes: form.notes.trim() });
    resetForm();
  };

  const handleDelete = (id) => {
    doDelete(() => removeItem('vitals', id));
  };

  /* ── add form sub-view ── */
  if (subView === 'add') {
    return (
      <FormWrap title="Log Sleep" onBack={resetForm}>
        <div className="space-y-3">
          <Field label="Date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          <Field label="Hours slept" type="number" step="0.1" min="0" max="24" placeholder="7.5" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} />
          <Field label="Notes" as="textarea" rows={3} placeholder="How did you sleep?" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <Button onClick={handleSave} className="w-full">Save</Button>
        </div>
      </FormWrap>
    );
  }

  /* ── empty state ── */
  if (!sleepRecords.length && !ouraLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setSubView('add')}><Plus size={14} className="mr-1" />Log Sleep</Button>
        </div>
        <EmptyState icon={Moon} title="No sleep data yet" description="Log your first night or connect a wearable to start tracking." />
      </div>
    );
  }

  /* ── main view ── */
  return (
    <div className="space-y-4">
      {/* action bar */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setSubView('add')}><Plus size={14} className="mr-1" />Log Sleep</Button>
      </div>

      {/* last night hero */}
      {lastNight && (
        <Card className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider">Last Night</p>
              <p className="text-3xl font-playfair font-semibold text-salve-text mt-0.5">
                {lastHrs}<span className="text-sm text-salve-textMid font-montserrat ml-1">hrs</span>
              </p>
              <p className="text-[10px] text-salve-textMid font-montserrat mt-1">{fmtDate(lastNight.date)}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {ouraScore?.score != null && (
                <Badge style={{ background: `${C.lav}22`, color: C.lav }}>
                  Score {ouraScore.score}
                </Badge>
              )}
              {lastQuality && (
                <Badge style={{ background: `${lastQuality.color}22`, color: lastQuality.color }}>
                  {lastQuality.text}
                </Badge>
              )}
              <SourceBadge source={getSource(lastNight)} />
            </div>
          </div>
        </Card>
      )}

      {/* Oura loading */}
      {ouraLoading && (
        <div className="flex items-center justify-center gap-2 py-3">
          <Loader size={14} className="animate-spin text-salve-lav" />
          <span className="text-xs text-salve-textMid font-montserrat">Fetching Oura data...</span>
        </div>
      )}

      {/* sleep stage breakdown */}
      {stageBreakdown && (
        <Card>
          <p className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-2">Sleep Stages</p>
          <div className="space-y-1.5">
            <SleepBar label="Deep" pct={stageBreakdown.deep} color={C.lav} />
            <SleepBar label="REM" pct={stageBreakdown.rem} color={C.sage} />
            <SleepBar label="Light" pct={stageBreakdown.light} color={C.amber} />
            <SleepBar label="Awake" pct={stageBreakdown.awake} color={C.rose} />
          </div>
          <div className="flex gap-4 mt-2.5 pt-2 border-t border-salve-border">
            <span className="text-[10px] text-salve-textMid font-montserrat">
              Efficiency <span className="text-salve-text font-medium">{stageBreakdown.efficiency ?? '\u2014'}%</span>
            </span>
            <span className="text-[10px] text-salve-textMid font-montserrat">
              Latency <span className="text-salve-text font-medium">{stageBreakdown.latency}min</span>
            </span>
          </div>
        </Card>
      )}

      {/* Oura metrics grid */}
      {ouraSession && (
        <div className="grid grid-cols-2 gap-2">
          <MetricBox label="Efficiency" value={ouraSession.efficiency} unit="%" icon={Sunrise} color={C.lav} />
          <MetricBox label="Latency" value={msToMin(ouraSession.latency)} unit="min" icon={Clock} color={C.amber} />
          <MetricBox label="Resting HR" value={ouraSession.lowest_heart_rate} unit="bpm" icon={Heart} color={C.rose} />
          <MetricBox label="HRV" value={ouraSession.average_hrv ? Math.round(ouraSession.average_hrv) : null} unit="ms" icon={TrendingUp} color={C.sage} />
        </div>
      )}

      {/* 7-day trend chart */}
      {chartData.some(d => d.hrs > 0) && (
        <Card>
          <p className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-2">7-Day Trend</p>
          <div className="h-36" role="img" aria-label="Sleep duration chart for the past 7 nights">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.textFaint, fontSize: 10, fontFamily: 'Montserrat' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 12]} tick={{ fill: C.textFaint, fontSize: 10, fontFamily: 'Montserrat' }} axisLine={false} tickLine={false} />
                <ReferenceLine y={8} stroke={C.lav} strokeDasharray="4 4" strokeOpacity={0.5} />
                <Tooltip
                  contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, fontFamily: 'Montserrat' }}
                  labelStyle={{ color: C.textMid }}
                  formatter={(v) => [`${v} hrs`, 'Sleep']}
                />
                <Bar dataKey="hrs" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* weekly stats */}
      {weeklyStats && (
        <Card>
          <p className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-2">This Week</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div className="flex justify-between text-xs font-montserrat">
              <span className="text-salve-textMid">Average</span>
              <span className="text-salve-text font-medium">{weeklyStats.avg} hrs</span>
            </div>
            <div className="flex justify-between text-xs font-montserrat">
              <span className="text-salve-textMid">Best</span>
              <span className="text-salve-text font-medium">{weeklyStats.best} hrs</span>
            </div>
            <div className="flex justify-between text-xs font-montserrat">
              <span className="text-salve-textMid">Worst</span>
              <span className="text-salve-text font-medium">{weeklyStats.worst} hrs</span>
            </div>
            <div className="flex justify-between text-xs font-montserrat">
              <span className="text-salve-textMid">Consistency</span>
              <span className="text-salve-text font-medium">{weeklyStats.consistency}%</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-salve-border">
            <div className="flex items-center gap-1.5 text-xs font-montserrat">
              {weeklyStats.debt > 0 ? (
                <>
                  <TrendingDown size={12} className="text-salve-lavDim" />
                  <span className="text-salve-textMid">{weeklyStats.debt.toFixed(1)} hrs behind</span>
                </>
              ) : (
                <>
                  <TrendingUp size={12} className="text-salve-lav" />
                  <span className="text-salve-lav">Caught up!</span>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* source filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTER_PILLS.map(pill => {
          const active = filter === pill;
          return (
            <button
              key={pill}
              onClick={() => setFilter(pill)}
              className={`text-[10px] font-montserrat px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? 'bg-salve-lav/20 border-salve-lav text-salve-lav'
                  : 'bg-transparent border-salve-border text-salve-textMid hover:border-salve-lav/40'
              }`}
            >
              {pill}
            </button>
          );
        })}
      </div>

      {/* sleep log list */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map(rec => {
            const hrs = parseFloat(rec.value) || 0;
            const src = getSource(rec);
            const q = qualityLabel(hrs);
            const expanded = expandedId === rec.id;
            const isHighlighted = highlightId === rec.id;
            return (
              <div key={rec.id} ref={isHighlighted ? highlightRef : undefined} className={isHighlighted ? 'highlight-pulse rounded-xl' : ''}>
                <Card className="cursor-pointer" onClick={() => setExpandedId(expanded ? null : rec.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Moon size={14} style={{ color: q.color }} />
                      <div>
                        <span className="text-sm font-medium text-salve-text font-montserrat">{hrs} hrs</span>
                        <span className="text-[10px] text-salve-textFaint font-montserrat ml-2">{fmtDate(rec.date)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <SourceBadge source={src} />
                      <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-2.5 pt-2.5 border-t border-salve-border space-y-2">
                      {rec.notes && <p className="text-xs text-salve-textMid font-montserrat">{rec.notes}</p>}
                      <div className="flex items-center gap-2">
                        <Badge style={{ background: `${q.color}22`, color: q.color }}>{q.text}</Badge>
                      </div>
                      {confirmId === rec.id ? (
                        <ConfirmBar onConfirm={() => handleDelete(rec.id)} onCancel={cancelDelete} />
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); askDelete(rec.id); }}
                          className="text-[10px] text-salve-rose/60 hover:text-salve-rose font-montserrat bg-transparent border-none cursor-pointer p-0"
                          aria-label={`Delete sleep record from ${fmtDate(rec.date)}`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        filter !== 'All' && (
          <p className="text-xs text-salve-textFaint font-montserrat text-center py-4">No {filter.toLowerCase()} sleep records.</p>
        )
      )}

      {/* educational tips */}
      <Card>
        <div className="space-y-2">
          <InfoCard
            title="Understanding Sleep Stages"
            body="Deep sleep is restorative for the body, repairing tissues and strengthening immunity. REM sleep supports memory consolidation and emotional processing. Light sleep serves as a transition phase. Most adults need 1.5-2 hrs of deep sleep and 1.5-2 hrs of REM per night."
          />
          <InfoCard
            title="Sleep Hygiene Tips"
            body="Keep a consistent schedule, even on weekends. Avoid screens 1 hour before bed. Keep the bedroom cool (65-68F) and dark. Limit caffeine after 2 PM. Exercise regularly but not within 3 hours of bedtime. Consider a wind-down routine with relaxation techniques."
          />
          <InfoCard
            title="Sleep Debt"
            body="Sleep debt accumulates when you consistently get less than your body needs (typically 7-9 hours for adults). Even small nightly deficits add up over the week. While you cannot fully repay large sleep debts in a single night, consistent adequate sleep can gradually restore balance."
          />
        </div>
      </Card>
    </div>
  );
}