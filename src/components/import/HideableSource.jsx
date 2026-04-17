import { X } from 'lucide-react';

export default function HideableSource({ id, label, hiddenSources, onHide, children }) {
  if (hiddenSources.includes(id)) return null;
  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onHide(id); }}
        aria-label={`Hide ${label}`}
        title={`Hide ${label}`}
        className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center bg-salve-card2/90 backdrop-blur-sm text-salve-textFaint hover:text-salve-rose hover:bg-salve-rose/15 transition-colors cursor-pointer border-none p-0"
      >
        <X size={11} />
      </button>
    </div>
  );
}
