import { useState, useMemo } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';
import AIMarkdown from '../../ui/AIMarkdown';
import { C } from '../../../constants/colors';
import { ResultHeader, Disclaimer } from '../SharedButtons';
import SourcesBadges from '../SourcesBadges';
import { stripDisclaimer, splitSections } from '../helpers';

function AccordionSection({ title, content, defaultOpen = false, index }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="card-hover rounded-xl border border-salve-rose/15 bg-salve-card overflow-hidden dash-stagger"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left bg-transparent border-none cursor-pointer"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <HelpCircle size={15} className="text-salve-rose flex-shrink-0" strokeWidth={1.5} />
          <span className="text-[15px] font-semibold text-salve-text font-montserrat">{title}</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-salve-textFaint transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`accordion-content ${open ? 'accordion-open' : 'accordion-closed'}`}
      >
        <div className="border-l-[3px] border-salve-rose/40 mx-4 mb-4 pl-4 pt-0 [&_h3]:border-t [&_h3]:border-salve-border/30 [&_h3]:pt-2.5 [&_h3]:mt-3 [&_h3:first-child]:border-0 [&_h3:first-child]:pt-0 [&_h3:first-child]:mt-0">
          <AIMarkdown reveal>{content.trim()}</AIMarkdown>
        </div>
      </div>
    </div>
  );
}

export default function ResourcesResult({ result, savedInsights, insightRatings }) {
  const text = typeof result === 'string' ? result : result?.text;
  const sources = typeof result === 'object' ? result?.sources : [];
  const sections = useMemo(() => splitSections(text), [text]);

  // Fallback: single card if we can't parse sections
  if (sections.length <= 1) {
    return (
      <div>
        <ResultHeader icon={HelpCircle} label="Resources" color={C.rose} text={text} featureType="resources" savedInsights={savedInsights} insightRatings={insightRatings} />
        <div className="rounded-xl border border-salve-rose/20 bg-salve-rose/5 overflow-hidden">
          <div className="border-l-[3px] border-salve-rose/40 p-4 pl-5">
            <AIMarkdown>{stripDisclaimer(text)}</AIMarkdown>
          </div>
        </div>
        <SourcesBadges sources={sources} />
        <Disclaimer />
      </div>
    );
  }

  // Parse heading from each section
  const parsed = sections.map(s => {
    const match = s.match(/^##\s+(.+?)[\n\r]/);
    const title = match ? match[1].trim() : 'Resources';
    const content = match ? s.replace(/^##\s+.+?[\n\r]/, '') : s;
    return { title, content };
  });

  return (
    <div>
      <ResultHeader icon={HelpCircle} label="Resources" color={C.rose} text={text} featureType="resources" savedInsights={savedInsights} insightRatings={insightRatings} />
      <div className="flex flex-col gap-2.5">
        {parsed.map((section, i) => (
          <AccordionSection
            key={i}
            index={i}
            title={section.title}
            content={section.content}
            defaultOpen={i === 0}
          />
        ))}
      </div>
      <SourcesBadges sources={sources} />
      <Disclaimer />
    </div>
  );
}
