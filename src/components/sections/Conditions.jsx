import { useState, useMemo, useEffect } from 'react';
import { Plus, Check, Edit, Trash2, Stethoscope, ChevronDown, Pill, User, ExternalLink, FlaskConical, BookOpen, Wind } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import ExternalLinkBadge from '../ui/ExternalLinkBadge';
import { EMPTY_CONDITION } from '../../constants/defaults';
import { fmtDate } from '../../utils/dates';
import { C } from '../../constants/colors';
import { medlinePlusUrl, providerLookupUrl, clinicalTrialsUrl } from '../../utils/links';
import { matchResources, normalizeCondition } from '../../constants/resources/index.js';
import { readCachedBarometric, PRESSURE_SENSITIVE, BARO_SCIENCE } from '../../services/barometric';
import SplitView, { useIsDesktop } from '../layout/SplitView';

const STATUS_COLORS = {
  active: { c: C.rose, bg: 'rgba(232,138,154,0.15)', label: '⚠ Active' },
  managed: { c: C.sage, bg: 'rgba(143,191,160,0.15)', label: '✓ Managed' },
  remission: { c: C.lav, bg: 'rgba(184,169,232,0.15)', label: '✦ Remission' },
  resolved: { c: C.textFaint, bg: 'rgba(110,106,128,0.15)', label: '✓ Resolved' },
};

