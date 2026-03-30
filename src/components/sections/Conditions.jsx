import { useState } from 'react';
import { Plus, Check, Edit, Trash2, Stethoscope, ChevronDown } from 'lucide-react';
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
  active: { c: C.rose, bg: 'rgba(232,138,154,0.15)', label: '⚠ Active' },
  managed: { c: C.sage, bg: 'rgba(143,191,160,0.15)', label: '✓ Managed' },
  remission: { c: C.lav, bg: 'rgba(184,169,232,0.15)', label: '✦ Remission' },
  resolved: { c: C.textFaint, bg: 'rgba(110,106,128,0.15)', label: '✓ Resolved' },
};

export default function Conditions({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_CONDITION);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
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

      <div className="flex gap-1.5 flex-wrap mb-3.5">
        {['all', 'active', 'managed', 'remission', 'resolved'].map(f => (
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

      {(() => {
        const fl = data.conditions.filter(c => filter === 'all' ? true : c.status === filter);
        return fl.length === 0 ? <EmptyState icon={Stethoscope} text={filter === 'all' ? 'No conditions recorded' : `No ${filter} conditions`} motif="star" /> :
        fl.map(c => {
          const st = STATUS_COLORS[c.status] || STATUS_COLORS.active;
          const isExpanded = expandedId === c.id;
          return (
            <Card key={c.id} onClick={() => setExpandedId(isExpanded ? null : c.id)} className="cursor-pointer transition-all">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-[15px] font-semibold text-salve-text">{c.name}</span>
                    <Badge label={st.label} color={st.c} bg={st.bg} />
                  </div>
                  {!isExpanded && c.provider && <div className="text-xs text-salve-textMid truncate">{c.provider}</div>}
                </div>
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
              {isExpanded && (
                <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                  {c.diagnosed_date && <div className="text-xs text-salve-textMid">Diagnosed: {fmtDate(c.diagnosed_date)}</div>}
                  {c.provider && <div className="text-xs text-salve-textMid">Provider: {c.provider}</div>}
                  {c.linked_meds && <div className="text-xs text-salve-sage mt-0.5">Meds: {c.linked_meds}</div>}
                  {c.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{c.notes}</div>}
                  <div className="flex gap-2.5 mt-2.5">
                    <button onClick={() => { setForm(c); setEditId(c.id); setSubView('form'); }} aria-label="Edit condition" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
                    <button onClick={() => del.ask(c.id, c.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                  </div>
                </div>
              )}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('conditions', id))} onCancel={del.cancel} itemId={c.id} />
          </Card>
          );
        });
      })()}
    </div>
  );
}
