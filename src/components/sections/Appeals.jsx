import { useState } from 'react';
import { Plus, Check, Edit, Trash2, Scale } from 'lucide-react';
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

const EMPTY = { date_filed: '', subject: '', against: '', status: 'Active', deadline: '', notes: '' };
const STATUSES = ['Active', 'Draft', 'Filed', 'Resolved'];

const statusStyle = (s) => {
  if (s === 'Active') return { color: C.amber, bg: 'rgba(196,166,115,0.15)' };
  if (s === 'Filed') return { color: C.lav, bg: 'rgba(184,169,232,0.15)' };
  if (s === 'Resolved') return { color: C.sage, bg: 'rgba(143,191,160,0.15)' };
  return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)' };
};

export default function Appeals({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.subject.trim()) return;
    if (editId) await updateItem('appeals_and_disputes', editId, form);
    else await addItem('appeals_and_disputes', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Appeal / Dispute`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Subject / Description" value={form.subject} onChange={v => sf('subject', v)} placeholder="Subject" required />
        <Field label="Against (insurer / entity)" value={form.against} onChange={v => sf('against', v)} placeholder="Insurer or entity" />
        <Field label="Status" value={form.status} onChange={v => sf('status', v)} options={STATUSES} />
        <Field label="Date Filed" value={form.date_filed} onChange={v => sf('date_filed', v)} type="date" />
        <Field label="Deadline" value={form.deadline} onChange={v => sf('deadline', v)} type="date" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Notes" />
        <div className="flex gap-2">
          <Button onClick={save} disabled={!form.subject.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const fl = filter === 'active'
    ? data.appeals_and_disputes.filter(a => a.status !== 'Resolved')
    : data.appeals_and_disputes;

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Appeals & Disputes
      </SectionTitle>

      <div className="flex gap-1.5 mb-3.5">
        {['active', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat capitalize ${
              filter === f ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >{f}</button>
        ))}
      </div>


      {fl.length === 0 ? <EmptyState icon={Scale} text={filter === 'active' ? 'No open appeals' : 'No appeals recorded'} motif="leaf" /> :
        fl.map(a => {
          const ss = statusStyle(a.status);
          return (
            <Card key={a.id}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-salve-text mb-0.5">{a.subject}</div>
                  {a.against && <div className="text-xs text-salve-textFaint">vs. {a.against}</div>}
                  <div className="text-xs text-salve-textFaint mt-0.5">
                    {a.date_filed ? `Filed: ${fmtDate(a.date_filed)}` : ''}
                    {a.date_filed && a.deadline ? ' · ' : ''}
                    {a.deadline ? <span style={{ color: C.amber }}>Deadline: {fmtDate(a.deadline)}</span> : ''}
                  </div>
                  {a.status && <Badge label={a.status} color={ss.color} bg={ss.bg} className="mt-1.5" />}
                  {a.notes && <div className="text-xs text-salve-textFaint mt-1">{a.notes}</div>}
                </div>
                <div className="flex gap-2 ml-2">
                  <button onClick={() => { setForm(a); setEditId(a.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                  <button onClick={() => del.ask(a.id, a.subject)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
                </div>
              </div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('appeals_and_disputes', id))} onCancel={del.cancel} itemId={a.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
