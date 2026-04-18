import { useState, useEffect } from 'react';
import { Plus, Check, Edit, Trash2, Shield, ChevronDown, ExternalLink } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { EMPTY_ALLERGY } from '../../constants/defaults';
import { C } from '../../constants/colors';
import { medlinePlusUrl } from '../../utils/links';

const SEV = {
  mild: { c: C.sage, bg: 'rgba(143,191,160,0.15)', label: '✓ Mild' },
  moderate: { c: C.amber, bg: 'rgba(232,200,138,0.15)', label: '◆ Moderate' },
  severe: { c: C.rose, bg: 'rgba(232,138,154,0.15)', label: '⚠ Severe' },
};

export default function Allergies({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_ALLERGY);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (highlightId && data.allergies.some(a => a.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <Field label="Type" value={form.type} onChange={v => sf('type', v)} options={[
          { value: '', label: 'Select type...' },
          { value: 'medication', label: 'Medication' },
          { value: 'food', label: 'Food' },
          { value: 'environmental', label: 'Environmental' },
          { value: 'latex', label: 'Latex' },
          { value: 'dye', label: 'Contrast / Dye' },
          { value: 'insect', label: 'Insect' },
          { value: 'other', label: 'Other' },
        ]} />
        <Field label="Reaction" value={form.reaction} onChange={v => sf('reaction', v)} placeholder="e.g. Hives, anaphylaxis" />
        <Field label="Severity" value={form.severity} onChange={v => sf('severity', v)} options={[
          { value: 'mild', label: 'Mild' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'severe', label: 'Severe, Anaphylaxis' },
        ]} />
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
      <div className="flex justify-end mb-3">
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
      </div>
      {data.allergies.length === 0 ? (
        <EmptyState
          icon={Shield}
          text="No allergies recorded"
          hint="Add your allergies so Sage and new medication additions can warn you about potential cross-reactivity."
          motif="star"
          actionLabel="Add your first allergy"
          onAction={() => setSubView('form')}
        />
      ) :
        <div className="md:grid md:grid-cols-2 md:gap-4">{data.allergies.map(a => {
          const s = SEV[a.severity] || SEV.moderate;
          const isExpanded = expandedId === a.id;
          return (
            <Card key={a.id} id={`record-${a.id}`} style={{ borderLeft: `3px solid ${s.c}` }} onClick={() => setExpandedId(isExpanded ? null : a.id)} className={`cursor-pointer transition-all${highlightId === a.id ? ' highlight-ring' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <a href={medlinePlusUrl(a.substance + ' allergy')} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-salve-text hover:text-salve-sage transition-colors hover:underline">{a.substance}</a>
                    <Badge label={s.label} color={s.c} bg={s.bg} />
                    {a.type && <Badge label={a.type.charAt(0).toUpperCase() + a.type.slice(1)} color={C.textMid} bg="rgba(110,106,128,0.12)" />}
                  </div>
                  {!isExpanded && a.reaction && <div className="text-xs text-salve-textMid truncate">{a.reaction}</div>}
                </div>
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
              <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                  {a.reaction && <div className="text-xs text-salve-textMid">Reaction: {a.reaction}</div>}
                  {a.notes && <div className="text-xs text-salve-textFaint mt-0.5 leading-relaxed">{a.notes}</div>}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { setForm(a); setEditId(a.id); setSubView('form'); }} aria-label="Edit allergy" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-salve-lav/10 text-salve-lav text-xs font-semibold font-montserrat border border-salve-lav/20 cursor-pointer hover:bg-salve-lav/20 transition-colors"><Edit size={13} /> Edit</button>
                    <button onClick={() => del.ask(a.id, a.substance)} aria-label="Delete allergy" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-salve-textFaint text-xs font-medium font-montserrat border border-salve-border cursor-pointer hover:bg-salve-rose/10 hover:text-salve-rose hover:border-salve-rose/25 transition-colors"><Trash2 size={13} /> Delete</button>
                  </div>
                </div>
              </div></div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('allergies', id))} onCancel={del.cancel} itemId={a.id} />
          </Card>
          );
        })}</div>
      }
    </div>
  );
}
