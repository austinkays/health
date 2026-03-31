import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Plus, Check, Edit, Trash2, Pill, AlertTriangle, Sparkles, Loader, ChevronDown, Search, Info, MapPin, ExternalLink, Link2, Unlink, Download, BadgeDollarSign, DollarSign, RefreshCw } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge, { SevBadge } from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { EMPTY_MED } from '../../constants/defaults';
import { fmtDate, daysUntil } from '../../utils/dates';
import { C } from '../../constants/colors';
import { Building2 } from 'lucide-react';
import { fetchCrossReactivity } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import { drugAutocomplete, drugDetails, drugPrice } from '../../services/drugs';
import { mapsUrl } from '../../utils/maps';
import { dailyMedUrl, providerLookupUrl, goodRxUrl, costPlusDrugsUrl, amazonPharmacyUrl, blinkHealthUrl } from '../../utils/links';
import { checkInteractions } from '../../utils/interactions';

const FREQ = ['Once daily','Twice daily (BID)','Three times daily (TID)','Four times daily (QID)','Every morning','Every evening/bedtime (QHS)','As needed (PRN)','Weekly','Biweekly','Monthly','Other'];
const ROUTES = ['Oral','Topical','Injection (SC)','Injection (IM)','IV','Inhaled','Sublingual','Transdermal patch','Rectal','Ophthalmic','Otic','Nasal','Other'];

/** Tiny SVG sparkline for price trends — no Recharts needed */
function PriceSparkline({ prices }) {
  if (!prices || prices.length < 2) return null;
  const w = 120, h = 36, pad = 2;
  const vals = prices.map(p => Number(p.nadac_per_unit));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const trend = vals[vals.length - 1] > vals[0] * 1.01 ? '#e8c88a' : '#8fbfa0'; // amber up, sage flat/down
  return (
    <svg width={w} height={h} className="inline-block" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={trend} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {vals.map((v, i) => {
        const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
        const y = pad + (1 - (v - min) / range) * (h - pad * 2);
        return <circle key={i} cx={x} cy={y} r="2" fill={trend} />;
      })}
    </svg>
  );
}

