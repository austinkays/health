import { useState, useEffect, useMemo } from 'react';
import { Plus, Activity, ChevronDown, Clock, Flame, Heart, MapPin } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { EMPTY_ACTIVITY, WORKOUT_TYPES } from '../../constants/defaults';
import { fmtDate } from '../../utils/dates';

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
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

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
    if (filter === 'all') return sorted;
    if (filter === 'workouts') return sorted.filter(a => a.type !== 'Daily Activity');
    if (filter === 'daily') return sorted.filter(a => a.type === 'Daily Activity');
    return sorted.filter(a => a.type === filter);
  }, [sorted, filter]);

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

  // Save
  const save = async () => {
    if (!form.type) return;
    const item = { ...form, date: form.date || new Date().toISOString().slice(0, 10) };
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
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Activities</SectionTitle>
        <Button variant="lavender" onClick={() => { setForm({ ...EMPTY_ACTIVITY, date: new Date().toISOString().slice(0, 10) }); setEditId(null); setSubView('form'); }} className="!py-1.5 !px-3 !text-xs">
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

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState icon={Activity} text={filter === 'all' ? 'No activities yet' : `No ${filter} activities`} motif="leaf" />
      ) : (
        <div className="flex flex-col gap-2">
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
