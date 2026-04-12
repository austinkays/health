import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ text, className = '' }) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-2.5 py-2 text-salve-textMid ${className}`}>
      <Loader2 size={18} className="animate-spin text-salve-lav" aria-hidden="true" />
      {text && <span className="text-[15px] italic">{text}</span>}
      {!text && <span className="sr-only">Loading</span>}
    </div>
  );
}
