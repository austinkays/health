import { useState } from 'react';
import { Plus, Check, BookOpen } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { EMPTY_JOURNAL, MOODS } from '../../constants/defaults';
import { fmtDate } from '../../utils/dates';
import { C } from '../../constants/colors';

export default function Journal({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_JOURNAL });
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const saveJ = async () => {
    if (!form.content.trim() && !form.title.trim()) return;
    if (editId) {
      await updateItem('journal', editId, form);
    } else {
      await addItem('journal', form);
    }
    setForm({ ...EMPTY_JOURNAL, date: new Date().toISOString().slice(0, 10) });
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'New'} Entry`} onBack={() => { setSubView(null); setForm(EMPTY_JOURNAL); setEditId(null); }}>
      <Card>
        <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" />
        <Field label="Title (optional)" value={form.title} onChange={v => sf('title', v)} placeholder="Quick label for today" />
        <Field label="Mood" value={form.mood} onChange={v => sf('mood', v)} options={MOODS} />
        <Field label="Symptom Severity" value={form.severity} onChange={v => sf('severity', v)} options={[...Array(10)].map((_, i) => ({ value: String(i + 1), label: `${i + 1}/10${i === 0 ? ' (minimal)' : i === 9 ? ' (worst)' : ''}` }))} />
        <Field label="What's going on?" value={form.content} onChange={v => sf('content', v)} textarea placeholder="Symptoms, triggers, what helped..." />
        <Field label="Tags" value={form.tags} onChange={v => sf('tags', v)} placeholder="flare, fatigue, headache..." />
        <div className="flex gap-2">
          <Button onClick={saveJ} disabled={!form.content.trim() && !form.title.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_JOURNAL); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="lavender" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Write</Button>}>
        Symptom Journal
      </SectionTitle>
      {data.journal.length === 0 ? <EmptyState icon={BookOpen} text="Your journal is empty — start tracking patterns" motif="moon" /> :
        data.journal.map(e => {
          const sev = Number(e.severity);
          const sevColor = sev >= 7 ? C.rose : sev >= 4 ? C.amber : C.sage;
          const sevBg = sev >= 7 ? 'rgba(232,138,154,0.15)' : sev >= 4 ? 'rgba(232,200,138,0.15)' : 'rgba(143,191,160,0.15)';
          return (
            <Card key={e.id} className="!bg-salve-lav/10 !border-salve-lav/20">
              <div className="flex justify-between items-start mb-1.5">
                <div>
                  <span className="font-playfair text-sm font-medium text-salve-text">{e.title || fmtDate(e.date)}</span>
                  {e.title && <span className="text-[11px] text-salve-textFaint ml-2">{fmtDate(e.date)}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  {e.mood && <span className="text-base">{e.mood.split(' ')[0]}</span>}
                  {e.severity && <Badge label={`${e.severity}/10`} color={sevColor} bg={sevBg} />}
                </div>
              </div>
              <div className="text-[13px] text-salve-textMid leading-relaxed">{e.content}</div>
              {e.tags && (
                <div className="mt-2 flex gap-1 flex-wrap">
                  {e.tags.split(',').map((t, i) => (
                    <span key={i} className="bg-salve-card2 text-salve-textMid text-[11px] px-2.5 py-0.5 rounded-full border border-salve-border">{t.trim()}</span>
                  ))}
                </div>
              )}
              <div className="flex gap-2.5 mt-2">
                <button onClick={() => { setForm(e); setEditId(e.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0">Edit</button>
                <button onClick={() => del.ask(e.id, e.title || 'entry')} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0">Delete</button>
              </div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('journal', id))} onCancel={del.cancel} itemId={e.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
