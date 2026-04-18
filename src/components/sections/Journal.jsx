import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Check, BookOpen, Sparkles, Loader, ChevronDown, X, RefreshCw, Link2, Mic, MicOff, Calendar, Activity, Zap, Heart, Moon, Pill, Wind, Edit, Trash2 } from 'lucide-react';
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
import { fetchJournalPatterns, extractJournalData } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import CrisisModal from '../ui/CrisisModal';
import { getCyclePhaseForDate } from '../../utils/cycles';
import { readCachedBarometric, PRESSURE_SENSITIVE } from '../../services/barometric';
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
          <span className="text-[12px] text-salve-rose font-montserrat animate-pulse">● Recording</span>
        )}
      </div>
      {isListening && transcript && (
        <div className="mt-1.5 px-2.5 py-2 rounded-lg bg-salve-lav/5 border border-salve-lav/15 text-xs text-salve-text font-montserrat leading-relaxed">
          {transcript}
        </div>
      )}
      {error && (
        <p className="text-[13px] text-salve-rose font-montserrat mt-1" role="alert">{error}</p>
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
  const [moodPhaseOpen, setMoodPhaseOpen] = useState(() => localStorage.getItem('salve:journal-mood-phase') === 'true');
  const [filterOpen, setFilterOpen] = useState(false);
  const [reflectionPrompt, setReflectionPrompt] = useState(() => getContextualPrompt(data) || getReflectionPrompt(''));
  const [openSections, setOpenSections] = useState({});
  const [quickCheck, setQuickCheck] = useState({ sleep: '', hydration: '', activity: '', sleepQuality: '', wakeUps: '', sleepTrouble: [] });
  const [dateOpen, setDateOpen] = useState(false);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleSection = useCallback((key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

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
    } catch { /* swallow, not critical */ }
    setExtracting(false);
  };

  const applyExtraction = () => {
    if (!extraction) return;
    const updates = {};
    if (extraction.mood && MOODS.includes(extraction.mood)) updates.mood = extraction.mood;
    // Severity is auto-computed from symptoms on save, don't apply extraction severity
    if (extraction.symptoms?.length) {
      updates.symptoms = extraction.symptoms.slice(0, 10).map(s => ({
        name: typeof s === 'string' ? s : (s.name || ''),
        severity: String(Math.max(1, Math.min(5, Math.round(Number(s.severity || 3))))),
      })).filter(s => s.name);
      // Auto-open symptoms section when extraction adds them
      setOpenSections(prev => ({ ...prev, symptoms: true }));
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
    // Auto-open contextual sections when mood changes
    if (!form.mood) return;
    const negative = !isPositiveMood(form.mood);
    if (negative) {
      setOpenSections(prev => ({ ...prev, symptoms: true, triggers: true }));
    } else {
      setOpenSections(prev => ({ ...prev, gratitude: true }));
    }
  }, [form.mood]);

  // Symptom severity scale (1-5 with clinical labels)
  const SEV_LEVELS = [
    { v: '1', label: 'Minimal', active: 'bg-salve-sage/20 border-salve-sage/50 text-salve-sage', hover: 'hover:border-salve-sage/30' },
    { v: '2', label: 'Mild', active: 'bg-salve-sage/20 border-salve-sage/50 text-salve-sage', hover: 'hover:border-salve-sage/30' },
    { v: '3', label: 'Moderate', active: 'bg-salve-amber/20 border-salve-amber/50 text-salve-amber', hover: 'hover:border-salve-amber/30' },
    { v: '4', label: 'Severe', active: 'bg-salve-rose/20 border-salve-rose/50 text-salve-rose', hover: 'hover:border-salve-rose/30' },
    { v: '5', label: 'Extreme', active: 'bg-salve-rose/20 border-salve-rose/50 text-salve-rose', hover: 'hover:border-salve-rose/30' },
  ];

  // Frequent symptoms, mined from user's past journal entries
  const frequentSymptoms = useMemo(() => {
    const counts = {};
    (data.journal || []).forEach(e => {
      (e.symptoms || []).forEach(s => {
        if (s.name) counts[s.name] = (counts[s.name] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);
  }, [data.journal]);

  // Symptom builder helpers
  const addSymptom = (name = '') => {
    if ((form.symptoms || []).length >= 10) return;
    sf('symptoms', [...(form.symptoms || []), { name, severity: '3' }]);
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
    // Auto-compute overall severity from max symptom severity (mapped to 1-10 for backward compat)
    const syms = persistForm.symptoms || [];
    if (syms.length > 0) {
      const maxSev = Math.max(...syms.map(s => Number(s.severity) || 3));
      persistForm.severity = String(maxSev * 2); // 1-5 → 2-10
    }
    // Crisis check, show resources but still save (journal is the user's space)
    const crisis = detectCrisis(persistForm.content);
    if (editId) {
      await updateItem('journal', editId, persistForm);
    } else {
      await addItem('journal', persistForm);
    }
    // Create vitals for quick check-in
    const dt = persistForm.date || todayISO();
    if (quickCheck.sleep) {
      const sleepNotes = ['from journal',
        quickCheck.sleepQuality && `quality: ${['','awful','poor','ok','good','great'][quickCheck.sleepQuality] || quickCheck.sleepQuality}/5`,
        quickCheck.wakeUps && `woke ${quickCheck.wakeUps}x`,
        (quickCheck.sleepTrouble || []).length > 0 && `trouble: ${quickCheck.sleepTrouble.join(', ')}`,
      ].filter(Boolean).join(' · ');
      addItem('vitals', { date: dt, type: 'sleep', value: quickCheck.sleep, unit: 'hrs', notes: sleepNotes });
    }
    if (quickCheck.hydration) {
      addItem('vitals', { date: dt, type: 'hydration', value: quickCheck.hydration, unit: '/4', notes: 'from journal' });
    }
    if (quickCheck.activity) {
      addItem('vitals', { date: dt, type: 'activity_level', value: quickCheck.activity, unit: '/4', notes: 'from journal' });
    }
    if (crisis.isCrisis) setCrisisType(crisis.type);
    setForm({ ...EMPTY_JOURNAL, date: todayISO() });
    setQuickCheck({ sleep: '', hydration: '', activity: '', sleepQuality: '', wakeUps: '', sleepTrouble: [] });
    setOpenSections({});
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') {
    const activeConditions = (data.conditions || []).filter(c => c.status === 'active' || c.status === 'managed');
    const activeMeds = (data.meds || []).filter(m => m.active !== false);
    const showGratitude = isPositiveMood(form.mood);

    // Auto-open sections that have data when editing
    const autoOpen = editId ? {
      ...(form.symptoms || []).length > 0 && { symptoms: true },
      ...Object.keys(form.adherence || {}).length > 0 && { meds: true },
      ...form.triggers && { triggers: true },
      ...form.interventions && { helped: true },
      ...form.gratitude && { gratitude: true },
      ...((form.linked_conditions || []).length + (form.linked_meds || []).length > 0) && { links: true },
      ...quickCheck.sleep && { sleep: true },
    } : {};
    const isSectionOpen = (key) => openSections[key] || autoOpen[key];

    // Per-section data indicators for pill badges
    const sectionHasData = {
      symptoms: (form.symptoms || []).length > 0,
      sleep: !!quickCheck.sleep,
      meds: Object.keys(form.adherence || {}).length > 0,
      triggers: !!form.triggers,
      helped: !!form.interventions,
      gratitude: !!form.gratitude,
      links: (form.linked_conditions || []).length + (form.linked_meds || []).length > 0,
    };

    // Mood-contextual suggestions
    const isNegativeMood = form.mood && !isPositiveMood(form.mood);
    const isPositive = isPositiveMood(form.mood) && !!form.mood;

    const topics = [
      { key: 'symptoms', icon: Activity, label: 'Symptoms', suggest: isNegativeMood },
      { key: 'sleep', icon: Moon, label: 'Sleep' },
      activeMeds.length > 0 && { key: 'meds', icon: Pill, label: 'Meds taken' },
      { key: 'triggers', icon: Zap, label: 'Triggers', suggest: isNegativeMood },
      { key: 'helped', icon: Heart, label: 'What helped', suggest: isPositive },
      showGratitude && { key: 'gratitude', icon: Sparkles, label: 'Gratitude', suggest: isPositive },
      (activeConditions.length > 0 || activeMeds.length > 0) && { key: 'links', icon: Link2, label: 'Link records' },
    ].filter(Boolean);

    return (
    <FormWrap title={`${editId ? 'Edit' : 'New'} Entry`} onBack={() => { setSubView(null); setForm(EMPTY_JOURNAL); setEditId(null); setOpenSections({}); setDateOpen(false); }}>
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
                <span className="text-[12px] font-montserrat" style={{ color: cp.color }}>
                  Day {cp.dayOfCycle} · {cp.phase}
                </span>
              ) : null;
            })()}
          </div>
          <VoiceInputBlock onTranscript={t => sf('content', ((form.content || '') + (form.content ? '\n' : '') + t).trim())} />
        </div>

        {/* ── Title ── */}
        <Field label="Title (optional)" value={form.title} onChange={v => sf('title', v)} placeholder="Quick label for today" />

        {/* ── Mood + body check (quick-tap zone) ── */}
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

          {/* Hydration + Activity, quick body check alongside mood */}
          <div className="flex items-center gap-4 mt-2.5 pl-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-salve-textFaint font-montserrat">Hydration</span>
              <div className="flex gap-0.5">
                {[{v:'1',l:'😵'},{v:'2',l:'🙂'},{v:'3',l:'💧'},{v:'4',l:'🌊'}].map(h => (
                  <button key={h.v} type="button" onClick={() => setQuickCheck(p => ({ ...p, hydration: p.hydration === h.v ? '' : h.v }))}
                    className={`w-7 h-7 rounded text-xs border transition-colors cursor-pointer ${
                      quickCheck.hydration === h.v ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/20'
                    }`}
                    aria-label={`Hydration ${h.v} of 4`}
                  >{h.l}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-salve-textFaint font-montserrat">Activity</span>
              <div className="flex gap-0.5">
                {[{v:'1',l:'🛋'},{v:'2',l:'🚶'},{v:'3',l:'🏃'},{v:'4',l:'🔥'}].map(a => (
                  <button key={a.v} type="button" onClick={() => setQuickCheck(p => ({ ...p, activity: p.activity === a.v ? '' : a.v }))}
                    className={`w-7 h-7 rounded text-xs border transition-colors cursor-pointer ${
                      quickCheck.activity === a.v ? 'bg-salve-sage/20 border-salve-sage/40 text-salve-sage' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-sage/20'
                    }`}
                    aria-label={`Activity level ${a.v} of 4`}
                  >{a.l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Reflection prompt as integrated bubble ── */}
        <button
          type="button"
          onClick={refreshPrompt}
          className="w-full mb-3 px-3.5 py-2.5 rounded-xl bg-salve-lav/5 border border-salve-lav/15 text-left cursor-pointer hover:bg-salve-lav/8 hover:border-salve-lav/25 transition-all group"
          aria-label="Reflection prompt, click for a different one"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={11} className="text-salve-lav/60" />
            <span className="text-[12px] font-montserrat font-medium text-salve-lav/60 uppercase tracking-wider">Not sure what to write?</span>
            <RefreshCw size={10} className="text-salve-textFaint/30 group-hover:text-salve-lav ml-auto shrink-0 transition-colors" />
          </div>
          <p className="text-xs text-salve-textFaint italic font-montserrat leading-relaxed pl-4">
            {reflectionPrompt}
          </p>
        </button>

        {/* ── Main content textarea ── */}
        <Field
          label="How are you feeling?"
          value={form.content}
          onChange={v => sf('content', v)}
          onBlur={() => {
            // Auto-extract mood & symptoms when leaving the textarea (free Gemini Lite tier)
            if (hasAIConsent() && (form.content || '').trim().length >= 20 && !extraction && !extracting) {
              runExtraction();
            }
          }}
          textarea
          placeholder="What's on your mind today..."
        />
        {extracting && (
          <div className="-mt-1 mb-3 flex items-center gap-1.5 text-salve-lav/70 text-[13px] font-montserrat">
            <Loader size={12} className="animate-spin" /> Reading your entry...
          </div>
        )}
        {extraction && (
          <div className="mb-3 px-2.5 py-2 rounded-lg bg-salve-lav/8 border border-salve-lav/20">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-semibold text-salve-lav font-montserrat flex items-center gap-1"><Sparkles size={11} /> Sage noticed</span>
              <button type="button" onClick={() => setExtraction(null)} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss extraction">×</button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {extraction.mood && (
                <span className="inline-flex items-center gap-1 text-[13px] px-2 py-0.5 rounded-full bg-salve-card border border-salve-border text-salve-text font-montserrat">
                  {extraction.mood}
                  <button type="button" onClick={() => removeExtractionField('mood')} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0 leading-none" aria-label="Remove mood"><X size={10} /></button>
                </span>
              )}
              {(extraction.symptoms || []).map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[13px] px-2 py-0.5 rounded-full bg-salve-amber/10 border border-salve-amber/25 text-salve-amber font-montserrat">
                  {typeof s === 'string' ? s : s.name}{s.severity ? ` ${s.severity}/5` : ''}
                  <button type="button" onClick={() => setExtraction(prev => ({ ...prev, symptoms: prev.symptoms.filter((_, j) => j !== i) }))} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0 leading-none" aria-label={`Remove ${typeof s === 'string' ? s : s.name}`}><X size={10} /></button>
                </span>
              ))}
              {extraction.triggers && (
                <span className="inline-flex items-center gap-1 text-[13px] px-2 py-0.5 rounded-full bg-salve-rose/10 border border-salve-rose/25 text-salve-rose font-montserrat">
                  ⚡ {extraction.triggers.length > 40 ? extraction.triggers.slice(0, 40) + '…' : extraction.triggers}
                  <button type="button" onClick={() => removeExtractionField('triggers')} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0 leading-none" aria-label="Remove triggers"><X size={10} /></button>
                </span>
              )}
              {extraction.interventions && (
                <span className="inline-flex items-center gap-1 text-[13px] px-2 py-0.5 rounded-full bg-salve-sage/10 border border-salve-sage/25 text-salve-sage font-montserrat">
                  ✦ {extraction.interventions.length > 40 ? extraction.interventions.slice(0, 40) + '…' : extraction.interventions}
                  <button type="button" onClick={() => removeExtractionField('interventions')} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0 leading-none" aria-label="Remove interventions"><X size={10} /></button>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={applyExtraction} className="text-[13px] px-3 py-1 rounded-full bg-salve-lav/20 border border-salve-lav/30 text-salve-lav font-montserrat font-medium cursor-pointer hover:bg-salve-lav/30 transition-colors">
                <Check size={10} className="inline mr-1 -mt-px" />Apply
              </button>
              <button type="button" onClick={() => setExtraction(null)} className="text-[13px] px-3 py-1 rounded-full bg-salve-card border border-salve-border text-salve-textFaint font-montserrat cursor-pointer hover:text-salve-text transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── Tags ── */}
        <Field label="Tags" value={form.tags} onChange={v => sf('tags', v)} placeholder="flare, fatigue, headache..." />

        {/* ── Barometric pressure context chip ── */}
        {(() => {
          const baro = readCachedBarometric();
          if (!baro) return null;
          const conditions = data?.conditions || [];
          const hasSensitive = conditions.some(c =>
            PRESSURE_SENSITIVE.some(k => (c.name || '').toLowerCase().includes(k))
          );
          if (!hasSensitive) return null;
          const trendConfig = {
            rising: { label: 'Rising', color: C.amber, emoji: '↑' },
            falling: { label: 'Falling', color: C.rose, emoji: '↓' },
            stable: { label: 'Stable', color: C.sage, emoji: '→' },
          };
          const tc = trendConfig[baro.trend] ?? trendConfig.stable;
          return (
            <div
              className="mt-1 mb-0.5 rounded-xl px-3 py-2"
              style={{ background: `${C.amber}0d`, border: `1px solid ${C.amber}25` }}
            >
              <div className="flex items-start gap-2 min-w-0">
                <Wind size={13} aria-hidden="true" className="mt-0.5 flex-shrink-0" style={{ color: C.amber }} />
                <div className="min-w-0 flex-1">
                  <div className="text-ui-base font-montserrat leading-relaxed" style={{ color: C.textFaint }}>
                    Today's pressure:{' '}
                    <span className="font-medium" style={{ color: tc.color }}>
                      {tc.emoji} {baro.current} hPa ({tc.label})
                    </span>
                    {baro.change24h != null && (
                      <span style={{ color: C.textFaint }}>
                        {' '}· {baro.change24h > 0 ? '+' : ''}{baro.change24h} hPa from yesterday
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNav?.('vitals')}
                  className="text-ui-sm font-montserrat underline cursor-pointer bg-transparent border-none p-0 flex-shrink-0 self-start"
                  style={{ color: C.amber }}
                >
                  Log
                </button>
              </div>
            </div>
          );
        })()}

        {/* ══════════ MORE ABOUT TODAY, Topic Pills ══════════ */}
        <div className="mt-1 mb-4">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="flex-1 h-px bg-salve-border/50" />
            <span className="text-[12px] font-montserrat font-medium text-salve-textFaint uppercase tracking-wider">More about today</span>
            <div className="flex-1 h-px bg-salve-border/50" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topics.map(t => {
              const open = isSectionOpen(t.key);
              const hasData = sectionHasData[t.key];
              const suggested = t.suggest && !open && !hasData;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggleSection(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[13px] font-montserrat font-medium transition-all cursor-pointer relative ${
                    open
                      ? 'bg-salve-lav/20 border-salve-lav/50 text-salve-lav ring-1 ring-salve-lav/20'
                      : suggested
                        ? 'bg-salve-card border-salve-lav/30 text-salve-textMid border-dashed hover:border-salve-lav/50 hover:bg-salve-lav/5'
                        : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30 hover:text-salve-textMid'
                  }`}
                  aria-pressed={open}
                  aria-label={`${t.label}${hasData ? ' (has data)' : ''}${suggested ? ' (suggested)' : ''}`}
                >
                  <t.icon size={12} />
                  <span>{t.label}</span>
                  {hasData && !open && (
                    <span className="w-1.5 h-1.5 rounded-full bg-salve-lav absolute -top-0.5 -right-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ══════════ EXPANDED DETAIL SECTIONS (fixed order) ══════════ */}

        {/* ── Symptoms ── */}
        {isSectionOpen('symptoms') && (
          <div className="mb-4 px-2.5 py-3 rounded-xl bg-salve-card2/30 border border-salve-border/40">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium font-montserrat text-salve-textMid flex items-center gap-1.5">
                <Activity size={13} className="text-salve-lav" /> Symptoms
              </label>
              {(form.symptoms || []).length < 10 && (
                <button onClick={() => addSymptom()} className="bg-transparent border-none cursor-pointer text-salve-lav text-[13px] font-montserrat p-0 flex items-center gap-0.5 hover:underline">
                  <Plus size={12} /> Add symptom
                </button>
              )}
            </div>

            {/* Quick-add: frequent symptoms from past entries */}
            {frequentSymptoms.length > 0 && (form.symptoms || []).length < 10 && (
              <div className="mb-2.5">
                <span className="text-[12px] text-salve-textFaint/60 font-montserrat block mb-1">Quick add</span>
                <div className="flex flex-wrap gap-1">
                  {frequentSymptoms
                    .filter(name => !(form.symptoms || []).some(s => s.name.toLowerCase() === name.toLowerCase()))
                    .slice(0, 6)
                    .map(name => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => addSymptom(name)}
                        className="text-[12px] px-2 py-0.5 rounded-full border border-dashed border-salve-lav/30 text-salve-textFaint font-montserrat cursor-pointer hover:bg-salve-lav/10 hover:text-salve-lav hover:border-salve-lav/50 transition-colors"
                      >+ {name}</button>
                    ))}
                </div>
              </div>
            )}

            {(form.symptoms || []).map((sym, idx) => {
              const sevLevel = SEV_LEVELS.find(l => l.v === sym.severity) || SEV_LEVELS[2];
              return (
                <div key={idx} className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
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
                    <button onClick={() => removeSymptom(idx)} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-0.5 transition-colors" aria-label={`Remove ${sym.name || 'symptom'}`}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {SEV_LEVELS.map(lev => {
                      const active = sym.severity === lev.v;
                      return (
                        <button key={lev.v} onClick={() => updateSymptom(idx, 'severity', lev.v)} type="button"
                          className={`flex-1 py-1 rounded-lg border text-[12px] font-montserrat font-medium transition-colors cursor-pointer ${
                            active
                              ? lev.active
                              : `bg-salve-card border-salve-border text-salve-textFaint ${lev.hover}`
                          }`}
                          aria-label={`${sym.name || 'Symptom'} severity: ${lev.label}`}
                        >{lev.label}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {(form.symptoms || []).length === 0 && (
              <p className="text-[13px] text-salve-textFaint/60 font-montserrat italic pl-0.5">
                {frequentSymptoms.length > 0 ? 'Tap a symptom above or add a new one' : 'Track what you\'re experiencing and how bad it is'}
              </p>
            )}
          </div>
        )}


        {/* ── Sleep ── */}
        {isSectionOpen('sleep') && (
          <div className="mb-4 px-2.5 py-3 rounded-xl bg-salve-card2/30 border border-salve-border/40">
            <label className="text-xs font-medium font-montserrat text-salve-textMid flex items-center gap-1.5 mb-2.5">
              <Moon size={13} className="text-salve-lav" /> How did you sleep?
            </label>
            <div className="space-y-3">
              {/* Hours + Quality side by side */}
              <div className="flex items-end gap-4">
                <div>
                  <span className="text-[12px] text-salve-textFaint font-montserrat block mb-1">Hours</span>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={quickCheck.sleep}
                    onChange={e => setQuickCheck(p => ({ ...p, sleep: e.target.value }))}
                    placeholder="hrs"
                    className="w-20 bg-salve-card border border-salve-border rounded-lg px-2 py-1.5 text-xs text-salve-text font-montserrat text-center placeholder:text-salve-textFaint/50 focus:outline-none focus:ring-1 focus:ring-salve-lav/40"
                  />
                </div>
                <div className="flex-1">
                  <span className="text-[12px] text-salve-textFaint font-montserrat block mb-1">Quality</span>
                  <div className="flex gap-1">
                    {[{v:'1',l:'Awful',e:'😫'},{v:'2',l:'Poor',e:'😴'},{v:'3',l:'OK',e:'😐'},{v:'4',l:'Good',e:'😊'},{v:'5',l:'Great',e:'✨'}].map(q => (
                      <button key={q.v} type="button"
                        onClick={() => setQuickCheck(p => ({ ...p, sleepQuality: p.sleepQuality === q.v ? '' : q.v }))}
                        className={`flex-1 flex flex-col items-center gap-0.5 py-1 rounded-lg border text-[12px] font-montserrat transition-colors cursor-pointer ${
                          quickCheck.sleepQuality === q.v
                            ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav'
                            : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/20'
                        }`}
                        aria-label={`Sleep quality: ${q.l}`}
                      >
                        <span className="text-xs">{q.e}</span>
                        <span className="leading-none">{q.l}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Wake-ups + Trouble */}
              <div className="flex items-end gap-4">
                <div>
                  <span className="text-[12px] text-salve-textFaint font-montserrat block mb-1">Woke up</span>
                  <div className="flex gap-0.5">
                    {['0','1','2','3','4+'].map(w => (
                      <button key={w} type="button"
                        onClick={() => setQuickCheck(p => ({ ...p, wakeUps: p.wakeUps === w ? '' : w }))}
                        className={`w-9 h-7 rounded text-[13px] border font-montserrat font-medium transition-colors cursor-pointer ${
                          quickCheck.wakeUps === w
                            ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav'
                            : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/20'
                        }`}
                        aria-label={`Woke up ${w} times`}
                      >{w}</button>
                    ))}
                    <span className="text-[12px] text-salve-textFaint font-montserrat self-center ml-1">times</span>
                  </div>
                </div>
                <div className="flex-1">
                  <span className="text-[12px] text-salve-textFaint font-montserrat block mb-1">Trouble with</span>
                  <div className="flex flex-wrap gap-1">
                    {['falling asleep', 'staying asleep', 'waking early', 'nightmares', 'pain'].map(t => (
                      <button key={t} type="button"
                        onClick={() => setQuickCheck(p => {
                          const arr = p.sleepTrouble || [];
                          return { ...p, sleepTrouble: arr.includes(t) ? arr.filter(x => x !== t) : [...arr, t] };
                        })}
                        className={`text-[12px] px-2 py-0.5 rounded-full border font-montserrat transition-colors cursor-pointer ${
                          (quickCheck.sleepTrouble || []).includes(t)
                            ? 'bg-salve-amber/15 border-salve-amber/30 text-salve-amber'
                            : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-amber/20'
                        }`}
                      >{t}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Medication Adherence ── */}
        {isSectionOpen('meds') && activeMeds.length > 0 && (
          <div className="mb-4 px-2.5 py-3 rounded-xl bg-salve-card2/30 border border-salve-border/40">
            <label className="text-xs font-medium font-montserrat text-salve-textMid flex items-center gap-1.5 mb-2">
              <Pill size={13} className="text-salve-lav" /> Medication check-in
            </label>
            <div className="flex flex-wrap gap-1.5">
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
                    className={`text-[13px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat flex items-center gap-1 ${
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
            <p className="text-[12px] text-salve-textFaint/50 font-montserrat mt-1.5 pl-0.5">Tap: untouched → ✓ taken → ✗ skipped → clear</p>
          </div>
        )}

        {/* ── Triggers ── */}
        {isSectionOpen('triggers') && (
          <div className="mb-4 px-2.5 py-3 rounded-xl bg-salve-card2/30 border border-salve-border/40">
            <label className="text-xs font-medium font-montserrat text-salve-textMid flex items-center gap-1.5 mb-2">
              <Zap size={13} className="text-salve-amber" /> Triggers
            </label>
            <Field value={form.triggers} onChange={v => sf('triggers', v)} textarea placeholder="What happened? Stressful meeting, poor sleep, missed meal..." />
          </div>
        )}

        {/* ── What Helped ── */}
        {isSectionOpen('helped') && (
          <div className="mb-4 px-2.5 py-3 rounded-xl bg-salve-card2/30 border border-salve-border/40">
            <label className="text-xs font-medium font-montserrat text-salve-textMid flex items-center gap-1.5 mb-2">
              <Heart size={13} className="text-salve-sage" /> What helped
            </label>
            <Field value={form.interventions} onChange={v => sf('interventions', v)} textarea placeholder="Took a walk, breathing exercises, called a friend..." />
          </div>
        )}

        {/* ── Gratitude ── */}
        {isSectionOpen('gratitude') && showGratitude && (
          <div className="mb-4 px-2.5 py-3 rounded-xl bg-salve-card2/30 border border-salve-border/40">
            <Field
              label="✨ What made you smile today?"
              value={form.gratitude || ''}
              onChange={v => sf('gratitude', v)}
              placeholder="A small win, a kind word, a moment of joy..."
              hint="Optional, save the bright spots"
            />
          </div>
        )}

        {/* ── Link to Records ── */}
        {isSectionOpen('links') && (activeConditions.length > 0 || activeMeds.length > 0) && (
          <div className="mb-4 px-2.5 py-3 rounded-xl bg-salve-card2/30 border border-salve-border/40">
            <label className="text-xs font-medium font-montserrat text-salve-textMid flex items-center gap-1.5 mb-2">
              <Link2 size={13} className="text-salve-lav" /> Link to records
            </label>
            <div className="space-y-2.5">
              {activeConditions.length > 0 && (
                <div>
                  <span className="text-[13px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Conditions</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {activeConditions.map(c => {
                      const linked = (form.linked_conditions || []).includes(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => toggleLinkedCondition(c.id)}
                          className={`text-[13px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${linked ? 'bg-salve-sage/20 border-salve-sage/40 text-salve-sage' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-sage/30'}`}
                        >{c.name}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              {activeMeds.length > 0 && (
                <div>
                  <span className="text-[13px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Medications</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {activeMeds.map(m => {
                      const linked = (form.linked_meds || []).includes(m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleLinkedMed(m.id)}
                          className={`text-[13px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${linked ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30'}`}
                        >{m.display_name || m.name}{m.dose ? ` ${m.dose}` : ''}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Save / Cancel ── */}
        <div className="flex gap-2">
          <Button onClick={saveJ} disabled={!form.content.trim() && !form.title.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_JOURNAL); setEditId(null); setOpenSections({}); setDateOpen(false); }}>Cancel</Button>
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
            {patternsLoading ? <><Loader size={13} className="animate-spin" /> Finding patterns...</> : <><Sparkles size={13} /> Analyze Patterns with Sage</>}
          </Button>
          {patternsAI && (
            <Card className="!bg-salve-lav/8 !border-salve-lav/20 mt-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[13px] font-semibold text-salve-lav flex items-center gap-1"><Sparkles size={11} /> Pattern Insights</div>
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
                    <span className="text-[13px] font-medium font-montserrat w-20 text-right" style={{ color: p.color }}>{p.phase}</span>
                    <div className="flex-1 h-2 rounded-full bg-salve-card2 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: p.color + '66' }} />
                    </div>
                    <span className="text-[13px] font-montserrat text-salve-textMid w-8">{p.avg}</span>
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

      {/* Tag & symptom filter pills, collapsed behind toggle */}
      {(() => {
        const allTags = [...new Set(data.journal.flatMap(e => e.tags ? String(e.tags).split(',').map(t => t.trim()).filter(Boolean) : []))].sort();
        const allSymptoms = [...new Set(data.journal.flatMap(e => (e.symptoms || []).map(s => s.name).filter(Boolean)))].sort();
        if (allTags.length === 0 && allSymptoms.length === 0) return null;
        const hasActiveFilter = tagFilter || symptomFilter;
        return (
          <div className="mb-3">
            <div className="flex gap-1.5 items-center flex-wrap">
              <button
                onClick={() => { setTagFilter(null); setSymptomFilter(null); }}
                className={`text-[13px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${!tagFilter && !symptomFilter ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30'}`}
              >All</button>
              {hasActiveFilter && (
                <span className="text-[13px] px-2.5 py-1 rounded-full bg-salve-lav/20 border border-salve-lav/40 text-salve-lav font-montserrat">
                  {symptomFilter || tagFilter}
                  <button onClick={() => { setTagFilter(null); setSymptomFilter(null); }} className="ml-1 bg-transparent border-none cursor-pointer text-salve-lav p-0 text-[13px]">×</button>
                </span>
              )}
              <button
                onClick={() => setFilterOpen(!filterOpen)}
                className="text-[13px] px-2.5 py-1 rounded-full border border-salve-border bg-salve-card text-salve-textFaint hover:border-salve-lav/30 cursor-pointer font-montserrat transition-colors"
              >{filterOpen ? 'Hide filters' : `Filter (${allSymptoms.length + allTags.length})`}</button>
            </div>
            {filterOpen && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {allSymptoms.map(sym => (
                  <button
                    key={`s:${sym}`}
                    onClick={() => { setSymptomFilter(symptomFilter === sym ? null : sym); setTagFilter(null); }}
                    className={`text-[13px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${symptomFilter === sym ? 'bg-salve-rose/15 border-salve-rose/40 text-salve-rose' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-rose/30'}`}
                  >⚬ {sym}</button>
                ))}
                {allTags.map(tag => (
                  <button
                    key={`t:${tag}`}
                    onClick={() => { setTagFilter(tagFilter === tag ? null : tag); setSymptomFilter(null); }}
                    className={`text-[13px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-montserrat ${tagFilter === tag ? 'bg-salve-lav/20 border-salve-lav/40 text-salve-lav' : 'bg-salve-card border-salve-border text-salve-textFaint hover:border-salve-lav/30'}`}
                  >{tag}</button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {data.journal.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          text="Your journal is empty"
          hint="Start tracking moods, symptoms, triggers, and what helped. Sage learns your patterns over time."
          motif="moon"
          actionLabel="Write your first entry"
          onAction={() => setSubView('form')}
        />
      ) :
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
                  {e.title && <span className="text-[13px] text-salve-textFaint ml-2">{fmtDate(e.date)}</span>}
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
                    const sc = sv >= 4 ? 'text-salve-rose bg-salve-rose/10' : sv >= 3 ? 'text-salve-amber bg-salve-amber/10' : 'text-salve-sage bg-salve-sage/10';
                    return <span key={i} className={`text-[12px] px-1.5 py-0.5 rounded-full font-montserrat ${sc}`}>{s.name} {s.severity}/5</span>;
                  })}
                  {symptoms.length > 4 && <span className="text-[12px] text-salve-textFaint font-montserrat">+{symptoms.length - 4}</span>}
                </div>
              )}

              {/* Gratitude sparkle badge (collapsed) */}
              {e.gratitude && !isExpanded && (
                <div className="text-[12px] text-salve-amber font-montserrat mt-0.5 truncate">✨ {e.gratitude}</div>
              )}

              {/* Adherence pill (collapsed) */}
              {!isExpanded && e.adherence && Object.keys(e.adherence).length > 0 && (() => {
                const total = Object.keys(e.adherence).length;
                const taken = Object.values(e.adherence).filter(Boolean).length;
                return <span className="text-[12px] px-1.5 py-0.5 rounded-full font-montserrat bg-salve-lav/10 text-salve-lav inline-block mt-0.5">💊 {taken}/{total} meds</span>;
              })()}

              {!isExpanded && e.content && !symptoms.length && !e.gratitude && (
                <div className="text-[15px] text-salve-textMid leading-relaxed line-clamp-2">{e.content}</div>
              )}
              {!isExpanded && e.content && (symptoms.length > 0 || e.gratitude) && (
                <div className="text-[14px] text-salve-textFaint leading-relaxed line-clamp-1 mt-0.5">{e.content}</div>
              )}

              <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                <div className="mt-1.5 pt-1.5 border-t border-salve-lav/15" onClick={ev => ev.stopPropagation()}>
                  <div className="text-[15px] text-salve-textMid leading-relaxed">{e.content}</div>

                  {/* Triggers */}
                  {e.triggers && (
                    <div className="mt-2 bg-salve-amber/8 border border-salve-amber/15 rounded-lg px-2.5 py-1.5">
                      <span className="text-[12px] font-medium font-montserrat text-salve-amber uppercase tracking-wider block mb-0.5">Triggers</span>
                      <span className="text-[14px] text-salve-textMid font-montserrat">{e.triggers}</span>
                    </div>
                  )}

                  {/* Interventions */}
                  {e.interventions && (
                    <div className="mt-2 bg-salve-sage/8 border border-salve-sage/15 rounded-lg px-2.5 py-1.5">
                      <span className="text-[12px] font-medium font-montserrat text-salve-sage uppercase tracking-wider block mb-0.5">What helped</span>
                      <span className="text-[14px] text-salve-textMid font-montserrat">{e.interventions}</span>
                    </div>
                  )}

                  {/* Adherence (expanded) */}
                  {e.adherence && Object.keys(e.adherence).length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {Object.entries(e.adherence).map(([medId, taken]) => {
                        const med = (data.meds || []).find(m => m.id === medId);
                        if (!med) return null;
                        return (
                          <span key={medId} className={`text-[12px] px-2 py-0.5 rounded-full font-montserrat flex items-center gap-0.5 ${taken ? 'bg-salve-sage/12 text-salve-sage' : 'bg-salve-rose/12 text-salve-rose line-through'}`}>
                            {taken ? '✓' : '✗'} {med.display_name || med.name}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Expanded symptoms list */}
                  {symptoms.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <span className="text-[12px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Symptoms</span>
                      {symptoms.map((s, i) => {
                        const sv = Number(s.severity);
                        const sc = sv >= 4 ? C.rose : sv >= 3 ? C.amber : C.sage;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs font-montserrat text-salve-text">{s.name}</span>
                            <div className="flex-1 h-1 rounded-full bg-salve-card2 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${sv * 20}%`, backgroundColor: sc }} />
                            </div>
                            <span className="text-[12px] font-montserrat" style={{ color: sc }}>{s.severity}/5</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Gratitude (expanded) */}
                  {e.gratitude && (
                    <div className="mt-2 bg-salve-amber/8 border border-salve-amber/15 rounded-lg px-2.5 py-1.5">
                      <span className="text-[13px] text-salve-amber font-montserrat">✨ {e.gratitude}</span>
                    </div>
                  )}

                  {/* Linked conditions & medications */}
                  {(linkedConditions.length > 0 || linkedMeds.length > 0) && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {linkedConditions.map(id => {
                        const cond = (data.conditions || []).find(c => c.id === id);
                        if (!cond) return null;
                        return (
                          <button key={id} onClick={() => onNav?.('conditions', { highlightId: id })} className="text-[12px] px-2 py-0.5 rounded-full bg-salve-sage/12 border border-salve-sage/25 text-salve-sage font-montserrat cursor-pointer hover:bg-salve-sage/20 transition-colors">
                            {cond.name}
                          </button>
                        );
                      })}
                      {linkedMeds.map(id => {
                        const med = (data.meds || []).find(m => m.id === id);
                        if (!med) return null;
                        return (
                          <button key={id} onClick={() => onNav?.('medications', { highlightId: id })} className="text-[12px] px-2 py-0.5 rounded-full bg-salve-lav/12 border border-salve-lav/25 text-salve-lav font-montserrat cursor-pointer hover:bg-salve-lav/20 transition-colors">
                            {med.display_name || med.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {e.tags && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {String(e.tags).split(',').map((t, i) => (
                        <span key={i} className="bg-salve-card2 text-salve-textMid text-[13px] px-2.5 py-0.5 rounded-full border border-salve-border">{t.trim()}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { setForm({ ...EMPTY_JOURNAL, ...e, symptoms: e.symptoms || [], linked_conditions: e.linked_conditions || [], linked_meds: e.linked_meds || [], gratitude: e.gratitude || '', triggers: e.triggers || '', interventions: e.interventions || '', adherence: e.adherence || {} }); setEditId(e.id); setSubView('form'); }} aria-label="Edit journal entry" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-salve-lav/10 text-salve-lav text-xs font-semibold font-montserrat border border-salve-lav/20 cursor-pointer hover:bg-salve-lav/20 transition-colors"><Edit size={13} /> Edit</button>
                    <button onClick={() => del.ask(e.id, e.title || 'entry')} aria-label="Delete journal entry" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-salve-textFaint text-xs font-medium font-montserrat border border-salve-border cursor-pointer hover:bg-salve-rose/10 hover:text-salve-rose hover:border-salve-rose/25 transition-colors"><Trash2 size={13} /> Delete</button>
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
