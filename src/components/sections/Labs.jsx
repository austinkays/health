import { useState, useEffect, useMemo } from 'react';
import { Plus, Check, Edit, Trash2, FlaskConical, Sparkles, ChevronDown, ExternalLink, Calendar } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import SplitView, { useIsDesktop } from '../layout/SplitView';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { fmtDate } from '../../utils/dates';
import { validateLab } from '../../utils/validate';
import { C } from '../../constants/colors';
import { findLabRange } from '../../constants/labRanges';
import { fetchLabInterpretation } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import { medlinePlusLabUrl, providerLookupUrl } from '../../utils/links';

const EMPTY = { date: '', test_name: '', result: '', unit: '', range: '', flag: '', provider: '', notes: '' };
const FLAG_OPTS = ['', 'normal', 'abnormal', 'high', 'low', 'mild-abnormal', 'completed', 'never'];

const flagColor = (flag) => {
  if (!flag || flag === 'normal' || flag === 'completed') return { color: C.sage, bg: 'rgba(143,191,160,0.15)', label: flag === 'completed' ? '✓ Completed' : '✓ Normal' };
  if (flag === 'abnormal' || flag === 'high' || flag === 'low') return { color: C.rose, bg: 'rgba(232,138,154,0.15)', label: `⚠ ${flag.charAt(0).toUpperCase() + flag.slice(1)}` };
  if (flag === 'mild-abnormal') return { color: C.amber, bg: 'rgba(196,166,115,0.15)', label: '◆ Mild Abnormal' };
  return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)', label: flag };
};

