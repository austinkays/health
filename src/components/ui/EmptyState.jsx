import Motif from './Motif';

/**
 * Warm, action-oriented empty state for section pages.
 *
 * Props:
 *   icon       — lucide icon component
 *   text       — headline (e.g. "No medications yet") — supports `message` alias for legacy callers
 *   hint       — optional one-line descriptive subtext
 *   motif      — decorative motif ('moon', 'star', 'leaf', 'sparkle')
 *   actionLabel — optional CTA button label (e.g. "Add your first medication")
 *   onAction   — click handler for the CTA button
 */
export default function EmptyState({ icon: Icon, text, message, hint, motif = 'moon', actionLabel, onAction }) {
  const headline = text || message;
  return (
    <div className="text-center py-12 px-6 text-salve-textFaint">
      <Motif type={motif} size={28} className="mb-2 block" />
      <Icon size={32} strokeWidth={1} className="mx-auto mb-3 opacity-35" />
      <div className="text-ui-lg font-light leading-relaxed text-salve-textMid">{headline}</div>
      {hint && (
        <div className="text-ui-base font-light leading-relaxed text-salve-textFaint mt-1.5 max-w-[320px] mx-auto">
          {hint}
        </div>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="cta-lift mt-5 inline-flex items-center gap-1.5 bg-salve-lav/15 border border-salve-lav/35 text-salve-lav font-medium rounded-full px-4 py-2 text-ui-base font-montserrat cursor-pointer hover:bg-salve-lav/25"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
