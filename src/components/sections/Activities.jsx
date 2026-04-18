import { useState, useEffect, useMemo } from 'react';
import { Plus, Activity, ChevronDown, Clock, Flame, Heart, MapPin, Apple, Footprints, Zap, TrendingUp, Watch, Edit, Trash2, Loader, Target, Timer, Trophy } from 'lucide-react';
import { OuraIcon } from '../ui/OuraIcon';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import AIMarkdown from '../ui/AIMarkdown';
import { hasAIConsent } from '../ui/AIConsentGate';
import { C } from '../../constants/colors';
import { EMPTY_ACTIVITY, WORKOUT_TYPES } from '../../constants/defaults';
import { fmtDate, todayISO, localISODate } from '../../utils/dates';
import { convertDistanceForDisplay, convertDistanceForStorage } from '../../utils/units';
import { fetchActivityTrend } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { computeCorrelations } from '../../utils/correlations';

const SOURCE_ICON = { oura: OuraIcon, apple_health: Apple, fitbit: Watch };
const SOURCE_LABEL = { oura: 'Oura', apple_health: 'Apple Health', fitbit: 'Fitbit', manual: 'Manual' };
const SOURCE_COLOR = { oura: '#8fbfa0', apple_health: '#b8a9e8', fitbit: '#00B0B9', manual: '#6e6a80' };

/* ── Helpers ────────────────────────────────────────────── */

const typeColor = (type) => {
  const t = (type || '').toLowerCase();
  if (t.includes('run')) return C.rose;
  if (t.includes('walk') || t.includes('hik')) return C.sage;
  if (t.includes('cycl') || t.includes('swim')) return C.lav;
  if (t.includes('strength') || t.includes('hiit') || t.includes('core')) return C.amber;
  if (t.includes('yoga') || t.includes('pilat')) return C.lav;
  if (t === 'daily activity') return C.textMid;
  return C.sage;
};

function formatDuration(mins) {
  if (!mins) return null;
  const m = Number(mins);
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const remainder = Math.round(m % 60);
  return remainder > 0 ? `${h}h ${remainder}m` : `${h}h`;
}