export default function Labs({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [interpretId, setInterpretId] = useState(null);
  const [interpretation, setInterpretation] = useState({});
  const [interpretLoading, setInterpretLoading] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const isDesktop = useIsDesktop();
  const del = useConfirmDelete();
  const [errors, setErrors] = useState({});
  const [showCleanup, setShowCleanup] = useState(false);
  const [cleanupYear, setCleanupYear] = useState('');
  const [cleanupConfirm, setCleanupConfirm] = useState(false);
  const [cleanupDeleting, setCleanupDeleting] = useState(false);
  const sf = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(e => { const n = { ...e }; delete n[k]; return n; }); };

  useEffect(() => {
    if (highlightId && data.labs.some(l => l.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const { valid, errors: e } = validateLab(form);
    if (!valid) { setErrors(e); return; }
    if (editId) await updateItem('labs', editId, form);
    else await addItem('labs', form);
    setForm(EMPTY); setErrors({}); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Lab / Imaging`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Test / Study Name" value={form.test_name} onChange={v => sf('test_name', v)} placeholder="e.g. CBC, CT Chest, Echo" required error={errors.test_name} />
        <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" />
        <Field label="Result" value={form.result} onChange={v => sf('result', v)} placeholder="e.g. 12.4, Negative, See report" error={errors.result} />
        <Field label="Unit" value={form.unit} onChange={v => sf('unit', v)} placeholder="e.g. g/dL, mmol/L" />
        <Field label="Reference Range" value={form.range} onChange={v => sf('range', v)} placeholder="e.g. 12.0–16.0" />
        <Field label="Flag" value={form.flag} onChange={v => sf('flag', v)} options={FLAG_OPTS} />
        <Field label="Ordering Provider" value={form.provider} onChange={v => sf('provider', v)} placeholder="Dr. Name" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Clinical context, follow-up needed..." maxLength={2000} error={errors.notes} />
        <div className="flex gap-2">
          <Button onClick={save} disabled={!form.test_name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const FILTERS = ['all', 'abnormal', 'normal'];
  const fl = (data.labs || []).filter(l => {
    if (!l || typeof l !== 'object') return false;
    if (filter === 'all') return true;
    if (filter === 'abnormal') return ['abnormal', 'high', 'low', 'mild-abnormal'].includes(l.flag);
    if (filter === 'normal') return !l.flag || l.flag === 'normal' || l.flag === 'completed';
    return true;
  });

  /* ── Shared detail renderer (used both inline on mobile and in side pane on desktop) ── */
  const renderLabDetail = (l) => {
    const fc = flagColor(l.flag);
    const refRange = findLabRange(l.test_name);
    return (
      <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
        {/* Desktop: show lab name + result as title in detail pane */}
        {isDesktop && (
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-salve-text font-playfair m-0">{l.test_name}</h3>
              {l.flag && <Badge label={fc.label} color={fc.color} bg={fc.bg} />}
            </div>
            {l.result && <div className="text-sm text-salve-textMid mt-0.5">{l.result}{l.unit ? ` ${l.unit}` : ''}</div>}
          </div>
        )}
        {l.date && <div className="text-xs text-salve-textFaint">{fmtDate(l.date)}{l.provider ? <>{' · '}<a href={providerLookupUrl(l.provider, data.providers)} target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">{l.provider}</a></> : ''}</div>}
        {l.range && <div className="text-xs text-salve-textFaint">Reference: {l.range}</div>}
        {!l.range && refRange && (
          <div className="text-xs text-salve-textFaint">
            Reference: {refRange.low !== undefined && refRange.high !== undefined ? `${refRange.low}–${refRange.high}` : refRange.low !== undefined ? `≥ ${refRange.low}` : refRange.high !== undefined ? `≤ ${refRange.high}` : ''}{refRange.unit ? ` ${refRange.unit}` : ''}
            <span className="text-salve-lav/60 ml-1">(standard)</span>
          </div>
        )}
        {l.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{l.notes}</div>}
        {hasAIConsent() && l.flag && l.flag !== 'normal' && l.flag !== 'completed' && (
          <button
            onClick={() => explainLab(l)}
            aria-label="Explain lab result with Sage"
            className="mt-2 flex items-center gap-1 bg-transparent border border-salve-lav/30 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-salve-lav/10 transition-colors"
          >
            <Sparkles size={12} color={C.lav} />
            <span className="text-[13px] text-salve-lav font-montserrat">
              {interpretLoading === l.id ? 'Analyzing...' : interpretation[l.id] ? (interpretId === l.id ? 'Hide' : 'Show') + ' interpretation' : 'Explain this result'}
            </span>
          </button>
        )}
        {interpretId === l.id && interpretation[l.id] && (
          <div className="mt-2 p-2.5 rounded-lg bg-salve-lav/5 border border-salve-lav/15">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[13px] font-semibold text-salve-lav flex items-center gap-1"><Sparkles size={11} /> Sage Interpretation</div>
              <button onClick={() => { setInterpretation(p => { const n = {...p}; delete n[l.id]; return n; }); setInterpretId(null); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss interpretation">×</button>
            </div>
            <AIMarkdown compact>{interpretation[l.id]}</AIMarkdown>
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={() => { setForm(l); setEditId(l.id); setSubView('form'); }} aria-label="Edit lab result" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-salve-lav/10 text-salve-lav text-xs font-semibold font-montserrat border border-salve-lav/20 cursor-pointer hover:bg-salve-lav/20 transition-colors"><Edit size={13} /> Edit</button>
          <button onClick={() => del.ask(l.id, l.test_name)} aria-label="Delete lab result" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-salve-textFaint text-xs font-medium font-montserrat border border-salve-border cursor-pointer hover:bg-salve-rose/10 hover:text-salve-rose hover:border-salve-rose/25 transition-colors"><Trash2 size={13} /> Delete</button>
        </div>
      </div>
    );
  };

  /* ── Selected lab for desktop detail pane ── */
  const selectedLab = isDesktop ? fl.find(l => l.id === expandedId) : null;

  /* ── Arrow key navigation on desktop ── */
  useEffect(() => {
    if (!isDesktop) return;
    const handler = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      const ids = fl.map(l => l.id);
      if (!ids.length) return;
      const cur = ids.indexOf(expandedId);
      const next = e.key === 'ArrowDown'
        ? ids[cur === -1 || cur === ids.length - 1 ? 0 : cur + 1]
        : ids[cur <= 0 ? ids.length - 1 : cur - 1];
      setExpandedId(next);
      document.getElementById(`record-${next}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDesktop, fl, expandedId]);

  const listContent = (
    <div className="mt-2">
      <div className="flex justify-end gap-2 mb-3">
        {data.labs.length > 0 && (
          <Button variant="ghost" onClick={() => { setShowCleanup(s => !s); setCleanupConfirm(false); setCleanupYear(''); }} className="!py-1.5 !px-3 !text-xs text-salve-textFaint">
            <Calendar size={13} /> Clean up
          </Button>
        )}
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
      </div>

      <div className="flex gap-1.5 mb-3.5">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat capitalize ${
              filter === f ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >{f}</button>
        ))}
      </div>

      {showCleanup && (() => {
        const currentYear = new Date().getFullYear();
        const yearOptions = [];
        for (let y = currentYear; y >= currentYear - 20; y--) yearOptions.push(String(y));
        const oldLabs = cleanupYear ? data.labs.filter(l => l.date && l.date < `${cleanupYear}-01-01`) : [];
        return (
          <Card className="mb-3 !bg-salve-rose/5 border-salve-rose/20">
            <p className="text-xs text-salve-textMid mb-2">Delete lab results older than a specific year</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={cleanupYear} onChange={e => { setCleanupYear(e.target.value); setCleanupConfirm(false); }}
                className="text-sm rounded-lg border border-salve-border bg-salve-card px-3 py-1.5 text-salve-text">
                <option value="">Select year...</option>
                {yearOptions.map(y => <option key={y} value={y}>Before {y}</option>)}
              </select>
              {cleanupYear && oldLabs.length > 0 && !cleanupConfirm && (
                <Button variant="ghost" onClick={() => setCleanupConfirm(true)} className="!text-xs !text-salve-rose">
                  <Trash2 size={13} /> Delete {oldLabs.length} record{oldLabs.length !== 1 ? 's' : ''}
                </Button>
              )}
              {cleanupYear && oldLabs.length === 0 && (
                <span className="text-xs text-salve-textFaint">No records before {cleanupYear}</span>
              )}
            </div>
            {cleanupConfirm && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-salve-rose font-medium">Permanently delete {oldLabs.length} lab{oldLabs.length !== 1 ? 's' : ''} from before {cleanupYear}?</span>
                <Button variant="ghost" className="!text-xs !text-salve-rose" disabled={cleanupDeleting}
                  onClick={async () => {
                    setCleanupDeleting(true);
                    for (const l of oldLabs) await removeItem('labs', l.id);
                    setCleanupDeleting(false);
                    setShowCleanup(false);
                    setCleanupYear('');
                    setCleanupConfirm(false);
                  }}>
                  {cleanupDeleting ? 'Deleting...' : 'Yes, delete'}
                </Button>
                <Button variant="ghost" className="!text-xs" onClick={() => setCleanupConfirm(false)}>Cancel</Button>
              </div>
            )}
          </Card>
        );
      })()}

      {fl.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          text="No labs or imaging yet"
          hint="Add bloodwork, imaging, or any test result. Sage auto-flags out-of-range values and can explain what they mean."
          motif="leaf"
          actionLabel="Add your first lab"
          onAction={() => setSubView('form')}
        />
      ) :
        fl.map(l => {
          const fc = flagColor(l.flag);
          const isExpanded = expandedId === l.id;
          const testName = typeof l.test_name === 'string' ? l.test_name : String(l.test_name ?? '');
          const result = l.result == null ? '' : String(l.result);
          return (
            <Card key={l.id} id={`record-${l.id}`} onClick={() => setExpandedId(isExpanded ? null : l.id)} className={`cursor-pointer transition-all${highlightId === l.id ? ' highlight-ring' : ''}${isDesktop && expandedId === l.id ? ' ring-2 ring-salve-lav/30' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <a href={medlinePlusLabUrl(testName)} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-salve-text hover:text-salve-sage transition-colors hover:underline">{testName || '(untitled lab)'}</a>
                    {l.flag && <Badge label={fc.label} color={fc.color} bg={fc.bg} />}
                  </div>
                  {result && (
                    <div className="text-[15px] text-salve-textMid">
                      {result}{l.unit ? ` ${l.unit}` : ''}{!isExpanded && l.date ? <span className="text-salve-textFaint text-xs ml-2">{fmtDate(l.date)}</span> : ''}
                    </div>
                  )}
                </div>
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
              {/* Mobile: inline expand. Desktop: detail goes to side pane */}
              {!isDesktop && (
                <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                  {isExpanded && renderLabDetail(l)}
                </div></div>
              )}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => { removeItem('labs', id); setInterpretation(prev => { const n = { ...prev }; delete n[id]; return n; }); })} onCancel={del.cancel} itemId={l.id} />
          </Card>
          );
        })
      }
    </div>
  );

  return (
    <SplitView
      list={listContent}
      detail={selectedLab ? (
        <Card className="!mb-0">
          {renderLabDetail(selectedLab)}
        </Card>
      ) : null}
      emptyMessage="Select a lab result to view details"
      detailKey={expandedId}
    />
  );
}
