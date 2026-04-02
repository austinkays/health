import { useState, useEffect, useMemo } from 'react';
import { Plus, Dna, ChevronDown, Clipboard, Zap, Leaf, Loader2 } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { EMPTY_GENETIC_RESULT } from '../../constants/defaults';
import { PGX_GENES, PHENOTYPES, PGX_SOURCES, PGX_INTERACTIONS } from '../../constants/pgx';
import { fetchGeneticExplanation } from '../../services/ai';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';

/* ── Helpers ────────────────────────────────────────────── */

const phenotypeStyle = (p) => {
  const pl = (p || '').toLowerCase();
  if (pl.includes('poor')) return { color: C.rose, bg: 'rgba(232,138,154,0.18)', label: '\u26A0 Poor Metabolizer' };
  if (pl.includes('intermediate')) return { color: C.amber, bg: 'rgba(232,200,138,0.15)', label: '\u25C6 Intermediate' };
  if (pl.includes('rapid') && !pl.includes('ultra')) return { color: C.sage, bg: 'rgba(143,191,160,0.15)', label: '\u2191 Rapid' };
  if (pl.includes('ultrarapid')) return { color: C.lav, bg: 'rgba(184,169,232,0.15)', label: '\u21C8 Ultrarapid' };
  return { color: C.sage, bg: 'rgba(143,191,160,0.15)', label: '\u2713 Normal' };
};

function getAffectedDrugs(gene, phenotype) {
  if (!gene || !phenotype) return [];
  const gUpper = gene.toUpperCase();
  const pLower = phenotype.toLowerCase();
  const drugs = new Set();
  for (const rule of PGX_INTERACTIONS) {
    if (rule.gene === gUpper && rule.phenotypes.includes(pLower)) {
      rule.drugs.forEach(d => drugs.add(d));
    }
  }
  return [...drugs].sort();
}

function severityColor(s) {
  if (s === 'danger') return C.rose;
  if (s === 'caution') return C.amber;
  return C.textFaint;
}

/* ── Component ──────────────────────────────────────────── */

