import { AlertTriangle, Pill, CheckCircle } from 'lucide-react';
import Card from '../ui/Card';
import { SevBadge } from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import Motif from '../ui/Motif';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';

export default function Interactions({ interactions, meds }) {
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
    </div>
  );
}
