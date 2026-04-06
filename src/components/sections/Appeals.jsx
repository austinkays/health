import { useState, useEffect } from 'react';
import { Plus, Check, Edit, Trash2, Scale, FileText, Loader, ChevronDown } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { fmtDate } from '../../utils/dates';
import { C } from '../../constants/colors';
import { fetchAppealDraft, isFeatureLocked } from '../../services/ai';
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

const deadlineBadge = (deadline) => {
  if (!deadline) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const dl = new Date(deadline + 'T00:00:00'); 
  const days = Math.ceil((dl - now) / 86400000);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: C.rose, bg: 'rgba(232,138,154,0.15)' };
  if (days === 0) return { label: 'Due today', color: C.rose, bg: 'rgba(232,138,154,0.15)' };
  if (days <= 3) return { label: `${days}d left`, color: C.rose, bg: 'rgba(232,138,154,0.15)' };
  if (days <= 7) return { label: `${days}d left`, color: C.amber, bg: 'rgba(196,166,115,0.15)' };
  return { label: `${days}d left`, color: C.textFaint, bg: 'rgba(110,106,128,0.1)' };
};

export default function Appeals({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const [draftLoading, setDraftLoading] = useState(null);
  const [draftResult, setDraftResult] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (highlightId && (data.appeals_and_disputes || []).some(a => a.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="flex justify-end mb-3">
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
      </div>

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
        <div className="md:grid md:grid-cols-2 md:gap-4">{fl.map(a => {
          const ss = statusStyle(a.status);
          const isExpanded = expandedId === a.id;
          const dlBadge = a.status !== 'Resolved' ? deadlineBadge(a.deadline) : null;
          return (
            <Card key={a.id} id={`record-${a.id}`} onClick={() => setExpandedId(isExpanded ? null : a.id)} className={`cursor-pointer transition-all${highlightId === a.id ? ' highlight-ring' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[15px] font-semibold text-salve-text">{a.subject}</span>
                    {a.status && <Badge label={a.status} color={ss.color} bg={ss.bg} />}
                    {dlBadge && <Badge label={dlBadge.label} color={dlBadge.color} bg={dlBadge.bg} />}
                  </div>
                  {a.against && <div className="text-xs text-salve-textFaint">vs. {a.against}</div>}
                </div>
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
              <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
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
                      aria-label="Draft appeal letter with Sage"
                      className="mt-2 bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"
                    >
                      {draftLoading === a.id ? <Loader size={11} className="animate-spin" /> : <FileText size={11} />}
                      {draftLoading === a.id ? 'Drafting...' : isFeatureLocked('appealDraft') ? 'Draft Appeal (Premium)' : 'Draft Appeal Letter'}
                    </button>
                  )}
                  {draftResult[a.id] && (
                    <div className="mt-2 p-2.5 rounded-lg bg-salve-lav/8 border border-salve-lav/20">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[11px] font-semibold text-salve-lav flex items-center gap-1"><FileText size={11} /> Sage Draft</div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { navigator.clipboard.writeText(draftResult[a.id]); setCopiedId(a.id); setTimeout(() => setCopiedId(null), 2000); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-lav p-0 text-[11px] font-montserrat" aria-label="Copy draft to clipboard">{copiedId === a.id ? '✓ Copied' : 'Copy'}</button>
                          <button onClick={() => setDraftResult(p => { const n = {...p}; delete n[a.id]; return n; })} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss draft">×</button>
                        </div>
                      </div>
                      <AIMarkdown>{draftResult[a.id]}</AIMarkdown>
                    </div>
                  )}
                  <div className="flex gap-2.5 mt-2.5">
                    <button onClick={() => { setForm(a); setEditId(a.id); setSubView('form'); }} aria-label="Edit appeal" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
                    <button onClick={() => del.ask(a.id, a.subject)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                  </div>
                </div>
              </div></div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('appeals_and_disputes', id))} onCancel={del.cancel} itemId={a.id} />
          </Card>
          );
        })}</div>
      }
    </div>
  );
}
