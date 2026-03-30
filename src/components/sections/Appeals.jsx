import { useState } from 'react';
import { Plus, Check, Edit, Trash2, Scale, FileText, Loader, ChevronDown } from 'lucide-react';
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
import { fetchAppealDraft } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';

const EMPTY = { date_filed: '', subject: '', against: '', status: 'Active', deadline: '', notes: '' };
const STATUSES = ['Active', 'Draft', 'Filed', 'Resolved'];

const statusStyle = (s) => {
  if (s === 'Active') return { color: C.amber, bg: 'rgba(196,166,115,0.15)' };
  if (s === 'Filed') return { color: C.lav, bg: 'rgba(184,169,232,0.15)' };
  if (s === 'Resolved') return { color: C.sage, bg: 'rgba(143,191,160,0.15)' };
  return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)' };
};

export default function Appeals({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const [draftLoading, setDraftLoading] = useState(null);
  const [draftResult, setDraftResult] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const draftLetter = async (appeal) => {
    setDraftLoading(appeal.id);
    try {
      const result = await fetchAppealDraft(appeal, buildProfile(data));
      setDraftResult(p => ({ ...p, [appeal.id]: result }));
    } catch (e) {
      setDraftResult(p => ({ ...p, [appeal.id]: 'Unable to draft letter right now. ' + e.message }));
    } finally {
      setDraftLoading(null);
    }
  };

  const save = async () => {
    if (!form.subject.trim()) return;
    if (editId) await updateItem('appeals_and_disputes', editId, form);
    else await addItem('appeals_and_disputes', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Appeal / Dispute`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Subject / Description" value={form.subject} onChange={v => sf('subject', v)} placeholder="e.g. Denial of Spravato coverage" required />
        <Field label="Against (insurer / entity)" value={form.against} onChange={v => sf('against', v)} placeholder="e.g. CareOregon, Providence" />
        <Field label="Status" value={form.status} onChange={v => sf('status', v)} options={STATUSES} />
        <Field label="Date Filed" value={form.date_filed} onChange={v => sf('date_filed', v)} type="date" />
        <Field label="Deadline" value={form.deadline} onChange={v => sf('deadline', v)} type="date" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Case number, contact, next steps..." />
        <div className="flex gap-2">
          <Button onClick={save} disabled={!form.subject.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const fl = filter === 'active'
    ? data.appeals_and_disputes.filter(a => a.status !== 'Resolved')
    : data.appeals_and_disputes;

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Appeals & Disputes
      </SectionTitle>

      <div className="flex gap-1.5 mb-3.5">
        {['active', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat capitalize ${
              filter === f ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >{f}</button>
        ))}
      </div>


      {fl.length === 0 ? <EmptyState icon={Scale} text={filter === 'active' ? 'No open appeals' : 'No appeals recorded'} motif="leaf" /> :
        fl.map(a => {
          const ss = statusStyle(a.status);
          const isExpanded = expandedId === a.id;
          return (
            <Card key={a.id} onClick={() => setExpandedId(isExpanded ? null : a.id)} className="cursor-pointer transition-all">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[15px] font-semibold text-salve-text">{a.subject}</span>
                    {a.status && <Badge label={a.status} color={ss.color} bg={ss.bg} />}
                  </div>
                  {a.against && <div className="text-xs text-salve-textFaint">vs. {a.against}</div>}
                  {!isExpanded && a.deadline && <div className="text-xs mt-0.5" style={{ color: C.amber }}>Deadline: {fmtDate(a.deadline)}</div>}
                </div>
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
              {isExpanded && (
                <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                  <div className="text-xs text-salve-textFaint">
                    {a.date_filed ? `Filed: ${fmtDate(a.date_filed)}` : ''}
                    {a.date_filed && a.deadline ? ' · ' : ''}
                    {a.deadline ? <span style={{ color: C.amber }}>Deadline: {fmtDate(a.deadline)}</span> : ''}
                  </div>
                  {a.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{a.notes}</div>}
                  {hasAIConsent() && a.status !== 'Resolved' && (
                    <button
                      onClick={() => draftLetter(a)}
                      disabled={draftLoading === a.id}
                      className="mt-2 bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"
                    >
                      {draftLoading === a.id ? <Loader size={11} className="animate-spin" /> : <FileText size={11} />}
                      {draftLoading === a.id ? 'Drafting...' : 'Draft Appeal Letter'}
                    </button>
                  )}
                  {draftResult[a.id] && (
                    <div className="mt-2 p-2.5 rounded-lg bg-salve-lav/8 border border-salve-lav/20">
                      <div className="text-[11px] font-semibold text-salve-lav mb-1 flex items-center gap-1"><FileText size={11} /> AI Draft</div>
                      <AIMarkdown>{draftResult[a.id]}</AIMarkdown>
                    </div>
                  )}
                  <div className="flex gap-2.5 mt-2.5">
                    <button onClick={() => { setForm(a); setEditId(a.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
                    <button onClick={() => del.ask(a.id, a.subject)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                  </div>
                </div>
              )}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('appeals_and_disputes', id))} onCancel={del.cancel} itemId={a.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
