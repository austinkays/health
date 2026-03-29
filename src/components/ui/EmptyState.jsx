import Motif from './Motif';

export default function EmptyState({ icon: Icon, text, motif = 'moon', suggestions, onSuggestion }) {
  return (
    <div className="text-center py-12 px-6 text-salve-textFaint">
      <Motif type={motif} size={28} className="mb-2 block" />
      <Icon size={32} strokeWidth={1} className="mx-auto mb-2 opacity-35" />
      <div className="text-sm font-light leading-relaxed">{text}</div>
      {suggestions && suggestions.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] text-salve-textFaint uppercase tracking-widest mb-2">Suggested for you</div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestion?.(s)}
                className="text-[12px] text-salve-lav bg-salve-lav/10 border border-salve-lav/20 rounded-full px-3 py-1 cursor-pointer font-montserrat hover:bg-salve-lav/15 transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