export default function Genetics({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_GENETIC_RESULT);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [pasteError, setPasteError] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [explanations, setExplanations] = useState({});
  const [explainLoading, setExplainLoading] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Deep-link
  useEffect(() => {
    if (highlightId) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]);

  // Sage explanation for a genetic result
  const explainResult = async (g) => {
    if (explanations[g.id]) return; // already have it
    setExplainLoading(g.id);
    try {
      const currentMedNames = (data.meds || [])
        .filter(m => m.active !== false)
        .map(m => m.display_name || m.name);
      const result = await fetchGeneticExplanation(
        g.gene, g.variant, g.phenotype, g.affected_drugs || [], currentMedNames
      );
      const text = result?.content?.[0]?.text || result?.text || '';
      setExplanations(prev => ({ ...prev, [g.id]: text }));
    } catch {
      setExplanations(prev => ({ ...prev, [g.id]: 'Unable to generate explanation. Try again later.' }));
    }
    setExplainLoading(null);
  };

  // Auto-populate affected drugs when gene/phenotype changes
  useEffect(() => {
    if (form.gene && form.phenotype) {
      const drugs = getAffectedDrugs(form.gene, form.phenotype);
      setForm(p => ({ ...p, affected_drugs: drugs }));
    }
  }, [form.gene, form.phenotype]);

  // Sort: group by gene
  const sorted = useMemo(() =>
    [...(data.genetic_results || [])].sort((a, b) => (a.gene || '').localeCompare(b.gene || '')),
    [data.genetic_results]
  );

  // Save
  const save = async () => {
    if (!form.gene.trim()) return;
    if (editId) {
      await updateItem('genetic_results', editId, form);
    } else {
      await addItem('genetic_results', form);
    }
    setSubView(null);
    setForm(EMPTY_GENETIC_RESULT);
    setEditId(null);
  };

  // Edit
  const startEdit = (g) => {
    setForm({ ...EMPTY_GENETIC_RESULT, ...g, affected_drugs: g.affected_drugs || [] });
    setEditId(g.id);
    setSubView('form');
  };

  // Paste import — processes JSON from the textarea
  const processPaste = async () => {
    setPasteError('');
    if (!pasteText.trim()) return;
    try {
      const results = JSON.parse(pasteText.trim());
      if (!Array.isArray(results)) throw new Error('Expected a JSON array of results');
      let added = 0;
      for (const r of results) {
        if (!r.gene) continue;
        const drugs = getAffectedDrugs(r.gene, r.phenotype || '');
        await addItem('genetic_results', {
          ...EMPTY_GENETIC_RESULT,
          gene: r.gene,
          variant: r.variant || '',
          phenotype: r.phenotype || '',
          source: r.source || '',
          affected_drugs: drugs,
          notes: r.notes || '',
        });
        added++;
      }
      setPasteError(`Imported ${added} result${added !== 1 ? 's' : ''}`);
      setPasteText('');
      setShowPaste(false);
    } catch (err) {
      setPasteError(err.message || 'Could not parse data. Expected JSON array.');
    }
  };

  // ── Form ────────────────────────────────────────────

  if (subView === 'form') {
    return (
      <FormWrap title={editId ? 'Edit Genetic Result' : 'Add Genetic Result'} onBack={() => { setSubView(null); setForm(EMPTY_GENETIC_RESULT); setEditId(null); }}>
        <Card>
          <div className="space-y-3">
            <Field
              label="Gene"
              value={form.gene}
              onChange={v => sf('gene', v)}
              options={PGX_GENES.map(g => ({ value: g, label: g }))}
              required
            />
            <Field label="Variant / Allele" value={form.variant} onChange={v => sf('variant', v)} placeholder="e.g., *1/*4 or rs3892097" />
            <Field
              label="Phenotype"
              value={form.phenotype}
              onChange={v => sf('phenotype', v)}
              options={PHENOTYPES.map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
            />
            <Field
              label="Source"
              value={form.source}
              onChange={v => sf('source', v)}
              options={PGX_SOURCES}
            />
            <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Additional details..." />

            {form.affected_drugs?.length > 0 && (
              <div>
                <div className="text-[10px] text-salve-textFaint font-montserrat tracking-wide uppercase mb-1.5">Affected Medications ({form.affected_drugs.length})</div>
                <div className="flex flex-wrap gap-1">
                  {form.affected_drugs.map(d => (
                    <span key={d} className="text-[10px] text-salve-lav bg-salve-lav/10 border border-salve-lav/20 rounded-full px-2 py-0.5 capitalize">{d}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Button variant="lavender" onClick={save} className="w-full justify-center mt-4">
            {editId ? 'Save Changes' : 'Add Result'}
          </Button>
        </Card>
      </FormWrap>
    );
  }

  // ── List ────────────────────────────────────────────

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Genetics</SectionTitle>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowPaste(!showPaste)}
            className={`flex items-center gap-1 py-1.5 px-3 rounded-lg text-xs font-medium font-montserrat cursor-pointer transition-colors border ${
              showPaste ? 'bg-salve-lav/10 border-salve-lav/30 text-salve-lav' : 'bg-salve-card2 border-salve-border text-salve-textMid hover:border-salve-lav/40 hover:text-salve-lav'
            }`}
            aria-label="Paste genetic results"
          >
            <Clipboard size={12} /> Paste
          </button>
          <Button variant="lavender" onClick={() => { setForm(EMPTY_GENETIC_RESULT); setEditId(null); setSubView('form'); }} className="!py-1.5 !px-3 !text-xs">
            <Plus size={14} /> Add
          </Button>
        </div>
      </div>

      {pasteError && (
        <div className={`text-xs font-montserrat mb-2.5 px-3 py-2 rounded-lg ${pasteError.startsWith('Imported') ? 'bg-salve-sage/10 text-salve-sage' : 'bg-salve-rose/10 text-salve-rose'}`}>
          {pasteError}
        </div>
      )}

      {showPaste && (
        <div className="mb-3 rounded-xl border border-salve-lav/20 bg-salve-card p-3">
          <p className="text-[11px] text-salve-textFaint mb-2 leading-relaxed">
            Paste a JSON array of results. Format: <code className="text-salve-lav bg-salve-lav/10 px-1 rounded text-[10px]">[{`{"gene":"CYP2D6","phenotype":"poor metabolizer","variant":"*4/*4","source":"genomind"}`}]</code>
          </p>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder='Paste JSON here...'
            className="w-full bg-salve-card2 border border-salve-border rounded-lg px-3 py-2 text-[12px] text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint resize-y min-h-[60px]"
            rows={3}
          />
          <div className="flex gap-2 mt-2">
            <Button variant="lavender" onClick={processPaste} className="!py-1.5 !px-3 !text-xs" disabled={!pasteText.trim()}>
              Import
            </Button>
            <button onClick={() => { setShowPaste(false); setPasteText(''); }} className="text-xs text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat hover:text-salve-text">Cancel</button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-salve-textFaint italic mb-3 leading-relaxed">
        Enter results from pharmacogenomic tests (Genomind, GeneSight, 23andMe, etc.). Sage uses this data to flag drug-gene interactions on your medications.
      </p>
      <p className="text-[10px] text-salve-textFaint italic mb-3">
        Genetic information requires professional interpretation. Always discuss results with your healthcare provider or genetic counselor.
      </p>

      {sorted.length === 0 ? (
        <EmptyState icon={Dna} text="No genetic results yet" motif="leaf" />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map(g => {
            const isExpanded = expandedId === g.id;
            const ps = phenotypeStyle(g.phenotype);
            const drugs = g.affected_drugs || [];

            // Find interactions for user's current meds
            const medMatches = (data.meds || []).filter(m => {
              const name = (m.display_name || m.name || '').toLowerCase();
              return drugs.some(d => name.includes(d) || d.includes(name));
            });

            return (
              <Card
                key={g.id}
                id={`record-${g.id}`}
                onClick={() => setExpandedId(isExpanded ? null : g.id)}
                className={`cursor-pointer transition-all ${highlightId === g.id ? 'highlight-pulse' : ''}`}
                style={{ borderLeft: `3px solid ${ps.color}` }}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-[15px] font-semibold text-salve-text font-playfair">{g.gene}</span>
                      <Badge label={ps.label} color={ps.color} bg={ps.bg} />
                      {medMatches.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 py-0.5 px-1.5 rounded-full bg-salve-amber/10 border border-salve-amber/20 text-[9px] text-salve-amber font-medium">
                          <Zap size={8} /> {medMatches.length} med{medMatches.length !== 1 ? 's' : ''} affected
                        </span>
                      )}
                    </div>
                    {!isExpanded && (
                      <div className="text-xs text-salve-textFaint">
                        {g.variant && <span>{g.variant} · </span>}
                        {g.source && <span>{g.source}</span>}
                        {!g.variant && !g.source && <span>{drugs.length} drug{drugs.length !== 1 ? 's' : ''} affected</span>}
                      </div>
                    )}
                  </div>
                  <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-1 mt-1 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>

                {/* Expanded */}
                <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                  <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                    {g.variant && <div className="text-xs text-salve-textFaint mb-1">Variant: {g.variant}</div>}
                    {g.source && <div className="text-xs text-salve-textFaint mb-1">Source: {g.source}</div>}
                    {g.notes && <div className="text-xs text-salve-textFaint mb-1.5 leading-relaxed">{g.notes}</div>}

                    {drugs.length > 0 && (
                      <div className="mb-2">
                        <div className="text-[10px] text-salve-textFaint font-montserrat tracking-wide uppercase mb-1">Affected Medications</div>
                        <div className="flex flex-wrap gap-1">
                          {drugs.map(d => {
                            const isCurrentMed = medMatches.some(m => (m.display_name || m.name || '').toLowerCase().includes(d));
                            return (
                              <span key={d} className={`text-[10px] rounded-full px-2 py-0.5 capitalize ${
                                isCurrentMed
                                  ? 'text-salve-amber bg-salve-amber/15 border border-salve-amber/25 font-semibold'
                                  : 'text-salve-textFaint bg-salve-card2 border border-salve-border'
                              }`}>
                                {isCurrentMed && <Zap size={7} className="inline mr-0.5" />}{d}
                              </span>
                            );
                          })}
                        </div>
                        {medMatches.length > 0 && (
                          <div className="text-[10px] text-salve-amber mt-1 italic">
                            Highlighted drugs match your current medications
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sage explanation */}
                    {hasAIConsent() && (
                      <div className="mt-2">
                        {!explanations[g.id] && explainLoading !== g.id && (
                          <button
                            onClick={() => explainResult(g)}
                            className="flex items-center gap-1.5 bg-salve-sage/10 border border-salve-sage/20 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-salve-sage/20 transition-colors"
                          >
                            <Leaf size={12} className="text-salve-sage" />
                            <span className="text-[11px] text-salve-sage font-montserrat font-medium">What does this mean for me?</span>
                          </button>
                        )}
                        {explainLoading === g.id && (
                          <div className="flex items-center gap-2 py-2">
                            <Loader2 size={13} className="animate-spin text-salve-sage" />
                            <span className="text-[11px] text-salve-textFaint italic font-montserrat">Sage is analyzing your result...</span>
                          </div>
                        )}
                        {explanations[g.id] && (
                          <div className="rounded-lg bg-salve-sage/5 border border-salve-sage/15 p-3 mt-1">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Leaf size={11} className="text-salve-sage" />
                              <span className="text-[10px] font-semibold text-salve-sage font-montserrat tracking-wide">SAGE</span>
                            </div>
                            <AIMarkdown compact>{explanations[g.id]}</AIMarkdown>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2.5 mt-2.5">
                      <button onClick={() => startEdit(g)} className="text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline" aria-label={`Edit ${g.gene}`}>Edit</button>
                      <button onClick={() => del.ask(g.id, g.gene)} className="text-xs text-salve-rose bg-transparent border-none cursor-pointer font-montserrat hover:underline" aria-label={`Delete ${g.gene}`}>Delete</button>
                    </div>
                    {del.pending === g.id && (
                      <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('genetic_results', id))} onCancel={del.cancel} itemId={g.id} />
                    )}
                  </div>
                </div></div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
