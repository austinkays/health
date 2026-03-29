import { useState } from 'react';
import { Plus, Check, Edit, Trash2, ShieldCheck } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { fmtDate } from '../../utils/dates';

const EMPTY = { date: '', name: '', dose: '', site: '', lot_number: '', provider: '', location: '' };

export default function Immunizations({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return;
    if (editId) await updateItem('immunizations', editId, form);
    else await addItem('immunizations', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Immunization`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Vaccine Name" value={form.name} onChange={v => sf('name', v)} placeholder="e.g. COVID-19 mRNA, Tdap, Flu" required />
        <Field label="Date Administered" value={form.date} onChange={v => sf('date', v)} type="date" />
        <Field label="Dose / Series" value={form.dose} onChange={v => sf('dose', v)} placeholder="e.g. Dose 1 of 2, Booster" />
        <Field label="Injection Site" value={form.site} onChange={v => sf('site', v)} placeholder="e.g. Left deltoid" />
        <Field label="Lot Number" value={form.lot_number} onChange={v => sf('lot_number', v)} placeholder="From vaccine label" />
        <Field label="Administered By" value={form.provider} onChange={v => sf('provider', v)} placeholder="Provider or pharmacist" />
        <Field label="Location" value={form.location} onChange={v => sf('location', v)} placeholder="Clinic, pharmacy, or hospital" />
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
        Immunizations
      </SectionTitle>


      {data.immunizations.length === 0 ? <EmptyState icon={ShieldCheck} text="No immunizations recorded yet" motif="leaf" /> :
        data.immunizations.map(imm => (
          <Card key={imm.id}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-salve-text mb-0.5">{imm.name}</div>
                <div className="text-xs text-salve-textFaint">
                  {[imm.dose, imm.date ? fmtDate(imm.date) : '', imm.location].filter(Boolean).join(' · ')}
                </div>
                {imm.site && <div className="text-xs text-salve-textFaint mt-0.5">Site: {imm.site}</div>}
                {imm.lot_number && <div className="text-xs text-salve-textFaint mt-0.5">Lot: {imm.lot_number}</div>}
                {imm.provider && <div className="text-xs text-salve-textMid mt-0.5">{imm.provider}</div>}
              </div>
              <div className="flex gap-2 ml-2">
                <button onClick={() => { setForm(imm); setEditId(imm.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                <button onClick={() => del.ask(imm.id, imm.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
              </div>
            </div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('immunizations', id))} onCancel={del.cancel} itemId={imm.id} />
          </Card>
        ))
      }
    </div>
  );
}
