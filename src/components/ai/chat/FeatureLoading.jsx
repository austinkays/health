import { Leaf, Loader2 } from 'lucide-react';
import useWellnessMessage from '../../../hooks/useWellnessMessage';

export default function FeatureLoading({ ready, onReveal }) {
  const { message, key } = useWellnessMessage();
  return (
    <div className="rounded-xl border border-salve-border bg-salve-card text-center py-12 px-6 breathe-container">
      <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-salve-lav/30 breathe-ring" />
        <div className="absolute -inset-2 rounded-full border border-salve-lav/15 breathe-ring" style={{ animationDelay: '1.5s' }} />
        <Leaf size={30} className="breathe-icon text-salve-sage" />
      </div>
      <p className="text-[13px] text-salve-textFaint/60 font-montserrat tracking-widest uppercase mb-4">Breathe with me</p>
      <div key={key} className="wellness-msg text-[15px] text-salve-textMid font-montserrat italic mb-5" role="status" aria-live="polite">{message}</div>
      <div className="relative h-10 flex items-center justify-center">
        <div className={`flex items-center justify-center gap-2 text-salve-textFaint/40 transition-opacity duration-1000 ${ready ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <Loader2 size={12} className="animate-spin" />
          <span className="text-[12px] font-montserrat tracking-wider uppercase">Sage is thinking</span>
        </div>
        {ready && (
          <button
            onClick={onReveal}
            className="absolute inset-0 m-auto w-fit inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-salve-lav/25 bg-salve-lav/8 text-salve-lav text-xs font-montserrat font-medium tracking-wide cursor-pointer transition-all duration-300 hover:bg-salve-lav/15 hover:border-salve-lav/40 ready-reveal"
            aria-label="View your insight"
          >
            <Leaf size={14} />
            Sage has your insight
          </button>
        )}
      </div>
    </div>
  );
}
