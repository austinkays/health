import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Check, Edit, Trash2, Pill, Search, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
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
import { suggestDrugs, getDrugInfo } from '../../services/drugLookup';

const FREQ = ['Once daily','Twice daily (BID)','Three times daily (TID)','Four times daily (QID)','Every morning','Every evening/bedtime (QHS)','As needed (PRN)','Weekly','Biweekly','Monthly','Other'];
const ROUTES = ['Oral','Topical','Injection (SC)','Injection (IM)','IV','Inhaled','Sublingual','Transdermal patch','Rectal','Ophthalmic','Otic','Nasal','Other'];

export default function Medications({ data, addItem, updateItem, removeItem, interactions }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_MED);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Drug autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const suggestTimer = useRef(null);
  const nameInputRef = useRef(null);

  // Drug info state
  const [drugInfo, setDrugInfo] = useState(null);
  const [drugInfoLoading, setDrugInfoLoading] = useState(false);
  const [drugInfoExpanded, setDrugInfoExpanded] = useState(false);

  const handleNameChange = useCallback((v) => {
    sf('name', v);
    setDrugInfo(null);
    setDrugInfoExpanded(false);

    if (suggestTimer.current) clearTimeout(suggestTimer.current);

    if (v.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSuggestLoading(true);
    suggestTimer.current = setTimeout(async () => {
      try {
        const results = await suggestDrugs(v);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setSuggestLoading(false);
      }
    }, 300);
  }, []);

  const selectSuggestion = useCallback(async (s) => {
    sf('name', s.name);
    setSuggestions([]);
    setShowSuggestions(false);

    // Fetch drug info
    setDrugInfoLoading(true);
    try {
      const info = await getDrugInfo(s.name);
      setDrugInfo(info);
      if (info) setDrugInfoExpanded(true);
    } catch {
      // Non-blocking
    } finally {
      setDrugInfoLoading(false);
    }
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (nameInputRef.current && !nameInputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup timer
  useEffect(() => () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); }, []);

  const saveMed = async () => {
    if (!form.name.trim()) return;
    if (editId) {
      await updateItem('medications', editId, form);
    } else {
      await addItem('medications', form);
    }
    setForm(EMPTY_MED);
    setEditId(null);
    setDrugInfo(null);
    setDrugInfoExpanded(false);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Medication`} onBack={() => { setSubView(null); setForm(EMPTY_MED); setEditId(null); setDrugInfo(null); }}>
      <Card>
        {/* Medication name with autocomplete */}
        <div className="mb-4 relative" ref={nameInputRef}>
          <label className="block text-[11px] font-semibold text-salve-textMid mb-1.5 uppercase tracking-widest">
            Medication Name <span className="text-salve-rose">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={form.name}
              onChange={e => handleNameChange(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              placeholder="Start typing to search..."
              className="w-full py-2.5 px-3.5 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 box-border focus:outline-none focus:border-salve-lav transition-colors"
              autoComplete="off"
            />
            {suggestLoading && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-salve-textFaint" />
            )}
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-salve-card border border-salve-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-salve-text hover:bg-salve-card2 transition-colors cursor-pointer bg-transparent border-none font-montserrat first:rounded-t-lg last:rounded-b-lg"
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Drug info panel */}
        {drugInfoLoading && (
          <div className="flex items-center gap-2 mb-4 py-2">
            <Loader2 size={14} className="animate-spin text-salve-lav" />
            <span className="text-xs text-salve-textFaint italic">Looking up drug info...</span>
          </div>
        )}

        {drugInfo && (
          <div className="mb-4 rounded-lg border border-salve-lav/30 bg-salve-lav/5 overflow-hidden">
            <button
              onClick={() => setDrugInfoExpanded(p => !p)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-transparent border-none cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <Search size={13} className="text-salve-lav" />
                <span className="text-xs font-semibold text-salve-lav uppercase tracking-wider">Drug Info</span>
                {drugInfo.generic_name && drugInfo.brand_name && (
                  <span className="text-xs text-salve-textMid">
                    — {drugInfo.generic_name}
                    {drugInfo.brand_name !== drugInfo.generic_name ? ` (${drugInfo.brand_name})` : ''}
                  </span>
                )}
              </div>
              {drugInfoExpanded ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
            </button>

            {drugInfoExpanded && (
              <div className="px-3.5 pb-3 space-y-2.5">
                {drugInfo.drug_class?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-wider">Class</span>
                    <p className="text-xs text-salve-textMid leading-relaxed mt-0.5">{drugInfo.drug_class.join(', ')}</p>
                  </div>
                )}
                {drugInfo.purpose && (
                  <div>
                    <span className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-wider">Purpose</span>
                    <p className="text-xs text-salve-textMid leading-relaxed mt-0.5">{drugInfo.purpose}</p>
                  </div>
                )}
                {drugInfo.adverse_reactions && (
                  <div>
                    <span className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-wider">Common Side Effects</span>
                    <p className="text-xs text-salve-textMid leading-relaxed mt-0.5">{drugInfo.adverse_reactions}</p>
                  </div>
                )}
                {drugInfo.dosage && (
                  <div>
                    <span className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-wider">Dosage Info</span>
                    <p className="text-xs text-salve-textMid leading-relaxed mt-0.5">{drugInfo.dosage}</p>
                  </div>
                )}
                {drugInfo.warnings && (
                  <div>
                    <span className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-wider">Warnings</span>
                    <p className="text-xs text-salve-textMid leading-relaxed mt-0.5">{drugInfo.warnings}</p>
                  </div>
                )}
                {drugInfo.manufacturer && (
                  <p className="text-[10px] text-salve-textFaint italic mt-1">Manufacturer: {drugInfo.manufacturer}</p>
                )}
                <p className="text-[10px] text-salve-textFaint italic">Source: OpenFDA. Always verify with your pharmacist.</p>
              </div>
            )}
          </div>
        )}

        <Field label="Dose" value={form.dose} onChange={v => sf('dose', v)} placeholder="e.g. 50mg" />
        <Field label="Frequency" value={form.frequency} onChange={v => sf('frequency', v)} options={FREQ} />
        <Field label="Route" value={form.route} onChange={v => sf('route', v)} options={ROUTES} />
        <Field label="Prescriber" value={form.prescriber} onChange={v => sf('prescriber', v)} placeholder="Dr. Name" />
        <Field label="Pharmacy" value={form.pharmacy} onChange={v => sf('pharmacy', v)} placeholder="Pharmacy name" />
        <Field label="Purpose / Condition" value={form.purpose} onChange={v => sf('purpose', v)} placeholder="What is this for?" />
        <Field label="Start Date" value={form.start_date} onChange={v => sf('start_date', v)} type="date" />
        <Field label="Next Refill" value={form.refill_date} onChange={v => sf('refill_date', v)} type="date" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Side effects, instructions..." />
        <div className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={form.active !== false} onChange={e => sf('active', e.target.checked)} id="medActive" />
          <label htmlFor="medActive" className="text-sm text-salve-textMid">Currently taking</label>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveMed} disabled={!form.name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_MED); setEditId(null); setDrugInfo(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const fl = data.meds.filter(m => filter === 'all' ? true : filter === 'active' ? m.active !== false : m.active === false);

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


      {fl.length === 0 ? <EmptyState icon={Pill} text="No medications yet" motif="leaf" /> :
        fl.map(m => (
          <Card key={m.id}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-salve-text mb-0.5">{m.name}</div>
                <div className="text-[13px] text-salve-textMid">{[m.dose, m.frequency, m.route].filter(Boolean).join(' · ')}</div>
                {m.purpose && <div className="text-xs text-salve-textFaint mt-0.5">For: {m.purpose}</div>}
                {m.prescriber && <div className="text-xs text-salve-textFaint">Rx: {m.prescriber}</div>}
                {m.refill_date && <div className="text-xs text-salve-amber mt-1 font-medium">Refill: {fmtDate(m.refill_date)} ({daysUntil(m.refill_date)})</div>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setForm(m); setEditId(m.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                <button onClick={() => del.ask(m.id, m.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
              </div>
            </div>
            {m.active === false && <Badge label="Discontinued" color={C.textFaint} bg="rgba(110,106,128,0.15)" />}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('medications', id))} onCancel={del.cancel} itemId={m.id} />
          </Card>
        ))
      }
    </div>
  );
}