export default function Conditions({ data, addItem, updateItem, removeItem, highlightId, onNav }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_CONDITION);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const isDesktop = useIsDesktop();
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (highlightId && data.conditions.some(c => c.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Cross-reference: count active meds related to each condition ── */
  const medsByCondition = useMemo(() => {
    const map = {};
    (data.conditions || []).forEach(c => {
      const name = c.name.trim().toLowerCase();
      map[c.id] = (data.meds || []).filter(m => {
        if (m.active === false) return false;
        const purpose = (m.purpose || '').toLowerCase();
        const linkedMeds = (c.linked_meds || '').toLowerCase();
        const medName = (m.display_name || m.name || '').toLowerCase();
        return purpose.includes(name) || linkedMeds.includes(medName);
      });
    });
    return map;
  }, [data.conditions, data.meds]);

  /* ── Provider picker options ── */
  const providerOptions = useMemo(() => [
    ...(data.providers || []).map(p => ({
      value: p.name,
      label: `${p.name}${p.specialty ? ` · ${p.specialty}` : ''}`,
    })),
    { value: '__custom', label: '+ Type a custom name' },
  ], [data.providers]);

  /* ── Resources matched against user data ── */
  const allMatched = useMemo(() => matchResources(data), [data]);

  /** Filter matched resources to those relevant to a specific condition name */
  const resourcesForCondition = (condName) => {
    const norm = normalizeCondition(condName);
    return allMatched.filter(({ resource }) =>
      (resource.conditions || []).some(rc => normalizeCondition(rc) === norm)
    );
  };

  const saveC = async () => {
    if (!form.name.trim()) return;
    if (editId) {
      await updateItem('conditions', editId, form);
    } else {
      await addItem('conditions', form);
    }
    setForm(EMPTY_CONDITION);
    setEditId(null);
    setSubView(null);
  };

  /* ── Shared detail renderer (used both inline on mobile and in side pane on desktop) ── */
  const renderConditionDetail = (c) => {
    const st = STATUS_COLORS[c.status] || STATUS_COLORS.active;
    const relatedMeds = medsByCondition[c.id] || [];
    return (
      <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
        {/* Desktop: show condition name + status as title in detail pane */}
        {isDesktop && (
          <div className="mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-salve-text font-playfair m-0">{c.name}</h3>
              <Badge label={st.label} color={st.c} bg={st.bg} />
            </div>
            {c.provider && <div className="text-sm text-salve-textMid mt-0.5">Provider: {c.provider}</div>}
          </div>
        )}
        {c.diagnosed_date && <div className="text-xs text-salve-textMid">Diagnosed: {fmtDate(c.diagnosed_date)}</div>}
        {c.provider && <div className="text-xs text-salve-textMid flex items-center gap-1">Provider: <a href={providerLookupUrl(c.provider, data.providers)} target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">{c.provider}</a></div>}
        {c.linked_meds && <div className="text-xs text-salve-sage mt-0.5">Meds: {c.linked_meds}</div>}
        {relatedMeds.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-salve-border/30">
            <div className="text-[13px] font-semibold text-salve-sage mb-1 flex items-center gap-1">
              <Pill size={11} /> Active Medications ({relatedMeds.length})
            </div>
            {relatedMeds.map(m => (
              <div key={m.id} className="text-xs text-salve-textMid py-0.5 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-salve-sage flex-shrink-0" />
                <span className="font-medium text-salve-text">{m.display_name || m.name}</span>
                {m.dose && <span className="text-salve-textFaint">{m.dose}</span>}
              </div>
            ))}
          </div>
        )}
        {c.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{c.notes}</div>}
        {(() => {
          const res = resourcesForCondition(c.name);
          const everycure = res.filter(r => r.resource.source === 'EveryCure');
          const understood = res.filter(r => r.resource.source === 'Understood.org');
          if (everycure.length === 0 && understood.length === 0) return null;
          return (
            <details className="mt-2.5 pt-2 border-t border-salve-border/30 group/res">
              <summary className="text-[13px] font-semibold text-salve-lav cursor-pointer list-none flex items-center gap-1 select-none">
                <BookOpen size={11} /> Resources &amp; research ({everycure.length + understood.length})
                <ChevronDown size={11} className="ml-auto transition-transform group-open/res:rotate-180 text-salve-textFaint" />
              </summary>
              <div className="mt-2 space-y-2">
                {everycure.map(({ resource: r }) => (
                  <div key={r.id} className="rounded-lg border border-salve-sage/20 bg-salve-sage/5 p-2.5">
                    <div className="flex items-start gap-1.5">
                      <span className="text-sm flex-shrink-0" aria-hidden="true">🔬</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-salve-text">{r.title}</span>
                          <Badge label="Research" color={C.sage} bg="rgba(143,191,160,0.15)" />
                        </div>
                        <p className="text-[13px] text-salve-textMid leading-relaxed mt-0.5 mb-1.5">{r.blurb}</p>
                        <ExternalLinkBadge url={r.url} label="EveryCure Portfolio" />
                      </div>
                    </div>
                    <p className="text-[12px] text-salve-rose/80 mt-1.5 leading-snug italic">
                      ⚠ Research-stage, not standard care. Always discuss with your healthcare provider before making treatment decisions.
                    </p>
                  </div>
                ))}
                {understood.map(({ resource: r }) => (
                  <div key={r.id} className="flex items-start gap-1.5 py-1">
                    <BookOpen size={11} className="text-salve-lav flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <ExternalLinkBadge url={r.url} label={r.title} />
                      <p className="text-[12px] text-salve-textFaint leading-snug mt-0.5">{r.blurb}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-salve-textFaint/70 mt-2 leading-snug">
                External resources are not medical advice. Always consult your healthcare providers.
              </p>
            </details>
          );
        })()}
        {/* Barometric pressure callout for pressure-sensitive conditions */}
        {(() => {
          const norm = (c.name || '').toLowerCase();
          const matchedKey = PRESSURE_SENSITIVE.find(k => norm.includes(k));
          if (!matchedKey) return null;
          const science = BARO_SCIENCE.find(s => s.conditions?.some(k => norm.includes(k)));
          const baro = readCachedBarometric();
          const trendConfig = {
            rising: { label: 'Rising', color: C.amber },
            falling: { label: 'Falling', color: C.rose },
            stable: { label: 'Stable', color: C.sage },
          };
          const tc = baro?.trend ? trendConfig[baro.trend] : null;
          return (
            <details className="mt-2.5 pt-2 border-t border-salve-border/30 group/baro">
              <summary
                className="list-none flex items-start gap-1.5 select-none cursor-pointer min-w-0 text-ui-base font-semibold"
                style={{ color: C.amber }}
              >
                <Wind size={11} aria-hidden="true" className="mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-ui-base font-semibold">Barometric pressure</div>
                  {baro && tc && (
                    <span className="block text-ui-sm font-normal truncate sm:whitespace-normal" style={{ color: tc.color }}>
                      {baro.current} hPa &middot; {tc.label}
                    </span>
                  )}
                </div>
                <ChevronDown size={11} className="ml-auto mt-0.5 flex-shrink-0 transition-transform group-open/baro:rotate-180 text-salve-textFaint" />
              </summary>
              <div className="mt-2.5 space-y-2">
                {!baro && (
                  <p className="text-ui-base font-montserrat leading-relaxed" style={{ color: C.textFaint }}>
                    Set your location in Settings to see live pressure data.
                  </p>
                )}
                {baro && (
                  <div className="rounded-xl p-fluid-sm" style={{ background: `${C.amber}10`, borderLeft: `3px solid ${C.amber}50` }}>
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-ui-xl font-semibold font-montserrat" style={{ color: tc?.color ?? C.textMid }}>
                        {baro.current} hPa
                      </span>
                      {tc && (
                        <span className="text-ui-sm font-medium font-montserrat rounded-full px-2 py-0.5 flex-shrink-0" style={{ background: `${tc.color}20`, color: tc.color }}>
                          {tc.label}
                        </span>
                      )}
                      {baro.change24h != null && (
                        <span className="text-ui-sm font-montserrat min-w-0 break-words" style={{ color: C.textFaint }}>
                          {baro.change24h > 0 ? '+' : ''}{baro.change24h} hPa vs 24h ago
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {science && (
                  <div className="rounded-xl p-fluid-sm" style={{ background: `${C.amber}08`, borderLeft: `3px solid ${C.amber}30` }}>
                    <div className="text-ui-sm font-semibold font-montserrat mb-0.5" style={{ color: C.textMid }}>
                      Why pressure affects {science.condition}
                    </div>
                    <p className="text-ui-base font-montserrat leading-relaxed line-clamp-4 sm:line-clamp-none" style={{ color: C.textFaint }}>
                      {science.detail}
                    </p>
                  </div>
                )}
                <p className="text-ui-base font-montserrat leading-relaxed line-clamp-4 sm:line-clamp-none" style={{ color: C.textFaint }}>
                  Track pressure alongside your pain, mood, and energy vitals to discover your personal
                  weather patterns. Most people experience effects within 12&ndash;48 hours of a significant
                  pressure change. Visit{' '}
                  <button
                    onClick={() => onNav?.('vitals')}
                    className="underline cursor-pointer bg-transparent border-none p-0 text-ui-base font-montserrat"
                    style={{ color: C.amber }}
                  >
                    Vitals
                  </button>
                  {' '}to log pressure and enable auto-logging.
                </p>
                <p className="text-ui-base font-montserrat italic leading-relaxed" style={{ color: C.textFaint, opacity: 0.7 }}>
                  For personal awareness only. Always discuss symptom patterns with your healthcare provider.
                </p>
              </div>
            </details>
          );
        })()}
        {/* Journal entries linked to this condition */}
        {(() => {
          const linked = (data.journal || []).filter(e => (e.linked_conditions || []).includes(c.id)).slice(0, 5);
          if (!linked.length) return null;
          return (
            <div className="mt-2">
              <span className="text-[12px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Recent Journal Entries</span>
              <div className="mt-1 space-y-1">
                {linked.map(e => (
                  <button key={e.id} onClick={() => onNav?.('journal', { highlightId: e.id })} className="w-full text-left bg-salve-lav/6 border border-salve-lav/12 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-salve-lav/12 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-salve-text font-montserrat">{e.title || e.date}</span>
                      {e.mood && <span className="text-xs">{String(e.mood).split(' ')[0]}</span>}
                      {e.severity && <span className="text-[12px] text-salve-textFaint">{e.severity}/10</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button onClick={() => { setForm(c); setEditId(c.id); setSubView('form'); }} aria-label="Edit condition" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-salve-lav/10 text-salve-lav text-xs font-semibold font-montserrat border border-salve-lav/20 cursor-pointer hover:bg-salve-lav/20 transition-colors"><Edit size={13} /> Edit</button>
          <button onClick={() => del.ask(c.id, c.name)} aria-label="Delete condition" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-salve-textFaint text-xs font-medium font-montserrat border border-salve-border cursor-pointer hover:bg-salve-rose/10 hover:text-salve-rose hover:border-salve-rose/25 transition-colors"><Trash2 size={13} /> Delete</button>
          {clinicalTrialsUrl(c.name, data.settings?.location) && (
            <a href={clinicalTrialsUrl(c.name, data.settings?.location)} target="_blank" rel="noopener noreferrer" aria-label={`Find clinical trials for ${c.name} on ClinicalTrials.gov (opens in new tab)`} className="text-salve-sage text-xs font-montserrat flex items-center gap-1 no-underline hover:underline">
              <FlaskConical size={12} aria-hidden="true" /> Find Trials
            </a>
          )}
        </div>
      </div>
    );
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Condition`} onBack={() => { setSubView(null); setForm(EMPTY_CONDITION); setEditId(null); }}>
      <Card>
        <Field label="Condition / Diagnosis" value={form.name} onChange={v => sf('name', v)} placeholder="e.g. Fibromyalgia" required />
        <Field label="Date Diagnosed" value={form.diagnosed_date} onChange={v => sf('diagnosed_date', v)} type="date" />
        <Field label="Status" value={form.status} onChange={v => sf('status', v)} options={[
          { value: 'active', label: 'Active' },
          { value: 'managed', label: 'Managed' },
          { value: 'remission', label: 'In Remission' },
          { value: 'resolved', label: 'Resolved' },
        ]} />
        <Field label="Treating Provider" value={form.provider} onChange={v => sf('provider', v)} options={providerOptions} />
        {form.provider === '__custom' && (
          <Field label="Custom Provider" value="" onChange={v => sf('provider', v)} placeholder="Dr. Name" />
        )}
        <Field label="Related Medications" value={form.linked_meds} onChange={v => sf('linked_meds', v)} placeholder="Meds for this condition" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="History, triggers..." />
        <div className="flex gap-2">
          <Button onClick={saveC} disabled={!form.name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_CONDITION); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const filteredList = data.conditions.filter(c => filter === 'all' ? true : c.status === filter);
  const selectedCondition = isDesktop ? filteredList.find(c => c.id === expandedId) : null;

  const listContent = (
    <div className="mt-2">
      <div className="flex justify-end mb-3">
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3.5">
        {['all', 'active', 'managed', 'remission', 'resolved'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat capitalize ${
              filter === f ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filteredList.length === 0 ? (
        filter === 'all' ? (
          <EmptyState
            icon={Stethoscope}
            text="No conditions recorded"
            hint="Track diagnoses to unlock condition-matched resources, medication cross-references, and clinical trial suggestions."
            motif="star"
            actionLabel="Add your first condition"
            onAction={() => setSubView('form')}
          />
        ) : (
          <EmptyState icon={Stethoscope} text={`No ${filter} conditions`} motif="star" />
        )
      ) :
        filteredList.map(c => {
          const st = STATUS_COLORS[c.status] || STATUS_COLORS.active;
          const isExpanded = expandedId === c.id;
          const relatedMeds = medsByCondition[c.id] || [];
          const condResources = resourcesForCondition(c.name);
          const hasResearch = condResources.some(r => r.resource.source === 'EveryCure');
          return (
            <Card key={c.id} id={`record-${c.id}`} onClick={() => setExpandedId(isExpanded ? null : c.id)} className={`cursor-pointer transition-all${highlightId === c.id ? ' highlight-ring' : ''}${isDesktop && expandedId === c.id ? ' ring-2 ring-salve-lav/30' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <a href={medlinePlusUrl(c.name)} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-salve-text hover:text-salve-sage transition-colors hover:underline">{c.name}</a>
                    <Badge label={st.label} color={st.c} bg={st.bg} />
                    {hasResearch && <Badge label="🔬 Research" color={C.sage} bg="rgba(143,191,160,0.15)" />}
                  </div>
                  {!isExpanded && c.provider && (
                    <div className="text-xs text-salve-textMid truncate flex items-center gap-1">
                      <User size={10} className="text-salve-textFaint flex-shrink-0" />
                      <a href={providerLookupUrl(c.provider, data.providers)} target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">{c.provider}</a>
                    </div>
                  )}
                  {!isExpanded && relatedMeds.length > 0 && (
                    <span className="inline-flex items-center gap-1 mt-1 py-0.5 px-2 rounded-full bg-salve-sage/10 border border-salve-sage/20 text-[12px] text-salve-sage font-medium">
                      <Pill size={10} /> {relatedMeds.length} med{relatedMeds.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
              {/* Mobile: inline expand. Desktop: detail goes to side pane */}
              {!isDesktop && (
                <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                  {isExpanded && renderConditionDetail(c)}
                </div></div>
              )}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('conditions', id))} onCancel={del.cancel} itemId={c.id} />
          </Card>
          );
        })
      }
    </div>
  );

  return (
    <SplitView
      list={listContent}
      detail={selectedCondition ? (
        <Card className="!mb-0">
          {renderConditionDetail(selectedCondition)}
        </Card>
      ) : null}
      emptyMessage="Select a condition to view details"
      detailKey={expandedId}
    />
  );
}
