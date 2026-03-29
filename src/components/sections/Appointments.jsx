import { useState } from 'react';
import { Plus, Check, Edit, Trash2, Calendar } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import Motif, { Divider } from '../ui/Motif';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { EMPTY_APPOINTMENT } from '../../constants/defaults';
import { fmtDate, daysUntil } from '../../utils/dates';
import { C } from '../../constants/colors';

export default function Appointments({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_APPOINTMENT);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const saveA = async () => {
    if (!form.date) return;
    if (editId) {
      await updateItem('appointments', editId, form);
    } else {
      await addItem('appointments', form);
    }
    setForm(EMPTY_APPOINTMENT);
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'New'} Appointment`} onBack={() => { setSubView(null); setForm(EMPTY_APPOINTMENT); setEditId(null); }}>
      <Card>
        <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" required />
        <Field label="Time" value={form.time} onChange={v => sf('time', v)} type="time" />
        <Field label="Visit Type" value={form.visit_type} onChange={v => sf('visit_type', v)} options={[
          { value: '', label: 'Select...' },
          { value: 'in-person', label: 'In-Person' },
          { value: 'telehealth', label: 'Telehealth / Video' },
          { value: 'phone', label: 'Phone Call' },
          { value: 'lab', label: 'Lab Work' },
          { value: 'imaging', label: 'Imaging / Scan' },
          { value: 'procedure', label: 'Procedure' },
          { value: 'emergency', label: 'Emergency / Urgent' },
        ]} />
        <Field label="Provider" value={form.provider} onChange={v => sf('provider', v)} placeholder="Dr. Name" />
        <Field label="Location" value={form.location} onChange={v => sf('location', v)} placeholder="Clinic, hospital..." />
        {(form.visit_type === 'telehealth') && (
          <Field label="Telehealth Link" value={form.telehealth_url} onChange={v => sf('telehealth_url', v)} placeholder="https://zoom.us/..." />
        )}
        <Field label="Reason" value={form.reason} onChange={v => sf('reason', v)} placeholder="Follow-up, labs..." />
        <Field label="Related Condition" value={form.linked_condition} onChange={v => sf('linked_condition', v)} placeholder="e.g. Fibromyalgia follow-up" />
        <Field label="Questions to Ask" value={form.questions} onChange={v => sf('questions', v)} textarea placeholder="Things to bring up..." />
        <Field label="Post-Visit Notes" value={form.post_notes} onChange={v => sf('post_notes', v)} textarea placeholder="What happened..." />
        <div className="flex gap-2">
          <Button onClick={saveA} disabled={!form.date}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_APPOINTMENT); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const up = data.appts.filter(a => new Date(a.date) >= new Date(new Date().toDateString()));
  const past = data.appts.filter(a => new Date(a.date) < new Date(new Date().toDateString())).reverse();

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Appointments
      </SectionTitle>

      {data.appts.length === 0 ? <EmptyState icon={Calendar} text="No appointments yet" motif="moon" /> : (
        <>
          {up.length > 0 && (
            <div className="text-[11px] font-semibold text-salve-sage uppercase tracking-widest mb-2">
              <Motif type="leaf" size={12} color={C.sage} style={{ marginRight: 4 }} /> Upcoming
            </div>
          )}
          {up.map(a => (
            <Card key={a.id} style={{ borderLeft: `3px solid ${C.sage}` }}>
              <div className="flex justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-salve-text">{a.reason || 'Appointment'}</div>
                    {a.visit_type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-salve-lav/15 text-salve-lavDim">{a.visit_type}</span>}
                  </div>
                  <div className="text-xs text-salve-textMid mt-0.5">{a.provider}{a.location ? ` · ${a.location}` : ''}</div>
                  {a.linked_condition && <div className="text-xs text-salve-lav mt-0.5">Re: {a.linked_condition}</div>}
                  {a.questions && <div className="text-xs text-salve-sage mt-1.5 p-1.5 bg-salve-sage/10 rounded-lg">📝 {a.questions.slice(0, 80)}{a.questions.length > 80 ? '...' : ''}</div>}
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <div className="text-[13px] font-semibold text-salve-sage">{daysUntil(a.date)}</div>
                  <div className="text-[11px] text-salve-textFaint">{fmtDate(a.date)}</div>
                  {a.time && <div className="text-[11px] text-salve-textFaint">{a.time}</div>}
                </div>
              </div>
              <div className="flex gap-2.5 mt-2">
                <button onClick={() => { setForm(a); setEditId(a.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0">Edit</button>
                <button onClick={() => del.ask(a.id, a.reason || 'appointment')} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0">Delete</button>
              </div>
          </Card>
          ))}
          {past.length > 0 && <><Divider /><div className="text-[11px] font-semibold text-salve-textFaint uppercase tracking-widest mb-2">Past</div></>}
          {past.slice(0, 10).map(a => (
            <Card key={a.id} className="opacity-75">
              <div className="flex justify-between">
                <div>
                  <div className="text-sm font-medium text-salve-text">{a.reason || 'Appointment'}</div>
                  <div className="text-xs text-salve-textMid">{a.provider} · {fmtDate(a.date)}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setForm(a); setEditId(a.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={14} /></button>
                  <button onClick={() => del.ask(a.id, a.reason || 'appointment')} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={14} /></button>
                </div>
              </div>
              {a.post_notes && <div className="text-xs text-salve-textMid mt-1.5 border-t border-salve-border pt-1.5">{a.post_notes}</div>}
            <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('appointments', id))} onCancel={del.cancel} itemId={a.id} />
          </Card>
          ))}
        </>
      )}
    </div>
  );
}
