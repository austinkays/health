import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Card from './Card';
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

  return (
    <Card className="!mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0"
      >
        <div className="flex items-center gap-2">
          {open ? <EyeOff size={14} className="text-salve-lav" /> : <Eye size={14} className="text-salve-lav" />}
          <span className="text-[13px] font-semibold text-salve-text font-montserrat">
            What AI Sees
          </span>
          <span className="text-[11px] text-salve-textFaint font-montserrat">
            ({dataPoints} data points)
          </span>
        </div>
        <span className="text-[11px] text-salve-lav font-montserrat">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-salve-border/50">
          <p className="text-[11px] text-salve-textFaint italic mb-3 leading-relaxed">
            This is the health context sent to AI when you use any AI feature. Only shared when you explicitly trigger an AI action.
          </p>
          {sections.map((sec, i) => (
            <div key={i} className="mb-3">
              {sec.header && (
                <div
                  className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                  style={{ color: colorForHeader(sec.header) }}
                >
                  {sec.header}
                </div>
              )}
              {sec.lines.length === 0 && sec.header && (
                <div className="text-[11px] text-salve-textFaint italic">(none)</div>
              )}
              {sec.lines.map((line, j) => (
                <div key={j} className="text-[11px] text-salve-textMid leading-relaxed">
                  {line}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
