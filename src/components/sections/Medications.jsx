import { useState } from 'react';
import { Plus, Check, Edit, Trash2, Pill, ChevronDown } from 'lucide-react';
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

const FREQ = ['Once daily','Twice daily (BID)','Three times daily (TID)','Four times daily (QID)','Every morning','Every evening/bedtime (QHS)','As needed (PRN)','Weekly','Biweekly','Monthly','Other'];
const ROUTES = ['Oral','Topical','Injection (SC)','Injection (IM)','IV','Inhaled','Sublingual','Transdermal patch','Rectal','Ophthalmic','Otic','Nasal','Other'];

export default function Medications({ data, addItem, updateItem, removeItem, interactions, onNav }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_MED);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const [expanded, setExpanded] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

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
          const isOpen = expanded === m.id;
          // Find conditions that list this med
          const linkedConditions = data.conditions.filter(c =>
            c.linked_meds && c.linked_meds.toLowerCase().includes(m.name.toLowerCase())
          );
          return (
          <Card key={m.id} className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : m.id)}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-semibold text-salve-text">{m.name}</span>
                  <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
                <div className="text-[13px] text-salve-textMid">{[m.dose, m.frequency, m.route].filter(Boolean).join(' · ')}</div>
              </div>
              {m.active === false && <Badge label="Discontinued" color={C.textFaint} bg="rgba(110,106,128,0.15)" />}
            </div>
            {isOpen && (
              <div className="mt-2 pt-2 border-t border-salve-border">
                {m.purpose && <div className="text-xs text-salve-textFaint mb-0.5">For: {m.purpose}</div>}
                {m.prescriber && <div className="text-xs text-salve-textFaint mb-0.5">Rx: {m.prescriber}</div>}
                {m.pharmacy && <div className="text-xs text-salve-textFaint mb-0.5">Pharmacy: {m.pharmacy}</div>}
                {m.start_date && <div className="text-xs text-salve-textFaint mb-0.5">Started: {fmtDate(m.start_date)}</div>}
                {m.refill_date && <div className="text-xs text-salve-amber font-medium mb-0.5">Refill: {fmtDate(m.refill_date)} ({daysUntil(m.refill_date)})</div>}
                {m.notes && <div className="text-xs text-salve-textMid mt-1 leading-relaxed">{m.notes}</div>}
                {linkedConditions.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {linkedConditions.map(c => (
                      <button key={c.id} onClick={e => { e.stopPropagation(); onNav('conditions'); }}
                        className="text-[11px] text-salve-lav bg-salve-lav/10 border border-salve-lav/25 rounded-full px-2.5 py-0.5 cursor-pointer font-montserrat">
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setForm(m); setEditId(m.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex items-center gap-1 text-xs font-montserrat"><Edit size={14} /> Edit</button>
                  <button onClick={() => del.ask(m.id, m.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex items-center gap-1 text-xs font-montserrat"><Trash2 size={14} /> Delete</button>
                </div>
              </div>
            )}
            {!isOpen && m.refill_date && <div className="text-xs text-salve-amber mt-1 font-medium">Refill: {fmtDate(m.refill_date)} ({daysUntil(m.refill_date)})</div>}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('medications', id))} onCancel={del.cancel} itemId={m.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
