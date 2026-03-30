import { useState } from 'react';
import { Plus, Check, Edit, Trash2, Syringe, ChevronDown } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { fmtDate } from '../../utils/dates';
import { C } from '../../constants/colors';

const EMPTY = { date: '', name: '', type: '', provider: '', location: '', reason: '', outcome: '', notes: '' };
const TYPES = ['', 'Surgical procedure', 'Diagnostic procedure', 'Pain procedure'];

const typeColor = (t) => {
  if (t === 'Surgical procedure') return { color: C.lav, bg: 'rgba(184,169,232,0.15)' };
  if (t === 'Pain procedure') return { color: C.amber, bg: 'rgba(196,166,115,0.15)' };
  return { color: C.sage, bg: 'rgba(143,191,160,0.15)' };
};

export default function Procedures({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return;
    if (editId) await updateItem('procedures', editId, form);
    else await addItem('procedures', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Procedure`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Procedure Name" value={form.name} onChange={v => sf('name', v)} placeholder="e.g. Epidural steroid injection" required />
        <Field label="Type" value={form.type} onChange={v => sf('type', v)} options={TYPES} />
        <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" />
        <Field label="Provider / Surgeon" value={form.provider} onChange={v => sf('provider', v)} placeholder="Dr. Name" />
        <Field label="Facility / Location" value={form.location} onChange={v => sf('location', v)} placeholder="Hospital or clinic name" />
        <Field label="Reason / Indication" value={form.reason} onChange={v => sf('reason', v)} placeholder="Why was this done?" />
        <Field label="Outcome" value={form.outcome} onChange={v => sf('outcome', v)} placeholder="Result or findings" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Complications, recovery, follow-up..." />
        <div className="flex gap-2">
          <Button onClick={save} disabled={!form.name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Procedures
      </SectionTitle>


      {data.procedures.length === 0 ? <EmptyState icon={Syringe} text="No procedures recorded yet" motif="leaf" /> :
        data.procedures.map(p => {
          const tc = p.type ? typeColor(p.type) : null;
          const isExpanded = expandedId === p.id;
          return (
            <Card key={p.id} onClick={() => setExpandedId(isExpanded ? null : p.id)} className="cursor-pointer transition-all">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-salve-text mb-0.5">{p.name}</div>
                  {p.date && <div className="text-xs text-salve-textFaint">{fmtDate(p.date)}</div>}
                  {tc && <Badge label={p.type} color={tc.color} bg={tc.bg} className="mt-1" />}
                </div>
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
              {isExpanded && (
                <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                  {p.location && <div className="text-xs text-salve-textFaint">Location: {p.location}</div>}
                  {p.provider && <div className="text-xs text-salve-textMid">{p.provider}</div>}
                  {p.reason && <div className="text-xs text-salve-textFaint mt-0.5">For: {p.reason}</div>}
                  {p.outcome && <div className="text-xs text-salve-textMid mt-0.5">Outcome: {p.outcome}</div>}
                  {p.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{p.notes}</div>}
                  <div className="flex gap-2.5 mt-2.5">
                    <button onClick={() => { setForm(p); setEditId(p.id); setSubView('form'); }} aria-label="Edit procedure" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
                    <button onClick={() => del.ask(p.id, p.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                  </div>
                </div>
              )}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('procedures', id))} onCancel={del.cancel} itemId={p.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
