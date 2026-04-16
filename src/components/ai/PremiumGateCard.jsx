import { ArrowRight } from 'lucide-react';
import { BILLING_ENABLED } from '../../services/billing';
import { FEATURES, PREMIUM_BENEFITS } from './constants';

export default function PremiumGateCard({ featureId }) {
  const f = FEATURES.find(ft => ft.id === featureId);
  const benefit = PREMIUM_BENEFITS[featureId];
  if (!f || !benefit) return null;
  const isAdmin = f.admin;
  const bgClass = benefit.accent === 'sage' ? 'bg-salve-sage/15' : benefit.accent === 'amber' ? 'bg-salve-amber/15' : benefit.accent === 'rose' ? 'bg-salve-rose/15' : 'bg-salve-lav/15';
  const textClass = benefit.accent === 'sage' ? 'text-salve-sage' : benefit.accent === 'amber' ? 'text-salve-amber' : benefit.accent === 'rose' ? 'text-salve-rose' : 'text-salve-lav';
  return (
    <div className="flex flex-col items-center py-6 px-4">
      <div className={`w-14 h-14 rounded-2xl ${bgClass} flex items-center justify-center mb-4`}>
        <f.icon size={28} className={textClass} strokeWidth={1.5} />
      </div>
      <h3 className="text-[18px] font-playfair font-semibold text-salve-text mb-2 text-center">{benefit.title}</h3>
      <p className="text-[14px] text-salve-textMid text-center leading-relaxed max-w-[320px] mb-5">{benefit.desc}</p>
      {!isAdmin && BILLING_ENABLED && (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-montserrat font-medium text-salve-lav bg-salve-lav/10 hover:bg-salve-lav/15 rounded-full px-4 py-2 transition-colors">
          Upgrade in Settings <ArrowRight size={13} />
        </span>
      )}
      {!isAdmin && !BILLING_ENABLED && (
        <p className="text-[13px] text-salve-textFaint text-center italic font-montserrat">Available with Premium — coming soon.</p>
      )}
      {isAdmin && (
        <p className="text-[13px] text-salve-textFaint text-center italic font-montserrat">Requires admin tier.</p>
      )}
    </div>
  );
}
