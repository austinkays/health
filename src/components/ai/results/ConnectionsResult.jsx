import { useMemo } from 'react';
import { Link } from 'lucide-react';
import AIMarkdown from '../../ui/AIMarkdown';
import { C } from '../../../constants/colors';
import { ResultHeader, Disclaimer } from '../SharedButtons';
import { stripDisclaimer, splitSections } from '../helpers';

export default function ConnectionsResult({ result, savedInsights, insightRatings }) {
  const text = typeof result === 'string' ? result : result?.text;
  const sections = useMemo(() => splitSections(text), [text]);

  // Single section fallback
  if (sections.length <= 1) {
    return (
      <div>
        <ResultHeader icon={Link} label="Health Connections" color={C.sage} text={text} featureType="connections" savedInsights={savedInsights} insightRatings={insightRatings} />
        <div className="rounded-xl border border-salve-sage/20 bg-salve-sage/5 overflow-hidden">
          <div className="border-l-[3px] border-salve-sage/40 p-4 pl-5">
            <AIMarkdown>{stripDisclaimer(text)}</AIMarkdown>
          </div>
        </div>
        <Disclaimer />
      </div>
    );
  }

  // Parse heading from each section
  const parsed = sections.map(s => {
    const match = s.match(/^##\s+(.+?)[\n\r]/);
    const title = match ? match[1].trim() : null;
    const content = match ? s.replace(/^##\s+.+?[\n\r]/, '') : s;
    return { title, content };
  });

  return (
    <div>
      <ResultHeader icon={Link} label="Health Connections" color={C.sage} text={text} featureType="connections" savedInsights={savedInsights} insightRatings={insightRatings} />
      <div className="flex flex-col gap-2.5">
        {parsed.map((section, i) => (
          <div
            key={i}
            className="card-hover rounded-xl border border-salve-sage/15 bg-salve-card overflow-hidden dash-stagger"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <div className="border-l-[3px] border-salve-sage/40 p-4 pl-5">
              {section.title && (
                <div className="flex items-center gap-2 mb-2">
                  <Link size={13} className="text-salve-sage shrink-0" strokeWidth={1.8} />
                  <span className="text-[15px] font-semibold text-salve-text font-montserrat">{section.title}</span>
                </div>
              )}
              <AIMarkdown reveal>{section.content.trim()}</AIMarkdown>
            </div>
          </div>
        ))}
      </div>
      <Disclaimer />
    </div>
  );
}
