import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Check, BookOpen, Sparkles, Loader, ChevronDown, X, RefreshCw, Link2, Mic, MicOff, Calendar } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { EMPTY_JOURNAL, MOODS, COMMON_SYMPTOMS } from '../../constants/defaults';
import { fmtDate, todayISO } from '../../utils/dates';
import { C } from '../../constants/colors';
import { fetchJournalPatterns, extractJournalData, isFeatureLocked } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import CrisisModal from '../ui/CrisisModal';
import { getCyclePhaseForDate } from '../../utils/cycles';
import { getReflectionPrompt, isPositiveMood, getContextualPrompt } from '../../constants/journalPrompts';
import { detectCrisis } from '../../utils/crisis';
import useVoiceInput from '../../hooks/useVoiceInput';

function VoiceInputBlock({ onTranscript }) {
  const { isListening, transcript, error, start, stop, isSupported } = useVoiceInput();
  if (!isSupported) return null;

  const handleToggle = () => {
    if (isListening) {
      stop();
      if (transcript) onTranscript(transcript);
    } else {
      start();
    }
  };

  return (
    <div className="mb-3 -mt-0.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggle}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-montserrat font-medium transition-all cursor-pointer ${
            isListening
              ? 'bg-salve-rose/15 border-salve-rose/40 text-salve-rose animate-pulse'
              : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/40 hover:text-salve-lav'
          }`}
          aria-label={isListening ? 'Stop recording' : 'Start voice entry'}
        >
          {isListening ? <MicOff size={14} /> : <Mic size={14} />}
          {isListening ? 'Stop · tap to save' : 'Voice entry'}
        </button>
        {isListening && (
          <span className="text-[10px] text-salve-rose font-montserrat animate-pulse">● Recording</span>
        )}
      </div>
      {isListening && transcript && (
        <div className="mt-1.5 px-2.5 py-2 rounded-lg bg-salve-lav/5 border border-salve-lav/15 text-xs text-salve-text font-montserrat leading-relaxed">
          {transcript}
        </div>
      )}
      {error && (
        <p className="text-[11px] text-salve-rose font-montserrat mt-1" role="alert">{error}</p>
      )}
    </div>
  );
}

export default function Journal({ data, addItem, updateItem, removeItem, highlightId, onNav }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_JOURNAL });
  const [editId, setEditId] = useState(null);
  const [patternsAI, setPatternsAI] = useState(null);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [tagFilter, setTagFilter] = useState(null);
  const [symptomFilter, setSymptomFilter] = useState(null);
  const [crisisType, setCrisisType] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState(null); // { mood, severity, symptoms, triggers, interventions, medications_mentioned }
  const [moodPhaseOpen, setMoodPhaseOpen] = useState(() => localStorage.getItem('salve:journal-mood-phase') !== 'false');
  const [reflectionPrompt, setReflectionPrompt] = useState(() => getContextualPrompt(data) || getReflectionPrompt(''));
  const [linksOpen, setLinksOpen] = useState(false);
  const [quickCheck, setQuickCheck] = useState({ sleep: '', hydration: '', activity: '' });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Symptom suggestions: user's condition names + common symptoms, deduped
  const symptomSuggestions = useMemo(() => {
    const condNames = (data.conditions || []).filter(c => c.status === 'active').map(c => c.name);
    return [...new Set([...condNames, ...COMMON_SYMPTOMS])].sort();
  }, [data.conditions]);

  // Rotate reflection prompt when mood changes
  const refreshPrompt = useCallback(() => {
    setReflectionPrompt(getReflectionPrompt(form.mood));
  }, [form.mood]);

  // --- AI extraction from freeform text ---
  const runExtraction = async () => {
    const text = form.content?.trim();
    if (!text || text.length < 10 || !hasAIConsent()) return;
    setExtracting(true);
    setExtraction(null);
    try {
      const result = await extractJournalData(text, buildProfile(data));
      if (result) setExtraction(result);
    } catch { /* swallow — not critical */ }
    setExtracting(false);
  };

  const applyExtraction = () => {
    if (!extraction) return;
    const updates = {};
    if (extraction.mood && MOODS.includes(extraction.mood)) updates.mood = extraction.mood;
    if (extraction.severity) {
      const sev = String(Math.max(1, Math.min(10, Math.round(Number(extraction.severity)))));
      if (sev !== 'NaN') updates.severity = sev;
    }
    if (extraction.symptoms?.length) {
      updates.symptoms = extraction.symptoms.slice(0, 10).map(s => ({
        name: typeof s === 'string' ? s : (s.name || ''),
        severity: String(Math.max(1, Math.min(10, Math.round(Number(s.severity || 5))))),
      })).filter(s => s.name);
    }
    if (extraction.triggers) updates.triggers = extraction.triggers;
    if (extraction.interventions) updates.interventions = extraction.interventions;
    setForm(p => ({ ...p, ...updates }));
    setExtraction(null);
  };

  const removeExtractionField = (field) => {
    setExtraction(prev => {
      if (!prev) return null;
      const next = { ...prev };
      if (field === 'symptoms') next.symptoms = [];
      else if (field === 'medications_mentioned') next.medications_mentioned = [];
      else delete next[field];
      return next;
    });
  };

  useEffect(() => {
    setReflectionPrompt(getReflectionPrompt(form.mood));
  }, [form.mood]);

  // Symptom builder helpers
  const addSymptom = () => {
    if ((form.symptoms || []).length >= 10) return;
    sf('symptoms', [...(form.symptoms || []), { name: '', severity: '5' }]);
  };
  const updateSymptom = (idx, field, value) => {
    const updated = [...(form.symptoms || [])];
    updated[idx] = { ...updated[idx], [field]: value };
    sf('symptoms', updated);
  };
  const removeSymptom = (idx) => {
    sf('symptoms', (form.symptoms || []).filter((_, i) => i !== idx));
  };

  // Cross-link toggle helpers
  const toggleLinkedCondition = (id) => {
    const current = form.linked_conditions || [];
    sf('linked_conditions', current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  };
  const toggleLinkedMed = (id) => {
    const current = form.linked_meds || [];
    sf('linked_meds', current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  };

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
    // Strip transient UI keys before persisting
    const { _triggersOpen, _interventionsOpen, _adherenceOpen, ...persistForm } = form;
    // Crisis check — show resources but still save (journal is the user's space)
    const crisis = detectCrisis(persistForm.content);
    if (editId) {
      await updateItem('journal', editId, persistForm);
    } else {
      await addItem('journal', persistForm);
    }
    // Create vitals for quick check-in
    const dt = persistForm.date || todayISO();
    if (quickCheck.sleep) {
      addItem('vitals', { date: dt, type: 'sleep', value: quickCheck.sleep, unit: 'hrs', notes: 'from journal' });
    }
    if (quickCheck.hydration) {
      addItem('vitals', { date: dt, type: 'hydration', value: quickCheck.hydration, unit: '/4', notes: 'from journal' });
    }
    if (quickCheck.activity) {
      addItem('vitals', { date: dt, type: 'activity_level', value: quickCheck.activity, unit: '/4', notes: 'from journal' });
    }
    if (crisis.isCrisis) setCrisisType(crisis.type);
    setForm({ ...EMPTY_JOURNAL, date: todayISO() });
    setQuickCheck({ sleep: '', hydration: '', activity: '' });
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') {
    const activeConditions = (data.conditions || []).filter(c => c.status === 'active' || c.status === 'managed');
    const activeMeds = (data.meds || []).filter(m => m.active !== false);
    const showGratitude = isPositiveMood(form.mood);

    // Auto-expand details when editing an entry that has detail-level data
    const hasDetailData = editId && (
      (form.symptoms || []).length > 0 ||
      (form.severity && form.severity !== '5') ||
      form.triggers ||
      form.interventions ||
      Object.keys(form.adherence || {}).length > 0 ||
      form.gratitude ||
      (form.linked_conditions || []).length > 0 ||
      (form.linked_meds || []).length > 0 ||
      quickCheck.sleep || quickCheck.hydration || quickCheck.activity
    );

    // Count how many detail sections have data (for the badge)
    const detailCount = [
      (form.symptoms || []).length > 0,
      form.severity && form.severity !== '5',
      form.triggers,
      form.interventions,
      Object.keys(form.adherence || {}).length > 0,
      form.gratitude,
      (form.linked_conditions || []).length + (form.linked_meds || []).length > 0,
      quickCheck.sleep || quickCheck.hydration || quickCheck.activity,
    ].filter(Boolean).length;

    const isDetailsOpen = detailsOpen || hasDetailData;

    return (
    <FormWrap title={`${editId ? 'Edit' : 'New'} Entry`} onBack={() => { setSubView(null); setForm(EMPTY_JOURNAL); setEditId(null); setDetailsOpen(false); setDateOpen(false); }}>
      <Card>
        {/* ── Date row (compact) + Voice button ── */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {dateOpen ? (
              <input
                type="date"
                value={form.date}
                onChange={e => { sf('date', e.target.value); }}
                onBlur={() => setDateOpen(false)}
                autoFocus
                className="bg-salve-card border border-salve-border rounded-lg px-2 py-1 text-xs text-salve-text font-montserrat focus:outline-none focus:ring-1 focus:ring-salve-lav/40"
              />
            ) : (
              <button
                type="button"
                onClick={() => setDateOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-salve-card2 border border-salve-border text-xs text-salve-textMid font-montserrat font-medium cursor-pointer hover:border-salve-lav/30 transition-colors"
                aria-label="Change date"
              >
                <Calendar size={12} className="text-salve-textFaint" />
                {form.date === todayISO() ? 'Today' : fmtDate(form.date)}
              </button>
            )}
            {data.cycles?.length > 0 && form.date && (() => {
              const cp = getCyclePhaseForDate(form.date, data.cycles);
              return cp ? (
                <span className="text-[10px] font-montserrat" style={{ color: cp.color }}>
                  Day {cp.dayOfCycle} · {cp.phase}
                </span>
              ) : null;
            })()}
          </div>
          <VoiceInputBlock onTranscript={t => sf('content', ((form.content || '') + (form.content ? '\n' : '') + t).trim())} />
        </div>

        {/* ── Title ── */}
        <Field label="Title (optional)" value={form.title} onChange={v => sf('title', v)} placeholder="Quick label for today" />

        {/* ── Mood as emoji pill buttons ── */}
        <div className="mb-3">
          <label className="text-xs font-medium font-montserrat text-salve-textMid block mb-1.5">Mood</label>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map(m => {
              const active = form.mood === m;
              const emoji = m.split(' ')[0];
              const label = m.split(' ').slice(1).join(' ');
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => sf('mood', active ? '' : m)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs font-montserrat font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-salve-lav/20 border-salve-lav/50 text-salve-lav ring-1 ring-salve-lav/30'
                      : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30 hover:text-salve-textMid'
                  }`}
                  aria-label={`Mood: ${m}`}
                  aria-pressed={active}
                >
                  <span className="text-sm">{emoji}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mood-aware reflection prompt */}
        <div className="flex items-center gap-1.5 -mt-1 mb-3 px-1">
          <p className="text-xs text-salve-textFaint italic font-montserrat flex-1 leading-relaxed">
            {reflectionPrompt}
          </p>
          <button
            onClick={refreshPrompt}
            className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-lav p-0.5 shrink-0 transition-colors"
            aria-label="Get a different prompt"
            title="Get a different prompt"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {/* ── Main content textarea ── */}
        <Field label="How are you feeling?" value={form.content} onChange={v => sf('content', v)} textarea placeholder="What's on your mind today..." />

        {/* AI extraction — extract structured data from freeform text */}
        {hasAIConsent() && (form.content || '').trim().length >= 20 && !extraction && (
          <div className="-mt-1 mb-3">
            <button
              type="button"
              onClick={runExtraction}
              disabled={extracting}
              className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-salve-lav/70 text-[11px] font-montserrat p-0 hover:text-salve-lav transition-colors disabled:opacity-50"
            >
              {extracting ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {extracting ? 'Extracting...' : 'Extract mood & symptoms with Sage'}
            </button>
          </div>
        )}
        {extraction && (
          <div className="mb-3 px-2.5 py-2 rounded-lg bg-salve-lav/8 border border-salve-lav/20">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-salve-lav font-montserrat flex items-center gap-1"><Sparkles size={11} /> Sage noticed</span>
              <button type="button" onClick={() => setExtraction(null)} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss extraction">×</button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {extraction.mood && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-salve-card border border-salve-border text-salve-text font-montserrat">
                  {extraction.mood}
                  <button type="button" onClick={() => removeExtractionField('mood')} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0 leading-none" aria-label="Remove mood"><X size={10} /></button>
                </span>
              )}
              {extraction.severity && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-salve-card border border-salve-border text-salve-text font-montserrat">
                  Severity {extraction.severity}/10
                  <button type="button" onClick={() => removeExtractionField('severity')} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0 leading-none" aria-label="Remove severity"><X size={10} /></button>
                </span>
              )}
              {(extraction.symptoms || []).map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-salve-amber/10 border border-salve-amber/25 text-salve-amber font-montserrat">
                  {typeof s === 'string' ? s : s.name}{s.severity ? ` ${s.severity}/10` : ''}
                  <button type="button" onClick={() => setExtraction(prev => ({ ...prev, symptoms: prev.symptoms.filter((_, j) => j !== i) }))} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0 leading-none" aria-label={`Remove ${typeof s === 'string' ? s : s.name}`}><X size={10} /></button>
                </span>
              ))}
              {extraction.triggers && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-salve-rose/10 border border-salve-rose/25 text-salve-rose font-montserrat">
                  ⚡ {extraction.triggers.length > 40 ? extraction.triggers.slice(0, 40) + '…' : extraction.triggers}
                  <button type="button" onClick={() => removeExtractionField('triggers')} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0 leading-none" aria-label="Remove triggers"><X size={10} /></button>
                </span>
              )}
              {extraction.interventions && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-salve-sage/10 border border-salve-sage/25 text-salve-sage font-montserrat">
                  ✦ {extraction.interventions.length > 40 ? extraction.interventions.slice(0, 40) + '…' : extraction.interventions}
                  <button type="button" onClick={() => removeExtractionField('interventions')} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0 leading-none" aria-label="Remove interventions"><X size={10} /></button>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={applyExtraction} className="text-[11px] px-3 py-1 rounded-full bg-salve-lav/20 border border-salve-lav/30 text-salve-lav font-montserrat font-medium cursor-pointer hover:bg-salve-lav/30 transition-colors">
                <Check size={10} className="inline mr-1 -mt-px" />Apply
              </button>
              <button type="button" onClick={() => setExtraction(null)} className="text-[11px] px-3 py-1 rounded-full bg-salve-card border border-salve-border text-salve-textFaint font-montserrat cursor-pointer hover:text-salve-text transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── Tags ── */}
        <Field label="Tags" value={form.tags} onChange={v => sf('tags', v)} placeholder="flare, fatigue, headache..." />

        {/* ── Add details toggle ── */}
        <div className="mb-3 -mt-1">
          <button
            type="button"
            onClick={() => setDetailsOpen(!isDetailsOpen)}
            className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg bg-salve-card2/50 border border-salve-border/60 text-xs font-montserrat font-medium text-salve-textFaint cursor-pointer hover:border-salve-lav/30 hover:text-salve-textMid transition-colors"
          >
            <ChevronDown size={14} className={`transition-transform ${isDetailsOpen ? 'rotate-180' : ''}`} />
            <span>{isDetailsOpen ? 'Less details' : 'Add details'}</span>
            <span className="text-[10px] text-salve-textFaint/60 ml-auto">
              {!isDetailsOpen && detailCount > 0 && `${detailCount} added`}
              {!isDetailsOpen && detailCount === 0 && 'symptoms, severity, check-in...'}
            </span>
          </button>
        </div>

        {/* ══════════ DETAILS SECTION (progressive disclosure) ══════════ */}
        {isDetailsOpen && (
          <div className="space-y-1 border-t border-salve-border/40 pt-3">

            {/* ── Symptoms & Severity ── */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium font-montserrat text-salve-textMid">Symptoms</label>
                {(form.symptoms || []).length < 10 && (
                  <button onClick={addSymptom} className="bg-transparent border-none cursor-pointer text-salve-lav text-[11px] font-montserrat p-0 flex items-center gap-0.5 hover:underline">
                    <Plus size={12} /> Add symptom
                  </button>
                )}
              </div>
              {(form.symptoms || []).map((sym, idx) => {
                const sev = Number(sym.severity);
                const sevColor = sev >= 7 ? 'text-salve-rose' : sev >= 4 ? 'text-salve-amber' : 'text-salve-sage';
                return (
                  <div key={idx} className="mb-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <input
                        type="text"
                        value={sym.name}
                        onChange={e => updateSymptom(idx, 'name', e.target.value)}
                        placeholder="Symptom name"
                        list={`symptom-suggestions-${idx}`}
                        className="flex-1 min-w-0 bg-salve-card border border-salve-border rounded-lg px-2.5 py-1.5 text-xs text-salve-text font-montserrat placeholder:text-salve-textFaint/60 focus:outline-none focus:ring-1 focus:ring-salve-lav/40"
                      />
                      <datalist id={`symptom-suggestions-${idx}`}>
                        {symptomSuggestions.map(s => <option key={s} value={s} />)}
                      </datalist>
                      <span className={`text-[10px] font-montserrat font-medium w-8 text-right ${sevColor}`}>{sym.severity}/10</span>
                      <button onClick={() => removeSymptom(idx)} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0.5 transition-colors" aria-label={`Remove ${sym.name || 'symptom'}`}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex gap-0.5 pl-0.5">
                      {[...Array(10)].map((_, i) => {
                        const sv = String(i + 1);
                        const active = sym.severity === sv;
                        const bg = i < 3 ? (active ? 'bg-salve-sage text-white' : 'text-salve-sage/60 border-salve-sage/20 hover:bg-salve-sage/10')
                          : i < 6 ? (active ? 'bg-salve-amber text-white' : 'text-salve-amber/60 border-salve-amber/20 hover:bg-salve-amber/10')
                          : (active ? 'bg-salve-rose text-white' : 'text-salve-rose/60 border-salve-rose/20 hover:bg-salve-rose/10');
                        return (
                          <button key={sv} onClick={() => updateSymptom(idx, 'severity', sv)} type="button"
                            className={`flex-1 min-w-0 h-6 rounded text-[10px] border font-montserrat font-medium transition-colors cursor-pointer ${active ? bg + ' border-transparent' : 'bg-salve-card ' + bg}`}
                            aria-label={`${sym.name || 'Symptom'} severity ${sv}`}
                          >{sv}</button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {(form.symptoms || []).length === 0 && (
                <p className="text-[11px] text-salve-textFaint/60 font-montserrat italic pl-0.5">Track individual symptoms with their own severity rating</p>
              )}
            </div>

            {/* Overall Severity segmented control */}
            <div className="mb-3">
              <label className="text-xs font-medium font-montserrat text-salve-textMid block mb-1.5">Overall Severity</label>
              <div className="flex gap-1">
                {[...Array(10)].map((_, i) => {
                  const v = String(i + 1);
                  const active = form.severity === v;
                  const bg = i < 3 ? (active ? 'bg-salve-sage text-white' : 'text-salve-sage border-salve-sage/30 hover:bg-salve-sage/10')
                    : i < 6 ? (active ? 'bg-salve-amber text-white' : 'text-salve-amber border-salve-amber/30 hover:bg-salve-amber/10')
                    : (active ? 'bg-salve-rose text-white' : 'text-salve-rose border-salve-rose/30 hover:bg-salve-rose/10');
                  return (
                    <button key={v} onClick={() => sf('severity', v)} type="button"
                      className={`flex-1 min-w-[28px] h-8 rounded-lg border text-xs font-montserrat font-medium transition-colors cursor-pointer ${active ? bg + ' border-transparent' : 'bg-salve-card ' + bg}`}
                      aria-label={`Severity ${v} of 10`}
                    >{v}</button>
                  );
                })}
              </div>
              <div className="flex justify-between mt-0.5 px-0.5">
                <span className="text-[9px] text-salve-textFaint font-montserrat">minimal</span>
                <span className="text-[9px] text-salve-textFaint font-montserrat">worst</span>
              </div>
            </div>

            {/* ── Check-in ── */}
            <div className="mb-3">
              <label className="text-xs font-medium font-montserrat text-salve-textMid block mb-1.5">Quick check-in</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-salve-textFaint font-montserrat block mb-1">Sleep</span>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={quickCheck.sleep}
                    onChange={e => setQuickCheck(p => ({ ...p, sleep: e.target.value }))}
                    placeholder="hrs"
                    className="w-full bg-salve-card border border-salve-border rounded-lg px-2 py-1.5 text-xs text-salve-text font-montserrat text-center placeholder:text-salve-textFaint/50 focus:outline-none focus:ring-1 focus:ring-salve-lav/40"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-salve-textFaint font-montserrat block mb-1">Hydration</span>
                  <div className="flex gap-0.5">
                    {[{v:'1',l:'😵'},{v:'2',l:'🙂'},{v:'3',l:'💧'},{v:'4',l:'🌊'}].map(h => (
                      <button key={h.v} type="button" onClick={() => setQuickCheck(p => ({ ...p, hydration: p.hydration === h.v ? '' : h.v }))}
                        className={`flex-1 h-7 rounded text-xs border transition-colors cursor-pointer ${
                          quickCheck.hydration === h.v ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/20'
                        }`}
                        aria-label={`Hydration ${h.v} of 4`}
                      >{h.l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-salve-textFaint font-montserrat block mb-1">Activity</span>
                  <div className="flex gap-0.5">
                    {[{v:'1',l:'🛋'},{v:'2',l:'🚶'},{v:'3',l:'🏃'},{v:'4',l:'🔥'}].map(a => (
                      <button key={a.v} type="button" onClick={() => setQuickCheck(p => ({ ...p, activity: p.activity === a.v ? '' : a.v }))}
                        className={`flex-1 h-7 rounded text-xs border transition-colors cursor-pointer ${
                          quickCheck.activity === a.v ? 'bg-salve-sage/20 border-salve-sage/40 text-salve-sage' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-sage/20'
                        }`}
                        aria-label={`Activity level ${a.v} of 4`}
                      >{a.l}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Medication adherence toggles */}
            {activeMeds.length > 0 && (
              <div className="mb-3">
                <button
                  onClick={() => sf('_adherenceOpen', !form._adherenceOpen)}
                  className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 mb-1 hover:text-salve-lav transition-colors"
                  type="button"
                >
                  <Plus size={12} className={form._adherenceOpen || Object.keys(form.adherence || {}).length ? 'hidden' : ''} />
                  <ChevronDown size={12} className={`transition-transform ${!form._adherenceOpen && !Object.keys(form.adherence || {}).length ? 'hidden' : ''} ${form._adherenceOpen ? 'rotate-180' : ''}`} />
                  <span>Medication check-in</span>
                  {Object.keys(form.adherence || {}).length > 0 && !form._adherenceOpen && (
                    <span className="text-salve-lav ml-0.5">({Object.values(form.adherence).filter(Boolean).length}/{Object.keys(form.adherence).length})</span>
                  )}
                </button>
                {(form._adherenceOpen || Object.keys(form.adherence || {}).length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {activeMeds.map(m => {
                      const v = (form.adherence || {})[m.id];
                      const taken = v === true;
                      const skipped = v === false;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            const adh = { ...(form.adherence || {}) };
                            if (taken) { adh[m.id] = false; }
                            else if (skipped) { delete adh[m.id]; }
                            else { adh[m.id] = true; }
                            sf('adherence', adh);
                          }}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat flex items-center gap-1 ${
                            taken ? 'bg-salve-sage/20 border-salve-sage/40 text-salve-sage' :
                            skipped ? 'bg-salve-rose/15 border-salve-rose/30 text-salve-rose line-through' :
                            'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30'
                          }`}
                          aria-label={`${m.display_name || m.name}: ${taken ? 'taken' : skipped ? 'skipped' : 'not recorded'}`}
                        >
                          {taken && <Check size={10} />}
                          {skipped && <X size={10} />}
                          {m.display_name || m.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {(form._adherenceOpen || Object.keys(form.adherence || {}).length > 0) && (
                  <p className="text-[10px] text-salve-textFaint/50 font-montserrat mt-1 pl-0.5">Tap: untouched → ✓ taken → ✗ skipped → clear</p>
                )}
              </div>
            )}

            {/* ── Context ── */}
            <div className="mb-3">
              <button
                onClick={() => sf('_triggersOpen', !form._triggersOpen)}
                className="flex items-center gap-1 bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 mb-1 hover:text-salve-amber transition-colors"
                type="button"
              >
                <Plus size={12} className={form._triggersOpen || form.triggers ? 'hidden' : ''} />
                <ChevronDown size={12} className={`transition-transform ${!form._triggersOpen && !form.triggers ? 'hidden' : ''} ${form._triggersOpen ? 'rotate-180' : ''}`} />
                <span>Triggers</span>
                {form.triggers && !form._triggersOpen && <span className="text-salve-amber ml-1">·</span>}
              </button>
              {(form._triggersOpen || form.triggers) && (
                <Field value={form.triggers} onChange={v => sf('triggers', v)} textarea placeholder="What happened? Stressful meeting, poor sleep, missed meal..." />
              )}
            </div>

            <div className="mb-3">
              <button
                onClick={() => sf('_interventionsOpen', !form._interventionsOpen)}
                className="flex items-center gap-1 bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 mb-1 hover:text-salve-sage transition-colors"
                type="button"
              >
                <Plus size={12} className={form._interventionsOpen || form.interventions ? 'hidden' : ''} />
                <ChevronDown size={12} className={`transition-transform ${!form._interventionsOpen && !form.interventions ? 'hidden' : ''} ${form._interventionsOpen ? 'rotate-180' : ''}`} />
                <span>What helped</span>
                {form.interventions && !form._interventionsOpen && <span className="text-salve-sage ml-1">·</span>}
              </button>
              {(form._interventionsOpen || form.interventions) && (
                <Field value={form.interventions} onChange={v => sf('interventions', v)} textarea placeholder="Took a walk, breathing exercises, called a friend..." />
              )}
            </div>

            {/* Gratitude field — only for positive/neutral moods */}
            {showGratitude && (
              <Field
                label="✨ What made you smile today?"
                value={form.gratitude || ''}
                onChange={v => sf('gratitude', v)}
                placeholder="A small win, a kind word, a moment of joy..."
                hint="Optional — save the bright spots"
              />
            )}

            {/* ── Connections ── */}
            {(activeConditions.length > 0 || activeMeds.length > 0) && (
              <div className="mb-3">
                <button
                  onClick={() => setLinksOpen(!linksOpen)}
                  className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 hover:text-salve-lav transition-colors"
                >
                  <Link2 size={12} />
                  <span>Link to records</span>
                  <ChevronDown size={12} className={`transition-transform ${linksOpen ? 'rotate-180' : ''}`} />
                  {((form.linked_conditions || []).length + (form.linked_meds || []).length) > 0 && (
                    <span className="text-salve-lav ml-0.5">({(form.linked_conditions || []).length + (form.linked_meds || []).length})</span>
                  )}
                </button>
                {linksOpen && (
                  <div className="mt-2 space-y-2.5 pl-0.5">
                    {activeConditions.length > 0 && (
                      <div>
                        <span className="text-[11px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Conditions</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {activeConditions.map(c => {
                            const linked = (form.linked_conditions || []).includes(c.id);
                            return (
                              <button
                                key={c.id}
                                onClick={() => toggleLinkedCondition(c.id)}
                                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${linked ? 'bg-salve-sage/20 border-salve-sage/40 text-salve-sage' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-sage/30'}`}
                              >{c.name}</button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {activeMeds.length > 0 && (
                      <div>
                        <span className="text-[11px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Medications</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {activeMeds.map(m => {
                            const linked = (form.linked_meds || []).includes(m.id);
                            return (
                              <button
                                key={m.id}
                                onClick={() => toggleLinkedMed(m.id)}
                                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${linked ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30'}`}
                              >{m.display_name || m.name}{m.dose ? ` ${m.dose}` : ''}</button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Save / Cancel ── */}
        <div className="flex gap-2">
          <Button onClick={saveJ} disabled={!form.content.trim() && !form.title.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_JOURNAL); setEditId(null); setDetailsOpen(false); setDateOpen(false); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
    );
  }

  return (
    <div className="mt-2">
      {crisisType && <CrisisModal type={crisisType} onClose={() => setCrisisType(null)} />}
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

      {/* Tag & symptom filter pills */}
      {(() => {
        const allTags = [...new Set(data.journal.flatMap(e => e.tags ? String(e.tags).split(',').map(t => t.trim()).filter(Boolean) : []))].sort();
        const allSymptoms = [...new Set(data.journal.flatMap(e => (e.symptoms || []).map(s => s.name).filter(Boolean)))].sort();
        if (allTags.length === 0 && allSymptoms.length === 0) return null;
        return (
          <div className="flex gap-1.5 flex-wrap mb-3">
            <button
              onClick={() => { setTagFilter(null); setSymptomFilter(null); }}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${!tagFilter && !symptomFilter ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30'}`}
            >All</button>
            {allSymptoms.map(sym => (
              <button
                key={`s:${sym}`}
                onClick={() => { setSymptomFilter(symptomFilter === sym ? null : sym); setTagFilter(null); }}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${symptomFilter === sym ? 'bg-salve-rose/15 border-salve-rose/40 text-salve-rose' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-rose/30'}`}
              >⚬ {sym}</button>
            ))}
            {allTags.map(tag => (
              <button
                key={`t:${tag}`}
                onClick={() => { setTagFilter(tagFilter === tag ? null : tag); setSymptomFilter(null); }}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${tagFilter === tag ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30'}`}
              >{tag}</button>
            ))}
          </div>
        );
      })()}

      {data.journal.length === 0 ? <EmptyState icon={BookOpen} text="Your journal is empty — start tracking patterns" motif="moon" /> :
        <div className="md:grid md:grid-cols-2 md:gap-4">{data.journal.filter(e => {
          if (tagFilter && !(e.tags && String(e.tags).split(',').map(t => t.trim()).includes(tagFilter))) return false;
          if (symptomFilter && !(e.symptoms || []).some(s => s.name === symptomFilter)) return false;
          return true;
        }).map(e => {
          const sev = Number(e.severity);
          const sevColor = sev >= 7 ? C.rose : sev >= 4 ? C.amber : C.sage;
          const sevBg = sev >= 7 ? 'rgba(232,138,154,0.15)' : sev >= 4 ? 'rgba(232,200,138,0.15)' : 'rgba(143,191,160,0.15)';
          const isExpanded = expandedId === e.id;
          const cyclePhase = data.cycles?.length > 0 ? getCyclePhaseForDate(e.date, data.cycles) : null;
          const symptoms = e.symptoms || [];
          const linkedConditions = e.linked_conditions || [];
          const linkedMeds = e.linked_meds || [];
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
                  {e.mood && <span className="text-base">{String(e.mood).split(' ')[0]}</span>}
                  {e.severity && <Badge label={`${e.severity}/10`} color={sevColor} bg={sevBg} />}
                  <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Symptom pills (collapsed view) */}
              {symptoms.length > 0 && !isExpanded && (
                <div className="flex gap-1 flex-wrap mt-1 mb-0.5">
                  {symptoms.slice(0, 4).map((s, i) => {
                    const sv = Number(s.severity);
                    const sc = sv >= 7 ? 'text-salve-rose bg-salve-rose/10' : sv >= 4 ? 'text-salve-amber bg-salve-amber/10' : 'text-salve-sage bg-salve-sage/10';
                    return <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-full font-montserrat ${sc}`}>{s.name} {s.severity}/10</span>;
                  })}
                  {symptoms.length > 4 && <span className="text-[10px] text-salve-textFaint font-montserrat">+{symptoms.length - 4}</span>}
                </div>
              )}

              {/* Gratitude sparkle badge (collapsed) */}
              {e.gratitude && !isExpanded && (
                <div className="text-[10px] text-salve-amber font-montserrat mt-0.5 truncate">✨ {e.gratitude}</div>
              )}

              {/* Adherence pill (collapsed) */}
              {!isExpanded && e.adherence && Object.keys(e.adherence).length > 0 && (() => {
                const total = Object.keys(e.adherence).length;
                const taken = Object.values(e.adherence).filter(Boolean).length;
                return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-montserrat bg-salve-lav/10 text-salve-lav inline-block mt-0.5">💊 {taken}/{total} meds</span>;
              })()}

              {!isExpanded && e.content && !symptoms.length && !e.gratitude && (
                <div className="text-[13px] text-salve-textMid leading-relaxed line-clamp-2">{e.content}</div>
              )}
              {!isExpanded && e.content && (symptoms.length > 0 || e.gratitude) && (
                <div className="text-[12px] text-salve-textFaint leading-relaxed line-clamp-1 mt-0.5">{e.content}</div>
              )}

              <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                <div className="mt-1.5 pt-1.5 border-t border-salve-lav/15" onClick={ev => ev.stopPropagation()}>
                  <div className="text-[13px] text-salve-textMid leading-relaxed">{e.content}</div>

                  {/* Triggers */}
                  {e.triggers && (
                    <div className="mt-2 bg-salve-amber/8 border border-salve-amber/15 rounded-lg px-2.5 py-1.5">
                      <span className="text-[10px] font-medium font-montserrat text-salve-amber uppercase tracking-wider block mb-0.5">Triggers</span>
                      <span className="text-[12px] text-salve-textMid font-montserrat">{e.triggers}</span>
                    </div>
                  )}

                  {/* Interventions */}
                  {e.interventions && (
                    <div className="mt-2 bg-salve-sage/8 border border-salve-sage/15 rounded-lg px-2.5 py-1.5">
                      <span className="text-[10px] font-medium font-montserrat text-salve-sage uppercase tracking-wider block mb-0.5">What helped</span>
                      <span className="text-[12px] text-salve-textMid font-montserrat">{e.interventions}</span>
                    </div>
                  )}

                  {/* Adherence (expanded) */}
                  {e.adherence && Object.keys(e.adherence).length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {Object.entries(e.adherence).map(([medId, taken]) => {
                        const med = (data.meds || []).find(m => m.id === medId);
                        if (!med) return null;
                        return (
                          <span key={medId} className={`text-[10px] px-2 py-0.5 rounded-full font-montserrat flex items-center gap-0.5 ${taken ? 'bg-salve-sage/12 text-salve-sage' : 'bg-salve-rose/12 text-salve-rose line-through'}`}>
                            {taken ? '✓' : '✗'} {med.display_name || med.name}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Expanded symptoms list */}
                  {symptoms.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <span className="text-[10px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Symptoms</span>
                      {symptoms.map((s, i) => {
                        const sv = Number(s.severity);
                        const sc = sv >= 7 ? C.rose : sv >= 4 ? C.amber : C.sage;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs font-montserrat text-salve-text">{s.name}</span>
                            <div className="flex-1 h-1 rounded-full bg-salve-card2 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${sv * 10}%`, backgroundColor: sc }} />
                            </div>
                            <span className="text-[10px] font-montserrat" style={{ color: sc }}>{s.severity}/10</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Gratitude (expanded) */}
                  {e.gratitude && (
                    <div className="mt-2 bg-salve-amber/8 border border-salve-amber/15 rounded-lg px-2.5 py-1.5">
                      <span className="text-[11px] text-salve-amber font-montserrat">✨ {e.gratitude}</span>
                    </div>
                  )}

                  {/* Linked conditions & medications */}
                  {(linkedConditions.length > 0 || linkedMeds.length > 0) && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {linkedConditions.map(id => {
                        const cond = (data.conditions || []).find(c => c.id === id);
                        if (!cond) return null;
                        return (
                          <button key={id} onClick={() => onNav?.('conditions', { highlightId: id })} className="text-[10px] px-2 py-0.5 rounded-full bg-salve-sage/12 border border-salve-sage/25 text-salve-sage font-montserrat cursor-pointer hover:bg-salve-sage/20 transition-colors">
                            {cond.name}
                          </button>
                        );
                      })}
                      {linkedMeds.map(id => {
                        const med = (data.meds || []).find(m => m.id === id);
                        if (!med) return null;
                        return (
                          <button key={id} onClick={() => onNav?.('medications', { highlightId: id })} className="text-[10px] px-2 py-0.5 rounded-full bg-salve-lav/12 border border-salve-lav/25 text-salve-lav font-montserrat cursor-pointer hover:bg-salve-lav/20 transition-colors">
                            {med.display_name || med.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {e.tags && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {String(e.tags).split(',').map((t, i) => (
                        <span key={i} className="bg-salve-card2 text-salve-textMid text-[11px] px-2.5 py-0.5 rounded-full border border-salve-border">{t.trim()}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2.5 mt-2.5">
                    <button onClick={() => { setForm({ ...EMPTY_JOURNAL, ...e, symptoms: e.symptoms || [], linked_conditions: e.linked_conditions || [], linked_meds: e.linked_meds || [], gratitude: e.gratitude || '', triggers: e.triggers || '', interventions: e.interventions || '', adherence: e.adherence || {} }); setEditId(e.id); setSubView('form'); }} aria-label="Edit journal entry" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1">Edit</button>
                    <button onClick={() => del.ask(e.id, e.title || 'entry')} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1">Delete</button>
                  </div>
                </div>
              </div></div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('journal', id))} onCancel={del.cancel} itemId={e.id} />
          </Card>
          );
        })}</div>
      }
    </div>
  );
}
