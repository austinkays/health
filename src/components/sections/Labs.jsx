import { useState } from 'react';
import { Plus, Check, Edit, Trash2, FlaskConical } from 'lucide-react';
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

const EMPTY = { date: '', test_name: '', result: '', unit: '', range: '', flag: '', provider: '', notes: '' };
const FLAG_OPTS = ['', 'normal', 'abnormal', 'high', 'low', 'mild-abnormal', 'completed', 'never'];

const flagColor = (flag) => {
  if (!flag || flag === 'normal' || flag === 'completed') return { color: C.sage, bg: 'rgba(143,191,160,0.15)' };
  if (flag === 'abnormal' || flag === 'high' || flag === 'low') return { color: C.rose, bg: 'rgba(232,138,154,0.15)' };
  if (flag === 'mild-abnormal') return { color: C.amber, bg: 'rgba(196,166,115,0.15)' };
  return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)' };
};

export default function Labs({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('all');
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.test_name.trim()) return;
    if (editId) await updateItem('labs', editId, form);
    else await addItem('labs', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Lab / Imaging`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Test / Study Name" value={form.test_name} onChange={v => sf('test_name', v)} placeholder="Test name" required />
        <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" />
        <Field label="Result" value={form.result} onChange={v => sf('result', v)} placeholder="Result" />
        <Field label="Unit" value={form.unit} onChange={v => sf('unit', v)} placeholder="Unit" />
        <Field label="Reference Range" value={form.range} onChange={v => sf('range', v)} placeholder="Reference range" />
        <Field label="Flag" value={form.flag} onChange={v => sf('flag', v)} options={FLAG_OPTS} />
        <Field label="Ordering Provider" value={form.provider} onChange={v => sf('provider', v)} placeholder="Provider" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Notes" />
        <div className="flex gap-2">
          <Button onClick={save} disabled={!form.test_name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const FILTERS = ['all', 'abnormal', 'normal'];
  const fl = data.labs.filter(l => {
    if (filter === 'all') return true;
    if (filter === 'abnormal') return ['abnormal', 'high', 'low', 'mild-abnormal'].includes(l.flag);
    if (filter === 'normal') return !l.flag || l.flag === 'normal' || l.flag === 'completed';
    return true;
  });

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Labs & Imaging
      </SectionTitle>

      <div className="flex gap-1.5 mb-3.5">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat capitalize ${
              filter === f ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >{f}</button>
        ))}
      </div>


      {fl.length === 0 ? <EmptyState icon={FlaskConical} text="No labs or imaging results yet" motif="leaf" /> :
        fl.map(l => {
          const fc = flagColor(l.flag);
          return (
            <Card key={l.id}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-[15px] font-semibold text-salve-text mb-0.5">{l.test_name}</div>
                  {l.date && <div className="text-xs text-salve-textFaint mb-1">{fmtDate(l.date)}{l.provider ? ` · ${l.provider}` : ''}</div>}
                  {l.result && (
                    <div className="text-[13px] text-salve-textMid">
                      {l.result}{l.unit ? ` ${l.unit}` : ''}{l.range ? <span className="text-salve-textFaint"> (ref: {l.range})</span> : ''}
                    </div>
                  )}
                  {l.flag && <Badge label={l.flag} color={fc.color} bg={fc.bg} className="mt-1.5" />}
                  {l.notes && <div className="text-xs text-salve-textFaint mt-1">{l.notes}</div>}
                </div>
                <div className="flex gap-2 ml-2">
                  <button onClick={() => { setForm(l); setEditId(l.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                  <button onClick={() => del.ask(l.id, l.test_name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
                </div>
              </div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('labs', id))} onCancel={del.cancel} itemId={l.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
