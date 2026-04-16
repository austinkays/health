import { Sparkles } from 'lucide-react';
import AIMarkdown from '../../ui/AIMarkdown';
import { C } from '../../../constants/colors';
import { ResultHeader, Disclaimer } from '../SharedButtons';
import { stripDisclaimer } from '../helpers';

export default function InsightResult({ result, savedInsights, insightRatings }) {
  const text = typeof result === 'string' ? result : result?.text;
  const cleaned = stripDisclaimer(text);

  return (
    <div>
      <ResultHeader icon={Sparkles} label="Health Insight" color={C.lav} text={text} featureType="insight" savedInsights={savedInsights} insightRatings={insightRatings} />
      <div className="rounded-xl border border-salve-lav/20 bg-salve-lav/5 insight-glow overflow-hidden dash-stagger">
        <div className="border-l-[3px] border-salve-lav/40 p-4 pl-5">
          <AIMarkdown reveal>{cleaned}</AIMarkdown>
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}
