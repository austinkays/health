import { useState, useCallback } from 'react';
import { AlertTriangle, Pill, CheckCircle, Search, Loader2, Database } from 'lucide-react';
import Card from '../ui/Card';
import { SevBadge } from '../ui/Badge';
import Motif from '../ui/Motif';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { checkLiveInteractions } from '../../services/drugLookup';

export default function Interactions({ interactions, meds }) {
  const active = meds.filter(m => m.active !== false);

  // Live interaction state
  const [liveInteractions, setLiveInteractions] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveChecked, setLiveChecked] = useState(false);
  const [liveError, setLiveError] = useState(null);

  const runLiveCheck = useCallback(async () => {
    const names = active.map(m => m.name).filter(Boolean);
    if (names.length < 2) return;

    setLiveLoading(true);
    setLiveError(null);
    try {
      const result = await checkLiveInteractions(names);
      setLiveInteractions(result.interactions || []);
      setLiveChecked(true);
    } catch (e) {
      setLiveError(e.message || 'Failed to check interactions');
    } finally {
      setLiveLoading(false);
    }
  }, [active]);

  // Map NLM severity to our severity levels
  const mapSeverity = (sev) => {
    if (!sev) return 'info';
    const lower = sev.toLowerCase();
    if (lower.includes('high') || lower.includes('critical')) return 'danger';
    if (lower.includes('moderate') || lower.includes('significant')) return 'caution';
    return 'info';
  };

  return (
    <div className="mt-2">
      <SectionTitle>Drug Interaction Checker</SectionTitle>

      <Card className="!p-3.5 mb-4">
        <div className="text-xs text-salve-textMid mb-2">Active medications being checked:</div>
        <div className="flex flex-wrap gap-1.5">
          {active.length === 0 ? (
            <span className="text-xs text-salve-textFaint italic">No active medications</span>
          ) : active.map(m => (
            <span key={m.id} className="bg-salve-card2 border border-salve-border rounded-full px-2.5 py-0.5 text-[11px] text-salve-text flex items-center gap-1">
              <Pill size={10} /> {m.name}
            </span>
          ))}
        </div>
      </Card>

      {/* Static interaction results */}
      <div className="flex items-center gap-1.5 mb-2 mt-5">
        <Database size={12} className="text-salve-textFaint" />
        <span className="text-[10px] font-semibold text-salve-textFaint uppercase tracking-wider">Built-in Database</span>
      </div>

      {interactions.length === 0 ? (
        <Card className="text-center !py-4">
          <CheckCircle size={22} className="mx-auto mb-1.5 text-salve-sage" />
          <div className="text-[13px] text-salve-sage font-medium">No known interactions</div>
          <div className="text-[11px] text-salve-textFaint">No flagged interactions in the built-in database.</div>
        </Card>
      ) : (
        <>
          <div className="text-xs text-salve-textFaint mb-2 text-center">{interactions.length} interaction{interactions.length > 1 ? 's' : ''} found</div>
          {interactions.map((w, i) => (
            <Card key={i} style={{ borderLeft: `3px solid ${w.severity === 'danger' ? C.rose : w.severity === 'caution' ? C.amber : C.sage}` }}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[13px] font-semibold text-salve-text">{w.medA} + {w.medB}</span>
                <SevBadge severity={w.severity} />
              </div>
              <div className="text-xs text-salve-textMid leading-relaxed">{w.msg}</div>
            </Card>
          ))}
        </>
      )}

      {/* Live NLM interaction check */}
      <div className="flex items-center gap-1.5 mb-2 mt-6">
        <Search size={12} className="text-salve-lav" />
        <span className="text-[10px] font-semibold text-salve-lav uppercase tracking-wider">NLM Drug Interaction Database</span>
      </div>

      {!liveChecked ? (
        <button
          onClick={runLiveCheck}
          disabled={liveLoading || active.length < 2}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-salve-lav/40 text-salve-lav text-xs font-medium bg-transparent cursor-pointer hover:bg-salve-lav/5 transition-colors font-montserrat disabled:opacity-40"
        >
          {liveLoading ? (
            <><Loader2 size={14} className="animate-spin" /> Checking NLM database...</>
          ) : active.length < 2 ? (
            <>Need at least 2 active medications to check</>
          ) : (
            <><Search size={14} /> Check NLM Interaction Database</>
          )}
        </button>
      ) : (
        <>
          {liveInteractions.length === 0 ? (
            <Card className="text-center !py-4">
              <CheckCircle size={22} className="mx-auto mb-1.5 text-salve-sage" />
              <div className="text-[13px] text-salve-sage font-medium">No additional interactions found</div>
              <div className="text-[11px] text-salve-textFaint">NLM database found no interactions beyond the built-in check.</div>
            </Card>
          ) : (
            <>
              <div className="text-xs text-salve-textFaint mb-2 text-center">
                {liveInteractions.length} interaction{liveInteractions.length > 1 ? 's' : ''} from NLM database
              </div>
              {liveInteractions.map((inter, i) => {
                const sev = mapSeverity(inter.severity);
                return (
                  <Card key={i} style={{ borderLeft: `3px solid ${sev === 'danger' ? C.rose : sev === 'caution' ? C.amber : C.sage}` }}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[13px] font-semibold text-salve-text">{inter.drugA} + {inter.drugB}</span>
                      <SevBadge severity={sev} />
                    </div>
                    <div className="text-xs text-salve-textMid leading-relaxed">{inter.description}</div>
                    <div className="text-[10px] text-salve-textFaint mt-1 italic">Source: {inter.source}</div>
                  </Card>
                );
              })}
            </>
          )}

          <button
            onClick={runLiveCheck}
            disabled={liveLoading}
            className="w-full flex items-center justify-center gap-1.5 py-2 mt-2 text-salve-lav text-[11px] bg-transparent border-none cursor-pointer font-montserrat hover:underline disabled:opacity-40"
          >
            {liveLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Re-check
          </button>
        </>
      )}

      {liveError && (
        <div className="mt-2 p-2.5 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-xs">
          {liveError}
        </div>
      )}

      <p className="text-[10px] text-salve-textFaint italic text-center mt-4">
        <Motif type="star" size={10} color={C.textFaint} style={{ marginRight: 4 }} />
        Always verify drug interactions with your pharmacist or healthcare provider.
      </p>
    </div>
  );
}
