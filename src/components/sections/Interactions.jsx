import { useState } from 'react';
import { AlertTriangle, Pill, CheckCircle, Loader, RefreshCw } from 'lucide-react';
import Card from '../ui/Card';
import { SevBadge } from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import Motif from '../ui/Motif';
import { C } from '../../constants/colors';
import { drugInteractions } from '../../services/drugs';

export default function Interactions({ interactions, meds }) {
  const active = meds.filter(m => m.active !== false);
  const rxcuiMeds = active.filter(m => m.rxcui);
  const [liveResults, setLiveResults] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const [liveChecked, setLiveChecked] = useState(false);

  const checkLive = async () => {
    if (rxcuiMeds.length < 2) return;
    setLiveLoading(true);
    setLiveError(null);
    try {
      const rxcuis = rxcuiMeds.map(m => m.rxcui);
      const results = await drugInteractions(rxcuis);
      setLiveResults(results);
      setLiveChecked(true);
    } catch (e) {
      setLiveError('Could not fetch live interactions');
    } finally {
      setLiveLoading(false);
    }
  };

  return (
    <div className="mt-2">

      <Card className="!p-3.5 mb-4">
        <div className="text-xs text-salve-textMid mb-2">Active medications being checked:</div>
        <div className="flex flex-wrap gap-1.5">
          {active.length === 0 ? (
            <span className="text-xs text-salve-textFaint italic">No active medications</span>
          ) : active.map(m => (
            <span key={m.id} className="bg-salve-card2 border border-salve-border rounded-full px-2.5 py-0.5 text-[11px] text-salve-text flex items-center gap-1">
              <Pill size={10} /> {m.name}
              {m.rxcui && <span className="text-[9px] text-salve-sage" title="Has RxCUI, eligible for live NLM interaction checking">✓</span>}
            </span>
          ))}
        </div>
        {rxcuiMeds.length >= 2 && (
          <button
            onClick={checkLive}
            disabled={liveLoading}
            className="mt-2.5 bg-salve-card2 border border-salve-border rounded-lg px-3 py-1.5 text-[11px] text-salve-lav font-montserrat cursor-pointer flex items-center gap-1.5 hover:border-salve-lav/40 transition-colors disabled:opacity-50"
          >
            {liveLoading ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            {liveLoading ? 'Checking NLM Database...' : liveChecked ? 'Re-check NLM Interactions' : 'Check NLM Interactions'}
          </button>
        )}
        {liveError && <div className="text-[11px] text-salve-rose mt-1.5">{liveError}</div>}
      </Card>

      {/* Live NLM Interaction Results */}
      {liveResults.length > 0 && (
        <>
          <div className="text-[11px] font-semibold text-salve-lav uppercase tracking-widest mb-2 flex items-center gap-1.5">
            NLM Database Results
            <span className="text-[9px] font-normal normal-case text-salve-textFaint tracking-normal">via National Library of Medicine</span>
          </div>
          <div className="md:grid md:grid-cols-2 md:gap-4">{liveResults.map((r, i) => (
            <Card key={`live-${i}`} style={{ borderLeft: `3px solid ${r.severity === 'danger' ? C.rose : r.severity === 'caution' ? C.amber : C.sage}` }}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[13px] font-semibold text-salve-text">{r.pair || 'Interaction'}</span>
                <SevBadge severity={r.severity || 'caution'} />
              </div>
              <div className="text-xs text-salve-textMid leading-relaxed">{r.description}</div>
              <div className="text-[9px] text-salve-textFaint mt-1.5">Source: NLM RxNorm</div>
            </Card>
          ))}</div>
          {interactions.length > 0 && <div className="h-px bg-salve-border my-3" />}
        </>
      )}

      {liveChecked && liveResults.length === 0 && (
        <Card className="text-center !py-4 mb-3">
          <CheckCircle size={22} className="mx-auto mb-1.5 text-salve-sage" />
          <div className="text-xs text-salve-sage font-medium">No interactions found in NLM database</div>
        </Card>
      )}

      {/* Static Local Interaction Results */}
      {interactions.length > 0 && (
        <div className="text-[11px] font-semibold text-salve-amber uppercase tracking-widest mb-2">Local Database</div>
      )}

      {interactions.length === 0 && !liveChecked ? (
        <Card className="text-center !py-6">
          <CheckCircle size={28} className="mx-auto mb-2 text-salve-sage" />
          <div className="text-[13px] text-salve-sage font-medium mb-1">No known interactions</div>
          <div className="text-xs text-salve-textFaint">Your current medications have no flagged interactions in our database.</div>
        </Card>
      ) : interactions.length > 0 ? (
        <>
          <div className="text-xs text-salve-textFaint mb-3 text-center">{interactions.length} interaction{interactions.length > 1 ? 's' : ''} found</div>
          <div className="md:grid md:grid-cols-2 md:gap-4">{interactions.map((w, i) => (
            <Card key={i} style={{ borderLeft: `3px solid ${w.severity === 'danger' ? C.rose : w.severity === 'caution' ? C.amber : C.sage}` }}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[13px] font-semibold text-salve-text">{w.medA} + {w.medB}</span>
                <SevBadge severity={w.severity} />
              </div>
              <div className="text-xs text-salve-textMid leading-relaxed">{w.msg}</div>
            </Card>
          ))}</div>
        </>
      ) : null}

      <p className="text-[10px] text-salve-textFaint italic text-center mt-3">
        <Motif type="star" size={10} color={C.textFaint} style={{ marginRight: 4 }} />
        This checks a limited local database and optionally the NLM RxNorm database. Always verify with your pharmacist.
      </p>
    </div>
  );
}
