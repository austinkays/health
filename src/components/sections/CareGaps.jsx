import { useState, useEffect } from 'react';
import { Plus, Check, Edit, Trash2, AlertTriangle, Sparkles, Loader, ChevronDown } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { fetchCareGapSuggestions, isFeatureLocked } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';

const EMPTY = { category: '', item: '', last_done: '', urgency: '', notes: '' };

const CATEGORIES = [
  '', 'Lab, never done', 'Lab, outdated', 'Immunization, overdue',
  'Treatment gap', 'Medication, pending',
];
const URGENCIES = ['', 'urgent', 'needs prompt attention', 'worth raising at next appointment', 'routine', 'completed'];

const urgencyStyle = (u) => {
  if (u === 'urgent') return { color: C.rose, bg: 'rgba(232,138,154,0.18)', border: C.rose, label: '⚠ Urgent' };
  if (u === 'needs prompt attention') return { color: C.amber, bg: 'rgba(196,166,115,0.15)', border: C.amber, label: '◆ Needs Prompt Attention' };
  if (u === 'worth raising at next appointment') return { color: C.lav, bg: 'rgba(184,169,232,0.15)', border: C.lav, label: '↗ Next Appointment' };
  if (u === 'completed') return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)', border: C.textFaint, label: '✓ Completed' };
  return { color: C.sage, bg: 'rgba(143,191,160,0.15)', border: C.sage, label: '· Routine' };
};

const URGENCY_ORDER = ['urgent', 'needs prompt attention', 'worth raising at next appointment', 'routine', 'completed', ''];

export default function CareGaps({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('active');
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (highlightId && (data.care_gaps || []).some(g => g.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestGaps = async () => {
    setAiLoading(true);
    setAiSuggestions(null);
    try {
      const result = await fetchCareGapSuggestions(buildProfile(data));
      setAiSuggestions(result);
    } catch (e) {
      setAiSuggestions('Unable to generate suggestions right now. ' + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const save = async () => {
    if (!form.item.trim()) return;
    if (editId) await updateItem('care_gaps', editId, form);
    else await addItem('care_gaps', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Care Gap`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Item" value={form.item} onChange={v => sf('item', v)} placeholder="e.g. TSH thyroid panel, Shingrix vaccine" required />
        <Field label="Category" value={form.category} onChange={v => sf('category', v)} options={CATEGORIES} />
        <Field label="Urgency" value={form.urgency} onChange={v => sf('urgency', v)} options={URGENCIES} />
        <Field label="Last Done" value={form.last_done} onChange={v => sf('last_done', v)} placeholder="Date, 'never', or 'in progress'" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Context, barriers, plan..." />
        <div className="flex gap-2">
          <Button onClick={save} disabled={!form.item.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const sorted = [...data.care_gaps].sort((a, b) =>
    URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency)
  );
  const fl = filter === 'active'
    ? sorted.filter(g => g.urgency !== 'completed')
    : sorted;

  const urgentCount = data.care_gaps.filter(g => g.urgency === 'urgent').length;

  return (
    <div className="mt-2">
      <div className="flex justify-end mb-3">
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
      </div>

      {urgentCount > 0 && (
        <div className="mb-3 px-3 py-2.5 rounded-lg border text-[12px] font-medium"
          style={{ background: 'rgba(232,138,154,0.1)', borderColor: C.rose, color: C.rose }}>
          ⚠ {urgentCount} item{urgentCount > 1 ? 's' : ''} marked urgent
        </div>
      )}

      {hasAIConsent() && (
        <div className="mb-3">
          <Button
            variant="ghost"
            onClick={suggestGaps}
            disabled={aiLoading}
            className="!text-xs w-full !justify-center"
          >
            {aiLoading ? <><Loader size={13} className="animate-spin" /> Analyzing your profile...</> : isFeatureLocked('careGapDetect') ? <><Sparkles size={13} /> Suggest Care Gaps (Premium)</> : <><Sparkles size={13} /> Suggest Care Gaps with Sage</>}
          </Button>
          {aiSuggestions && (
            <Card className="!bg-salve-lav/8 !border-salve-lav/20 mt-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-semibold text-salve-lav flex items-center gap-1"><Sparkles size={11} /> Sage Suggestions</div>
                <button onClick={() => setAiSuggestions(null)} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss Sage suggestions">×</button>
              </div>
              <AIMarkdown>{aiSuggestions}</AIMarkdown>
            </Card>
          )}
        </div>
      )}

      <div className="flex gap-1.5 mb-3.5">
        {['active', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat capitalize ${
              filter === f ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >{f}</button>
        ))}
      </div>


      {fl.length === 0 ? <EmptyState icon={AlertTriangle} text={filter === 'active' ? 'No open care gaps' : 'No care gaps recorded'} motif="leaf" /> :
        <div className="md:grid md:grid-cols-2 md:gap-4">{fl.map(g => {
          const us = urgencyStyle(g.urgency);
          const isExpanded = expandedId === g.id;
          return (
            <Card key={g.id} id={`record-${g.id}`} style={{ borderLeft: `3px solid ${us.border}` }} onClick={() => setExpandedId(isExpanded ? null : g.id)} className={`cursor-pointer transition-all${highlightId === g.id ? ' highlight-ring' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[15px] font-semibold text-salve-text">{g.item}</span>
                    {g.urgency && <Badge label={us.label} color={us.color} bg={us.bg} />}
                  </div>
                  {!isExpanded && g.category && <div className="text-xs text-salve-textFaint truncate">{g.category}</div>}
                </div>
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
              <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                  {g.category && <div className="text-xs text-salve-textFaint">{g.category}</div>}
                  {g.last_done && <div className="text-xs text-salve-textFaint">Last done: {g.last_done}</div>}
                  {g.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{g.notes}</div>}
                  <div className="flex gap-2.5 mt-2.5">
                    <button onClick={() => { setForm(g); setEditId(g.id); setSubView('form'); }} aria-label="Edit care gap" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
                    <button onClick={() => del.ask(g.id, g.item)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                  </div>
                </div>
              </div></div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('care_gaps', id))} onCancel={del.cancel} itemId={g.id} />
          </Card>
          );
        })}</div>
      }
    </div>
  );
}
