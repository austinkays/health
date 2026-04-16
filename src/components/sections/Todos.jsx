import { useState, useEffect, useMemo } from 'react';
import { Plus, CheckSquare, ChevronDown, RefreshCw } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { EMPTY_TODO } from '../../constants/defaults';
import { fmtDate, daysUntil, localISODate } from '../../utils/dates';

/* ── Constants ──────────────────────────────────────────── */

const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];

const PRIORITIES = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const CATEGORIES = [
  { value: 'custom',      label: 'General' },
  { value: 'medication',  label: 'Medication' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'follow_up',   label: 'Follow-up' },
  { value: 'insurance',   label: 'Insurance' },
  { value: 'lab',         label: 'Lab / Test' },
  { value: 'research',    label: 'Research' },
];

const RECURRING = [
  { value: 'none',    label: 'None' },
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const priorityStyle = (p) => {
  if (p === 'urgent') return { color: C.rose, bg: 'rgba(232,138,154,0.18)', label: '\u26A0 Urgent' };
  if (p === 'high')   return { color: C.amber, bg: 'rgba(232,200,138,0.15)', label: '\u25C6 High' };
  if (p === 'medium') return { color: C.lav, bg: 'rgba(184,169,232,0.15)', label: '\u00B7 Medium' };
  return { color: C.sage, bg: 'rgba(143,191,160,0.15)', label: '\u2713 Low' };
};

function dueLabel(dateStr) {
  if (!dateStr) return null;
  const today = new Date(new Date().toDateString());
  const due = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((due - today) / 86400000);
  const absDiff = Math.abs(diff);
  if (diff < 0) return { text: `Overdue by ${absDiff} day${absDiff !== 1 ? 's' : ''}`, overdue: true };
  if (diff === 0) return { text: 'Due today', overdue: false };
  if (diff === 1) return { text: 'Due tomorrow', overdue: false };
  return { text: `Due in ${diff} days`, overdue: false };
}

/* ── Component ──────────────────────────────────────────── */

export default function Todos({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_TODO);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Deep-link: expand + scroll
  useEffect(() => {
    if (highlightId) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]);

  // Sort: priority order, then by due_date (nulls last), completed at bottom
  const sorted = useMemo(() => {
    return [...(data.todos || [])].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const pa = PRIORITY_ORDER.indexOf(a.priority || 'medium');
      const pb = PRIORITY_ORDER.indexOf(b.priority || 'medium');
      if (pa !== pb) return pa - pb;
      if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });
  }, [data.todos]);

  // Filter
  const filtered = useMemo(() => {
    const now = new Date(new Date().toDateString());
    return sorted.filter(t => {
      if (filter === 'active') return !t.completed;
      if (filter === 'completed') return t.completed;
      if (filter === 'overdue') return !t.completed && t.due_date && new Date(t.due_date + 'T00:00:00') < now;
      return true; // 'all'
    });
  }, [sorted, filter]);

  const overdueCt = useMemo(() => {
    const now = new Date(new Date().toDateString());
    return (data.todos || []).filter(t => !t.completed && t.due_date && new Date(t.due_date + 'T00:00:00') < now).length;
  }, [data.todos]);

  // Save handler
  const save = async () => {
    if (!form.title.trim()) return;
    if (editId) {
      await updateItem('todos', editId, form);
    } else {
      await addItem('todos', form);
    }
    setSubView(null);
    setForm(EMPTY_TODO);
    setEditId(null);
  };

  // Complete toggle, auto-create next occurrence for recurring todos
  const toggleComplete = async (t) => {
    const nowCompleted = !t.completed;
    await updateItem('todos', t.id, {
      completed: nowCompleted,
      completed_at: nowCompleted ? new Date().toISOString() : null,
    });
    if (nowCompleted && t.recurring && t.recurring !== 'none' && t.due_date) {
      const base = new Date(t.due_date + 'T00:00:00');
      if (t.recurring === 'daily') base.setDate(base.getDate() + 1);
      else if (t.recurring === 'weekly') base.setDate(base.getDate() + 7);
      else if (t.recurring === 'monthly') base.setMonth(base.getMonth() + 1);
      const nextDue = localISODate(base);
      const { id, created_at, updated_at, completed, completed_at, ...rest } = t;
      await addItem('todos', { ...rest, due_date: nextDue, completed: false, completed_at: null });
    }
  };

  // Start editing
  const startEdit = (t) => {
    setForm({ ...EMPTY_TODO, ...t });
    setEditId(t.id);
    setSubView('form');
  };

  // ── Add/Edit Form ──────────────────────────────────────

  if (subView === 'form') {
    return (
      <FormWrap title={editId ? 'Edit To-Do' : 'New To-Do'} onBack={() => { setSubView(null); setForm(EMPTY_TODO); setEditId(null); }}>
        <Card>
          <div className="space-y-3">
            <Field label="Title" value={form.title} onChange={v => sf('title', v)} required placeholder="What needs to be done?" />
            <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Additional details..." />
            <Field label="Due Date" value={form.due_date} onChange={v => sf('due_date', v)} type="date" />
            <Field
              label="Priority"
              value={form.priority}
              onChange={v => sf('priority', v)}
              options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))}
            />
            <Field
              label="Category"
              value={form.category}
              onChange={v => sf('category', v)}
              options={CATEGORIES.map(c => ({ value: c.value, label: c.label }))}
            />
            <Field
              label="Recurring"
              value={form.recurring}
              onChange={v => sf('recurring', v)}
              options={RECURRING.map(r => ({ value: r.value, label: r.label }))}
            />
          </div>
          <Button variant="lavender" onClick={save} className="w-full justify-center mt-4">
            {editId ? 'Save Changes' : 'Add To-Do'}
          </Button>
        </Card>
      </FormWrap>
    );
  }

  // ── List View ──────────────────────────────────────────

  return (
    <div className="mt-2">
      <div className="flex justify-end mb-3">
        <Button variant="lavender" onClick={() => { setForm(EMPTY_TODO); setEditId(null); setSubView('form'); }} className="!py-1.5 !px-3 !text-xs">
          <Plus size={14} /> Add
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-3.5 flex-wrap">
        {[
          { key: 'active', label: 'Active' },
          { key: 'all', label: 'All' },
          { key: 'completed', label: 'Done' },
          { key: 'overdue', label: `Overdue${overdueCt > 0 ? ` (${overdueCt})` : ''}` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat ${
              filter === f.key
                ? f.key === 'overdue' && overdueCt > 0
                  ? 'border-salve-rose bg-salve-rose/15 text-salve-rose'
                  : 'border-salve-lav bg-salve-lav/15 text-salve-lav'
                : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >{f.label}</button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          text={filter === 'active' ? 'No active to-dos' : filter === 'completed' ? 'Nothing completed yet' : filter === 'overdue' ? 'Nothing overdue' : 'No to-dos yet'}
          motif="leaf"
        />
      ) : (
        <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-4">
          {filtered.map(t => {
            const isExpanded = expandedId === t.id;
            const ps = priorityStyle(t.priority);
            const dl = dueLabel(t.due_date);
            const catLabel = CATEGORIES.find(c => c.value === t.category)?.label || t.category;

            return (
              <Card
                key={t.id}
                id={`record-${t.id}`}
                onClick={() => setExpandedId(isExpanded ? null : t.id)}
                className={`cursor-pointer transition-all ${highlightId === t.id ? 'highlight-pulse' : ''} ${t.completed ? 'opacity-60' : ''}`}
                style={{ borderLeft: `3px solid ${t.completed ? C.textFaint : ps.color}` }}
              >
                <div className="flex items-start gap-2.5">
                  {/* Complete checkbox */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleComplete(t); }}
                    className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center cursor-pointer transition-colors ${
                      t.completed
                        ? 'bg-salve-sage/30 border-salve-sage text-salve-sage'
                        : 'bg-transparent border-salve-border hover:border-salve-lav'
                    }`}
                    aria-label={t.completed ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {t.completed && <CheckSquare size={12} />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[15px] font-semibold text-salve-text font-playfair ${t.completed ? 'line-through' : ''}`}>
                        {t.title}
                      </span>
                      {!t.completed && <Badge label={ps.label} color={ps.color} bg={ps.bg} />}
                    </div>

                    {/* Collapsed summary */}
                    {!isExpanded && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {dl && (
                          <span className={`text-xs ${dl.overdue && !t.completed ? 'text-salve-rose font-semibold' : 'text-salve-textFaint'}`}>
                            {dl.text}
                          </span>
                        )}
                        {t.category && t.category !== 'custom' && (
                          <span className="text-[12px] text-salve-textFaint bg-salve-card2 rounded-full px-2 py-0.5">{catLabel}</span>
                        )}
                        {t.recurring && t.recurring !== 'none' && (
                          <span className="text-[12px] text-salve-textFaint flex items-center gap-0.5">
                            <RefreshCw size={9} /> {t.recurring}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-1 mt-1 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>

                {/* Expanded details */}
                <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                  <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                    {dl && (
                      <div className={`text-xs mb-1 ${dl.overdue && !t.completed ? 'text-salve-rose font-semibold' : 'text-salve-textFaint'}`}>
                        {dl.text} {t.due_date && <span className="text-salve-textFaint font-normal">({fmtDate(t.due_date)})</span>}
                      </div>
                    )}
                    {t.category && t.category !== 'custom' && (
                      <div className="text-xs text-salve-textFaint mb-1">Category: {catLabel}</div>
                    )}
                    {t.recurring && t.recurring !== 'none' && (
                      <div className="text-xs text-salve-textFaint mb-1 flex items-center gap-1">
                        <RefreshCw size={10} /> Repeats {t.recurring}
                      </div>
                    )}
                    {t.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{t.notes}</div>}
                    {t.completed && t.completed_at && (
                      <div className="text-[12px] text-salve-sage mt-1">Completed {fmtDate(t.completed_at)}</div>
                    )}

                    <div className="flex gap-2.5 mt-2.5">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline"
                        aria-label={`Edit ${t.title}`}
                      >Edit</button>
                      <button
                        onClick={() => del.ask(t.id, t.title)}
                        className="text-xs text-salve-rose bg-transparent border-none cursor-pointer font-montserrat hover:underline"
                        aria-label={`Delete ${t.title}`}
                      >Delete</button>
                    </div>
                    {del.pending === t.id && (
                      <ConfirmBar
                        pending={del.pending}
                        onConfirm={() => del.confirm(id => removeItem('todos', id))}
                        onCancel={del.cancel}
                        itemId={t.id}
                      />
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
