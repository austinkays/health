import { useState, useEffect, useMemo } from 'react';
import { Plus, Check, BookOpen, Sparkles, Loader, ChevronDown } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { EMPTY_JOURNAL, MOODS } from '../../constants/defaults';
import { fmtDate } from '../../utils/dates';
import { C } from '../../constants/colors';
import { fetchJournalPatterns, isFeatureLocked } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import { getCyclePhaseForDate } from '../../utils/cycles';

export default function Journal({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_JOURNAL });
  const [editId, setEditId] = useState(null);
  const [patternsAI, setPatternsAI] = useState(null);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [tagFilter, setTagFilter] = useState(null);
  const [moodPhaseOpen, setMoodPhaseOpen] = useState(() => localStorage.getItem('salve:journal-mood-phase') !== 'false');
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (highlightId && data.journal.some(e => e.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyzePatterns = async () => {
    setPatternsLoading(true);
    setPatternsAI(null);
    try {
      const result = await fetchJournalPatterns(data.journal.slice(0, 30), buildProfile(data));
      setPatternsAI(result);
    } catch (e) {
      setPatternsAI('Unable to analyze patterns right now. ' + e.message);
    } finally {
      setPatternsLoading(false);
    }
  };

  const moodByPhase = useMemo(() => {
    if (!data.cycles?.length) return null;
    const phases = {};
    for (const e of data.journal) {
      // Use severity (1-10 numeric) since mood is emoji strings
      if (!e.severity) continue;
      const cp = getCyclePhaseForDate(e.date, data.cycles);
      if (!cp) continue;
      if (!phases[cp.phase]) phases[cp.phase] = { total: 0, count: 0, color: cp.color };
      const val = typeof e.severity === 'number' ? e.severity : Number(e.severity);
      if (isNaN(val)) continue;
      phases[cp.phase].total += val;
      phases[cp.phase].count += 1;
    }
    const qualified = Object.entries(phases).filter(([, v]) => v.count >= 2);
    const totalEntries = qualified.reduce((sum, [, v]) => sum + v.count, 0);
    if (qualified.length < 2 || totalEntries < 5) return null;
    return qualified.map(([phase, v]) => ({
      phase,
      avg: Math.round((v.total / v.count) * 10) / 10,
      count: v.count,
      color: v.color,
    })).sort((a, b) => {
      const order = ['Menstrual', 'Follicular', 'Ovulatory', 'Luteal'];
      return order.indexOf(a.phase) - order.indexOf(b.phase);
    });
  }, [data.journal, data.cycles]);

  const saveJ = async () => {
    if (!form.content.trim() && !form.title.trim()) return;
    if (editId) {
      await updateItem('journal', editId, form);
    } else {
      await addItem('journal', form);
    }
    setForm({ ...EMPTY_JOURNAL, date: new Date().toISOString().slice(0, 10) });
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'New'} Entry`} onBack={() => { setSubView(null); setForm(EMPTY_JOURNAL); setEditId(null); }}>
      <Card>
        <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" />
        {data.cycles?.length > 0 && form.date && (() => {
          const cp = getCyclePhaseForDate(form.date, data.cycles);
          return cp ? (
            <div className="text-xs font-montserrat -mt-1 mb-1 pl-1" style={{ color: cp.color }}>
              Cycle day {cp.dayOfCycle} · {cp.phase} phase
            </div>
          ) : null;
        })()}
        <Field label="Title (optional)" value={form.title} onChange={v => sf('title', v)} placeholder="Quick label for today" />
        <Field label="Mood" value={form.mood} onChange={v => sf('mood', v)} options={MOODS} />
        <Field label="Symptom Severity" value={form.severity} onChange={v => sf('severity', v)} options={[...Array(10)].map((_, i) => ({ value: String(i + 1), label: `${i + 1}/10${i === 0 ? ' (minimal)' : i === 9 ? ' (worst)' : ''}` }))} />
        <Field label="What's going on?" value={form.content} onChange={v => sf('content', v)} textarea placeholder="Symptoms, triggers, what helped..." />
        <Field label="Tags" value={form.tags} onChange={v => sf('tags', v)} placeholder="flare, fatigue, headache..." />
        <div className="flex gap-2">
          <Button onClick={saveJ} disabled={!form.content.trim() && !form.title.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_JOURNAL); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      <div className="flex justify-end mb-3">
        <Button variant="lavender" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Write</Button>
      </div>

      {data.journal.length >= 3 && hasAIConsent() && (
        <div className="mb-3">
          <Button
            variant="ghost"
            onClick={analyzePatterns}
            disabled={patternsLoading}
            className="!text-xs w-full !justify-center"
          >
            {patternsLoading ? <><Loader size={13} className="animate-spin" /> Finding patterns...</> : isFeatureLocked('journalPatterns') ? <><Sparkles size={13} /> Analyze Patterns (Premium)</> : <><Sparkles size={13} /> Analyze Patterns with Sage</>}
          </Button>
          {patternsAI && (
            <Card className="!bg-salve-lav/8 !border-salve-lav/20 mt-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-semibold text-salve-lav flex items-center gap-1"><Sparkles size={11} /> Pattern Insights</div>
                <button onClick={() => setPatternsAI(null)} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss pattern insights">×</button>
              </div>
              <AIMarkdown>{patternsAI}</AIMarkdown>
            </Card>
          )}
        </div>
      )}

      {moodByPhase && (
        <Card className="mb-3">
          <button
            onClick={() => {
              const next = !moodPhaseOpen;
              setMoodPhaseOpen(next);
              localStorage.setItem('salve:journal-mood-phase', String(next));
            }}
            className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0"
          >
            <span className="text-xs font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Severity by Cycle Phase</span>
            <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${moodPhaseOpen ? 'rotate-180' : ''}`} />
          </button>
          {moodPhaseOpen && (
            <div className="mt-2.5 space-y-2">
              {moodByPhase.map(p => {
                const maxMood = 10;
                const pct = Math.round((p.avg / maxMood) * 100);
                return (
                  <div key={p.phase} className="flex items-center gap-2.5">
                    <span className="text-[11px] font-medium font-montserrat w-20 text-right" style={{ color: p.color }}>{p.phase}</span>
                    <div className="flex-1 h-2 rounded-full bg-salve-card2 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: p.color + '66' }} />
                    </div>
                    <span className="text-[11px] font-montserrat text-salve-textMid w-8">{p.avg}</span>
                  </div>
                );
              })}
              <div className="text-[9px] text-salve-textFaint font-montserrat text-center pt-1">
                Based on {moodByPhase.reduce((s, p) => s + p.count, 0)} journal entries with severity ratings
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Tag filter pills */}
      {(() => {
        const allTags = [...new Set(data.journal.flatMap(e => e.tags ? e.tags.split(',').map(t => t.trim()).filter(Boolean) : []))].sort();
        if (allTags.length === 0) return null;
        return (
          <div className="flex gap-1.5 flex-wrap mb-3">
            <button
              onClick={() => setTagFilter(null)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${!tagFilter ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30'}`}
            >All</button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${tagFilter === tag ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30'}`}
              >{tag}</button>
            ))}
          </div>
        );
      })()}

      {data.journal.length === 0 ? <EmptyState icon={BookOpen} text="Your journal is empty — start tracking patterns" motif="moon" /> :
        data.journal.filter(e => !tagFilter || (e.tags && e.tags.split(',').map(t => t.trim()).includes(tagFilter))).map(e => {
          const sev = Number(e.severity);
          const sevColor = sev >= 7 ? C.rose : sev >= 4 ? C.amber : C.sage;
          const sevBg = sev >= 7 ? 'rgba(232,138,154,0.15)' : sev >= 4 ? 'rgba(232,200,138,0.15)' : 'rgba(143,191,160,0.15)';
          const isExpanded = expandedId === e.id;
          const cyclePhase = data.cycles?.length > 0 ? getCyclePhaseForDate(e.date, data.cycles) : null;
          return (
            <Card key={e.id} id={`record-${e.id}`} className={`!bg-salve-lav/10 !border-salve-lav/20 cursor-pointer transition-all${highlightId === e.id ? ' highlight-ring' : ''}`} onClick={() => setExpandedId(isExpanded ? null : e.id)}>
              <div className="flex justify-between items-start mb-0.5">
                <div className="flex-1 min-w-0">
                  <span className="font-playfair text-sm font-medium text-salve-text">{e.title || fmtDate(e.date)}</span>
                  {e.title && <span className="text-[11px] text-salve-textFaint ml-2">{fmtDate(e.date)}</span>}
                  {cyclePhase && (
                    <Badge label={`${cyclePhase.phase} day ${cyclePhase.dayOfCycle}`} color={cyclePhase.color} bg={`${cyclePhase.color}22`} />
                  )}
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  {e.mood && <span className="text-base">{e.mood.split(' ')[0]}</span>}
                  {e.severity && <Badge label={`${e.severity}/10`} color={sevColor} bg={sevBg} />}
                  <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
              {!isExpanded && e.content && (
                <div className="text-[13px] text-salve-textMid leading-relaxed line-clamp-2">{e.content}</div>
              )}
              <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                <div className="mt-1.5 pt-1.5 border-t border-salve-lav/15" onClick={ev => ev.stopPropagation()}>
                  <div className="text-[13px] text-salve-textMid leading-relaxed">{e.content}</div>
                  {e.tags && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {e.tags.split(',').map((t, i) => (
                        <span key={i} className="bg-salve-card2 text-salve-textMid text-[11px] px-2.5 py-0.5 rounded-full border border-salve-border">{t.trim()}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2.5 mt-2.5">
                    <button onClick={() => { setForm(e); setEditId(e.id); setSubView('form'); }} aria-label="Edit journal entry" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1">Edit</button>
                    <button onClick={() => del.ask(e.id, e.title || 'entry')} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1">Delete</button>
                  </div>
                </div>
              </div></div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('journal', id))} onCancel={del.cancel} itemId={e.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
