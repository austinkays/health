import { useState, useMemo } from 'react';
import { Plus, Check, Edit, Trash2, Pill, AlertTriangle, Sparkles, Loader, ChevronDown } from 'lucide-react';
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
import { fetchCrossReactivity } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';

const FREQ = ['Once daily','Twice daily (BID)','Three times daily (TID)','Four times daily (QID)','Every morning','Every evening/bedtime (QHS)','As needed (PRN)','Weekly','Biweekly','Monthly','Other'];
const ROUTES = ['Oral','Topical','Injection (SC)','Injection (IM)','IV','Inhaled','Sublingual','Transdermal patch','Rectal','Ophthalmic','Otic','Nasal','Other'];

export default function Medications({ data, addItem, updateItem, removeItem, interactions }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_MED);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const [crossReactAI, setCrossReactAI] = useState(null);
  const [crossReactLoading, setCrossReactLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  /* ── Allergy cross-check ── */
  const allergyWarnings = useMemo(() => {
    const name = form.name.trim().toLowerCase();
    if (!name) return [];
    return (data.allergies || []).filter(a => {
      const sub = (a.substance || '').toLowerCase();
      return sub && (name.includes(sub) || sub.includes(name));
    });
  }, [form.name, data.allergies]);

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
        <Field label="Medication Name" value={form.name} onChange={v => sf('name', v)} placeholder="e.g. Sertraline" required />
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
        fl.map(m => {
          const isExpanded = expandedId === m.id;
          return (
          <Card key={m.id} onClick={() => setExpandedId(isExpanded ? null : m.id)} className="cursor-pointer transition-all">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-salve-text mb-0.5">{m.name}</div>
                <div className="text-[13px] text-salve-textMid">{[m.dose, m.frequency].filter(Boolean).join(' · ')}</div>
                {m.active === false && <Badge label="Discontinued" color={C.textFaint} bg="rgba(110,106,128,0.15)" className="mt-1" />}
              </div>
              <div className="flex items-center gap-1 ml-2">
                {m.refill_date && !isExpanded && <span className="text-[11px] text-salve-amber font-medium">{daysUntil(m.refill_date)}</span>}
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>
            {isExpanded && (
              <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                {m.route && <div className="text-xs text-salve-textMid mb-0.5">Route: {m.route}</div>}
                {m.purpose && <div className="text-xs text-salve-textFaint">For: {m.purpose}</div>}
                {m.prescriber && <div className="text-xs text-salve-textFaint">Rx: {m.prescriber}</div>}
                {m.pharmacy && <div className="text-xs text-salve-textFaint">Pharmacy: {m.pharmacy}</div>}
                {m.start_date && <div className="text-xs text-salve-textFaint">Started: {fmtDate(m.start_date)}</div>}
                {m.refill_date && <div className="text-xs text-salve-amber mt-1 font-medium">Refill: {fmtDate(m.refill_date)} ({daysUntil(m.refill_date)})</div>}
                {m.notes && <div className="text-xs text-salve-textFaint mt-1.5 leading-relaxed">{m.notes}</div>}
                <div className="flex gap-2.5 mt-2.5">
                  <button onClick={() => { setForm(m); setEditId(m.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
                  <button onClick={() => del.ask(m.id, m.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                </div>
              </div>
            )}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('medications', id))} onCancel={del.cancel} itemId={m.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
