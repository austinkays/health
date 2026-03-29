import { useState } from 'react';
import { Plus, Check, Edit, Trash2, User, Phone, ChevronDown, Globe, ExternalLink } from 'lucide-react';
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
  const [expanded, setExpanded] = useState(null);
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
        data.providers.map(p => {
          const isOpen = expanded === p.id;
          return (
          <Card key={p.id} className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : p.id)}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-semibold text-salve-text">{p.name}</span>
                  <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
                {p.specialty && <div className="text-[13px] text-salve-lav font-medium">{p.specialty}</div>}
                {!isOpen && p.clinic && <div className="text-xs text-salve-textMid mt-0.5">{p.clinic}</div>}
              </div>
            </div>
            {isOpen && (
              <div className="mt-2 pt-2 border-t border-salve-border" onClick={e => e.stopPropagation()}>
                {p.clinic && <div className="text-xs text-salve-textMid mb-1">{p.clinic}</div>}
                {p.phone && (
                  <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="text-xs text-salve-sage flex items-center gap-1.5 mb-1 no-underline">
                    <Phone size={13} strokeWidth={1.4} /> {p.phone}
                  </a>
                )}
                {p.fax && <div className="text-xs text-salve-textMid mb-1">Fax: {p.fax}</div>}
                {p.portal_url && (
                  <a href={p.portal_url} target="_blank" rel="noopener noreferrer" className="text-xs text-salve-lav flex items-center gap-1.5 mb-1 no-underline">
                    <Globe size={13} strokeWidth={1.4} /> Patient Portal <ExternalLink size={10} />
                  </a>
                )}
                {p.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{p.notes}</div>}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setForm(p); setEditId(p.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex items-center gap-1 text-xs font-montserrat"><Edit size={14} /> Edit</button>
                  <button onClick={() => del.ask(p.id, p.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex items-center gap-1 text-xs font-montserrat"><Trash2 size={14} /> Delete</button>
                </div>
              </div>
            )}
            {!isOpen && p.phone && <div className="text-xs text-salve-textMid mt-1 flex items-center gap-1"><Phone size={12} strokeWidth={1.4} /> {p.phone}</div>}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('providers', id))} onCancel={del.cancel} itemId={p.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
