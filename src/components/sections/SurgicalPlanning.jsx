import { useState } from 'react';
import { Plus, Check, Edit, Trash2, PlaneTakeoff } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';

const EMPTY = {
  facility: '', surgeon: '', coordinator: '', case_number: '',
  procedures: [], procedures_not_on_list: [],
  target_date: '', accommodation: '',
  constraints: [], outstanding_items: [],
  status: 'Planning phase',
};
const STATUSES = ['Planning phase', 'Confirmed', 'Completed'];

const statusStyle = (s) => {
  if (s === 'Confirmed') return { color: C.sage, bg: 'rgba(143,191,160,0.15)' };
  if (s === 'Completed') return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)' };
  return { color: C.lav, bg: 'rgba(184,169,232,0.15)' };
};

// Helper: edit arrays as newline-separated text
const arrToText = (arr) => (Array.isArray(arr) ? arr : []).join('\n');
const textToArr = (txt) => txt.split('\n').map(s => s.trim()).filter(Boolean);

export default function SurgicalPlanning({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  // text fields for array inputs
  const [proceduresTxt, setProceduresTxt] = useState('');
  const [notOnListTxt, setNotOnListTxt] = useState('');
  const [constraintsTxt, setConstraintsTxt] = useState('');
  const [outstandingTxt, setOutstandingTxt] = useState('');
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const openForm = (plan = null) => {
    if (plan) {
      setForm(plan);
      setProceduresTxt(arrToText(plan.procedures));
      setNotOnListTxt(arrToText(plan.procedures_not_on_list));
      setConstraintsTxt(arrToText(plan.constraints));
      setOutstandingTxt(arrToText(plan.outstanding_items));
      setEditId(plan.id);
    } else {
      setForm(EMPTY);
      setProceduresTxt(''); setNotOnListTxt(''); setConstraintsTxt(''); setOutstandingTxt('');
      setEditId(null);
    }
    setSubView('form');
  };

  const save = async () => {
    if (!form.facility.trim() && !form.surgeon.trim()) return;
    const payload = {
      ...form,
      procedures: textToArr(proceduresTxt),
      procedures_not_on_list: textToArr(notOnListTxt),
      constraints: textToArr(constraintsTxt),
      outstanding_items: textToArr(outstandingTxt),
    };
    if (editId) await updateItem('surgical_planning', editId, payload);
    else await addItem('surgical_planning', payload);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Surgical Plan`} onBack={() => { setSubView(null); }}>
      <Card>
        <Field label="Facility" value={form.facility} onChange={v => sf('facility', v)} placeholder="Hospital or surgical center" />
        <Field label="Surgeon" value={form.surgeon} onChange={v => sf('surgeon', v)} placeholder="Dr. Name" />
        <Field label="Coordinator" value={form.coordinator} onChange={v => sf('coordinator', v)} placeholder="Name and contact" />
        <Field label="Case Number" value={form.case_number} onChange={v => sf('case_number', v)} placeholder="Reference / case ID" />
        <Field label="Target Date" value={form.target_date} onChange={v => sf('target_date', v)} placeholder="e.g. 2026, 2026-09" />
        <Field label="Status" value={form.status} onChange={v => sf('status', v)} options={STATUSES} />
        <Field label="Accommodation Notes" value={form.accommodation} onChange={v => sf('accommodation', v)} textarea placeholder="Travel, lodging, recovery stay..." />
        <Field label="Planned Procedures (one per line)" value={proceduresTxt} onChange={setProceduresTxt} textarea placeholder="Laparoscopic hysterectomy&#10;Bilateral salpingo-oophorectomy" />
        <Field label="Procedures NOT on Approved List (one per line)" value={notOnListTxt} onChange={setNotOnListTxt} textarea placeholder="Appendectomy (if incidental)" />
        <Field label="Constraints (one per line)" value={constraintsTxt} onChange={setConstraintsTxt} textarea placeholder="Must avoid succinylcholine&#10;Regional anesthesia preferred" />
        <Field label="Outstanding Items (one per line)" value={outstandingTxt} onChange={setOutstandingTxt} textarea placeholder="Pre-op clearance from cardiology&#10;Insurance auth pending" />
        <div className="flex gap-2">
          <Button onClick={save}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => setSubView(null)}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => openForm()} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Surgical Planning
      </SectionTitle>


      {data.surgical_planning.length === 0 ? <EmptyState icon={PlaneTakeoff} text="No surgical plans yet" motif="leaf" /> :
        data.surgical_planning.map(plan => {
          const ss = statusStyle(plan.status);
          const procs = Array.isArray(plan.procedures) ? plan.procedures : [];
          const outstanding = Array.isArray(plan.outstanding_items) ? plan.outstanding_items : [];
          const constraints = Array.isArray(plan.constraints) ? plan.constraints : [];
          return (
            <Card key={plan.id}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="text-[15px] font-semibold text-salve-text">{plan.facility || 'Unnamed facility'}</div>
                  {plan.surgeon && <div className="text-xs text-salve-textMid">{plan.surgeon}</div>}
                  {plan.target_date && <div className="text-xs text-salve-textFaint">Target: {plan.target_date}</div>}
                  {plan.case_number && <div className="text-xs text-salve-textFaint">Case #: {plan.case_number}</div>}
                  {plan.status && <Badge label={plan.status} color={ss.color} bg={ss.bg} className="mt-1.5" />}
                </div>
                <div className="flex gap-2 ml-2">
                  <button onClick={() => openForm(plan)} aria-label="Edit surgical plan" className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                  <button onClick={() => del.ask(plan.id, plan.facility || 'this plan')} aria-label="Delete surgical plan" className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
                </div>
              </div>

              {procs.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-widest mb-1">Planned Procedures</div>
                  {procs.map((p, i) => <div key={i} className="text-[12px] text-salve-textMid">· {p}</div>)}
                </div>
              )}

              {constraints.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.rose }}>Constraints</div>
                  {constraints.map((c, i) => <div key={i} className="text-[12px]" style={{ color: C.rose }}>⚠ {c}</div>)}
                </div>
              )}

              {outstanding.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-widest mb-1">Outstanding Items</div>
                  {outstanding.map((o, i) => <div key={i} className="text-[12px] text-salve-amber">□ {o}</div>)}
                </div>
              )}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('surgical_planning', id))} onCancel={del.cancel} itemId={plan.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
