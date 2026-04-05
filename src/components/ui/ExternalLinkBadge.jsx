import { ExternalLink } from 'lucide-react';

export default function ExternalLinkBadge({ url, label }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative inline-flex items-center gap-1 text-salve-lav hover:text-salve-text text-xs font-medium transition-colors"
      aria-label={label ? `${label} (opens external site)` : 'External link (opens external site)'}
    >
      <ExternalLink size={13} strokeWidth={1.8} className="shrink-0" />
      {label && <span>{label}</span>}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-salve-card2 border border-salve-border px-2 py-1 text-[10px] text-salve-textMid opacity-0 group-hover:opacity-100 transition-opacity"
      >
        You&rsquo;re leaving Salve
      </span>
    </a>
  );
}
