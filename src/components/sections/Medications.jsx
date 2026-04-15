import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Plus, Check, Edit, Trash2, Pill, AlertTriangle, Sparkles, Loader, ChevronDown, Search, MapPin, ExternalLink, Unlink, Download, RefreshCw, Info, DollarSign, Heart, Zap } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge, { SevBadge } from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { EMPTY_MED, MED_CATEGORIES, getCycleRelatedLabel } from '../../constants/defaults';
import { fmtDate, daysUntil } from '../../utils/dates';
import { C } from '../../constants/colors';
import { Building2 } from 'lucide-react';
import { fetchCrossReactivity } from '../../services/ai';
import { findPgxMatches } from '../../constants/pgx';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import { drugAutocomplete, drugDetails } from '../../services/drugs';
import { mapsUrl } from '../../utils/maps';
import { dailyMedUrl, providerLookupUrl, goodRxUrl } from '../../utils/links';
import { validateMedication } from '../../utils/validate';
import { checkInteractions } from '../../utils/interactions';
import SplitView, { useIsDesktop } from '../layout/SplitView';

const FREQ = ['Once daily','Twice daily (BID)','Three times daily (TID)','Four times daily (QID)','Every morning','Every evening/bedtime (QHS)','As needed (PRN)','Weekly','Biweekly','Monthly','Other'];
const ROUTES = ['Oral','Topical','Injection (SC)','Injection (IM)','IV','Inhaled','Sublingual','Transdermal patch','Rectal','Ophthalmic','Otic','Nasal','Other'];

