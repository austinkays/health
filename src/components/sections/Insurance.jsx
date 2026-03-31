import { useState, useEffect } from 'react';
import { Plus, Check, Edit, Trash2, BadgeDollarSign, ChevronDown, Phone } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';

const EMPTY = { name: '', type: '', member_id: '', group: '', phone: '', notes: '' };
const TYPES = ['', 'Medicaid', 'Medicare', 'Private', 'Hospital charity care'];

const typeStyle = (t) => {
  if (t === 'Medicaid' || t === 'Medicare') return { color: C.sage, bg: 'rgba(143,191,160,0.15)' };
  if (t === 'Private') return { color: C.lav, bg: 'rgba(184,169,232,0.15)' };
  if (t === 'Hospital charity care') return { color: C.amber, bg: 'rgba(196,166,115,0.15)' };
  return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)' };
};

export default function Insurance({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (highlightId && data.insurance.some(i => i.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form.name.trim()) return;
    if (editId) await updateItem('insurance', editId, form);
    else await addItem('insurance', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Insurance`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Plan Name" value={form.name} onChange={v => sf('name', v)} placeholder="e.g. CareOregon OHP, OHSU Charity Care" required />
        <Field label="Type" value={form.type} onChange={v => sf('type', v)} options={TYPES} />
        <Field label="Member ID" value={form.member_id} onChange={v => sf('member_id', v)} placeholder="Your member number" />
        <Field label="Group Number" value={form.group} onChange={v => sf('group', v)} placeholder="Group / plan code" />
        <Field label="Phone" value={form.phone} onChange={v => sf('phone', v)} placeholder="Member services number" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Coverage details, deductible, prior auth contacts..." />
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
        Insurance & Coverage
      </SectionTitle>


      {data.insurance.length === 0 ? <EmptyState icon={BadgeDollarSign} text="No insurance plans recorded" motif="leaf" /> :
        data.insurance.map(ins => {
          const ts = ins.type ? typeStyle(ins.type) : null;
          const isExpanded = expandedId === ins.id;
          return (
            <Card key={ins.id} id={`record-${ins.id}`} onClick={() => setExpandedId(isExpanded ? null : ins.id)} className={`cursor-pointer transition-all${highlightId === ins.id ? ' highlight-ring' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[15px] font-semibold text-salve-text">{ins.name}</span>
                    {ts && <Badge label={ins.type} color={ts.color} bg={ts.bg} />}
                  </div>
                  {!isExpanded && ins.member_id && <div className="text-xs text-salve-textMid truncate">ID: {ins.member_id}</div>}
                </div>
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
              <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                  {ins.member_id && <div className="text-xs text-salve-textMid">Member ID: {ins.member_id}</div>}
                  {ins.group && <div className="text-xs text-salve-textFaint">Group: {ins.group}</div>}
                  {ins.phone && (
                    <div className="text-xs text-salve-textMid mt-0.5 flex items-center gap-1">
                      <Phone size={12} strokeWidth={1.4} className="flex-shrink-0" />
                      <a href={`tel:${ins.phone.replace(/[^\d+]/g, '')}`} className="text-salve-sage hover:underline">{ins.phone}</a>
                    </div>
                  )}
                  {ins.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{ins.notes}</div>}
                  <div className="flex gap-2.5 mt-2.5">
                    <button onClick={() => { setForm(ins); setEditId(ins.id); setSubView('form'); }} aria-label="Edit insurance plan" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
                    <button onClick={() => del.ask(ins.id, ins.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                  </div>
                </div>
              </div></div>
              )}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('insurance', id))} onCancel={del.cancel} itemId={ins.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
