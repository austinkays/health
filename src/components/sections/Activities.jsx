import { useState, useEffect, useMemo } from 'react';
import { Plus, Activity, ChevronDown, Clock, Flame, Heart, MapPin, Apple, Footprints, Zap, TrendingUp } from 'lucide-react';
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
import { EMPTY_ACTIVITY, WORKOUT_TYPES } from '../../constants/defaults';
import { fmtDate, todayISO } from '../../utils/dates';

const SOURCE_ICON = { oura: OuraIcon, apple_health: Apple };
const SOURCE_LABEL = { oura: 'Oura', apple_health: 'Apple Health', manual: 'Manual' };
const SOURCE_COLOR = { oura: '#8fbfa0', apple_health: '#b8a9e8', manual: '#6e6a80' };

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

/* ── Component ──────────────────────────────────────────── */

export default function Activities({ data, addItem, updateItem, removeItem, highlightId }) {
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
      const dateStr = d.toISOString().slice(0, 10);
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
      const dateStr = d.toISOString().slice(0, 10);
      const dayCal = acts.filter(a => a.date === dateStr).reduce((s, a) => s + (Number(a.calories) || 0), 0);
      days.push({ date: dateStr, cal: dayCal, label: d.toLocaleDateString('en', { weekday: 'short' })[0] });
    }
    const withData = days.filter(d => d.cal > 0);
    if (withData.length < 2) return null;
    const avg = Math.round(withData.reduce((s, d) => s + d.cal, 0) / withData.length);
    return { days, avg };
  }, [data.activities]);

  // Save
  const save = async () => {
    if (!form.type) return;
    const item = { ...form, date: form.date || todayISO() };
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
    setForm({ ...EMPTY_ACTIVITY, ...a });
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
            <Field label="Distance (km)" value={form.distance} onChange={v => sf('distance', v)} type="number" placeholder="5.0" />
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

      {/* Weekly summary */}
      {stats.weekCount > 0 && (
        <Card className="!bg-salve-sage/5 !border-salve-sage/15 mb-3">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-[18px] font-semibold text-salve-sage font-playfair">{stats.weekCount}</div>
              <div className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">This week</div>
            </div>
            {stats.totalMin > 0 && (
              <div className="text-center">
                <div className="text-[18px] font-semibold text-salve-text font-playfair">{formatDuration(stats.totalMin)}</div>
                <div className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">Active</div>
              </div>
            )}
            {stats.totalCal > 0 && (
              <div className="text-center">
                <div className="text-[18px] font-semibold text-salve-amber font-playfair">{stats.totalCal.toLocaleString()}</div>
                <div className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">Calories</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Steps + Calories + Distance dashboard */}
      {(stepsTrend || calTrend) && (
        <div className="space-y-2.5 mb-4">
          {/* Steps card with hero number + chart */}
          {stepsTrend && (
            <Card className="!p-4 md:!p-5">
              <div className="flex items-center gap-1.5 mb-2">
                <Footprints size={13} className="text-salve-sage" />
                <span className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider">Daily Steps</span>
                <span className="text-[10px] text-salve-textFaint font-montserrat ml-auto">7-day avg: {stepsTrend.avg.toLocaleString()}</span>
              </div>
              <div className="flex items-end gap-1.5 h-20">
                {stepsTrend.days.map((d, i) => {
                  const max = Math.max(...stepsTrend.days.map(x => x.steps), 1);
                  const pct = d.steps > 0 ? Math.max(d.steps / max, 0.06) : 0;
                  const isToday = i === 6;
                  const barColor = d.steps >= 10000 ? C.sage : d.steps >= 5000 ? C.lav : C.textFaint;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1">
                      {d.steps > 0 && (
                        <span className="text-[8px] font-montserrat font-medium" style={{ color: isToday ? barColor : C.textFaint }}>
                          {d.steps >= 1000 ? `${(d.steps / 1000).toFixed(1)}k` : d.steps}
                        </span>
                      )}
                      <div className="w-full rounded-md" style={{ height: d.steps > 0 ? `${Math.round(pct * 52)}px` : '2px', background: d.steps > 0 ? (isToday ? barColor : `${barColor}44`) : C.border }} />
                      <span className="text-[8px] font-montserrat" style={{ color: isToday ? barColor : C.textFaint }}>{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Calories + Distance side-by-side */}
          <div className="grid grid-cols-2 gap-2.5">
            {calTrend && (
              <Card className="!p-3.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Flame size={12} className="text-salve-rose" />
                  <span className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider">Calories</span>
                </div>
                <div className="text-[22px] font-medium text-salve-text font-montserrat leading-none mb-1">
                  {calTrend.days.reduce((s, d) => s + d.cal, 0).toLocaleString()}
                </div>
                <span className="text-[10px] text-salve-textFaint font-montserrat">burned this week</span>
                <div className="flex items-end gap-0.5 h-8 mt-2">
                  {calTrend.days.map((d, i) => {
                    const max = Math.max(...calTrend.days.map(x => x.cal), 1);
                    const pct = d.cal > 0 ? Math.max(d.cal / max, 0.08) : 0;
                    return (
                      <div key={d.date} className="flex-1 rounded-sm" style={{ height: d.cal > 0 ? `${Math.round(pct * 28)}px` : '2px', background: d.cal > 0 ? (i === 6 ? C.rose : `${C.rose}44`) : C.border }} />
                    );
                  })}
                </div>
              </Card>
            )}
            {(() => {
              const weekDist = sorted.filter(a => {
                const d = new Date(a.date + 'T00:00:00');
                return d >= new Date(Date.now() - 7 * 86400000) && Number(a.distance) > 0;
              }).reduce((s, a) => s + Number(a.distance), 0);
              if (!weekDist) return null;
              return (
                <Card className="!p-3.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MapPin size={12} className="text-salve-lav" />
                    <span className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider">Distance</span>
                  </div>
                  <div className="text-[22px] font-medium text-salve-text font-montserrat leading-none mb-1">
                    {weekDist.toFixed(1)}
                  </div>
                  <span className="text-[10px] text-salve-textFaint font-montserrat">km this week</span>
                </Card>
              );
            })()}
            {(() => {
              const weekDist = sorted.filter(a => {
                const d = new Date(a.date + 'T00:00:00');
                return d >= new Date(Date.now() - 7 * 86400000) && Number(a.distance) > 0;
              }).reduce((s, a) => s + Number(a.distance), 0);
              if (weekDist) return null; // distance card shown instead
              if (!calTrend) return null; // already showing calories
              // Show average HR if available
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
                    <span className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider">Avg HR</span>
                  </div>
                  <div className="text-[22px] font-medium text-salve-text font-montserrat leading-none mb-1">
                    {avgHR}
                  </div>
                  <span className="text-[10px] text-salve-textFaint font-montserrat">bpm during workouts</span>
                </Card>
              );
            })()}
          </div>
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
            className={`py-1 px-3 rounded-full text-[10px] font-medium border cursor-pointer font-montserrat transition-colors ${
              sourceFilter === 'all' ? 'border-salve-lav bg-salve-lav/15 text-salve-lav' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >All sources</button>
          {sources.map(s => {
            const Icon = SOURCE_ICON[s];
            return (
              <button key={s} onClick={() => setSourceFilter(s)}
                className={`py-1 px-3 rounded-full text-[10px] font-medium border cursor-pointer font-montserrat transition-colors flex items-center gap-1 ${
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
                        {a.date && <span>{fmtDate(a.date)}</span>}
                        {a.calories && <span className="flex items-center gap-0.5"><Flame size={10} /> {a.calories} kcal</span>}
                        {a.distance && <span className="flex items-center gap-0.5"><MapPin size={10} /> {a.distance} km</span>}
                        {isDaily && a.notes && <span>{a.notes}</span>}
                      </div>
                    )}
                  </div>
                  <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-1 mt-1 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>

                {/* Expanded */}
                <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                  <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                    {a.date && <div className="text-xs text-salve-textFaint mb-1">{fmtDate(a.date)}</div>}

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
                          <MapPin size={11} className="text-salve-lav" /> {a.distance} km
                        </div>
                      )}
                      {a.heart_rate_avg && (
                        <div className="flex items-center gap-1 text-xs text-salve-textMid">
                          <Heart size={11} className="text-salve-rose" /> {a.heart_rate_avg} bpm avg
                        </div>
                      )}
                    </div>

                    {a.source && <div className="text-[10px] text-salve-textFaint mb-1">Source: {a.source}</div>}
                    {a.notes && <div className="text-xs text-salve-textFaint leading-relaxed mb-1">{a.notes}</div>}

                    <div className="flex gap-2.5 mt-2.5">
                      <button onClick={() => startEdit(a)} className="text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline" aria-label={`Edit ${a.type}`}>Edit</button>
                      <button onClick={() => del.ask(a.id, a.type)} className="text-xs text-salve-rose bg-transparent border-none cursor-pointer font-montserrat hover:underline" aria-label={`Delete ${a.type}`}>Delete</button>
                    </div>
                    {del.pending === a.id && (
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
