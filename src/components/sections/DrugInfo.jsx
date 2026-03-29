import { useState, useEffect, useRef } from 'react';
import { Pill, Search, AlertTriangle, ShieldAlert, RotateCcw, Loader2, Info, FileWarning } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { searchDrugLabel, searchRecalls, searchAdverseEvents } from '../../services/fda';
import { findDrug, getGenericEquivalents, suggestDrugs, checkInteractionsByNames } from '../../services/rxnorm';

const TABS = ['label', 'recalls', 'adverse', 'generics'];
const TAB_LABELS = { label: 'Label Info', recalls: 'Recalls', adverse: 'Side Effects', generics: 'Generics' };

export default function DrugInfo({ data }) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('label');
  const [labelData, setLabelData] = useState(null);
  const [recallData, setRecallData] = useState(null);
  const [adverseData, setAdverseData] = useState(null);
  const [genericsData, setGenericsData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [searched, setSearched] = useState(false);
  const [interactionResults, setInteractionResults] = useState(null);
  const [interactionLoading, setInteractionLoading] = useState(false);
  const debounceRef = useRef(null);

  // Autocomplete suggestions
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const results = await suggestDrugs(query);
      setSuggestions(results.slice(0, 6));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const doSearch = async (drugName) => {
    const name = drugName || query.trim();
    if (!name) return;
    setQuery(name);
    setSuggestions([]);
    setSearched(true);
    setLabelData(null); setRecallData(null); setAdverseData(null); setGenericsData(null);
    setErrors({});
    setInteractionResults(null);

    // Fetch label
    setLoading(l => ({ ...l, label: true }));
    try { setLabelData(await searchDrugLabel(name)); }
    catch (e) { setErrors(er => ({ ...er, label: e.message })); }
    finally { setLoading(l => ({ ...l, label: false })); }

    // Fetch recalls
    setLoading(l => ({ ...l, recalls: true }));
    try { setRecallData(await searchRecalls(name)); }
    catch (e) { setErrors(er => ({ ...er, recalls: e.message })); }
    finally { setLoading(l => ({ ...l, recalls: false })); }

    // Fetch adverse events
    setLoading(l => ({ ...l, adverse: true }));
    try { setAdverseData(await searchAdverseEvents(name)); }
    catch (e) { setErrors(er => ({ ...er, adverse: e.message })); }
    finally { setLoading(l => ({ ...l, adverse: false })); }

    // Fetch generics via RxNorm
    setLoading(l => ({ ...l, generics: true }));
    try {
      const drug = await findDrug(name);
      if (drug?.rxcui) {
        setGenericsData(await getGenericEquivalents(drug.rxcui));
      } else {
        setGenericsData([]);
      }
    } catch (e) { setErrors(er => ({ ...er, generics: e.message })); }
    finally { setLoading(l => ({ ...l, generics: false })); }
  };

  const checkMyMeds = async () => {
    const activeMeds = (data?.meds || []).filter(m => m.active !== false).map(m => m.name).filter(Boolean);
    if (activeMeds.length < 2) return;
    setInteractionLoading(true);
    try {
      setInteractionResults(await checkInteractionsByNames(activeMeds));
    } catch (e) {
      setInteractionResults({ error: e.message });
    } finally {
      setInteractionLoading(false);
    }
  };

  const renderLabel = () => {
    if (loading.label) return <Spinner />;
    if (errors.label) return <ErrorMsg msg={errors.label} />;
    if (!labelData?.length) return <NoResults />;
    const d = labelData[0];
    return (
      <div className="space-y-3">
        {d.generic_name && (
          <div className="text-xs text-salve-textFaint">
            Generic: <span className="text-salve-textMid">{d.generic_name}</span>
            {d.manufacturer && <> · {d.manufacturer}</>}
          </div>
        )}
        {d.indications && <InfoBlock title="Uses" content={d.indications} />}
        {d.warnings && <InfoBlock title="Warnings" content={d.warnings} color="rose" />}
        {d.dosage && <InfoBlock title="Dosage" content={d.dosage} />}
        {d.adverse_reactions && <InfoBlock title="Adverse Reactions" content={d.adverse_reactions} color="amber" />}
        {d.contraindications && <InfoBlock title="Contraindications" content={d.contraindications} color="rose" />}
        {d.drug_interactions && <InfoBlock title="Drug Interactions" content={d.drug_interactions} color="amber" />}
      </div>
    );
  };

  const renderRecalls = () => {
    if (loading.recalls) return <Spinner />;
    if (errors.recalls) return <ErrorMsg msg={errors.recalls} />;
    if (!recallData?.length) return <NoResults text="No active recalls found" />;
    return (
      <div className="space-y-2">
        {recallData.map((r, i) => (
          <Card key={i}>
            <div className="flex items-start gap-2">
              <FileWarning size={16} className="text-salve-rose mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-[13px] text-salve-text font-medium mb-1">{r.reason}</div>
                <div className="text-xs text-salve-textFaint">
                  {r.classification && <Badge label={r.classification} color={C.amber} bg="rgba(232,200,138,0.15)" />}
                  {r.status && <span className="ml-2">{r.status}</span>}
                  {r.date && <span className="ml-2">{r.date.slice(0, 4)}-{r.date.slice(4, 6)}-{r.date.slice(6, 8)}</span>}
                </div>
                {r.firm && <div className="text-xs text-salve-textFaint mt-1">{r.firm}</div>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderAdverse = () => {
    if (loading.adverse) return <Spinner />;
    if (errors.adverse) return <ErrorMsg msg={errors.adverse} />;
    if (!adverseData?.top_reactions?.length) return <NoResults text="No adverse event data found" />;
    return (
      <div>
        <div className="text-xs text-salve-textFaint mb-3">
          Based on {adverseData.total_reports?.toLocaleString()} FDA reports
          {adverseData.serious_count > 0 && <> · <span className="text-salve-rose">{adverseData.serious_count} serious</span> in sample</>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {adverseData.top_reactions.map((r, i) => (
            <span key={i} className="text-xs px-2.5 py-1 rounded-full border border-salve-border bg-salve-card2 text-salve-textMid">
              {r.name} <span className="text-salve-textFaint">({r.count})</span>
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderGenerics = () => {
    if (loading.generics) return <Spinner />;
    if (errors.generics) return <ErrorMsg msg={errors.generics} />;
    if (!genericsData?.length) return <NoResults text="No generic equivalents found" />;
    return (
      <div className="space-y-1.5">
        {genericsData.slice(0, 15).map((g, i) => (
          <div key={i} className="text-[13px] text-salve-textMid py-1.5 px-3 bg-salve-card2 rounded-lg border border-salve-border">
            {g.name}
            <span className="text-salve-textFaint text-[11px] ml-2">{g.tty}</span>
          </div>
        ))}
      </div>
    );
  };

  const activeMeds = (data?.meds || []).filter(m => m.active !== false);

  return (
    <div className="mt-2">
      <SectionTitle>Drug Information</SectionTitle>

      {/* Search */}
      <div className="relative mb-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="Search medication name..."
              className="w-full py-2.5 px-3.5 pl-9 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 focus:outline-none focus:border-salve-lav transition-colors"
            />
            <Search size={15} className="absolute left-3 top-3 text-salve-textFaint" />
          </div>
          <Button onClick={() => doSearch()} disabled={!query.trim()} className="!px-4">
            <Search size={14} />
          </Button>
        </div>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-salve-card2 border border-salve-border rounded-lg shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => doSearch(s)}
                className="w-full text-left px-3.5 py-2 text-sm text-salve-textMid hover:bg-salve-card cursor-pointer bg-transparent border-none font-montserrat">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick lookup from active meds */}
      {!searched && activeMeds.length > 0 && (
        <Card>
          <div className="text-[11px] font-semibold text-salve-textFaint uppercase tracking-widest mb-2">Your Medications</div>
          <div className="flex flex-wrap gap-1.5">
            {activeMeds.map(m => (
              <button key={m.id} onClick={() => doSearch(m.name)}
                className="text-xs px-3 py-1.5 rounded-full border border-salve-lav/30 bg-salve-lav/10 text-salve-lav cursor-pointer bg-transparent font-montserrat hover:bg-salve-lav/20 transition-colors">
                {m.name}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Check My Meds interaction button */}
      {activeMeds.length >= 2 && (
        <div className="mb-4">
          <Button variant="lavender" onClick={checkMyMeds} disabled={interactionLoading} className="w-full justify-center">
            {interactionLoading ? <><Loader2 size={14} className="animate-spin" /> Checking...</> : <><AlertTriangle size={14} /> Check All My Meds for Interactions</>}
          </Button>
          {interactionResults && !interactionResults.error && (
            <Card className="mt-2">
              <div className="text-[11px] font-semibold text-salve-textFaint uppercase tracking-widest mb-2">
                Interactions via National Library of Medicine
              </div>
              {interactionResults.length === 0 ? (
                <div className="text-sm text-salve-sage">No interactions found between your medications.</div>
              ) : (
                <div className="space-y-2">
                  {interactionResults.map((r, i) => (
                    <div key={i} className="text-[13px] p-2.5 bg-salve-card2 rounded-lg border-l-2 border-salve-amber">
                      <div className="font-medium text-salve-text mb-0.5">{r.drug1} + {r.drug2}</div>
                      <div className="text-salve-textMid text-xs">{r.description}</div>
                      {r.severity && r.severity !== 'N/A' && (
                        <Badge label={r.severity} color={C.amber} bg="rgba(232,200,138,0.15)" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
          {interactionResults?.error && <ErrorMsg msg={interactionResults.error} />}
        </div>
      )}

      {/* Tabs */}
      {searched && (
        <>
          <div className="flex gap-1.5 mb-3.5">
            {TABS.map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`py-1.5 px-3 rounded-full text-xs font-medium border cursor-pointer font-montserrat ${
                  activeTab === t ? 'border-salve-lav bg-salve-lav/15 text-salve-lav' : 'border-salve-border bg-transparent text-salve-textFaint'
                }`}
              >{TAB_LABELS[t]}</button>
            ))}
          </div>

          <Card>
            {activeTab === 'label' && renderLabel()}
            {activeTab === 'recalls' && renderRecalls()}
            {activeTab === 'adverse' && renderAdverse()}
            {activeTab === 'generics' && renderGenerics()}
          </Card>

          <p className="text-[11px] text-salve-textFaint text-center mt-3 font-montserrat leading-relaxed">
            Data from openFDA & NIH RxNorm. This is not medical advice. Always consult your healthcare providers.
          </p>
        </>
      )}

      {!searched && activeMeds.length === 0 && (
        <EmptyState icon={Pill} text="Search for any medication to see FDA label info, recalls, side effects, and generic alternatives" motif="leaf" />
      )}
    </div>
  );
}

function InfoBlock({ title, content, color }) {
  const borderColor = color === 'rose' ? 'border-salve-rose/40' : color === 'amber' ? 'border-salve-amber/40' : 'border-salve-border';
  const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
  return (
    <div className={`p-3 bg-salve-card2 rounded-lg border-l-2 ${borderColor}`}>
      <div className="text-[11px] font-semibold text-salve-textFaint uppercase tracking-widest mb-1">{title}</div>
      <div className="text-[13px] text-salve-textMid leading-relaxed whitespace-pre-line">{truncated}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 size={20} className="animate-spin text-salve-lav" />
    </div>
  );
}

function ErrorMsg({ msg }) {
  return (
    <div className="text-sm text-salve-rose py-4 text-center">
      <ShieldAlert size={18} className="inline mr-1.5 mb-0.5" />{msg}
    </div>
  );
}

function NoResults({ text = 'No results found' }) {
  return (
    <div className="text-sm text-salve-textFaint py-4 text-center">
      <Info size={16} className="inline mr-1 mb-0.5" />{text}
    </div>
  );
}
