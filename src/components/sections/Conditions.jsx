import { useState } from 'react';
import { Plus, Check, Edit, Trash2, Stethoscope, ChevronDown, AlertOctagon, Pill } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { EMPTY_CONDITION } from '../../constants/defaults';
import { fmtDate } from '../../utils/dates';
import { C } from '../../constants/colors';

const STATUS_COLORS = {
  active: { c: C.rose, bg: 'rgba(232,138,154,0.15)' },
  managed: { c: C.sage, bg: 'rgba(143,191,160,0.15)' },
  remission: { c: C.lav, bg: 'rgba(184,169,232,0.15)' },
  resolved: { c: C.textFaint, bg: 'rgba(110,106,128,0.15)' },
};

export default function Conditions({ data, addItem, updateItem, removeItem, onNav }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_CONDITION);
  const [editId, setEditId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const saveC = async () => {
    if (!form.name.trim()) return;
    if (editId) {
      await updateItem('conditions', editId, form);
    } else {
      await addItem('conditions', form);
    }
    setForm(EMPTY_CONDITION);
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Condition`} onBack={() => { setSubView(null); setForm(EMPTY_CONDITION); setEditId(null); }}>
      <Card>
        <Field label="Condition / Diagnosis" value={form.name} onChange={v => sf('name', v)} placeholder="e.g. Fibromyalgia" required />
        <Field label="Date Diagnosed" value={form.diagnosed_date} onChange={v => sf('diagnosed_date', v)} type="date" />
        <Field label="Status" value={form.status} onChange={v => sf('status', v)} options={[
          { value: 'active', label: 'Active' },
          { value: 'managed', label: 'Managed' },
          { value: 'remission', label: 'In Remission' },
          { value: 'resolved', label: 'Resolved' },
        ]} />
        <Field label="Treating Provider" value={form.provider} onChange={v => sf('provider', v)} placeholder="Dr. Name" />
        <Field label="Related Medications" value={form.linked_meds} onChange={v => sf('linked_meds', v)} placeholder="Meds for this condition" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="History, triggers..." />
        <div className="flex gap-2">
          <Button onClick={saveC} disabled={!form.name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_CONDITION); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Conditions & Diagnoses
      </SectionTitle>
      {data.conditions.length === 0 ? <EmptyState icon={Stethoscope} text="No conditions recorded" motif="star" /> :
        data.conditions.map(c => {
          const st = STATUS_COLORS[c.status] || STATUS_COLORS.active;
          const isOpen = expanded === c.id;
          // Find matching meds by name
          const linkedMedNames = c.linked_meds ? c.linked_meds.split(',').map(s => s.trim()).filter(Boolean) : [];
          const matchedMeds = linkedMedNames.map(name => {
            const med = data.meds.find(m => m.name.toLowerCase() === name.toLowerCase());
            return { name, med };
          });
          // Check if this condition has anesthesia flags
          const relatedFlags = (data.anesthesia_flags || []).filter(f =>
            f.condition && (f.condition.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(f.condition.toLowerCase()))
          );
          return (
            <Card key={c.id} className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : c.id)}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[15px] font-semibold text-salve-text">{c.name}</span>
                    <Badge label={c.status} color={st.c} bg={st.bg} />
                    <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                  {c.diagnosed_date && <div className="text-xs text-salve-textMid">Diagnosed: {fmtDate(c.diagnosed_date)}</div>}
                </div>
              </div>
              {isOpen && (
                <div className="mt-2 pt-2 border-t border-salve-border">
                  {c.provider && <div className="text-xs text-salve-textMid mb-0.5">Provider: {c.provider}</div>}
                  {matchedMeds.length > 0 && (
                    <div className="mt-1.5 mb-1" onClick={e => e.stopPropagation()}>
                      <div className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-widest mb-1">Related Medications</div>
                      <div className="flex flex-wrap gap-1">
                        {matchedMeds.map(({ name, med }) => (
                          <button key={name} onClick={() => onNav('meds')}
                            className="text-[11px] bg-salve-sage/10 border border-salve-sage/25 rounded-full px-2.5 py-0.5 cursor-pointer font-montserrat flex items-center gap-1"
                            style={{ color: C.sage }}>
                            <Pill size={10} /> {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {relatedFlags.length > 0 && (
                    <div className="mt-1.5 mb-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => onNav('anesthesia')}
                        className="text-[11px] bg-salve-rose/10 border border-salve-rose/25 rounded-full px-2.5 py-0.5 cursor-pointer font-montserrat flex items-center gap-1"
                        style={{ color: C.rose }}>
                        <AlertOctagon size={10} /> {relatedFlags.length} anesthesia flag{relatedFlags.length > 1 ? 's' : ''}
                      </button>
                    </div>
                  )}
                  {c.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{c.notes}</div>}
                  <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setForm(c); setEditId(c.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex items-center gap-1 text-xs font-montserrat"><Edit size={14} /> Edit</button>
                    <button onClick={() => del.ask(c.id, c.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex items-center gap-1 text-xs font-montserrat"><Trash2 size={14} /> Delete</button>
                  </div>
                </div>
              )}
              {!isOpen && c.linked_meds && <div className="text-xs text-salve-sage mt-0.5">Meds: {c.linked_meds}</div>}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('conditions', id))} onCancel={del.cancel} itemId={c.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