export default function Medications({ data, addItem, updateItem, removeItem, interactions, highlightId, onNav }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_MED);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const [crossReactAI, setCrossReactAI] = useState(null);
  const [crossReactLoading, setCrossReactLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [reminderAddId, setReminderAddId] = useState(null); // which med is showing the time picker
  const [reminderTime, setReminderTime] = useState('08:00');

  useEffect(() => {
    if (highlightId && (data.meds || []).some(m => m.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [acResults, setAcResults] = useState([]);
  const [acLoading, setAcLoading] = useState(false);
  const [acError, setAcError] = useState(null);
  const [showAc, setShowAc] = useState(false);
  const [bulkLinking, setBulkLinking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(null);
  const [enrichResult, setEnrichResult] = useState(null);
  const [maintOpen, setMaintOpen] = useState(false);
  // Cancel bulk ops on unmount to prevent state updates after navigation
  const cancelledRef = useRef(false);
  useEffect(() => () => { cancelledRef.current = true; }, []);
  const [fdaDetailId, setFdaDetailId] = useState(null);
  const [fdaExpanded, setFdaExpanded] = useState({});

  /** Strip leading FDA section headers like "ADVERSE REACTIONS" or "Pregnancy:" from label text */
  const stripFdaHeader = (text) => {
    if (!text) return text;
    return text.replace(/^[A-Z][A-Z &/,()-]+(?::\s*|\s+)/,'').replace(/^\s+/,'');
  };
  const isDesktop = useIsDesktop();
  const acRef = useRef(null);
  const acTimerRef = useRef(null);
  const del = useConfirmDelete();
  const [errors, setErrors] = useState({});
  const sf = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(e => { const n = { ...e }; delete n[k]; return n; }); };

  /* ── Drug name autocomplete (debounced) ── */
  const handleNameChange = useCallback((v) => {
    sf('name', v);
    setShowAc(true);
    if (acTimerRef.current) clearTimeout(acTimerRef.current);
    if (v.length < 2) { setAcResults([]); return; }
    acTimerRef.current = setTimeout(async () => {
      setAcLoading(true);
      setAcError(null);
      try {
        const results = await drugAutocomplete(v);
        setAcResults(results);
      } catch { setAcResults([]); setAcError('Search unavailable'); }
      finally { setAcLoading(false); }
    }, 300);
  }, []);

  // Map FDA route strings (e.g. "ORAL") to our ROUTES dropdown values
  const mapFdaRoute = (fdaRoutes) => {
    if (!fdaRoutes?.length) return null;
    const raw = fdaRoutes[0].toLowerCase();
    const mapping = {
      oral: 'Oral', topical: 'Topical', subcutaneous: 'Injection (SC)',
      intramuscular: 'Injection (IM)', intravenous: 'IV', inhalation: 'Inhaled',
      sublingual: 'Sublingual', transdermal: 'Transdermal patch', rectal: 'Rectal',
      ophthalmic: 'Ophthalmic', otic: 'Otic', nasal: 'Nasal',
    };
    return mapping[raw] || null;
  };

  const selectAcResult = useCallback((item) => {
    setForm(p => ({ ...p, name: item.name, rxcui: item.rxcui }));
    setAcResults([]);
    setShowAc(false);
    // Background-fetch FDA data for auto-enrichment
    if (item.rxcui) {
      drugDetails(item.rxcui, item.name).then(info => {
        if (!info) return;
        setForm(p => {
          const updates = { ...p, fda_data: info };
          // Auto-suggest route if still default
          if (p.route === 'Oral' || !p.route) {
            const mapped = mapFdaRoute(info.route);
            if (mapped) updates.route = mapped;
          }
          // Auto-suggest purpose if empty and indications available
          if (!p.purpose && info.indications?.length) {
            const raw = info.indications[0];
            // Extract first sentence, cap at 120 chars
            const first = raw.split(/\.|\n/)[0]?.trim();
            if (first && first.length > 5) updates.purpose = first.slice(0, 120);
          }
          return updates;
        });
      }).catch(() => { /* non-blocking */ });
    }
  }, []);

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (acRef.current && !acRef.current.contains(e.target)) setShowAc(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  /* ── Allergy cross-check ── */
  const allergyWarnings = useMemo(() => {
    const name = form.name.trim().toLowerCase();
    if (!name) return [];
    return (data.allergies || []).filter(a => {
      const sub = (a.substance || '').toLowerCase();
      return sub && (name.includes(sub) || sub.includes(name));
    });
  }, [form.name, data.allergies]);

  /* ── Drug interaction check for form entry ── */
  const formInteractionWarnings = useMemo(() => {
    const name = form.name.trim();
    if (!name) return [];
    const otherMeds = (data.meds || []).filter(m => m.active !== false && m.id !== editId);
    if (!otherMeds.length) return [];
    const fakeMed = { name, active: true };
    const all = checkInteractions([...otherMeds, fakeMed]);
    return all.filter(w => w.medA.toLowerCase() === name.toLowerCase() || w.medB.toLowerCase() === name.toLowerCase());
  }, [form.name, data.meds, editId]);

  /* ── Fetch FDA data for a single med and persist ── */
  const enrichFdaData = async (med) => {
    const key = med.rxcui || med.name;
    if (!key) return null;
    try {
      const info = await drugDetails(key, med.name);
      if (info) {
        await updateItem('medications', med.id, { fda_data: info });
        return info;
      }
    } catch { /* non-blocking */ }
    return null;
  };

  /* ── Bulk enrich linked meds missing FDA data ── */
  const bulkEnrichMeds = async () => {
    const unenriched = (data.meds || []).filter(m => m.rxcui && (!m.fda_data || !m.fda_data.spl_set_id));
    if (unenriched.length === 0) return;
    cancelledRef.current = false;
    setEnriching(true);
    setEnrichResult(null);
    let enriched = 0;
    const failed = [];
    for (let i = 0; i < unenriched.length; i++) {
      if (cancelledRef.current) break;
      setEnrichProgress({ current: i + 1, total: unenriched.length, name: unenriched[i].display_name || unenriched[i].name });
      const info = await enrichFdaData(unenriched[i]);
      if (info) enriched++;
      else failed.push(unenriched[i].display_name || unenriched[i].name);
    }
    if (cancelledRef.current) return;
    setEnrichProgress(null);
    setEnrichResult({ enriched, total: unenriched.length, failed });
    setEnriching(false);
  };

  /* ── Bulk link unlinked meds to RxNorm ── */
  const bulkLinkMeds = async () => {
    const unlinked = (data.meds || []).filter(m => m.active !== false && !m.rxcui && m.name.trim());
    if (unlinked.length === 0) return;
    cancelledRef.current = false;
    setBulkLinking(true);
    setBulkResult(null);
    let linked = 0;
    const failed = [];
    for (let i = 0; i < unlinked.length; i++) {
      if (cancelledRef.current) break;
      setBulkProgress({ current: i + 1, total: unlinked.length, name: unlinked[i].display_name || unlinked[i].name });
      try {
        const results = await drugAutocomplete(unlinked[i].name);
        if (results.length > 0) {
          const nameLC = unlinked[i].name.trim().toLowerCase();
          const exact = results.find(r => r.name.toLowerCase() === nameLC);
          const match = exact || results[0];
          // Also fetch FDA data during bulk link
          let fda_data = null;
          try {
            fda_data = await drugDetails(match.rxcui, match.name);
          } catch { /* non-blocking */ }
          const updates = { rxcui: match.rxcui, name: match.name };
          if (fda_data) updates.fda_data = fda_data;
          await updateItem('medications', unlinked[i].id, updates);
          linked++;
        } else {
          failed.push(unlinked[i].display_name || unlinked[i].name);
        }
      } catch {
        failed.push(unlinked[i].display_name || unlinked[i].name);
      }
    }
    if (cancelledRef.current) return;
    setBulkProgress(null);
    setBulkResult({ linked, total: unlinked.length, failed });
    setBulkLinking(false);
  };

  // Warn if a med with the same name (case-insensitive) already exists
  const duplicateWarning = useMemo(() => {
    if (editId || !form.name?.trim()) return null;
    const meds = data.meds || [];
    const norm = form.name.trim().toLowerCase();
    const dup = meds.find(m => m.name?.toLowerCase() === norm || m.display_name?.toLowerCase() === norm);
    return dup ? `"${dup.display_name || dup.name}" already exists${dup.dose ? ` (${dup.dose})` : ''}. Adding anyway will create a duplicate.` : null;
  }, [form.name, editId, data.meds]);

  /* ── Pharmacy filter support (must be above early return for hooks ordering) ── */
  const NON_PHARMACY = new Set(['otc', 'n/a', 'na', 'none', 'self', 'online', '-', ', ', 'over the counter']);
  const pharmacyNames = useMemo(() => {
    const names = new Set();
    (data.meds || []).forEach(m => { if (m.pharmacy?.trim() && !NON_PHARMACY.has(m.pharmacy.trim().toLowerCase())) names.add(m.pharmacy.trim()); });
    return [...names].sort();
  }, [data.meds]);
  const [pharmacyFilter, setPharmacyFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [sortMode, setSortMode] = useState(() => {
    try { return localStorage.getItem('salve:med-sort') || 'alpha'; }
    catch { return 'alpha'; }
  });
  const [showDiscontinued, setShowDiscontinued] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('salve:med-sort', sortMode); } catch {}
  }, [sortMode]);

  // Check if any meds have non-default categories (show filter pills only when relevant)
  const hasCategories = (data.meds || []).some(m => m.category && m.category !== 'medication');

  // Map a frequency string to a "primary bucket" ordinal for schedule sort.
  // Buckets: 0 morning, 3 bedtime, 4 PRN, 5 other. Multi-dose regimens
  // (BID/TID/QID) map to 0 (morning) because they start their day there;
  // within a bucket we fall back to alpha on display_name/name.
  const scheduleBucket = (frequency) => {
    const f = String(frequency || '').toLowerCase();
    if (/prn|as.?needed/.test(f)) return 4;
    if (/bedtime|qhs|evening|night/.test(f)) return 3;
    if (/morning|am\b|once.*day|daily|every.?day|bid|tid|qid|twice|three.*day|four.*day/.test(f)) return 0;
    if (/week|biweek|month/.test(f)) return 5;
    return 5;
  };

  const groupedMeds = useMemo(() => {
    const base = (data.meds || []).filter(m => {
      const pharmaOk = pharmacyFilter === 'all' ? true : (m.pharmacy?.trim() || '') === pharmacyFilter;
      const catOk = catFilter === 'all' ? true : (m.category || 'medication') === catFilter;
      return pharmaOk && catOk;
    });
    const nameKey = (m) => (m.display_name || m.name || '').toLowerCase();
    const cmpAlpha = (a, b) => nameKey(a).localeCompare(nameKey(b));
    const cmpSchedule = (a, b) => (scheduleBucket(a.frequency) - scheduleBucket(b.frequency)) || cmpAlpha(a, b);
    const cmpRefill = (a, b) => {
      const ad = a.refill_date ? new Date(a.refill_date).getTime() : Infinity;
      const bd = b.refill_date ? new Date(b.refill_date).getTime() : Infinity;
      return (ad - bd) || cmpAlpha(a, b);
    };
    const cmpCategory = (a, b) => {
      const ac = (a.category || 'medication');
      const bc = (b.category || 'medication');
      return ac.localeCompare(bc) || cmpAlpha(a, b);
    };
    const cmp = {
      alpha: cmpAlpha,
      schedule: cmpSchedule,
      refill: cmpRefill,
      category: cmpCategory,
    }[sortMode] || cmpAlpha;

    const active = base.filter(m => m.active !== false).slice().sort(cmp);
    const discontinued = base.filter(m => m.active === false).slice().sort(cmpAlpha);

    // Honor existing status filter: if user chose 'inactive', hide active entirely.
    if (filter === 'inactive') return { active: [], discontinued };
    if (filter === 'active') return { active, discontinued: [] };
    return { active, discontinued };
  }, [data.meds, pharmacyFilter, catFilter, sortMode, filter]);

  // Backwards-compat alias used by cross-reference logic still reading a flat list.
  const fl = useMemo(
    () => [...groupedMeds.active, ...groupedMeds.discontinued],
    [groupedMeds]
  );

  /* ── Monthly cost estimate from NADAC prices ── */
  const monthlyCost = useMemo(() => {
    const active = (data.meds || []).filter(m => m.active !== false);
    const prices = data.drug_prices || [];
    if (!prices.length || !active.length) return null;
    let total = 0, counted = 0;
    active.forEach(m => {
      const mp = prices.filter(dp => dp.medication_id === m.id && dp.nadac_per_unit)
        .sort((a, b) => new Date(b.fetched_at || b.created_at) - new Date(a.fetched_at || a.created_at));
      if (!mp.length) return;
      const perUnit = Number(mp[0].nadac_per_unit);
      let daily = 1;
      const f = (m.frequency || '').toLowerCase();
      if (/qid|4.*day|q6h/i.test(f)) daily = 4;
      else if (/tid|3.*day|q8h/i.test(f)) daily = 3;
      else if (/bid|2.*day|twice|q12h/i.test(f)) daily = 2;
      else if (/week/i.test(f)) daily = 1 / 7;
      else if (/biweek|every.*2.*week/i.test(f)) daily = 1 / 14;
      else if (/month/i.test(f)) daily = 1 / 30;
      total += perUnit * daily * 30;
      counted++;
    });
    return counted > 0 ? { total, counted, of: active.length } : null;
  }, [data.meds, data.drug_prices]);

  /* ── Arrow key navigation on desktop ── */
  useEffect(() => {
    if (!isDesktop) return;
    const handler = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      const ids = fl.map(m => m.id);
      if (!ids.length) return;
      const cur = ids.indexOf(expandedId);
      const next = e.key === 'ArrowDown'
        ? ids[cur === -1 || cur === ids.length - 1 ? 0 : cur + 1]
        : ids[cur <= 0 ? ids.length - 1 : cur - 1];
      setExpandedId(next);
      document.getElementById(`record-${next}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDesktop, fl, expandedId]);

  const saveMed = async () => {
    const { valid, errors: e } = validateMedication(form);
    if (!valid) { setErrors(e); return; }
    const { id, ...payload } = form;
    if (editId) {
      await updateItem('medications', editId, payload);
    } else {
      await addItem('medications', payload);
    }
    setForm(EMPTY_MED);
    setErrors({});
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Medication`} onBack={() => { setSubView(null); setForm(EMPTY_MED); setEditId(null); }}>
      <Card>
        <div className="relative" ref={acRef}>
          <Field
            label="Medication Name"
            value={form.name}
            onChange={handleNameChange}
            placeholder="e.g. Sertraline"
            required
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!!(showAc && (acResults.length > 0 || acLoading || acError))}
            aria-controls="med-ac-listbox"
            aria-haspopup="listbox"
          />
          {showAc && (acResults.length > 0 || acLoading || acError) && (
            <div
              id="med-ac-listbox"
              role="listbox"
              aria-label="Medication suggestions"
              className="absolute z-20 left-0 right-0 top-full -mt-3 bg-salve-card2 border border-salve-border rounded-lg shadow-lg max-h-48 overflow-y-auto"
            >
              {acLoading && <div className="px-3 py-2 text-xs text-salve-textFaint flex items-center gap-1.5" role="status"><Loader size={11} className="animate-spin" aria-hidden="true" /> Searching...</div>}
              {acError && !acLoading && <div className="px-3 py-2 text-xs text-salve-rose" role="alert">{acError}</div>}
              {acResults.map((item, i) => (
                <button
                  key={`${item.rxcui}-${i}`}
                  id={`med-ac-opt-${i}`}
                  onClick={() => selectAcResult(item)}
                  role="option"
                  aria-selected={false}
                  className="w-full text-left px-3 py-2 text-sm text-salve-text hover:bg-salve-lav/10 cursor-pointer bg-transparent border-none font-montserrat flex items-center gap-2 transition-colors"
                >
                  <Search size={11} className="text-salve-textFaint flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          )}
          {form.rxcui && <div className="text-[12px] text-salve-textFaint -mt-3 mb-3" title="RxNorm Concept Unique Identifier, links this medication to the NLM drug database for interaction checking and drug info">RxCUI: {form.rxcui} · Linked to NLM drug database</div>}
          {duplicateWarning && <div className="flex items-start gap-1.5 text-xs text-salve-amber -mt-2 mb-2" role="alert"><AlertTriangle size={12} className="flex-shrink-0 mt-0.5" aria-hidden="true" />{duplicateWarning}</div>}
        </div>
        <Field label="Display Name (optional)" value={form.display_name} onChange={v => sf('display_name', v)} placeholder="e.g. my morning pill" />
        <Field label="Type" value={form.category || 'medication'} onChange={v => sf('category', v)} options={MED_CATEGORIES} />
        <Field label="Dose" value={form.dose} onChange={v => sf('dose', v)} placeholder="e.g. 50mg" />
        <Field label="Frequency" value={form.frequency} onChange={v => sf('frequency', v)} options={FREQ} />
        <Field label="Route" value={form.route} onChange={v => sf('route', v)} options={ROUTES} />
        <Field label="Prescriber" value={form.prescriber} onChange={v => sf('prescriber', v)} placeholder="Dr. Name" />
        <Field label="Pharmacy" value={form.pharmacy} onChange={v => sf('pharmacy', v)}
          options={[
            ...((data.pharmacies || []).map(p => ({ value: p.name, label: p.name + (p.is_preferred ? ' ★' : '') }))),
            { value: '__custom', label: '+ Type a custom name' },
          ]}
        />
        {form.pharmacy === '__custom' && (
          <Field label="Custom Pharmacy" value="" onChange={v => sf('pharmacy', v)} placeholder="Pharmacy name" />
        )}
        <Field label="Purpose / Condition" value={form.purpose} onChange={v => sf('purpose', v)} placeholder="What is this for?" maxLength={500} error={errors.purpose} />
        <Field label="Start Date" value={form.start_date} onChange={v => sf('start_date', v)} type="date" />
        <Field label="Next Refill" value={form.refill_date} onChange={v => sf('refill_date', v)} type="date" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Side effects, instructions..." maxLength={2000} error={errors.notes} />
        <div className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={form.active !== false} onChange={e => sf('active', e.target.checked)} id="medActive" />
          <label htmlFor="medActive" className="text-sm text-salve-textMid">Currently taking</label>
        </div>
        {allergyWarnings.length > 0 && (
          <div className="mb-4 p-3 rounded-xl border border-salve-rose/40 bg-salve-rose/10">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle size={14} color={C.rose} />
              <span className="text-xs font-semibold text-salve-rose">Allergy Warning</span>
            </div>
            {allergyWarnings.map((a, i) => (
              <div key={i} className="text-xs text-salve-textMid leading-relaxed">
                Known allergy to <span className="font-semibold text-salve-rose">{a.substance}</span>
                {a.reaction ? `, ${a.reaction}` : ''}{a.severity ? ` (${a.severity})` : ''}
              </div>
            ))}
          </div>
        )}
        {formInteractionWarnings.length > 0 && (
          <div className="mb-4 p-3 rounded-xl border border-salve-amber/40 bg-salve-amber/10">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle size={14} color={C.amber} />
              <span className="text-xs font-semibold text-salve-amber">Drug Interaction Warning</span>
            </div>
            {formInteractionWarnings.map((w, i) => (
              <div key={i} className="text-xs text-salve-textMid leading-relaxed mt-0.5">
                <span className="font-semibold" style={{ color: w.severity === 'major' ? C.rose : C.amber }}>{w.medA}</span>
                {' + '}
                <span className="font-semibold" style={{ color: w.severity === 'major' ? C.rose : C.amber }}>{w.medB}</span>
                {': '}{w.msg}
                {w.severity === 'major' && <span className="text-salve-rose font-semibold"> (Major)</span>}
              </div>
            ))}
          </div>
        )}
        {form.name.trim() && (data.allergies || []).length > 0 && allergyWarnings.length === 0 && hasAIConsent() && (
          <div className="mb-4">
            <button
              onClick={async () => {
                setCrossReactLoading(true);
                setCrossReactAI(null);
                try {
                  const result = await fetchCrossReactivity(form.name, data.allergies, buildProfile(data));
                  setCrossReactAI(result);
                } catch (e) {
                  setCrossReactAI('Unable to check cross-reactivity right now. ' + e.message);
                } finally {
                  setCrossReactLoading(false);
                }
              }}
              disabled={crossReactLoading}
              className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"
            >
              {crossReactLoading ? <Loader size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {crossReactLoading ? 'Checking cross-reactivity...' : 'Check cross-reactivity with Sage'}
            </button>
            {crossReactAI && (
              <div className="mt-2 p-2.5 rounded-lg bg-salve-lav/8 border border-salve-lav/20">
                <div className="text-[13px] font-semibold text-salve-lav mb-1 flex items-center gap-1"><Sparkles size={11} /> Cross-Reactivity Analysis</div>
                <AIMarkdown compact>{crossReactAI}</AIMarkdown>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={saveMed} disabled={!form.name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_MED); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  /* ── Shared detail renderer (used both inline on mobile and in side pane on desktop) ── */
  const renderMedDetail = (m) => (
    <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
      {/* Desktop: show med name as title in detail pane */}
      {isDesktop && (
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-salve-text font-playfair m-0">{m.display_name || m.name}</h3>
          {m.display_name && m.display_name !== m.name && <div className="text-xs text-salve-textFaint">{m.name}</div>}
          <div className="text-sm text-salve-textMid mt-0.5">{[m.dose, m.frequency].filter(Boolean).join(' · ')}</div>
        </div>
      )}
      {m.route && <div className="text-xs text-salve-textMid mb-0.5">Route: {m.route}</div>}
      {m.purpose && <div className="text-xs text-salve-textFaint">For: {m.purpose}</div>}
      {m.prescriber && <div className="text-xs text-salve-textFaint flex items-center gap-1">Rx: <a href={providerLookupUrl(m.prescriber, data.providers)} target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">{m.prescriber}</a></div>}
      {m.pharmacy && (() => {
        const pLC = m.pharmacy.trim().toLowerCase();
        const notMappable = ['otc', 'n/a', 'na', 'none', 'self', 'online', '-', ', ', 'over the counter'].includes(pLC);
        return notMappable
          ? <div className="text-xs text-salve-textFaint">{m.pharmacy}</div>
          : <div className="text-xs text-salve-textFaint flex items-center gap-1">
              Pharmacy: <a href={mapsUrl(m.pharmacy)} target="_blank" rel="noopener noreferrer" className="text-salve-sage hover:underline inline-flex items-center gap-0.5">{m.pharmacy} <MapPin size={10} /></a>
            </div>;
      })()}
      {m.start_date && <div className="text-xs text-salve-textFaint">Started: {fmtDate(m.start_date)}</div>}
      {m.refill_date && <div className="text-xs text-salve-amber mt-1 font-medium">Refill: {fmtDate(m.refill_date)} ({daysUntil(m.refill_date)})</div>}
      {m.notes && <div className="text-xs text-salve-textFaint mt-1.5 leading-relaxed">{m.notes}</div>}
      {/* ── NADAC price + classification ── */}
      {(() => {
        const prices = (data.drug_prices || []).filter(dp => dp.medication_id === m.id && dp.nadac_per_unit);
        if (!prices.length) return null;
        const latest = prices.sort((a, b) => new Date(b.fetched_at || b.created_at) - new Date(a.fetched_at || a.created_at))[0];
        const isGeneric = latest.classification === 'G';
        return (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[13px] text-salve-sage font-medium">
              <DollarSign size={10} /> ${Number(latest.nadac_per_unit).toFixed(4)}/{latest.pricing_unit || 'unit'}
            </span>
            <span className={`inline-flex items-center py-0.5 px-1.5 rounded text-[9px] font-semibold ${isGeneric ? 'bg-salve-sage/10 text-salve-sage border border-salve-sage/20' : 'bg-salve-amber/10 text-salve-amber border border-salve-amber/20'}`}>
              {isGeneric ? 'Generic' : 'Brand'}
            </span>
          </div>
        );
      })()}
      {/* ── Inline FDA summary ── */}
      {m.fda_data && (
        <div className="mt-2 p-2.5 rounded-lg bg-salve-sage/5 border border-salve-sage/15">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {m.fda_data.generic_name && m.fda_data.generic_name.toLowerCase() !== m.name.toLowerCase() && (
              <span className="text-salve-textMid"><span className="font-medium">Generic:</span> {m.fda_data.generic_name}</span>
            )}
            {m.fda_data.brand_name && m.fda_data.brand_name.toLowerCase() !== m.name.toLowerCase() && (
              <span className="text-salve-textMid"><span className="font-medium">Brand:</span> {m.fda_data.brand_name}</span>
            )}
            {m.fda_data.manufacturer && (
              <span className="text-salve-textMid"><span className="font-medium">Mfr:</span> {m.fda_data.manufacturer}</span>
            )}
            {m.fda_data.pharm_class?.length > 0 && (
              <span className="text-salve-textMid"><span className="font-medium">Class:</span> {m.fda_data.pharm_class.map(c => c.replace(/ \[.*\]$/, '')).join(', ')}</span>
            )}
            {m.fda_data.pharm_class_moa?.length > 0 && (
              <span className="text-salve-textMid"><span className="font-medium">How it works:</span> {m.fda_data.pharm_class_moa.map(c => c.replace(/ \[.*\]$/, '')).join(', ')}</span>
            )}
          </div>
          {/* ── Boxed warning (expandable) ── */}
          {m.fda_data.boxed_warning?.length > 0 && (
            <div className="mt-1.5">
              <div className="flex items-center gap-1 text-[12px] text-salve-rose font-medium">
                <AlertTriangle size={10} /> FDA Black Box Warning
              </div>
              <div className={`mt-1 text-[12px] text-salve-rose/80 leading-relaxed whitespace-pre-line ${!fdaExpanded[`${m.id}:warning`] && m.fda_data.boxed_warning[0].length > 500 ? 'line-clamp-6' : ''}`}>{stripFdaHeader(m.fda_data.boxed_warning[0])}</div>
              {m.fda_data.boxed_warning[0].length > 500 && (
                <button onClick={() => setFdaExpanded(prev => ({ ...prev, [`${m.id}:warning`]: !prev[`${m.id}:warning`] }))} className="mt-0.5 text-[9px] text-salve-sage bg-transparent border-none cursor-pointer font-montserrat p-0 hover:text-salve-text transition-colors">
                  {fdaExpanded[`${m.id}:warning`] ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          {/* ── Indications (always visible when available) ── */}
          {m.fda_data.indications?.length > 0 && (
            <div className="mt-1.5 text-[12px] text-salve-textMid leading-relaxed">
              <span className="font-medium text-salve-text">Used for:</span> <span className={`whitespace-pre-line ${!fdaExpanded[`${m.id}:indications`] && m.fda_data.indications[0].length > 500 ? 'line-clamp-4' : ''}`}>{stripFdaHeader(m.fda_data.indications[0])}</span>
              {m.fda_data.indications[0].length > 500 && (
                <button onClick={() => setFdaExpanded(prev => ({ ...prev, [`${m.id}:indications`]: !prev[`${m.id}:indications`] }))} className="mt-0.5 text-[9px] text-salve-sage bg-transparent border-none cursor-pointer font-montserrat p-0 hover:text-salve-text transition-colors block">
                  {fdaExpanded[`${m.id}:indications`] ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          {/* ── Drug Details toggle ── */}
          {(m.fda_data.adverse_reactions?.length > 0 || m.fda_data.dosage?.length > 0 || m.fda_data.contraindications?.length > 0 || m.fda_data.drug_interactions?.length > 0 || m.fda_data.pregnancy?.length > 0 || m.fda_data.precautions?.length > 0 || m.fda_data.storage?.length > 0 || m.fda_data.overdosage?.length > 0) && (
            <>
              <button
                onClick={() => setFdaDetailId(fdaDetailId === m.id ? null : m.id)}
                className="mt-1.5 flex items-center gap-1 text-[12px] text-salve-sage font-medium bg-transparent border-none cursor-pointer font-montserrat p-0 hover:text-salve-text transition-colors"
              >
                <Info size={10} />
                {fdaDetailId === m.id ? 'Hide details' : 'More drug details'}
                <ChevronDown size={9} className={`transition-transform ${fdaDetailId === m.id ? 'rotate-180' : ''}`} />
              </button>
              {fdaDetailId === m.id && (
                <div className="mt-1.5 space-y-2 text-[12px] leading-relaxed">
                  {[
                    { key: 'adverse_reactions', label: 'Side Effects', color: 'text-salve-amber', data: m.fda_data.adverse_reactions },
                    { key: 'dosage', label: 'Dosage & Administration', color: 'text-salve-text', data: m.fda_data.dosage },
                    { key: 'contraindications', label: 'Contraindications', color: 'text-salve-rose', data: m.fda_data.contraindications },
                    { key: 'drug_interactions', label: 'Drug Interactions', color: 'text-salve-amber', data: m.fda_data.drug_interactions },
                    { key: 'precautions', label: 'Precautions', color: 'text-salve-text', data: m.fda_data.precautions },
                    { key: 'pregnancy', label: 'Pregnancy', color: 'text-salve-lav', data: m.fda_data.pregnancy },
                    { key: 'overdosage', label: 'Overdosage', color: 'text-salve-rose', data: m.fda_data.overdosage },
                    { key: 'storage', label: 'Storage', color: 'text-salve-textMid', data: m.fda_data.storage },
                  ].filter(s => s.data?.length > 0).map(s => {
                    const sKey = `${m.id}:${s.key}`;
                    const isOpen = !!fdaExpanded[sKey];
                    const text = stripFdaHeader(s.data[0]);
                    const isLong = text && text.length > 500;
                    return (
                      <div key={s.key}>
                        <div className={`font-medium ${s.color} mb-0.5`}>{s.label}</div>
                        <div className={`text-salve-textMid whitespace-pre-line ${!isOpen && isLong ? 'line-clamp-6' : ''}`}>{text}</div>
                        {isLong && (
                          <button
                            onClick={() => setFdaExpanded(prev => ({ ...prev, [sKey]: !isOpen }))}
                            className="mt-0.5 text-[9px] text-salve-sage bg-transparent border-none cursor-pointer font-montserrat p-0 hover:text-salve-text transition-colors"
                          >
                            {isOpen ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Journal entries linked to this medication */}
      {(() => {
        const linked = (data.journal || []).filter(e => (e.linked_meds || []).includes(m.id)).slice(0, 5);
        if (!linked.length) return null;
        return (
          <div className="mt-2">
            <span className="text-[12px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Journal Mentions</span>
            <div className="mt-1 space-y-1">
              {linked.map(e => (
                <button key={e.id} onClick={() => onNav?.('journal', { highlightId: e.id })} className="w-full text-left bg-salve-lav/6 border border-salve-lav/12 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-salve-lav/12 transition-colors">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-salve-text font-montserrat">{e.title || e.date}</span>
                    {e.mood && <span className="text-xs">{String(e.mood).split(' ')[0]}</span>}
                    {e.severity && <span className="text-[12px] text-salve-textFaint">{e.severity}/10</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Reminders */}
      {(() => {
        const medReminders = (data.medication_reminders || []).filter(r => r.medication_id === m.id);
        const isAdding = reminderAddId === m.id;
        return (
          <div className="mt-2.5 pt-2.5 border-t border-salve-border/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Reminders</span>
              {!isAdding && (
                <button
                  onClick={() => { setReminderAddId(m.id); setReminderTime('08:00'); }}
                  className="text-[13px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer p-0 hover:underline flex items-center gap-0.5"
                >
                  <Plus size={11} /> Add
                </button>
              )}
            </div>
            {/* Inline time picker */}
            {isAdding && (
              <div className="flex items-center gap-2 mb-2 px-1 py-1.5 rounded-lg bg-salve-card border border-salve-lav/30">
                <input
                  type="time"
                  value={reminderTime}
                  onChange={e => setReminderTime(e.target.value)}
                  autoFocus
                  className="bg-salve-card2 border border-salve-border rounded-lg px-2 py-1 text-xs text-salve-text font-montserrat focus:outline-none focus:ring-1 focus:ring-salve-lav/40"
                />
                <button
                  onClick={() => {
                    if (reminderTime) {
                      addItem('medication_reminders', { medication_id: m.id, reminder_time: reminderTime + ':00', enabled: true });
                      setReminderAddId(null);
                    }
                  }}
                  className="text-[13px] px-2.5 py-1 rounded-full bg-salve-lav/20 border border-salve-lav/30 text-salve-lav font-montserrat font-medium cursor-pointer hover:bg-salve-lav/30 transition-colors"
                >Save</button>
                <button
                  onClick={() => setReminderAddId(null)}
                  className="text-[13px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-text"
                >Cancel</button>
              </div>
            )}
            {medReminders.map(r => (
              <div key={r.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-montserrat text-salve-text">{r.reminder_time?.slice(0, 5)}</span>
                  <span className={`text-[12px] font-montserrat ${r.enabled ? 'text-salve-sage' : 'text-salve-textFaint'}`}>
                    {r.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateItem('medication_reminders', r.id, { enabled: !r.enabled })}
                    className="text-[12px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-lav"
                  >{r.enabled ? 'Pause' : 'Enable'}</button>
                  <button
                    onClick={() => removeItem('medication_reminders', r.id)}
                    className="text-[12px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-rose"
                  >Remove</button>
                </div>
              </div>
            ))}
            {medReminders.length === 0 && !isAdding && (
              <p className="text-[12px] text-salve-textFaint/60 font-montserrat italic">No reminders set</p>
            )}
          </div>
        );
      })()}

      <div className="flex gap-2.5 mt-2.5 flex-wrap">
        <button onClick={() => { setForm(m); setEditId(m.id); setSubView('form'); }} aria-label="Edit medication" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
        <button onClick={() => del.ask(m.id, m.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
        <a href={dailyMedUrl(m.fda_data?.brand_name || m.fda_data?.generic_name || m.display_name || m.name, m.rxcui, m.fda_data?.spl_set_id)} target="_blank" rel="noopener noreferrer" aria-label={`View ${m.display_name || m.name} on DailyMed (opens in new tab)`} className="text-salve-sage text-xs font-montserrat flex items-center gap-1 no-underline hover:underline">
          <ExternalLink size={11} aria-hidden="true" /> DailyMed
        </a>
        {goodRxUrl(m.name) && (
          <a href={goodRxUrl(m.name)} target="_blank" rel="noopener noreferrer" aria-label={`Compare prices for ${m.display_name || m.name} on GoodRx (opens in new tab)`} className="text-salve-sage text-xs font-montserrat flex items-center gap-1 no-underline hover:underline">
            <ExternalLink size={11} aria-hidden="true" /> Compare Prices
          </a>
        )}
      </div>
    </div>
  );

  /* ── Selected med for desktop detail pane ── */
  const selectedMed = isDesktop ? fl.find(m => m.id === expandedId) : null;

  const listContent = (
    <div className="mt-2">
      {interactions.length > 0 && (
        <>
          <SectionTitle>Interaction Warnings</SectionTitle>
          {interactions.map((w, i) => (
            <Card key={i} style={{ borderLeft: `3px solid ${w.severity === 'danger' ? C.rose : w.severity === 'caution' ? C.amber : C.sage}` }} className="!p-3.5">
              <div className="flex justify-between mb-1.5">
                <span className="text-[15px] font-semibold text-salve-text">{w.medA} + {w.medB}</span>
                <SevBadge severity={w.severity} />
              </div>
              <div className="text-xs text-salve-textMid leading-relaxed">{w.msg}</div>
          </Card>
          ))}
          <p className="text-[13px] text-salve-textFaint italic text-center my-1">✧ Always verify with your pharmacist ✧</p>
        </>
      )}

      <div className="flex justify-end mb-3">
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
      </div>

      <div className="flex gap-1.5 mb-3.5">
        {['active', 'inactive', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat capitalize ${
              filter === f ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ── Monthly cost estimate ── */}
      {monthlyCost && (
        <div className="flex items-center gap-2 mb-3 px-0.5">
          <DollarSign size={12} className="text-salve-sage flex-shrink-0" />
          <span className="text-[13px] text-salve-textMid">
            Est. <span className="font-medium text-salve-sage">${monthlyCost.total.toFixed(2)}</span>/mo wholesale
            <span className="text-salve-textFaint"> · {monthlyCost.counted} of {monthlyCost.of} meds priced</span>
          </span>
        </div>
      )}

      {/* ── Pharmacy filter ── */}
      {pharmacyNames.length > 1 && (
        <div className="flex items-center gap-2 mb-3.5">
          <Building2 size={12} className="text-salve-textFaint flex-shrink-0" />
          <select
            value={pharmacyFilter}
            onChange={e => setPharmacyFilter(e.target.value)}
            className="bg-salve-card2 border border-salve-border rounded-lg text-xs text-salve-text font-montserrat py-1.5 px-2.5 cursor-pointer appearance-none pr-7 truncate max-w-[220px]"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236e6a80' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            <option value="all">All pharmacies</option>
            {pharmacyNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Category filter ── */}
      {hasCategories && (
        <div className="flex gap-1.5 mb-3.5 flex-wrap">
          {[{ value: 'all', label: 'All' }, ...MED_CATEGORIES].map(c => (
            <button
              key={c.value}
              onClick={() => setCatFilter(c.value)}
              className={`px-2.5 py-1 rounded-full text-[13px] font-montserrat font-medium border transition-all cursor-pointer ${
                catFilter === c.value
                  ? 'border-salve-lav/40 bg-salve-lav/10 text-salve-text'
                  : 'border-salve-border bg-transparent text-salve-textFaint hover:border-salve-border2'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Consolidated maintenance banner ── */}
      {(() => {
        const unenrichedCount = (data.meds || []).filter(m => m.rxcui && (!m.fda_data || !m.fda_data.spl_set_id)).length;
        const unlinkedCount = (data.meds || []).filter(m => m.active !== false && !m.rxcui && m.name.trim()).length;
        const hasAnyResult = enrichResult || bulkResult;
        const hasAnyProgress = enrichProgress || bulkProgress;
        const tasks = [
          unenrichedCount > 0 && 'enrich',
          unlinkedCount > 0 && 'link',
        ].filter(Boolean);
        if (tasks.length === 0 && !hasAnyResult && !hasAnyProgress) return null;

        const isOpen = hasAnyProgress || hasAnyResult || maintOpen;

        return (
          <div className="mb-3.5 rounded-xl bg-salve-card2/50 border border-salve-border/30 overflow-hidden">
            <button
              onClick={() => setMaintOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-transparent border-none cursor-pointer font-montserrat"
            >
              <div className="flex items-center gap-2 text-[13px] text-salve-textMid">
                <RefreshCw size={11} className="text-salve-textFaint" />
                <span>
                  {hasAnyProgress ? 'Working…' :
                   hasAnyResult ? 'Done, tap to review' :
                   `${tasks.length} maintenance task${tasks.length !== 1 ? 's' : ''}`}
                </span>
                {!isOpen && (
                  <span className="flex gap-1">
                    {unenrichedCount > 0 && <span className="inline-block w-1.5 h-1.5 rounded-full bg-salve-sage/60" />}
                    {unlinkedCount > 0 && <span className="inline-block w-1.5 h-1.5 rounded-full bg-salve-amber/60" />}
                  </span>
                )}
              </div>
              <ChevronDown size={12} className={`text-salve-textFaint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
              <div className="px-3 pb-2.5 space-y-2 border-t border-salve-border/20 pt-2">
                {/* Enrich row */}
                {(unenrichedCount > 0 || enrichResult || enrichProgress) && (
                  enrichResult ? (
                    <div className="text-[13px] text-salve-textMid">
                      <span className="font-medium text-salve-sage">✓ Enriched {enrichResult.enriched}/{enrichResult.total}</span>
                      {enrichResult.failed?.length > 0 && <span className="text-salve-textFaint"> · Not in FDA: {enrichResult.failed.join(', ')}</span>}
                      <button onClick={() => setEnrichResult(null)} className="ml-2 text-[12px] text-salve-textFaint underline bg-transparent border-none cursor-pointer font-montserrat p-0">×</button>
                    </div>
                  ) : enrichProgress ? (
                    <div className="flex items-center gap-2 text-[13px] text-salve-textMid">
                      <Loader size={11} className="animate-spin text-salve-sage" />
                      Enriching {enrichProgress.current}/{enrichProgress.total} <span className="text-salve-textFaint truncate">{enrichProgress.name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-salve-sage flex items-center gap-1"><Download size={10} /> {unenrichedCount} missing drug info</span>
                      <button onClick={bulkEnrichMeds} disabled={enriching} className="text-[12px] px-2 py-0.5 rounded-md bg-salve-sage/10 border border-salve-sage/25 text-salve-sage cursor-pointer font-montserrat hover:bg-salve-sage/20 transition-colors">Enrich</button>
                    </div>
                  )
                )}

                {/* Link row */}
                {(unlinkedCount > 0 || bulkResult || bulkProgress) && (
                  bulkResult ? (
                    <div className="text-[13px] text-salve-textMid">
                      <span className="font-medium text-salve-sage">✓ Linked {bulkResult.linked}/{bulkResult.total}</span>
                      {bulkResult.failed?.length > 0 && <span className="text-salve-textFaint"> · Failed: {bulkResult.failed.join(', ')}</span>}
                      <button onClick={() => setBulkResult(null)} className="ml-2 text-[12px] text-salve-textFaint underline bg-transparent border-none cursor-pointer font-montserrat p-0">×</button>
                    </div>
                  ) : bulkProgress ? (
                    <div className="flex items-center gap-2 text-[13px] text-salve-textMid">
                      <Loader size={11} className="animate-spin text-salve-amber" />
                      Linking {bulkProgress.current}/{bulkProgress.total} <span className="text-salve-textFaint truncate">{bulkProgress.name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-salve-amber flex items-center gap-1"><Unlink size={10} /> {unlinkedCount} not linked to NLM</span>
                      <button onClick={bulkLinkMeds} disabled={bulkLinking} className="text-[12px] px-2 py-0.5 rounded-md bg-salve-amber/10 border border-salve-amber/25 text-salve-amber cursor-pointer font-montserrat hover:bg-salve-amber/20 transition-colors">Link</button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        );
      })()}

      {fl.length === 0 ? (
        <EmptyState
          icon={Pill}
          text="No medications yet"
          hint="Track your meds to get drug interaction checks, refill reminders, and Sage insights that factor in your current regimen."
          motif="leaf"
          actionLabel="Add your first medication"
          onAction={() => setSubView('form')}
        />
      ) :
        fl.map(m => {
          const isExpanded = expandedId === m.id;
          return (
          <Card key={m.id} id={`record-${m.id}`} onClick={() => setExpandedId(isExpanded ? null : m.id)} className={`cursor-pointer transition-all${highlightId === m.id ? ' highlight-ring' : ''}${isDesktop && expandedId === m.id ? ' ring-2 ring-salve-lav/30' : ''}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-salve-text mb-0.5 flex items-center gap-1.5">
                  {m.display_name || m.name}
                </div>
                {m.display_name && m.display_name !== m.name && <div className="text-[13px] text-salve-textFaint -mt-0.5 mb-0.5 truncate">{m.name}</div>}
                <div className="text-[15px] text-salve-textMid">{[m.dose, m.frequency].filter(Boolean).join(' · ')}</div>
                {m.category && m.category !== 'medication' && <Badge label={MED_CATEGORIES.find(c => c.value === m.category)?.label || m.category} color={C.lav} bg={`${C.lav}15`} className="mt-1" />}
                {m.active === false && <Badge label="Discontinued" color={C.textFaint} bg="rgba(110,106,128,0.15)" className="mt-1" />}
                {!isExpanded && (m.fda_data?.pharm_class?.length > 0 || m.fda_data?.boxed_warning?.length > 0) && (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {m.fda_data.pharm_class?.length > 0 && (
                      <span className="inline-flex items-center py-0.5 px-1.5 rounded-full bg-salve-sage/10 border border-salve-sage/20 text-[9px] text-salve-sage font-medium truncate max-w-[200px]">
                        {m.fda_data.pharm_class[0].replace(/ \[.*\]$/, '')}
                      </span>
                    )}
                    {m.fda_data.boxed_warning?.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 py-0.5 px-1.5 rounded-full bg-salve-rose/10 border border-salve-rose/20 text-[9px] text-salve-rose font-medium">
                        <AlertTriangle size={8} /> Boxed Warning
                      </span>
                    )}
                  </div>
                )}
                {!isExpanded && (() => {
                  const cycleLabel = getCycleRelatedLabel(m);
                  const pgxMatches = findPgxMatches(m.display_name || m.name, data.genetic_results);
                  if (!cycleLabel && pgxMatches.length === 0) return null;
                  return (
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {cycleLabel && (
                        <span className="inline-flex items-center gap-0.5 py-0.5 px-1.5 rounded-full bg-salve-rose/10 border border-salve-rose/20 text-[9px] text-salve-rose font-medium">
                          <Heart size={8} /> {cycleLabel}
                        </span>
                      )}
                      {pgxMatches.map((pm, i) => (
                        <span key={i} className={`inline-flex items-center gap-0.5 py-0.5 px-1.5 rounded-full text-[9px] font-medium ${
                          pm.severity === 'danger' ? 'bg-salve-rose/10 border border-salve-rose/20 text-salve-rose'
                            : pm.severity === 'caution' ? 'bg-salve-amber/10 border border-salve-amber/20 text-salve-amber'
                            : 'bg-salve-lav/10 border border-salve-lav/20 text-salve-lav'
                        }`}>
                          <Zap size={8} /> {pm.gene} {pm.phenotype.split(' ')[0]}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-1 ml-2">
                {m.refill_date && !isExpanded && <span className="text-[13px] text-salve-amber font-medium">{daysUntil(m.refill_date)}</span>}
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>
            {/* Mobile: inline expand. Desktop: detail goes to side pane */}
            {!isDesktop && (
              <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                {isExpanded && renderMedDetail(m)}
              </div></div>
            )}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('medications', id))} onCancel={del.cancel} itemId={m.id} />
          </Card>
          );
        })
      }
    </div>
  );

  return (
    <SplitView
      list={listContent}
      detail={selectedMed ? (
        <Card className="!mb-0">
          {renderMedDetail(selectedMed)}
        </Card>
      ) : null}
      emptyMessage="Select a medication to view details"
      detailKey={expandedId}
    />
  );
}