function formatPace(durationMins, dist) {
  if (!durationMins || !dist || dist <= 0) return null;
  const pace = durationMins / dist;
  if (pace > 60 || pace < 2) return null;
  const mins = Math.floor(pace);
  const secs = Math.round((pace - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseStepsFromNotes(notes) {
  if (!notes) return 0;
  const m = notes.match(/([\d,]+)\s*steps/i);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

const STEP_GOAL = 8000;
const ACTIVE_MIN_GOAL = 150; // WHO recommendation per week

function distanceEquivalence(miles) {
  if (miles >= 26.2) return `a full marathon`;
  if (miles >= 13.1) return `a half marathon`;
  if (miles >= 6.2) return `a 10K race`;
  if (miles >= 3.1) return `a 5K race`;
  if (miles >= 2) return `${miles.toFixed(1)} miles — about a neighborhood loop`;
  if (miles >= 1) return `${miles.toFixed(1)} miles`;
  return `${miles.toFixed(1)} miles`;
}

function relativeDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en', { weekday: 'long' });
  return fmtDate(dateStr);
}

/* ── Component ──────────────────────────────────────────── */

export default function Activities({ data, addItem, updateItem, removeItem, highlightId }) {
  const unitSystem = data?.settings?.unit_system || 'imperial';
  const distLabel = unitSystem === 'metric' ? 'km' : 'mi';
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_ACTIVITY);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('workouts');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Normalize source (older imports used 'Apple Health', newer use 'apple_health')
  const getSource = (a) => {
    const raw = a.source || 'manual';
    if (raw === 'Apple Health' || raw === 'apple_health') return 'apple_health';
    return raw;
  };
  const sources = useMemo(() => {
    const s = new Set();
    (data.activities || []).forEach(a => s.add(getSource(a)));
    return [...s].sort();
  }, [data.activities]);

  // Deep-link
  useEffect(() => {
    if (highlightId) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]);

  // Sort by date descending
  const sorted = useMemo(() =>
    [...(data.activities || [])].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    [data.activities]
  );

  // Get unique types for filter pills
  const activityTypes = useMemo(() => {
    const types = new Set(sorted.map(a => a.type).filter(Boolean));
    return [...types].sort();
  }, [sorted]);

  // Filter
  const filtered = useMemo(() => {
    let list = sorted;
    if (filter === 'workouts') list = list.filter(a => a.type !== 'Daily Activity');
    else if (filter === 'daily') list = list.filter(a => a.type === 'Daily Activity');
    else if (filter !== 'all') list = list.filter(a => a.type === filter);
    if (sourceFilter !== 'all') list = list.filter(a => getSource(a) === sourceFilter);
    return list;
  }, [sorted, filter, sourceFilter]);

  // Stats
  const stats = useMemo(() => {
    const workouts = sorted.filter(a => a.type !== 'Daily Activity');
    const thisWeek = workouts.filter(a => {
      const d = new Date(a.date + 'T00:00:00');
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      return d >= weekAgo;
    });
    const totalCal = thisWeek.reduce((s, a) => s + (Number(a.calories) || 0), 0);
    const totalMin = thisWeek.reduce((s, a) => s + (Number(a.duration_minutes) || 0), 0);
    return { weekCount: thisWeek.length, totalCal, totalMin, total: workouts.length };
  }, [sorted]);

  // 7-day steps trend (from vitals)
  const stepsTrend = useMemo(() => {
    const stepVitals = (data.vitals || []).filter(v => v.type === 'steps');
    if (!stepVitals.length) return null;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = localISODate(d);
      const daySteps = stepVitals.filter(v => v.date === dateStr).reduce((s, v) => s + (Number(v.value) || 0), 0);
      days.push({ date: dateStr, steps: daySteps, label: d.toLocaleDateString('en', { weekday: 'short' })[0] });
    }
    const withData = days.filter(d => d.steps > 0);
    if (withData.length < 2) return null;
    const avg = Math.round(withData.reduce((s, d) => s + d.steps, 0) / withData.length);
    return { days, avg };
  }, [data.vitals]);

  // 7-day calories trend (from activities)
  const calTrend = useMemo(() => {
    const acts = data.activities || [];
    if (!acts.length) return null;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = localISODate(d);
      const dayCal = acts.filter(a => a.date === dateStr).reduce((s, a) => s + (Number(a.calories) || 0), 0);
      days.push({ date: dateStr, cal: dayCal, label: d.toLocaleDateString('en', { weekday: 'short' })[0] });
    }
    const withData = days.filter(d => d.cal > 0);
    if (withData.length < 2) return null;
    const avg = Math.round(withData.reduce((s, d) => s + d.cal, 0) / withData.length);
    return { days, avg };
  }, [data.activities]);

  // Steps by date (for enriching Daily Activity cards)
  const stepsMap = useMemo(() => {
    const map = {};
    (data.vitals || []).filter(v => v.type === 'steps').forEach(v => {
      map[v.date] = (map[v.date] || 0) + (Number(v.value) || 0);
    });
    return map;
  }, [data.vitals]);

  const weeklySteps = useMemo(() => {
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 86400000);
      total += stepsMap[localISODate(d)] || 0;
    }
    return total;
  }, [stepsMap]);

  // AI trend state
  const [trendAI, setTrendAI] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);

  // Last week stats for week-over-week comparison
  const lastWeekStats = useMemo(() => {
    const workouts = sorted.filter(a => a.type !== 'Daily Activity');
    const prevWeek = workouts.filter(a => {
      const d = new Date(a.date + 'T00:00:00');
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
      return d >= twoWeeksAgo && d < oneWeekAgo;
    });
    const totalMin = prevWeek.reduce((s, a) => s + (Number(a.duration_minutes) || 0), 0);
    let steps = 0;
    for (let i = 7; i < 14; i++) {
      const d = new Date(Date.now() - i * 86400000);
      steps += stepsMap[localISODate(d)] || 0;
    }
    return { weekCount: prevWeek.length, totalMin, steps };
  }, [sorted, stepsMap]);

  // Active minutes this week (workout activities only)
  const activeMinutes = stats.totalMin;
  const activeMinPct = Math.min(Math.round((activeMinutes / ACTIVE_MIN_GOAL) * 100), 100);

  // Best day this week (most active minutes)
  const bestDay = useMemo(() => {
    const workouts = sorted.filter(a => a.type !== 'Daily Activity');
    const dayMap = {};
    workouts.forEach(a => {
      const d = new Date(a.date + 'T00:00:00');
      if (d >= new Date(Date.now() - 7 * 86400000)) {
        dayMap[a.date] = (dayMap[a.date] || 0) + (Number(a.duration_minutes) || 0);
      }
    });
    let best = null;
    for (const [date, mins] of Object.entries(dayMap)) {
      if (!best || mins > best.mins) best = { date, mins };
    }
    return best;
  }, [sorted]);

  // Exercise↔health correlations
  const exerciseInsights = useMemo(() => {
    if (!data.vitals?.length || !data.activities?.length) return [];
    try {
      const all = computeCorrelations(data);
      return all.filter(c => c.category === 'exercise');
    } catch { return []; }
  }, [data]);

  // Weekly distance
  const weekDist = useMemo(() => {
    return sorted.filter(a => {
      const d = new Date(a.date + 'T00:00:00');
      return d >= new Date(Date.now() - 7 * 86400000) && Number(a.distance) > 0;
    }).reduce((s, a) => s + Number(a.distance), 0);
  }, [sorted]);

  // Save
  const save = async () => {
    if (!form.type) return;
    const item = { ...form, date: form.date || todayISO() };
    if (item.distance) item.distance = convertDistanceForStorage(Number(item.distance), unitSystem);
    if (editId) {
      await updateItem('activities', editId, item);
    } else {
      await addItem('activities', item);
    }
    setSubView(null);
    setForm(EMPTY_ACTIVITY);
    setEditId(null);
  };

  const startEdit = (a) => {
    const edit = { ...EMPTY_ACTIVITY, ...a };
    if (edit.distance) {
      const d = convertDistanceForDisplay(Number(edit.distance), unitSystem);
      edit.distance = d.value;
    }
    setForm(edit);
    setEditId(a.id);
    setSubView('form');
  };

  // ── Form ──────────────────────────────────────────────

  if (subView === 'form') {
    return (
      <FormWrap title={editId ? 'Edit Activity' : 'Log Activity'} onBack={() => { setSubView(null); setForm(EMPTY_ACTIVITY); setEditId(null); }}>
        <Card>
          <div className="space-y-3">
            <Field
              label="Type"
              value={form.type}
              onChange={v => sf('type', v)}
              options={WORKOUT_TYPES.map(t => ({ value: t, label: t }))}
              required
            />
            <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" />
            <Field label="Duration (minutes)" value={form.duration_minutes} onChange={v => sf('duration_minutes', v)} type="number" placeholder="30" />
            <Field label={`Distance (${distLabel})`} value={form.distance} onChange={v => sf('distance', v)} type="number" placeholder="5.0" />
            <Field label="Calories Burned" value={form.calories} onChange={v => sf('calories', v)} type="number" placeholder="250" />
            <Field label="Avg Heart Rate" value={form.heart_rate_avg} onChange={v => sf('heart_rate_avg', v)} type="number" placeholder="140" />
            <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="How did it feel?" />
          </div>
          <Button variant="lavender" onClick={save} className="w-full justify-center mt-4">
            {editId ? 'Save Changes' : 'Log Activity'}
          </Button>
        </Card>
      </FormWrap>
    );
  }

  // ── List View ─────────────────────────────────────────

  return (
    <div className="mt-2">
      <div className="flex justify-end mb-3">
        <Button variant="lavender" onClick={() => { setForm({ ...EMPTY_ACTIVITY, date: todayISO() }); setEditId(null); setSubView('form'); }} className="!py-1.5 !px-3 !text-xs">
          <Plus size={14} /> Log
        </Button>
      </div>

      {/* ── Your Week narrative card ─────────────────── */}
      {(stats.weekCount > 0 || weeklySteps > 0) && (() => {
        const stepsDelta = lastWeekStats.steps > 0 ? Math.round(((weeklySteps - lastWeekStats.steps) / lastWeekStats.steps) * 100) : null;
        const minsDelta = lastWeekStats.totalMin > 0 ? Math.round(((stats.totalMin - lastWeekStats.totalMin) / lastWeekStats.totalMin) * 100) : null;

        return (
          <Card className="!bg-salve-sage/5 !border-salve-sage/15 mb-3">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Zap size={13} className="text-salve-sage" />
              <span className="text-ui-xs text-salve-textFaint font-montserrat uppercase tracking-wider">Your Week</span>
            </div>

            {/* Narrative sentence */}
            <p className="text-ui-md text-salve-text font-montserrat leading-relaxed mb-3">
              {stats.weekCount > 0 && <>You logged <span className="font-semibold text-salve-sage">{stats.weekCount} workout{stats.weekCount !== 1 ? 's' : ''}</span> totaling <span className="font-semibold">{formatDuration(stats.totalMin)}</span> of active time</>}
              {stats.weekCount > 0 && weeklySteps > 0 && <> and </>}
              {stats.weekCount === 0 && weeklySteps > 0 && <>You took </>}
              {weeklySteps > 0 && <><span className="font-semibold text-salve-sage">{weeklySteps.toLocaleString()} steps</span>{stats.weekCount === 0 ? ' this week' : ''}</>}
              {stats.weekCount > 0 && weeklySteps === 0 && <> this week</>}
              .
            </p>

            {/* Chips row — contextual badges */}
            <div className="flex flex-wrap gap-1.5">
              {/* Active minutes progress toward 150 min/week WHO goal */}
              {activeMinutes > 0 && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-montserrat font-medium px-2 py-0.5 rounded-full ${
                  activeMinPct >= 100 ? 'bg-salve-sage/15 text-salve-sage' : activeMinPct >= 60 ? 'bg-salve-lav/15 text-salve-lav' : 'bg-salve-amber/15 text-salve-amber'
                }`}>
                  <Timer size={9} />
                  {activeMinPct >= 100 ? '✓ 150 min goal hit' : `${activeMinPct}% of 150 min goal`}
                </span>
              )}
              {/* Steps trend vs last week */}
              {stepsDelta !== null && Math.abs(stepsDelta) >= 5 && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-montserrat font-medium px-2 py-0.5 rounded-full ${
                  stepsDelta > 0 ? 'bg-salve-sage/15 text-salve-sage' : 'bg-salve-amber/15 text-salve-amber'
                }`}>
                  {stepsDelta > 0 ? '↑' : '↓'} {Math.abs(stepsDelta)}% steps vs last week
                </span>
              )}
              {/* Active minutes trend vs last week */}
              {minsDelta !== null && Math.abs(minsDelta) >= 10 && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-montserrat font-medium px-2 py-0.5 rounded-full ${
                  minsDelta > 0 ? 'bg-salve-sage/15 text-salve-sage' : 'bg-salve-amber/15 text-salve-amber'
                }`}>
                  {minsDelta > 0 ? '↑' : '↓'} {Math.abs(minsDelta)}% active time vs last week
                </span>
              )}
              {/* Best day */}
              {bestDay && bestDay.mins >= 20 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-montserrat font-medium px-2 py-0.5 rounded-full bg-salve-lav/15 text-salve-lav">
                  <Trophy size={9} />
                  Best day: {new Date(bestDay.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' })} — {formatDuration(bestDay.mins)}
                </span>
              )}
              {/* Distance equivalence */}
              {weekDist > 0 && (() => {
                const d = convertDistanceForDisplay(weekDist, unitSystem);
                return d.value >= 1 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-montserrat font-medium px-2 py-0.5 rounded-full bg-salve-lav/10 text-salve-textMid">
                    <MapPin size={9} /> {distanceEquivalence(d.value)}
                  </span>
                ) : null;
              })()}
            </div>
          </Card>
        );
      })()}

      {/* ── Steps chart with goal line ──────────────────── */}
      {(stepsTrend || calTrend) && (
        <div className="space-y-2.5 mb-4">
          {stepsTrend && (
            <Card className="!p-4 md:!p-5">
              <div className="flex items-center gap-1.5 mb-2">
                <Footprints size={13} className="text-salve-sage" />
                <span className="text-[12px] text-salve-textFaint font-montserrat uppercase tracking-wider">Daily Steps</span>
                <span className="text-[12px] text-salve-textFaint font-montserrat ml-auto">
                  {(() => {
                    const todaySteps = stepsTrend.days[6]?.steps || 0;
                    if (todaySteps > 0) {
                      const pctGoal = Math.round((todaySteps / STEP_GOAL) * 100);
                      return pctGoal >= 100 ? `✓ Goal hit today` : `${pctGoal}% of ${(STEP_GOAL / 1000).toFixed(0)}k goal`;
                    }
                    return `avg: ${stepsTrend.avg.toLocaleString()}`;
                  })()}
                </span>
              </div>
              <div className="relative flex items-end gap-1.5 h-20">
                {/* Goal line */}
                {(() => {
                  const max = Math.max(...stepsTrend.days.map(x => x.steps), STEP_GOAL);
                  const goalPct = STEP_GOAL / max;
                  return (
                    <div className="absolute left-0 right-0 pointer-events-none" style={{ bottom: `${Math.round(goalPct * 52 + 16)}px` }}>
                      <div className="w-full border-t border-dashed" style={{ borderColor: `${C.sage}55` }} />
                    </div>
                  );
                })()}
                {stepsTrend.days.map((d, i) => {
                  const max = Math.max(...stepsTrend.days.map(x => x.steps), STEP_GOAL);
                  const pct = d.steps > 0 ? Math.max(d.steps / max, 0.06) : 0;
                  const isToday = i === 6;
                  const barColor = d.steps >= STEP_GOAL ? C.sage : d.steps >= STEP_GOAL * 0.6 ? C.lav : C.textFaint;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1">
                      {d.steps > 0 && (
                        <span className="text-[8px] font-montserrat font-medium" style={{ color: isToday ? barColor : C.textFaint }}>
                          {d.steps >= 1000 ? `${(d.steps / 1000).toFixed(1)}k` : d.steps}
                        </span>
                      )}
                      <div className="w-full rounded-md transition-all" style={{ height: d.steps > 0 ? `${Math.round(pct * 52)}px` : '2px', background: d.steps > 0 ? (isToday ? barColor : `${barColor}44`) : C.border }} />
                      <span className="text-[8px] font-montserrat" style={{ color: isToday ? barColor : C.textFaint }}>{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Active Minutes + Distance side-by-side */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Active Minutes card (replaces raw calories) */}
            {stats.totalMin > 0 && (
              <Card className="!p-3.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Timer size={12} className="text-salve-sage" />
                  <span className="text-[12px] text-salve-textFaint font-montserrat uppercase tracking-wider">Active Min</span>
                </div>
                <div className="text-[22px] font-medium text-salve-text font-montserrat leading-none mb-1">
                  {formatDuration(activeMinutes)}
                </div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-salve-border/40 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${activeMinPct}%`, background: activeMinPct >= 100 ? C.sage : activeMinPct >= 60 ? C.lav : C.amber }} />
                  </div>
                  <span className="text-[10px] text-salve-textFaint font-montserrat">{activeMinPct}%</span>
                </div>
                <span className="text-[11px] text-salve-textFaint font-montserrat">of 150 min/week goal</span>
              </Card>
            )}
            {/* Distance card with equivalence */}
            {weekDist > 0 && (() => {
              const dispDist = convertDistanceForDisplay(weekDist, unitSystem);
              return (
                <Card className="!p-3.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MapPin size={12} className="text-salve-lav" />
                    <span className="text-[12px] text-salve-textFaint font-montserrat uppercase tracking-wider">Distance</span>
                  </div>
                  <div className="text-[22px] font-medium text-salve-text font-montserrat leading-none mb-1">
                    {dispDist.value.toFixed(1)}
                  </div>
                  <span className="text-[12px] text-salve-textFaint font-montserrat">{dispDist.unit} this week</span>
                  {dispDist.value >= 3.1 && (
                    <div className="text-[10px] text-salve-textMid font-montserrat mt-1 italic">≈ {distanceEquivalence(dispDist.value)}</div>
                  )}
                </Card>
              );
            })()}
            {/* Fallback: Calories if no active minutes, or Avg HR if no distance */}
            {stats.totalMin === 0 && calTrend && (
              <Card className="!p-3.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Flame size={12} className="text-salve-rose" />
                  <span className="text-[12px] text-salve-textFaint font-montserrat uppercase tracking-wider">Calories</span>
                </div>
                <div className="text-[22px] font-medium text-salve-text font-montserrat leading-none mb-1">
                  {calTrend.days.reduce((s, d) => s + d.cal, 0).toLocaleString()}
                </div>
                <span className="text-[12px] text-salve-textFaint font-montserrat">burned this week</span>
              </Card>
            )}
            {!weekDist && (() => {
              const weekHR = sorted.filter(a => {
                const d = new Date(a.date + 'T00:00:00');
                return d >= new Date(Date.now() - 7 * 86400000) && Number(a.heart_rate_avg) > 0;
              });
              if (!weekHR.length) return null;
              const avgHR = Math.round(weekHR.reduce((s, a) => s + Number(a.heart_rate_avg), 0) / weekHR.length);
              return (
                <Card className="!p-3.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Heart size={12} className="text-salve-lav" />
                    <span className="text-[12px] text-salve-textFaint font-montserrat uppercase tracking-wider">Avg HR</span>
                  </div>
                  <div className="text-[22px] font-medium text-salve-text font-montserrat leading-none mb-1">
                    {avgHR}
                  </div>
                  <span className="text-[12px] text-salve-textFaint font-montserrat">bpm during workouts</span>
                </Card>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Exercise↔Health Correlation Card ────────────── */}
      {exerciseInsights.length > 0 && (
        <Card className="!bg-salve-lav/5 !border-salve-lav/15 mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity size={13} className="text-salve-lav" />
            <span className="text-ui-xs text-salve-textFaint font-montserrat uppercase tracking-wider">How Exercise Affects You</span>
          </div>
          <div className="space-y-1.5">
            {exerciseInsights.slice(0, 3).map((insight, i) => (
              <p key={i} className="text-ui-base text-salve-textMid font-montserrat leading-relaxed">
                {insight.text}
              </p>
            ))}
          </div>
        </Card>
      )}

      {/* ── Sage Activity Analysis ──────────────────────── */}
      {(data.activities?.length >= 3 || (data.vitals || []).filter(v => v.type === 'steps').length >= 3) && hasAIConsent() && (
        <div className="mb-3">
          {!trendAI && (
            <div className="text-right">
              <button
                onClick={async () => {
                  setTrendLoading(true);
                  setTrendAI(null);
                  try {
                    const recentActivities = sorted.slice(0, 20).map(a => ({
                      type: a.type, date: a.date, duration: a.duration_minutes,
                      calories: a.calories, distance: a.distance,
                      hr: a.heart_rate_avg, notes: a.notes,
                    }));
                    const recentSteps = (data.vitals || []).filter(v => v.type === 'steps').slice(-14).map(v => ({
                      date: v.date, steps: v.value,
                    }));
                    const result = await fetchActivityTrend({ activities: recentActivities, steps: recentSteps }, buildProfile(data));
                    setTrendAI(result);
                  } catch (e) {
                    setTrendAI('Unable to analyze activity trends right now. ' + e.message);
                  } finally {
                    setTrendLoading(false);
                  }
                }}
                disabled={trendLoading}
                className="inline-flex items-center gap-1 text-[11px] text-salve-lav font-montserrat bg-transparent border-0 p-0 cursor-pointer hover:underline disabled:opacity-50"
              >
                {trendLoading ? <><Loader size={10} className="animate-spin" /> Analyzing…</> : <><TrendingUp size={10} /> Analyze activity with Sage</>}
              </button>
            </div>
          )}
          {trendAI && (
            <Card className="!bg-salve-lav/8 !border-salve-lav/20">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[13px] font-semibold text-salve-lav flex items-center gap-1"><TrendingUp size={11} /> Activity Analysis</div>
                <button onClick={() => setTrendAI(null)} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss activity analysis">×</button>
              </div>
              <AIMarkdown>{trendAI}</AIMarkdown>
            </Card>
          )}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-1.5 mb-3.5 flex-wrap">
        {[
          { key: 'all', label: 'All' },
          { key: 'workouts', label: 'Workouts' },
          { key: 'daily', label: 'Daily' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat ${
              filter === f.key
                ? 'border-salve-sage bg-salve-sage/15 text-salve-sage'
                : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >{f.label}</button>
        ))}
      </div>

      {/* Source filter pills */}
      {sources.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          <button onClick={() => setSourceFilter('all')}
            className={`py-1 px-3 rounded-full text-[12px] font-medium border cursor-pointer font-montserrat transition-colors ${
              sourceFilter === 'all' ? 'border-salve-lav bg-salve-lav/15 text-salve-lav' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >All sources</button>
          {sources.map(s => {
            const Icon = SOURCE_ICON[s];
            return (
              <button key={s} onClick={() => setSourceFilter(s)}
                className={`py-1 px-3 rounded-full text-[12px] font-medium border cursor-pointer font-montserrat transition-colors flex items-center gap-1 ${
                  sourceFilter === s ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
                }`}
              >
                {Icon && <Icon size={9} />}
                {SOURCE_LABEL[s] || s}
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState icon={Activity} text={filter === 'all' ? 'No activities yet' : `No ${filter} activities`} motif="leaf" />
      ) : (
        <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-4">
          {filtered.map(a => {
            const isExpanded = expandedId === a.id;
            const color = typeColor(a.type);
            const isDaily = a.type === 'Daily Activity';
            const isPB = !isDaily && a.duration_minutes && sorted.filter(x => x.type === a.type && x.id !== a.id).every(x => (Number(x.duration_minutes) || 0) <= Number(a.duration_minutes));

            return (
              <Card
                key={a.id}
                id={`record-${a.id}`}
                onClick={() => setExpandedId(isExpanded ? null : a.id)}
                className={`cursor-pointer transition-all ${highlightId === a.id ? 'highlight-pulse' : ''} ${isDaily ? 'opacity-70' : ''}`}
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`text-[15px] font-semibold text-salve-text font-playfair ${isDaily ? 'text-[14px]' : ''}`}>
                        {a.type || 'Activity'}
                      </span>
                      {a.duration_minutes && !isDaily && (
                        <Badge label={formatDuration(a.duration_minutes)} color={C.textMid} bg={C.textFaint + '15'} />
                      )}
                      {isPB && sorted.filter(x => x.type === a.type).length >= 3 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-montserrat font-semibold px-1.5 py-0.5 rounded-md text-salve-amber bg-salve-amber/12">
                          <Trophy size={8} /> PB
                        </span>
                      )}
                      {(() => {
                        const s = getSource(a);
                        if (s === 'manual') return null;
                        const SrcIcon = SOURCE_ICON[s];
                        return (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-montserrat px-1.5 py-0.5 rounded-md" style={{ color: SOURCE_COLOR[s], background: SOURCE_COLOR[s] + '18' }}>
                            {SrcIcon && <SrcIcon size={8} />} {SOURCE_LABEL[s] || s}
                          </span>
                        );
                      })()}
                    </div>
                    {!isExpanded && (
                      <div className="flex items-center gap-2.5 text-xs text-salve-textFaint flex-wrap">
                        {a.date && <span>{relativeDate(a.date)}</span>}
                        {isDaily && (() => {
                          const steps = stepsMap[a.date] || parseStepsFromNotes(a.notes);
                          return steps > 0 ? <span className="flex items-center gap-0.5"><Footprints size={10} /> {steps.toLocaleString()} steps</span> : null;
                        })()}
                        {Number(a.calories) > 0 && <span className="flex items-center gap-0.5"><Flame size={10} /> {a.calories} kcal</span>}
                        {Number(a.distance) > 0 && (
                          <span className="flex items-center gap-0.5">
                            <MapPin size={10} /> {convertDistanceForDisplay(Number(a.distance), unitSystem).value} {distLabel}
                          </span>
                        )}
                        {!isDaily && Number(a.heart_rate_avg) > 0 && (
                          <span className="flex items-center gap-0.5"><Heart size={10} /> {a.heart_rate_avg} bpm</span>
                        )}
                        {!isDaily && Number(a.distance) > 0 && Number(a.duration_minutes) > 0 && (() => {
                          const dist = convertDistanceForDisplay(Number(a.distance), unitSystem);
                          const pace = formatPace(Number(a.duration_minutes), dist.value);
                          return pace ? <span className="flex items-center gap-0.5"><TrendingUp size={10} /> {pace} /{distLabel}</span> : null;
                        })()}
                      </div>
                    )}
                  </div>
                  <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-1 mt-1 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>

                {/* Expanded */}
                <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                  <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                    {a.date && <div className="text-xs text-salve-textFaint mb-1">{relativeDate(a.date)}</div>}

                    <div className="flex flex-wrap gap-3 mb-2">
                      {a.duration_minutes && (
                        <div className="flex items-center gap-1 text-xs text-salve-textMid">
                          <Clock size={11} className="text-salve-sage" /> {formatDuration(a.duration_minutes)}
                        </div>
                      )}
                      {a.calories && (
                        <div className="flex items-center gap-1 text-xs text-salve-textMid">
                          <Flame size={11} className="text-salve-amber" /> {a.calories} kcal
                        </div>
                      )}
                      {a.distance && (
                        <div className="flex items-center gap-1 text-xs text-salve-textMid">
                          <MapPin size={11} className="text-salve-lav" /> {convertDistanceForDisplay(Number(a.distance), unitSystem).value} {distLabel}
                        </div>
                      )}
                      {a.heart_rate_avg && (
                        <div className="flex items-center gap-1 text-xs text-salve-textMid">
                          <Heart size={11} className="text-salve-rose" /> {a.heart_rate_avg} bpm avg
                        </div>
                      )}
                    </div>

                    {a.source && <div className="text-[12px] text-salve-textFaint mb-1">Source: {a.source}</div>}
                    {a.notes && <div className="text-xs text-salve-textFaint leading-relaxed mb-1">{a.notes}</div>}

                    <div className="flex gap-2 mt-3">
                      <button onClick={() => startEdit(a)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-salve-lav/10 text-salve-lav text-xs font-semibold font-montserrat border border-salve-lav/20 cursor-pointer hover:bg-salve-lav/20 transition-colors" aria-label={`Edit ${a.type}`}><Edit size={13} /> Edit</button>
                      <button onClick={() => del.ask(a.id, a.type)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-salve-textFaint text-xs font-medium font-montserrat border border-salve-border cursor-pointer hover:bg-salve-rose/10 hover:text-salve-rose hover:border-salve-rose/25 transition-colors" aria-label={`Delete ${a.type}`}><Trash2 size={13} /> Delete</button>
                    </div>
                    {del.pending?.id === a.id && (
                      <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('activities', id))} onCancel={del.cancel} itemId={a.id} />
                    )}
                  </div>
                </div></div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
