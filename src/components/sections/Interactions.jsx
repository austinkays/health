import { useState } from 'react';
import { AlertTriangle, Pill, CheckCircle, Globe, Loader2 } from 'lucide-react';
import Card from '../ui/Card';
import Badge, { SevBadge } from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import Motif from '../ui/Motif';
import Button from '../ui/Button';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { checkInteractionsByNames } from '../../services/rxnorm';

export default function Interactions({ interactions, meds }) {
  const active = meds.filter(m => m.active !== false);
  const [nlmResults, setNlmResults] = useState(null);
  const [nlmLoading, setNlmLoading] = useState(false);
  const [nlmError, setNlmError] = useState(null);

  const checkWithNLM = async () => {
    const names = active.map(m => m.name).filter(Boolean);
    if (names.length < 2) return;
    setNlmLoading(true); setNlmError(null);
    try {
      setNlmResults(await checkInteractionsByNames(names));
    } catch (e) {
      setNlmError(e.message);
    } finally {
      setNlmLoading(false);
    }
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

      {/* Static database results */}
      <div className="text-[11px] font-semibold text-salve-textFaint uppercase tracking-widest mb-2">Local Database</div>

      {interactions.length === 0 ? (
        <Card className="text-center !py-6">
          <CheckCircle size={28} className="mx-auto mb-2 text-salve-sage" />
          <div className="text-[13px] text-salve-sage font-medium mb-1">No known interactions</div>
          <div className="text-xs text-salve-textFaint">Your current medications have no flagged interactions in our database.</div>
        </Card>
      ) : (
        <>
          <div className="text-xs text-salve-textFaint mb-3 text-center">{interactions.length} interaction{interactions.length > 1 ? 's' : ''} found</div>
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

      {/* NLM / RxNorm online check */}
      {active.length >= 2 && (
        <div className="mt-5">
          <div className="text-[11px] font-semibold text-salve-textFaint uppercase tracking-widest mb-2">National Library of Medicine</div>
          {!nlmResults && !nlmLoading && (
            <Button variant="lavender" onClick={checkWithNLM} className="w-full justify-center">
              <Globe size={14} /> Check with NLM RxNorm
            </Button>
          )}
          {nlmLoading && (
            <Card className="text-center !py-6">
              <Loader2 size={22} className="mx-auto mb-2 text-salve-lav animate-spin" />
              <div className="text-xs text-salve-textFaint">Resolving drug names and checking interactions...</div>
            </Card>
          )}
          {nlmError && (
            <Card className="text-center !py-4">
              <div className="text-sm text-salve-rose mb-2">{nlmError}</div>
              <Button variant="ghost" onClick={checkWithNLM} className="!text-xs">Retry</Button>
            </Card>
          )}
          {nlmResults && !nlmError && (
            <>
              {nlmResults.length === 0 ? (
                <Card className="text-center !py-6">
                  <CheckCircle size={28} className="mx-auto mb-2 text-salve-sage" />
                  <div className="text-[13px] text-salve-sage font-medium mb-1">No interactions found</div>
                  <div className="text-xs text-salve-textFaint">NIH RxNorm reports no known interactions between your medications.</div>
                </Card>
              ) : (
                <>
                  <div className="text-xs text-salve-textFaint mb-3 text-center">{nlmResults.length} interaction{nlmResults.length > 1 ? 's' : ''} from NLM</div>
                  {nlmResults.map((r, i) => (
                    <Card key={i} style={{ borderLeft: `3px solid ${C.lav}` }}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[13px] font-semibold text-salve-text">{r.drug1} + {r.drug2}</span>
                        {r.severity && r.severity !== 'N/A' && (
                          <Badge label={r.severity} color={C.lav} bg="rgba(184,169,232,0.15)" />
                        )}
                      </div>
                      <div className="text-xs text-salve-textMid leading-relaxed">{r.description}</div>
                    </Card>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      <p className="text-[10px] text-salve-textFaint italic text-center mt-3">
        <Motif type="star" size={10} color={C.textFaint} style={{ marginRight: 4 }} />
        This checks a limited database of common interactions. Always verify with your pharmacist.
      </p>
    </div>
  );
}