export default function Medications({ data, addItem, updateItem, removeItem, interactions, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_MED);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const [crossReactAI, setCrossReactAI] = useState(null);
  const [crossReactLoading, setCrossReactLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (highlightId && data.meds.some(m => m.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [acResults, setAcResults] = useState([]);
  const [acLoading, setAcLoading] = useState(false);
  const [acError, setAcError] = useState(null);
  const [showAc, setShowAc] = useState(false);
  const [drugInfo, setDrugInfo] = useState({});
  const [drugInfoLoading, setDrugInfoLoading] = useState(null);
  const [drugInfoExpanded, setDrugInfoExpanded] = useState(null);
  const [bulkLinking, setBulkLinking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(null);
  const [enrichResult, setEnrichResult] = useState(null);
  const [priceLoading, setPriceLoading] = useState(null);
  const [bulkPricing, setBulkPricing] = useState(false);
  const [priceProgress, setPriceProgress] = useState(null);
  const [priceResult, setPriceResult] = useState(null);
  const [priceHistoryExpanded, setPriceHistoryExpanded] = useState(null);
  const acRef = useRef(null);
  const acTimerRef = useRef(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

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

  /* ── Fetch drug info for expanded card ── */
  const loadDrugInfo = async (med) => {
    const key = med.rxcui || med.name;
    if (drugInfo[med.id]) { setDrugInfoExpanded(drugInfoExpanded === med.id ? null : med.id); return; }
    setDrugInfoLoading(med.id);
    setDrugInfoExpanded(med.id);
    try {
      const info = await drugDetails(key, med.name);
      setDrugInfo(prev => ({ ...prev, [med.id]: info }));
    } catch {
      setDrugInfo(prev => ({ ...prev, [med.id]: null }));
    } finally { setDrugInfoLoading(null); }
  };

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
    const otherMeds = data.meds.filter(m => m.active !== false && m.id !== editId);
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
    const unenriched = data.meds.filter(m => m.rxcui && !m.fda_data);
    if (unenriched.length === 0) return;
    setEnriching(true);
    setEnrichResult(null);
    let enriched = 0;
    const failed = [];
    for (let i = 0; i < unenriched.length; i++) {
      setEnrichProgress({ current: i + 1, total: unenriched.length, name: unenriched[i].display_name || unenriched[i].name });
      const info = await enrichFdaData(unenriched[i]);
      if (info) enriched++;
      else failed.push(unenriched[i].display_name || unenriched[i].name);
    }
    setEnrichProgress(null);
    setEnrichResult({ enriched, total: unenriched.length, failed });
    setEnriching(false);
  };

  /* ── Bulk link unlinked meds to RxNorm ── */
  const bulkLinkMeds = async () => {
    const unlinked = data.meds.filter(m => m.active !== false && !m.rxcui && m.name.trim());
    if (unlinked.length === 0) return;
    setBulkLinking(true);
    setBulkResult(null);
    let linked = 0;
    for (let i = 0; i < unlinked.length; i++) {
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
        }
      } catch { /* skip this med */ }
    }
    setBulkProgress(null);
    setBulkResult({ linked, total: unlinked.length });
    setBulkLinking(false);
  };

  /* ── Price helpers ── */
  const getLatestPrice = useCallback((medId) => {
    return (data.drug_prices || [])
      .filter(p => p.medication_id === medId)
      .sort((a, b) => new Date(b.fetched_at) - new Date(a.fetched_at))[0] || null;
  }, [data.drug_prices]);

  const parseFreqMultiplier = (freq) => {
    if (!freq) return null;
    const f = freq.toLowerCase();
    if (f.includes('qid') || f.includes('four times')) return 4;
    if (f.includes('tid') || f.includes('three times')) return 3;
    if (f.includes('bid') || f.includes('twice')) return 2;
    if (f.includes('once daily') || f.includes('every morning') || f.includes('every evening') || f.includes('qhs') || f.includes('daily')) return 1;
    if (f.includes('weekly')) return 1 / 7;
    if (f.includes('biweekly')) return 1 / 14;
    if (f.includes('monthly')) return 1 / 30;
    return null;
  };

  const checkPrice = async (med) => {
    if (!med.rxcui) return;
    setPriceLoading(med.id);
    try {
      const result = await drugPrice(med.rxcui);
      if (result && !result.error) {
        await addItem('drug_prices', {
          medication_id: med.id,
          rxcui: med.rxcui,
          ndc: result.ndc,
          nadac_per_unit: result.nadac_per_unit,
          pricing_unit: result.pricing_unit,
          drug_name: result.drug_name,
          effective_date: result.effective_date,
          as_of_date: result.as_of_date,
          classification: result.classification,
        });
      }
    } catch { /* non-blocking */ }
    finally { setPriceLoading(null); }
  };

  const priceColor = (price) => {
    if (price <= 1) return 'text-salve-sage';
    if (price <= 10) return 'text-salve-amber';
    return 'text-salve-rose';
  };

  /* ── Bulk price check for all linked meds ── */
  const medsNeedingPrice = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return data.meds.filter(m => {
      if (!m.rxcui || m.active === false) return false;
      const latest = (data.drug_prices || []).find(p => p.medication_id === m.id);
      return !latest || new Date(latest.fetched_at).getTime() < sevenDaysAgo;
    });
  }, [data.meds, data.drug_prices]);

  const bulkPriceCheck = async () => {
    if (medsNeedingPrice.length === 0) return;
    setBulkPricing(true);
    setPriceResult(null);
    let checked = 0;
    let totalMonthly = 0;
    for (let i = 0; i < medsNeedingPrice.length; i++) {
      const med = medsNeedingPrice[i];
      setPriceProgress({ current: i + 1, total: medsNeedingPrice.length, name: med.display_name || med.name });
      try {
        const result = await drugPrice(med.rxcui);
        if (result && !result.error) {
          await addItem('drug_prices', {
            medication_id: med.id,
            rxcui: med.rxcui,
            ndc: result.ndc,
            nadac_per_unit: result.nadac_per_unit,
            pricing_unit: result.pricing_unit,
            drug_name: result.drug_name,
            effective_date: result.effective_date,
            as_of_date: result.as_of_date,
            classification: result.classification,
          });
          checked++;
          const mult = parseFreqMultiplier(med.frequency);
          if (mult) totalMonthly += result.nadac_per_unit * mult * 30;
        }
      } catch { /* skip */ }
    }
    setPriceProgress(null);
    setPriceResult({ checked, total: medsNeedingPrice.length, monthlyEstimate: totalMonthly > 0 ? totalMonthly.toFixed(2) : null });
    setBulkPricing(false);
  };

  const saveMed = async () => {
    if (!form.name.trim()) return;
    if (editId) {
      await updateItem('medications', editId, form);
    } else {
      await addItem('medications', form);
    }
    setForm(EMPTY_MED);
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Medication`} onBack={() => { setSubView(null); setForm(EMPTY_MED); setEditId(null); }}>
      <Card>
        <div className="relative" ref={acRef}>
          <Field label="Medication Name" value={form.name} onChange={handleNameChange} placeholder="e.g. Sertraline" required />
          {showAc && (acResults.length > 0 || acLoading || acError) && (
            <div className="absolute z-20 left-0 right-0 top-full -mt-3 bg-salve-card2 border border-salve-border rounded-lg shadow-lg max-h-48 overflow-y-auto" role="listbox" aria-label="Medication suggestions">
              {acLoading && <div className="px-3 py-2 text-xs text-salve-textFaint flex items-center gap-1.5"><Loader size={11} className="animate-spin" /> Searching...</div>}
              {acError && !acLoading && <div className="px-3 py-2 text-xs text-salve-rose" role="alert">{acError}</div>}
              {acResults.map((item, i) => (
                <button
                  key={`${item.rxcui}-${i}`}
                  onClick={() => selectAcResult(item)}
                  role="option"
                  className="w-full text-left px-3 py-2 text-sm text-salve-text hover:bg-salve-lav/10 cursor-pointer bg-transparent border-none font-montserrat flex items-center gap-2 transition-colors"
                >
                  <Search size={11} className="text-salve-textFaint flex-shrink-0" />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          )}
          {form.rxcui && <div className="text-[10px] text-salve-textFaint -mt-3 mb-3" title="RxNorm Concept Unique Identifier — links this medication to the NLM drug database for interaction checking and drug info">RxCUI: {form.rxcui} · Linked to NLM drug database</div>}
        </div>
        <Field label="Display Name (optional)" value={form.display_name} onChange={v => sf('display_name', v)} placeholder="e.g. my morning pill" />
        <Field label="Dose" value={form.dose} onChange={v => sf('dose', v)} placeholder="e.g. 50mg" />
        <Field label="Frequency" value={form.frequency} onChange={v => sf('frequency', v)} options={FREQ} />
        <Field label="Route" value={form.route} onChange={v => sf('route', v)} options={ROUTES} />
        <Field label="Prescriber" value={form.prescriber} onChange={v => sf('prescriber', v)} placeholder="Dr. Name" />
        <Field label="Pharmacy" value={form.pharmacy} onChange={v => sf('pharmacy', v)}
          options={[
            { value: '', label: 'Select pharmacy...' },
            ...((data.pharmacies || []).map(p => ({ value: p.name, label: p.name + (p.is_preferred ? ' ★' : '') }))),
            { value: '__custom', label: '— Type custom —' },
          ]}
        />
        {form.pharmacy === '__custom' && (
          <Field label="Custom Pharmacy" value="" onChange={v => sf('pharmacy', v)} placeholder="Pharmacy name" />
        )}
        <Field label="Purpose / Condition" value={form.purpose} onChange={v => sf('purpose', v)} placeholder="What is this for?" />
        <Field label="Start Date" value={form.start_date} onChange={v => sf('start_date', v)} type="date" />
        <Field label="Next Refill" value={form.refill_date} onChange={v => sf('refill_date', v)} type="date" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Side effects, instructions..." />
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
                {a.reaction ? ` — ${a.reaction}` : ''}{a.severity ? ` (${a.severity})` : ''}
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
              {crossReactLoading ? 'Checking cross-reactivity...' : 'Check AI cross-reactivity with allergies'}
            </button>
            {crossReactAI && (
              <div className="mt-2 p-2.5 rounded-lg bg-salve-lav/8 border border-salve-lav/20">
                <div className="text-[11px] font-semibold text-salve-lav mb-1 flex items-center gap-1"><Sparkles size={11} /> Cross-Reactivity Analysis</div>
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

  /* ── Pharmacy filter support ── */
  const pharmacyNames = useMemo(() => {
    const names = new Set();
    data.meds.forEach(m => { if (m.pharmacy?.trim()) names.add(m.pharmacy.trim()); });
    return [...names].sort();
  }, [data.meds]);
  const [pharmacyFilter, setPharmacyFilter] = useState('all');

  const fl = data.meds.filter(m => {
    const statusOk = filter === 'all' ? true : filter === 'active' ? m.active !== false : m.active === false;
    const pharmaOk = pharmacyFilter === 'all' ? true : (m.pharmacy?.trim() || '') === pharmacyFilter;
    return statusOk && pharmaOk;
  });

  return (
    <div className="mt-2">
      {interactions.length > 0 && (
        <>
          <SectionTitle>Interaction Warnings</SectionTitle>
          {interactions.map((w, i) => (
            <Card key={i} style={{ borderLeft: `3px solid ${w.severity === 'danger' ? C.rose : w.severity === 'caution' ? C.amber : C.sage}` }} className="!p-3.5">
              <div className="flex justify-between mb-1.5">
                <span className="text-[13px] font-semibold text-salve-text">{w.medA} + {w.medB}</span>
                <SevBadge severity={w.severity} />
              </div>
              <div className="text-xs text-salve-textMid leading-relaxed">{w.msg}</div>
          </Card>
          ))}
          <p className="text-[11px] text-salve-textFaint italic text-center my-1">✧ Always verify with your pharmacist ✧</p>
        </>
      )}

      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        My Medications
      </SectionTitle>

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

      {/* ── Enrich All banner (linked meds missing FDA data) ── */}
      {(() => {
        const unenrichedCount = data.meds.filter(m => m.rxcui && !m.fda_data).length;
        if (unenrichedCount === 0 && !enrichResult) return null;
        return (
          <div className="mb-3.5 p-3 rounded-xl bg-salve-sage/5 border border-salve-sage/20">
            {enrichResult ? (
              <div className="text-xs text-salve-textMid">
                <span className="font-medium text-salve-sage">✓ Enriched {enrichResult.enriched}/{enrichResult.total}</span>
                {enrichResult.failed?.length > 0 && (
                  <span className="text-salve-textFaint"> · Not in FDA database: {enrichResult.failed.join(', ')}</span>
                )}
                <button onClick={() => setEnrichResult(null)} className="ml-2 text-[10px] text-salve-textFaint underline bg-transparent border-none cursor-pointer font-montserrat p-0">dismiss</button>
              </div>
            ) : enrichProgress ? (
              <div className="flex items-center gap-2 text-xs text-salve-textMid">
                <Loader size={12} className="animate-spin text-salve-sage" />
                Enriching {enrichProgress.current} of {enrichProgress.total}… <span className="text-salve-textFaint truncate">{enrichProgress.name}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-salve-sage">
                  <Download size={12} />
                  <span>{unenrichedCount} linked med{unenrichedCount !== 1 ? 's' : ''} missing drug info</span>
                </div>
                <button
                  onClick={bulkEnrichMeds}
                  disabled={enriching}
                  className="flex-shrink-0 py-1.5 px-3 rounded-lg bg-salve-sage/10 border border-salve-sage/30 text-salve-sage text-[11px] font-medium cursor-pointer font-montserrat flex items-center gap-1 hover:bg-salve-sage/20 transition-colors"
                >
                  <Download size={11} /> Enrich All
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {(() => {
        const unlinkedCount = data.meds.filter(m => m.active !== false && !m.rxcui && m.name.trim()).length;
        if (unlinkedCount === 0 && !bulkResult) return null;
        return (
          <div className="mb-3.5 p-3 rounded-xl bg-salve-amber/5 border border-salve-amber/20">
            {bulkResult ? (
              <div className="text-xs text-salve-textMid">
                <span className="font-medium text-salve-sage">✓ Linked {bulkResult.linked}/{bulkResult.total}</span>
                {bulkResult.linked < bulkResult.total && <span className="text-salve-textFaint"> · {bulkResult.total - bulkResult.linked} couldn't be matched — try editing them and using the search</span>}
                <button onClick={() => setBulkResult(null)} className="ml-2 text-[10px] text-salve-textFaint underline bg-transparent border-none cursor-pointer font-montserrat p-0">dismiss</button>
              </div>
            ) : bulkProgress ? (
              <div className="flex items-center gap-2 text-xs text-salve-textMid">
                <Loader size={12} className="animate-spin text-salve-amber" />
                Linking {bulkProgress.current} of {bulkProgress.total}… <span className="text-salve-textFaint truncate">{bulkProgress.name}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-salve-amber">
                  <Unlink size={12} />
                  <span>{unlinkedCount} medication{unlinkedCount !== 1 ? 's' : ''} not linked to NLM</span>
                </div>
                <button
                  onClick={bulkLinkMeds}
                  disabled={bulkLinking}
                  className="flex-shrink-0 py-1.5 px-3 rounded-lg bg-salve-amber/10 border border-salve-amber/30 text-salve-amber text-[11px] font-medium cursor-pointer font-montserrat flex items-center gap-1 hover:bg-salve-amber/20 transition-colors"
                >
                  <Link2 size={11} /> Link All
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Bulk Price Check banner ── */}
      {(() => {
        if (medsNeedingPrice.length < 2 && !priceResult) return null;
        return (
          <div className="mb-3.5 p-3 rounded-xl bg-salve-lav/5 border border-salve-lav/20">
            {priceResult ? (
              <div className="text-xs text-salve-textMid">
                <span className="font-medium text-salve-sage">✓ Checked {priceResult.checked}/{priceResult.total}</span>
                {priceResult.monthlyEstimate && <span className="text-salve-lav"> · Monthly estimate: ~${priceResult.monthlyEstimate}</span>}
                <button onClick={() => setPriceResult(null)} className="ml-2 text-[10px] text-salve-textFaint underline bg-transparent border-none cursor-pointer font-montserrat p-0">dismiss</button>
              </div>
            ) : priceProgress ? (
              <div className="flex items-center gap-2 text-xs text-salve-textMid">
                <Loader size={12} className="animate-spin text-salve-lav" />
                Checking {priceProgress.current} of {priceProgress.total}… <span className="text-salve-textFaint truncate">{priceProgress.name}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-salve-lav">
                  <DollarSign size={12} />
                  <span>{medsNeedingPrice.length} med{medsNeedingPrice.length !== 1 ? 's' : ''} need price check</span>
                </div>
                <button
                  onClick={bulkPriceCheck}
                  disabled={bulkPricing}
                  className="flex-shrink-0 py-1.5 px-3 rounded-lg bg-salve-lav/10 border border-salve-lav/30 text-salve-lav text-[11px] font-medium cursor-pointer font-montserrat flex items-center gap-1 hover:bg-salve-lav/20 transition-colors"
                >
                  <DollarSign size={11} /> Price Check All
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {fl.length === 0 ? <EmptyState icon={Pill} text="No medications yet" motif="leaf" /> :
        fl.map(m => {
          const isExpanded = expandedId === m.id;
          return (
          <Card key={m.id} id={`record-${m.id}`} onClick={() => setExpandedId(isExpanded ? null : m.id)} className={`cursor-pointer transition-all${highlightId === m.id ? ' highlight-ring' : ''}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-salve-text mb-0.5 flex items-center gap-1.5">
                  <a href={dailyMedUrl(m.name, m.rxcui)} target="_blank" rel="noopener noreferrer" className="text-salve-text hover:text-salve-sage transition-colors hover:underline">
                    {m.display_name || m.name}
                  </a>
                  {m.rxcui
                    ? <span title="Linked to NLM drug database" className="text-salve-sage"><Link2 size={11} /></span>
                    : <span title="Not linked to NLM database" className="text-salve-amber"><Unlink size={11} /></span>
                  }
                </div>
                {m.display_name && m.display_name !== m.name && <div className="text-[11px] text-salve-textFaint -mt-0.5 mb-0.5">{m.name}</div>}
                <div className="text-[13px] text-salve-textMid">{[m.dose, m.frequency].filter(Boolean).join(' · ')}</div>
                {m.fda_data?.pharm_class?.length > 0 && (
                  <span className="inline-block mt-1 mr-1 py-0.5 px-2 rounded-full bg-salve-sage/10 border border-salve-sage/20 text-[10px] text-salve-sage font-medium">
                    {m.fda_data.pharm_class[0].replace(/ \[.*\]$/, '')}
                  </span>
                )}
                {m.fda_data?.boxed_warning?.length > 0 && (
                  <span className="inline-block mt-1 py-0.5 px-2 rounded-full bg-salve-rose/10 border border-salve-rose/20 text-[10px] text-salve-rose font-medium">
                    ⚠ Boxed Warning
                  </span>
                )}
                {m.active === false && <Badge label="Discontinued" color={C.textFaint} bg="rgba(110,106,128,0.15)" className="mt-1" />}
              </div>
              <div className="flex items-center gap-1 ml-2">
                {m.refill_date && !isExpanded && <span className="text-[11px] text-salve-amber font-medium">{daysUntil(m.refill_date)}</span>}
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>
            <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
              <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                {m.route && <div className="text-xs text-salve-textMid mb-0.5">Route: {m.route}</div>}
                {m.purpose && <div className="text-xs text-salve-textFaint">For: {m.purpose}</div>}
                {m.prescriber && <div className="text-xs text-salve-textFaint flex items-center gap-1">Rx: <a href={providerLookupUrl(m.prescriber, data.providers)} target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">{m.prescriber}</a></div>}
                {m.pharmacy && (
                  <div className="text-xs text-salve-textFaint flex items-center gap-1">
                    Pharmacy: <a href={mapsUrl(m.pharmacy)} target="_blank" rel="noopener noreferrer" className="text-salve-sage hover:underline inline-flex items-center gap-0.5">{m.pharmacy} <MapPin size={10} /></a>
                  </div>
                )}
                {m.start_date && <div className="text-xs text-salve-textFaint">Started: {fmtDate(m.start_date)}</div>}
                {m.refill_date && <div className="text-xs text-salve-amber mt-1 font-medium">Refill: {fmtDate(m.refill_date)} ({daysUntil(m.refill_date)})</div>}
                {m.rxcui && <div className="text-[10px] text-salve-textFaint mt-1" title="RxNorm Concept Unique Identifier — enables drug interaction checking and FDA drug info lookup">RxCUI: {m.rxcui}</div>}
                {m.notes && <div className="text-xs text-salve-textFaint mt-1.5 leading-relaxed">{m.notes}</div>}
                {/* ── Inline FDA summary ── */}
                {m.fda_data && (
                  <div className="mt-2 p-2.5 rounded-lg bg-salve-sage/5 border border-salve-sage/15">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                      {m.fda_data.generic_name && m.fda_data.generic_name.toLowerCase() !== m.name.toLowerCase() && (
                        <span className="text-salve-textMid"><span className="font-medium">Generic:</span> {m.fda_data.generic_name}</span>
                      )}
                      {m.fda_data.brand_name && m.fda_data.brand_name.toLowerCase() !== m.name.toLowerCase() && (
                        <span className="text-salve-textMid"><span className="font-medium">Brand:</span> {m.fda_data.brand_name}</span>
                      )}
                      {m.fda_data.pharm_class?.length > 0 && (
                        <span className="text-salve-textMid"><span className="font-medium">Class:</span> {m.fda_data.pharm_class.map(c => c.replace(/ \[.*\]$/, '')).join(', ')}</span>
                      )}
                      {m.fda_data.manufacturer && (
                        <span className="text-salve-textFaint"><span className="font-medium">Mfg:</span> {m.fda_data.manufacturer}</span>
                      )}
                    </div>
                    {m.fda_data.boxed_warning?.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-salve-rose font-medium">
                        <AlertTriangle size={10} /> Has FDA Black Box Warning — see full details below
                      </div>
                    )}
                  </div>
                )}
                {!m.fda_data && m.rxcui && (
                  <button
                    onClick={async () => {
                      setDrugInfoLoading(m.id);
                      await enrichFdaData(m);
                      setDrugInfoLoading(null);
                    }}
                    className="mt-2 bg-transparent border-none cursor-pointer text-salve-sage/60 text-[11px] font-montserrat p-0 flex items-center gap-1 hover:text-salve-sage transition-colors"
                    aria-label="Fetch FDA drug data"
                  >
                    {drugInfoLoading === m.id ? <Loader size={10} className="animate-spin" /> : <Download size={10} />}
                    {drugInfoLoading === m.id ? 'Fetching drug info…' : 'Fetch drug info'}
                  </button>
                )}
                {/* ── NADAC Price Display ── */}
                {m.rxcui && (() => {
                  const price = getLatestPrice(m.id);
                  const priceHistory = (data.drug_prices || [])
                    .filter(p => p.medication_id === m.id)
                    .sort((a, b) => new Date(a.fetched_at) - new Date(b.fetched_at));
                  if (price) {
                    const mult = parseFreqMultiplier(m.frequency);
                    const monthly = mult ? (price.nadac_per_unit * mult * 30).toFixed(2) : null;
                    const dateStr = price.as_of_date ? fmtDate(price.as_of_date) : fmtDate(price.fetched_at);
                    return (
                      <div className="mt-2 p-2 rounded-lg bg-salve-card2/50 border border-salve-border/30">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <DollarSign size={12} className={priceColor(price.nadac_per_unit)} />
                            <span className={`text-xs font-medium ${priceColor(price.nadac_per_unit)}`}>
                              ${Number(price.nadac_per_unit).toFixed(4)}/{price.pricing_unit || 'unit'}
                            </span>
                            <span className="text-[10px] text-salve-textFaint">(NADAC)</span>
                          </div>
                          <button
                            onClick={() => checkPrice(m)}
                            disabled={priceLoading === m.id}
                            className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-lav transition-colors p-0"
                            aria-label="Refresh price"
                          >
                            {priceLoading === m.id ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                          </button>
                        </div>
                        {monthly && (
                          <div className="text-[11px] text-salve-textMid mt-0.5">
                            ~${monthly}/mo estimated
                          </div>
                        )}
                        {priceHistory.length >= 4 && (
                          <div className="mt-1.5"><PriceSparkline prices={priceHistory} /></div>
                        )}
                        <div className="text-[10px] text-salve-textFaint mt-0.5">
                          {price.classification === 'G' ? 'Generic' : price.classification === 'B' ? 'Brand' : ''}
                          {price.classification ? ' · ' : ''}Updated {dateStr}
                          {priceHistory.length >= 2 && (
                            <button
                              onClick={() => setPriceHistoryExpanded(priceHistoryExpanded === m.id ? null : m.id)}
                              className="ml-1.5 text-salve-lav/70 hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat text-[10px] p-0 underline"
                            >
                              {priceHistoryExpanded === m.id ? 'Hide' : `${priceHistory.length} snapshots`}
                            </button>
                          )}
                        </div>
                        {priceHistoryExpanded === m.id && priceHistory.length >= 2 && (
                          <div className="mt-2 space-y-0.5">
                            {priceHistory.slice().reverse().map((ph, i, arr) => {
                              const prev = arr[i + 1];
                              const pctChange = prev ? ((Number(ph.nadac_per_unit) - Number(prev.nadac_per_unit)) / Number(prev.nadac_per_unit) * 100) : null;
                              const changeColor = pctChange === null ? 'text-salve-textFaint' : pctChange > 0 ? 'text-salve-amber' : pctChange < 0 ? 'text-salve-sage' : 'text-salve-textFaint';
                              return (
                                <div key={ph.id || i} className="flex items-center justify-between text-[10px] py-0.5 border-b border-salve-border/20 last:border-0">
                                  <span className="text-salve-textFaint">{fmtDate(ph.as_of_date || ph.fetched_at)}</span>
                                  <span className="text-salve-textMid font-medium">${Number(ph.nadac_per_unit).toFixed(4)}</span>
                                  {pctChange !== null && (
                                    <span className={`${changeColor} font-medium`}>
                                      {pctChange > 0 ? '↑' : pctChange < 0 ? '↓' : '·'}{Math.abs(pctChange).toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <button
                      onClick={() => checkPrice(m)}
                      disabled={priceLoading === m.id}
                      className="mt-2 bg-transparent border-none cursor-pointer text-salve-sage/60 text-[11px] font-montserrat p-0 flex items-center gap-1 hover:text-salve-sage transition-colors"
                      aria-label="Check NADAC price"
                    >
                      {priceLoading === m.id ? <Loader size={10} className="animate-spin" /> : <DollarSign size={10} />}
                      {priceLoading === m.id ? 'Checking price…' : 'Check Price'}
                    </button>
                  );
                })()}
                <div className="flex gap-2.5 mt-2.5 flex-wrap">
                  <button onClick={() => { setForm(m); setEditId(m.id); setSubView('form'); }} aria-label="Edit medication" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
                  <button onClick={() => del.ask(m.id, m.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                  <button onClick={() => loadDrugInfo(m)} className="bg-transparent border-none cursor-pointer text-salve-sage text-xs font-montserrat p-0 flex items-center gap-1">
                    {drugInfoLoading === m.id ? <Loader size={11} className="animate-spin" /> : <Info size={12} />}
                    {drugInfoLoading === m.id ? 'Loading...' : drugInfo[m.id] ? (drugInfoExpanded === m.id ? 'Hide' : 'Show') + ' Drug Info' : 'Drug Info'}
                  </button>
                  {goodRxUrl(m.name) && (
                    <a href={goodRxUrl(m.name)} target="_blank" rel="noopener noreferrer" className="text-salve-amber text-xs font-montserrat flex items-center gap-1 no-underline hover:underline">
                      <BadgeDollarSign size={12} /> Compare Prices
                    </a>
                  )}
                </div>
                {/* ── Compare Prices links ── */}
                {goodRxUrl(m.name) && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]">
                    {costPlusDrugsUrl(m.name) && <a href={costPlusDrugsUrl(m.name)} target="_blank" rel="noopener noreferrer" className="text-salve-amber/70 hover:text-salve-amber no-underline hover:underline flex items-center gap-0.5"><ExternalLink size={9} /> Cost Plus</a>}
                    {amazonPharmacyUrl(m.name) && <a href={amazonPharmacyUrl(m.name)} target="_blank" rel="noopener noreferrer" className="text-salve-amber/70 hover:text-salve-amber no-underline hover:underline flex items-center gap-0.5"><ExternalLink size={9} /> Amazon Pharmacy</a>}
                    {blinkHealthUrl(m.name) && <a href={blinkHealthUrl(m.name)} target="_blank" rel="noopener noreferrer" className="text-salve-amber/70 hover:text-salve-amber no-underline hover:underline flex items-center gap-0.5"><ExternalLink size={9} /> Blink Health</a>}
                  </div>
                )}
                {drugInfoExpanded === m.id && drugInfo[m.id] && (
                  <div className="mt-2.5 p-3 rounded-lg bg-salve-sage/5 border border-salve-sage/20">
                    <div className="text-[11px] font-semibold text-salve-sage mb-2 flex items-center gap-1"><Info size={11} /> FDA Drug Label</div>
                    {drugInfo[m.id].generic_name && <div className="text-xs text-salve-textMid mb-1"><span className="font-medium">Generic:</span> {drugInfo[m.id].generic_name}</div>}
                    {drugInfo[m.id].brand_name && <div className="text-xs text-salve-textMid mb-1"><span className="font-medium">Brand:</span> {drugInfo[m.id].brand_name}</div>}
                    {drugInfo[m.id].pharm_class?.length > 0 && <div className="text-xs text-salve-textMid mb-1"><span className="font-medium">Class:</span> {drugInfo[m.id].pharm_class.join(', ')}</div>}
                    {drugInfo[m.id].manufacturer && <div className="text-xs text-salve-textFaint mb-1"><span className="font-medium">Mfg:</span> {drugInfo[m.id].manufacturer}</div>}
                    {drugInfo[m.id].boxed_warning?.length > 0 && (
                      <div className="mt-2 p-2 rounded-lg bg-salve-rose/10 border border-salve-rose/30">
                        <div className="text-[11px] font-semibold text-salve-rose mb-1 flex items-center gap-1"><AlertTriangle size={11} /> Black Box Warning</div>
                        <div className="text-[11px] text-salve-textMid leading-relaxed">{drugInfo[m.id].boxed_warning[0].slice(0, 300)}{drugInfo[m.id].boxed_warning[0].length > 300 ? '…' : ''}</div>
                      </div>
                    )}
                    {drugInfo[m.id].indications?.length > 0 && (
                      <div className="mt-2"><div className="text-[11px] font-medium text-salve-textMid mb-0.5">Indications</div><div className="text-[11px] text-salve-textFaint leading-relaxed">{drugInfo[m.id].indications[0].slice(0, 200)}…</div></div>
                    )}
                    {drugInfo[m.id].adverse_reactions?.length > 0 && (
                      <div className="mt-2"><div className="text-[11px] font-medium text-salve-textMid mb-0.5">Side Effects</div><div className="text-[11px] text-salve-textFaint leading-relaxed">{drugInfo[m.id].adverse_reactions[0].slice(0, 250)}…</div></div>
                    )}
                    {drugInfo[m.id].drug_interactions?.length > 0 && (
                      <div className="mt-2"><div className="text-[11px] font-medium text-salve-textMid mb-0.5">Drug Interactions</div><div className="text-[11px] text-salve-textFaint leading-relaxed">{drugInfo[m.id].drug_interactions[0].slice(0, 250)}…</div></div>
                    )}
                    <div className="text-[9px] text-salve-textFaint italic mt-2">Source: FDA/OpenFDA drug labeling database</div>
                  </div>
                )}
                {drugInfoExpanded === m.id && drugInfo[m.id] === null && (
                  <div className="mt-2 text-[11px] text-salve-textFaint italic">No FDA label data found for this medication.</div>
                )}
              </div>
            </div></div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('medications', id))} onCancel={del.cancel} itemId={m.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
