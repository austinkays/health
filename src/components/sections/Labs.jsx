import { useState } from 'react';
import { Plus, Check, Edit, Trash2, FlaskConical, Sparkles } from 'lucide-react';
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
import { fetchLabInterpretation } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';

const EMPTY = { date: '', test_name: '', result: '', unit: '', range: '', flag: '', provider: '', notes: '' };
const FLAG_OPTS = ['', 'normal', 'abnormal', 'high', 'low', 'mild-abnormal', 'completed', 'never'];

const flagColor = (flag) => {
  if (!flag || flag === 'normal' || flag === 'completed') return { color: C.sage, bg: 'rgba(143,191,160,0.15)', label: flag === 'completed' ? '✓ Completed' : '✓ Normal' };
  if (flag === 'abnormal' || flag === 'high' || flag === 'low') return { color: C.rose, bg: 'rgba(232,138,154,0.15)', label: `⚠ ${flag.charAt(0).toUpperCase() + flag.slice(1)}` };
  if (flag === 'mild-abnormal') return { color: C.amber, bg: 'rgba(196,166,115,0.15)', label: '◆ Mild Abnormal' };
  return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)', label: flag };
};

export default function Labs({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [interpretId, setInterpretId] = useState(null);
  const [interpretation, setInterpretation] = useState({});
  const [interpretLoading, setInterpretLoading] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const explainLab = async (lab) => {
    if (interpretLoading) return;
    if (interpretation[lab.id]) {
      setInterpretId(interpretId === lab.id ? null : lab.id);
      return;
    }
    setInterpretId(lab.id);
    setInterpretLoading(lab.id);
    try {
      const profile = buildProfile(data);
      const result = await fetchLabInterpretation(lab, profile);
      setInterpretation(prev => ({ ...prev, [lab.id]: result }));
    } catch (e) {
      setInterpretation(prev => ({ ...prev, [lab.id]: 'Unable to interpret. ' + e.message }));
    } finally {
      setInterpretLoading(null);
    }
  };

  const save = async () => {
    if (!form.test_name.trim()) return;
    if (editId) await updateItem('labs', editId, form);
    else await addItem('labs', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Lab / Imaging`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Test / Study Name" value={form.test_name} onChange={v => sf('test_name', v)} placeholder="e.g. CBC, CT Chest, Echo" required />
        <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" />
        <Field label="Result" value={form.result} onChange={v => sf('result', v)} placeholder="e.g. 12.4, Negative, See report" />
        <Field label="Unit" value={form.unit} onChange={v => sf('unit', v)} placeholder="e.g. g/dL, mmol/L" />
        <Field label="Reference Range" value={form.range} onChange={v => sf('range', v)} placeholder="e.g. 12.0–16.0" />
        <Field label="Flag" value={form.flag} onChange={v => sf('flag', v)} options={FLAG_OPTS} />
        <Field label="Ordering Provider" value={form.provider} onChange={v => sf('provider', v)} placeholder="Dr. Name" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Clinical context, follow-up needed..." />
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
                  {l.flag && <Badge label={fc.label} color={fc.color} bg={fc.bg} className="mt-1.5" />}
                  {l.notes && <div className="text-xs text-salve-textFaint mt-1">{l.notes}</div>}
                  {hasAIConsent() && l.flag && l.flag !== 'normal' && l.flag !== 'completed' && (
                    <button
                      onClick={() => explainLab(l)}
                      className="mt-2 flex items-center gap-1 bg-transparent border border-salve-lav/30 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-salve-lav/10 transition-colors"
                    >
                      <Sparkles size={12} color={C.lav} />
                      <span className="text-[11px] text-salve-lav font-montserrat">
                        {interpretLoading === l.id ? 'Analyzing...' : interpretation[l.id] ? (interpretId === l.id ? 'Hide' : 'Show') + ' interpretation' : 'Explain this result'}
                      </span>
                    </button>
                  )}
                  {interpretId === l.id && interpretation[l.id] && (
                    <div className="mt-2 p-2.5 rounded-lg bg-salve-lav/5 border border-salve-lav/15">
                      <p className="text-xs text-salve-textMid leading-relaxed m-0 whitespace-pre-line">{interpretation[l.id]}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-2">
                  <button onClick={() => { setForm(l); setEditId(l.id); setSubView('form'); }} aria-label="Edit lab result" className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                  <button onClick={() => del.ask(l.id, l.test_name)} aria-label="Delete lab result" className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
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
