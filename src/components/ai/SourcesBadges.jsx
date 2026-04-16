import { useState } from 'react';
import { ExternalLink, ChevronDown } from 'lucide-react';

export default function SourcesBadges({ sources }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources?.length) return null;
  return (
    <div className="mt-4 pt-3 border-t border-salve-border/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[12px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-textMid transition-colors"
      >
        <ExternalLink size={9} />
        <span>{sources.length} source{sources.length !== 1 ? 's' : ''} referenced</span>
        <ChevronDown size={10} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-1">
          {sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-salve-textFaint hover:text-salve-lav transition-colors font-montserrat truncate no-underline hover:underline"
            >
              {s.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
