import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ text, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 py-2 text-salve-textMid ${className}`}>
      <Loader2 size={18} className="animate-spin text-salve-lav" />
      {text && <span className="text-[13px] italic">{text}</span>}
    </div>
  );
}
