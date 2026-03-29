import { AlertTriangle, Pill, CheckCircle, ShieldAlert, Loader2 } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { SevBadge } from '../ui/Badge';
import Motif from '../ui/Motif';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { hasAIConsent } from '../ui/AIConsentGate';

const CATEGORY_LABELS = {
  'drug-drug': 'Drug-Drug',
  'drug-condition': 'Drug-Condition',
  'drug-allergy': 'Drug-Allergy',
  'duplicate-therapy': 'Duplicate Therapy',
  'missing-med': 'Missing Medication',
  'dosage': 'Dosage',
  'vitals-correlation': 'Vitals Trend',
  'care-gap': 'Care Gap',
};

export default function Interactions({ interactions, meds, safetyScan }) {
  const active = meds.filter(m => m.active !== false);

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

      <p className="text-[10px] text-salve-textFaint italic text-center mt-3">
        <Motif type="star" size={10} color={C.textFaint} style={{ marginRight: 4 }} />
        This checks a limited database of common interactions. Always verify with your pharmacist.
      </p>

      {/* AI Safety Analysis Section */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} color={C.lav} />
            <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0">AI Safety Analysis</h2>
          </div>
          {safetyScan.lastRun && (
            <span className="text-[10px] text-salve-textFaint">
              {new Date(safetyScan.lastRun).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>

        {safetyScan.loading ? (
          <Card className="text-center !py-6">
            <Loader2 size={24} className="animate-spin mx-auto mb-2 text-salve-lav" />
            <div className="text-[13px] text-salve-textMid">Analyzing your full health profile...</div>
          </Card>
        ) : safetyScan.error ? (
          <Card className="!border-salve-rose/30">
            <div className="text-[13px] text-salve-rose">{safetyScan.error}</div>
          </Card>
        ) : safetyScan.results ? (
          safetyScan.results.length === 0 ? (
            <Card className="text-center !py-5">
              <CheckCircle size={24} className="mx-auto mb-2 text-salve-sage" />
              <div className="text-[13px] text-salve-sage font-medium mb-1">No additional concerns found</div>
              <div className="text-xs text-salve-textFaint">AI analysis found no issues beyond the static database checks above.</div>
            </Card>
          ) : (
            <>
              <div className="text-xs text-salve-textFaint mb-3 text-center">
                {safetyScan.results.length} finding{safetyScan.results.length > 1 ? 's' : ''} from AI analysis
              </div>
              {safetyScan.results.map((f, i) => (
                <Card key={i} style={{ borderLeft: `3px solid ${f.severity === 'danger' ? C.rose : f.severity === 'caution' ? C.amber : C.sage}` }}>
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-[13px] font-semibold text-salve-text">{f.title}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: 'rgba(184,169,232,0.15)', color: C.lav }}>AI</span>
                      <SevBadge severity={f.severity} />
                    </div>
                  </div>
                  <div className="text-[10px] text-salve-textFaint mb-1.5 uppercase tracking-wider">
                    {CATEGORY_LABELS[f.category] || f.category}
                  </div>
                  <div className="text-xs text-salve-textMid leading-relaxed mb-2">{f.detail}</div>
                  <div className="flex flex-wrap gap-1">
                    {f.involved.map((item, j) => (
                      <span key={j} className="bg-salve-card2 border border-salve-border rounded-full px-2 py-0.5 text-[10px] text-salve-textMid">
                        {item}
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </>
          )
        ) : null}

        {hasAIConsent() ? (
          <div className="text-center mt-3">
            <Button variant="lavender" onClick={safetyScan.runScan} disabled={safetyScan.loading} className="!text-xs !py-1.5">
              <ShieldAlert size={13} /> {safetyScan.results ? 'Re-scan' : 'Run Safety Scan'}
            </Button>
          </div>
        ) : (
          <Card className="text-center !py-4 mt-2">
            <div className="text-[12px] text-salve-textFaint italic">Enable AI features in the AI tab to use safety scanning.</div>
          </Card>
        )}

        <p className="text-[10px] text-salve-textFaint italic text-center mt-3">
          <Motif type="sparkle" size={10} color={C.textFaint} style={{ marginRight: 4 }} />
          AI analysis is not a substitute for professional medical or pharmaceutical review.
        </p>
      </div>
    </div>
  );
}
