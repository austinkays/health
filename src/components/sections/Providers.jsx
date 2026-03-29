import { useState } from 'react';
import { Plus, Check, Edit, Trash2, User, Phone } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { EMPTY_PROVIDER } from '../../constants/defaults';

export default function Providers({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_PROVIDER);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const saveP = async () => {
    if (!form.name.trim()) return;
    if (editId) {
      await updateItem('providers', editId, form);
    } else {
      await addItem('providers', form);
    }
    setForm(EMPTY_PROVIDER);
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Provider`} onBack={() => { setSubView(null); setForm(EMPTY_PROVIDER); setEditId(null); }}>
      <Card>
        <Field label="Name" value={form.name} onChange={v => sf('name', v)} placeholder="Dr. Name" required />
        <Field label="Specialty" value={form.specialty} onChange={v => sf('specialty', v)} placeholder="e.g. Rheumatology" />
        <Field label="Clinic / Office" value={form.clinic} onChange={v => sf('clinic', v)} placeholder="Clinic name" />
        <Field label="Phone" value={form.phone} onChange={v => sf('phone', v)} type="tel" placeholder="(555) 555-5555" />
        <Field label="Fax" value={form.fax} onChange={v => sf('fax', v)} type="tel" />
        <Field label="Patient Portal" value={form.portal_url} onChange={v => sf('portal_url', v)} placeholder="https://..." />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Office hours, best contact..." />
        <div className="flex gap-2">
          <Button onClick={saveP} disabled={!form.name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_PROVIDER); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Providers
      </SectionTitle>
      {data.providers.length === 0 ? <EmptyState icon={User} text="No providers added" motif="leaf" /> :
        data.providers.map(p => (
          <Card key={p.id}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-salve-text">{p.name}</div>
                {p.specialty && <div className="text-[13px] text-salve-lav font-medium">{p.specialty}</div>}
                {p.clinic && <div className="text-xs text-salve-textMid mt-0.5">{p.clinic}</div>}
                {p.phone && <div className="text-xs text-salve-textMid mt-1 flex items-center gap-1"><Phone size={12} strokeWidth={1.4} /> {p.phone}</div>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setForm(p); setEditId(p.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                <button onClick={() => del.ask(p.id, p.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
              </div>
            </div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('providers', id))} onCancel={del.cancel} itemId={p.id} />
          </Card>
        ))
      }
    </div>
  );
}
