import { useState } from 'react';
import { Plus, Check, Edit, Trash2, Shield } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { EMPTY_ALLERGY } from '../../constants/defaults';
import { C } from '../../constants/colors';

const SEV = {
  mild: { c: C.sage, bg: 'rgba(143,191,160,0.15)' },
  moderate: { c: C.amber, bg: 'rgba(232,200,138,0.15)' },
  severe: { c: C.rose, bg: 'rgba(232,138,154,0.15)' },
};

export default function Allergies({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_ALLERGY);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const saveAl = async () => {
    if (!form.substance.trim()) return;
    if (editId) {
      await updateItem('allergies', editId, form);
    } else {
      await addItem('allergies', form);
    }
    setForm(EMPTY_ALLERGY);
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Allergy`} onBack={() => { setSubView(null); setForm(EMPTY_ALLERGY); setEditId(null); }}>
      <Card>
        <Field label="Substance" value={form.substance} onChange={v => sf('substance', v)} placeholder="e.g. Penicillin, Latex" required />
        <Field label="Allergen Type" value={form.type} onChange={v => sf('type', v)} options={[
          { value: '', label: 'Select type...' },
          { value: 'drug', label: 'Drug / Medication' },
          { value: 'food', label: 'Food' },
          { value: 'environmental', label: 'Environmental' },
          { value: 'insect', label: 'Insect' },
          { value: 'latex', label: 'Latex' },
          { value: 'other', label: 'Other' },
        ]} />
        <Field label="Reaction" value={form.reaction} onChange={v => sf('reaction', v)} placeholder="e.g. Hives, anaphylaxis" />
        <Field label="Severity" value={form.severity} onChange={v => sf('severity', v)} options={[
          { value: 'mild', label: 'Mild' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'severe', label: 'Severe — Anaphylaxis' },
        ]} />
        <Field label="Onset Date" value={form.onset_date} onChange={v => sf('onset_date', v)} type="date" />
        <Field label="Confirmed By" value={form.confirmed_by} onChange={v => sf('confirmed_by', v)} placeholder="Dr. Name or allergy test" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Cross-sensitivities..." />
        <div className="flex gap-2">
          <Button onClick={saveAl} disabled={!form.substance.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_ALLERGY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Allergies & Sensitivities
      </SectionTitle>
      {data.allergies.length === 0 ? <EmptyState icon={Shield} text="No allergies recorded" motif="star" /> :
        data.allergies.map(a => {
          const s = SEV[a.severity] || SEV.moderate;
          return (
            <Card key={a.id} style={{ borderLeft: `3px solid ${s.c}` }}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[15px] font-semibold text-salve-text">{a.substance}</span>
                    <Badge label={a.severity} color={s.c} bg={s.bg} />
                  </div>
                  {a.type && <div className="text-xs text-salve-textMid">Type: {a.type}</div>}
                  {a.reaction && <div className="text-xs text-salve-textMid">Reaction: {a.reaction}</div>}
                  {a.confirmed_by && <div className="text-xs text-salve-textFaint">Confirmed by: {a.confirmed_by}</div>}
                  {a.notes && <div className="text-xs text-salve-textFaint mt-0.5">{a.notes}</div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setForm(a); setEditId(a.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                  <button onClick={() => del.ask(a.id, a.substance)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
                </div>
              </div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('allergies', id))} onCancel={del.cancel} itemId={a.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
