import { useState, useEffect } from 'react';
import { Plus, Check, Edit, Trash2, AlertOctagon } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { C } from '../../constants/colors';

const EMPTY = { condition: '', implication: '', action_required: '' };

export default function AnesthesiaFlags({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (highlightId) {
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]);

  const save = async () => {
    if (!form.condition.trim()) return;
    if (editId) await updateItem('anesthesia_flags', editId, form);
    else await addItem('anesthesia_flags', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Anesthesia Flag`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Condition / Medication" value={form.condition} onChange={v => sf('condition', v)} placeholder="e.g. Suxamethonium apnoea, CRPS" required />
        <Field label="Implication for Surgical Team" value={form.implication} onChange={v => sf('implication', v)} textarea placeholder="Why this matters (e.g. prolonged paralysis, autonomic crisis)" />
        <Field label="Action Required" value={form.action_required} onChange={v => sf('action_required', v)} textarea placeholder="What the team must do or avoid" />
        <div className="flex gap-2">
          <Button onClick={save} disabled={!form.condition.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const flags = data.anesthesia_flags;

  return (
    <div className="mt-2">
      {/* Safety warning banner */}
      <div className="mb-4 rounded-xl border-2 px-4 py-3"
        style={{ background: 'rgba(232,138,154,0.08)', borderColor: C.rose }}>
        <div className="flex items-center gap-2 mb-1">
          <AlertOctagon size={16} style={{ color: C.rose }} />
          <span className="text-[13px] font-bold tracking-wide" style={{ color: C.rose }}>ANESTHESIA & SURGICAL FLAGS</span>
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: C.rose }}>
          These flags must be communicated to any surgical, procedural, or anesthesia team before any procedure.
        </p>
      </div>

      <div className="flex justify-between items-center mb-3">
        <span className="text-sm text-salve-textMid font-montserrat"><span style={{ color: C.rose }}>⚠</span> {flags.length} flag{flags.length !== 1 ? 's' : ''}</span>
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
      </div>


      {flags.length === 0 ? (
        <EmptyState icon={AlertOctagon} text="No anesthesia flags recorded" motif="leaf" />
      ) : (
        <div className="md:grid md:grid-cols-2 md:gap-4">{flags.map(flag => (
          <Card key={flag.id} id={`record-${flag.id}`} style={{ borderLeft: `3px solid ${C.rose}` }} className={highlightId === flag.id ? 'highlight-ring' : ''}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="text-[15px] font-bold mb-1" style={{ color: C.rose }}>
                  {flag.condition}
                </div>
                {flag.implication && (
                  <div className="mb-1.5">
                    <div className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-widest mb-0.5">Implication</div>
                    <div className="text-[13px] text-salve-textMid leading-relaxed">{flag.implication}</div>
                  </div>
                )}
                {flag.action_required && (
                  <div>
                    <div className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-widest mb-0.5">Action Required</div>
                    <div className="text-[13px] text-salve-text leading-relaxed font-medium">{flag.action_required}</div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 ml-2">
                <button onClick={() => { setForm(flag); setEditId(flag.id); setSubView('form'); }} aria-label="Edit anesthesia flag" className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                <button onClick={() => del.ask(flag.id, flag.condition)} aria-label="Delete anesthesia flag" className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
              </div>
            </div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('anesthesia_flags', id))} onCancel={del.cancel} itemId={flag.id} />
          </Card>
        ))}</div>
      )}

      {flags.length > 0 && (
        <p className="text-center text-[11px] text-salve-textFaint italic mt-2">
          ✧ Always verify with your care team before any procedure ✧
        </p>
      )}
    </div>
  );
}
