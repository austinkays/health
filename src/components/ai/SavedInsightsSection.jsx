import { useState } from 'react';
import { Bookmark, ChevronDown } from 'lucide-react';
import AIMarkdown from '../ui/AIMarkdown';
import { C } from '../../constants/colors';

export default function SavedInsightsSection({ savedInsights }) {
  const [open, setOpen] = useState(false);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const featureColors = { insight: C.lav, connections: C.sage, news: C.amber, resources: C.rose, costs: C.sage, cycle_patterns: C.rose };
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-[14px] text-salve-textMid font-montserrat bg-transparent border-none cursor-pointer py-2"
      >
        <span className="flex items-center gap-1.5">
          <Bookmark size={13} className="text-salve-lav" />
          Saved Insights ({savedInsights.saved.length})
        </span>
        <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 mt-1">
          {savedInsights.saved.map((s, i) => {
            const isExpanded = expandedIdx === i;
            const isLong = s.text.length > 200;
            return (
              <div key={i} className="rounded-xl border bg-salve-card p-3.5" style={{ borderColor: (featureColors[s.type] || C.lav) + '25' }}>
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-[12px] font-montserrat font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ color: featureColors[s.type] || C.lav, background: (featureColors[s.type] || C.lav) + '15' }}>{s.label}</span>
                  <span className="flex-1" />
                  <button onClick={() => setConfirmIdx(i)} className="flex-shrink-0 bg-transparent border-none cursor-pointer p-0.5" aria-label="Remove saved insight">
                    <Bookmark size={13} className="text-salve-lav fill-salve-lav" strokeWidth={1.5} />
                  </button>
                </div>
                {confirmIdx === i && (
                  <div className="flex items-center gap-2 mb-1.5 px-1 py-1.5 rounded-lg bg-salve-lav/10 border border-salve-lav/20">
                    <span className="flex-1 text-[13px] text-salve-lav font-montserrat">Remove saved insight?</span>
                    <button onClick={() => { savedInsights.remove(i); setConfirmIdx(null); }} className="text-[13px] text-salve-rose font-semibold bg-transparent border-none cursor-pointer font-montserrat">Remove</button>
                    <button onClick={() => setConfirmIdx(null)} className="text-[13px] text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Cancel</button>
                  </div>
                )}
                {isExpanded ? (
                  <AIMarkdown compact>{s.text}</AIMarkdown>
                ) : (
                  <div className="text-[14px] text-salve-textMid leading-relaxed font-montserrat line-clamp-3">
                    {s.text.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/^- /gm, '').replace(/^\d+\.\s/gm, '').slice(0, 250)}
                  </div>
                )}
                <div className="flex items-center justify-between mt-1.5">
                  <div className="text-[9px] text-salve-textFaint">Saved {new Date(s.savedAt).toLocaleDateString()}</div>
                  {isLong && (
                    <button
                      onClick={() => setExpandedIdx(isExpanded ? null : i)}
                      className="text-[12px] text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline"
                    >
                      {isExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
