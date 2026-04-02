import { useState, useEffect } from 'react';
import { Eye, EyeOff, X, ChevronDown, MessageSquare } from 'lucide-react';
import { C } from '../../constants/colors';
import { buildProfile } from '../../services/profile';

const SECTION_COLORS = {
  'ACTIVE MEDICATIONS': C.sage,
  'DISCONTINUED MEDICATIONS': C.textFaint,
  'CONDITIONS & DIAGNOSES': C.lav,
  'ALLERGIES': C.rose,
  'RECENT VITALS': C.amber,
  'RECENT JOURNAL ENTRIES': C.lav,
  'INSURANCE': C.sage,
  'ADDITIONAL HEALTH BACKGROUND': C.textMid,
  'ABNORMAL LAB RESULTS': C.rose,
  'RECENT LAB RESULTS': C.sage,
  'RECENT PROCEDURES': C.amber,
  'IMMUNIZATIONS': C.sage,
  'CARE GAPS': C.amber,
  'ANESTHESIA FLAGS': C.rose,
  'SURGICAL PLANNING': C.lav,
  'INSURANCE APPEALS': C.amber,
};

function parseSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let currentHeader = null;
  let currentLines = [];
  let headerLines = [];

  for (const line of lines) {
    const match = line.match(/^— (.+?) —$/);
    if (match) {
      if (currentHeader) sections.push({ header: currentHeader, lines: currentLines });
      else if (headerLines.length) sections.push({ header: null, lines: headerLines });
      currentHeader = match[1];
      currentLines = [];
    } else if (currentHeader) {
      if (line.trim()) currentLines.push(line);
    } else {
      if (line.trim()) headerLines.push(line);
    }
  }
  if (currentHeader) sections.push({ header: currentHeader, lines: currentLines });
  else if (headerLines.length) sections.push({ header: null, lines: headerLines });

  return sections;
}

function colorForHeader(header) {
  if (!header) return C.textMid;
  for (const [key, color] of Object.entries(SECTION_COLORS)) {
    if (header.includes(key)) return color;
  }
  return C.lav;
}

export default function AIProfilePreview({ data }) {
  const [open, setOpen] = useState(false);
  const profile = buildProfile(data);
  const sections = parseSections(profile);
  const dataPoints = profile.split('\n').filter(l => l.startsWith('- ')).length;

  // Lock body scroll when panel is open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Small pill button */}
      <button
        onClick={() => setOpen(true)}
        className="group relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-medium font-montserrat cursor-pointer transition-all duration-200 bg-transparent border border-salve-sage/40 text-salve-sage hover:border-salve-sage hover:shadow-[0_0_12px_rgba(143,191,160,0.15)]"
      >
        <Eye size={12} strokeWidth={2} />
        <span>What Sage Sees</span>
        <span className="text-salve-textFaint">· {dataPoints}</span>
      </button>

      {/* Full-screen slide-up panel */}
      {open && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center" onClick={() => setOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Panel */}
          <div
            className="relative mt-auto w-full max-w-[480px] max-h-[85vh] bg-salve-bg rounded-t-2xl border-t border-x border-salve-border overflow-hidden flex flex-col animate-[slideUp_0.25s_ease-out]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-salve-border/50 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <Eye size={15} className="text-salve-sage" />
                <span className="text-[14px] font-semibold text-salve-text font-montserrat">What Sage Sees</span>
                <span className="text-[11px] text-salve-textFaint font-montserrat rounded-full bg-salve-card2 px-2 py-0.5">{dataPoints} data points</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="bg-salve-card2 border-none rounded-full p-1.5 cursor-pointer text-salve-textMid hover:text-salve-text transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-5 py-4 overscroll-contain">
              <p className="text-[11px] text-salve-textFaint italic mb-2 leading-relaxed">
                Health context sent to AI when you use any AI feature. Only shared when you explicitly trigger an AI action.
              </p>
              <p className="text-[11px] text-salve-lav/70 mb-4 leading-relaxed flex items-center gap-1.5">
                <MessageSquare size={11} className="flex-shrink-0" />
                <span>Need to update something? Tell the <strong className="text-salve-lav">AI Chat</strong> — e.g. "add Lexapro 10mg" or "remove my old pharmacy"</span>
              </p>

              {sections.map((sec, i) => {
                if (!sec.header && sec.lines.length === 0) return null;
                return (
                  <ProfileSection
                    key={i}
                    header={sec.header}
                    lines={sec.lines}
                    color={colorForHeader(sec.header)}
                    defaultOpen={i < 3}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProfileSection({ header, lines, color, defaultOpen }) {
  const [expanded, setExpanded] = useState(defaultOpen);

  if (!header) {
    return (
      <div className="mb-4">
        {lines.map((line, j) => (
          <div key={j} className="text-[12px] text-salve-textMid leading-relaxed">{line}</div>
        ))}
      </div>
    );
  }

  const count = lines.filter(l => l.startsWith('- ')).length;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0 py-2 group"
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color }}>
            {header}
          </span>
          {count > 0 && (
            <span className="text-[10px] text-salve-textFaint font-montserrat">{count}</span>
          )}
        </div>
        <ChevronDown size={14} className={`text-salve-textFaint transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="pl-3.5 pb-2 border-l border-salve-border/30 ml-[3px]">
          {lines.length === 0 ? (
            <div className="text-[11px] text-salve-textFaint italic py-1">(none)</div>
          ) : (
            lines.map((line, j) => (
              <div key={j} className="text-[12px] text-salve-textMid leading-relaxed py-0.5">
                {line}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
