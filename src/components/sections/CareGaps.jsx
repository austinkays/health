import { useState } from 'react';
import { Plus, Check, Edit, Trash2, AlertTriangle } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';

const EMPTY = { category: '', item: '', last_done: '', urgency: '', notes: '' };

const CATEGORIES = [
  '', 'Lab — never done', 'Lab — outdated', 'Immunization — overdue',
  'Treatment gap', 'Medication — pending',
];
const URGENCIES = ['', 'urgent', 'needs prompt attention', 'worth raising at next appointment', 'routine', 'completed'];

const urgencyStyle = (u) => {
  if (u === 'urgent') return { color: C.rose, bg: 'rgba(232,138,154,0.18)', border: C.rose };
  if (u === 'needs prompt attention') return { color: C.amber, bg: 'rgba(196,166,115,0.15)', border: C.amber };
  if (u === 'worth raising at next appointment') return { color: C.lav, bg: 'rgba(184,169,232,0.15)', border: C.lav };
  if (u === 'completed') return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)', border: C.textFaint };
  return { color: C.sage, bg: 'rgba(143,191,160,0.15)', border: C.sage };
};

const URGENCY_ORDER = ['urgent', 'needs prompt attention', 'worth raising at next appointment', 'routine', 'completed', ''];

export default function CareGaps({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.item.trim()) return;
    if (editId) await updateItem('care_gaps', editId, form);
    else await addItem('care_gaps', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Care Gap`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Item" value={form.item} onChange={v => sf('item', v)} placeholder="e.g. TSH thyroid panel, Shingrix vaccine" required />
        <Field label="Category" value={form.category} onChange={v => sf('category', v)} options={CATEGORIES} />
        <Field label="Urgency" value={form.urgency} onChange={v => sf('urgency', v)} options={URGENCIES} />
        <Field label="Last Done" value={form.last_done} onChange={v => sf('last_done', v)} placeholder="Date, 'never', or 'in progress'" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Context, barriers, plan..." />
        <div className="flex gap-2">
          <Button onClick={save} disabled={!form.item.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const sorted = [...data.care_gaps].sort((a, b) =>
    URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency)
  );
  const fl = filter === 'active'
    ? sorted.filter(g => g.urgency !== 'completed')
    : sorted;

  const urgentCount = data.care_gaps.filter(g => g.urgency === 'urgent').length;

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Care Gaps
      </SectionTitle>

      {urgentCount > 0 && (
        <div className="mb-3 px-3 py-2.5 rounded-lg border text-[12px] font-medium"
          style={{ background: 'rgba(232,138,154,0.1)', borderColor: C.rose, color: C.rose }}>
          ⚠ {urgentCount} item{urgentCount > 1 ? 's' : ''} marked urgent
        </div>
      )}

      <div className="flex gap-1.5 mb-3.5">
        {['active', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat capitalize ${
              filter === f ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >{f}</button>
        ))}
      </div>


      {fl.length === 0 ? <EmptyState icon={AlertTriangle} text={filter === 'active' ? 'No open care gaps' : 'No care gaps recorded'} motif="leaf" /> :
        fl.map(g => {
          const us = urgencyStyle(g.urgency);
          return (
            <Card key={g.id} style={{ borderLeft: `3px solid ${us.border}` }}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-salve-text mb-0.5">{g.item}</div>
                  {g.category && <div className="text-xs text-salve-textFaint mb-1">{g.category}</div>}
                  {g.last_done && <div className="text-xs text-salve-textFaint">Last done: {g.last_done}</div>}
                  {g.urgency && <Badge label={g.urgency} color={us.color} bg={us.bg} className="mt-1.5" />}
                  {g.notes && <div className="text-xs text-salve-textFaint mt-1">{g.notes}</div>}
                </div>
                <div className="flex gap-2 ml-2">
                  <button onClick={() => { setForm(g); setEditId(g.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                  <button onClick={() => del.ask(g.id, g.item)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
                </div>
              </div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('care_gaps', id))} onCancel={del.cancel} itemId={g.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
