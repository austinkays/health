import { useMemo } from 'react';
import { BadgeDollarSign } from 'lucide-react';
import AIMarkdown from '../../ui/AIMarkdown';
import { C } from '../../../constants/colors';
import { ResultHeader, Disclaimer } from '../SharedButtons';
import SourcesBadges from '../SourcesBadges';
import { stripDisclaimer, splitSections } from '../helpers';

export default function CostResult({ result, savedInsights, insightRatings }) {
  const text = typeof result === 'string' ? result : result?.text;
  const sources = typeof result === 'object' ? result?.sources : [];
  const sections = useMemo(() => splitSections(text), [text]);

  if (sections.length <= 1) {
    return (
      <div>
        <ResultHeader icon={BadgeDollarSign} label="Cost Savings" color={C.sage} text={text} featureType="costs" savedInsights={savedInsights} insightRatings={insightRatings} />
        <div className="rounded-xl border border-salve-sage/20 bg-salve-sage/5 overflow-hidden">
          <div className="border-l-[3px] border-salve-sage/40 p-4 pl-5">
            <AIMarkdown>{stripDisclaimer(text)}</AIMarkdown>
          </div>
        </div>
        <SourcesBadges sources={sources} />
        <Disclaimer />
      </div>
    );
  }

  const parsed = sections.map(s => {
    const match = s.match(/^##\s+(.+?)[\n\r]/);
    const title = match ? match[1].trim() : 'Savings';
    const content = match ? s.replace(/^##\s+.+?[\n\r]/, '') : s;
    return { title, content };
  });

  return (
    <div>
      <ResultHeader icon={BadgeDollarSign} label="Cost Savings" color={C.sage} text={text} featureType="costs" savedInsights={savedInsights} insightRatings={insightRatings} />
      <div className="flex flex-col gap-2.5">
        {parsed.map((section, i) => (
          <div
            key={i}
            className="card-hover rounded-xl border border-salve-sage/15 bg-salve-card overflow-hidden dash-stagger"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <div className="border-l-[3px] border-salve-sage/40 p-4 pl-5">
              <div className="flex items-center gap-2 mb-2">
                <BadgeDollarSign size={13} className="text-salve-sage shrink-0" strokeWidth={1.8} />
                <span className="text-[15px] font-semibold text-salve-text font-montserrat">{section.title}</span>
              </div>
              <AIMarkdown reveal>{section.content.trim()}</AIMarkdown>
            </div>
          </div>
        ))}
      </div>
      <SourcesBadges sources={sources} />
      <Disclaimer />
    </div>
  );
}
