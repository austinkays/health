import { useState, useMemo } from 'react';
import { Newspaper, Bookmark, ExternalLink } from 'lucide-react';
import AIMarkdown from '../../ui/AIMarkdown';
import ThumbsRating from '../../ui/ThumbsRating';
import { C } from '../../../constants/colors';
import { ResultHeader, Disclaimer } from '../SharedButtons';
import SourcesBadges from '../SourcesBadges';
import { stripDisclaimer, splitSections } from '../helpers';
import { NEWS_SAVE_KEY } from '../constants';

export default function NewsResult({ result, onSaveChange, savedInsights, insightRatings }) {
  const text = typeof result === 'string' ? result : result?.text;
  const sources = typeof result === 'object' ? result?.sources : [];
  const sections = useMemo(() => splitSections(text), [text]);

  // Saved stories in localStorage
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem(NEWS_SAVE_KEY) || '[]'); } catch { return []; }
  });
  const [confirmUnsave, setConfirmUnsave] = useState(null);
  const toggleSave = (headline, body, sourceName, sourceUrl) => {
    const exists = saved.find(s => s.headline === headline);
    if (exists) {
      // Unsaving, require confirmation
      setConfirmUnsave(headline);
      return;
    }
    setSaved(prev => {
      const next = [...prev, { headline, body, sourceName, sourceUrl, savedAt: new Date().toISOString() }];
      localStorage.setItem(NEWS_SAVE_KEY, JSON.stringify(next));
      onSaveChange?.(next);
      return next;
    });
  };
  const doUnsave = (headline) => {
    setSaved(prev => {
      const next = prev.filter(s => s.headline !== headline);
      localStorage.setItem(NEWS_SAVE_KEY, JSON.stringify(next));
      onSaveChange?.(next);
      return next;
    });
    setConfirmUnsave(null);
  };
  const isSaved = (headline) => saved.some(s => s.headline === headline);

  // Parse headline, body, and inline source from each section
  const parseStory = (section) => {
    // Extract headline from ## heading (capture everything until the next newline)
    const headMatch = section.match(/^##\s+(.+)/m);
    const headline = headMatch ? headMatch[1].trim() : null;
    // Remove the heading line entirely
    let body = headMatch ? section.replace(/^##\s+.+\n?/m, '') : section;
    // Extract inline source link: "Source: [Name](url)" or "*Source: [Name](url)*"
    const srcMatch = body.match(/\*?\**Source:?\**\s*\[([^\]]+)\]\(([^)]+)\)\*?/);
    const srcPlain = !srcMatch ? body.match(/\*?\**Source:?\**\s*([^*\n]+?)\*?\s*$/m) : null;
    // Strip the source line from body text
    body = body.replace(/\n*\*?\**Source:?\**\s*(?:\[[^\]]+\]\([^)]+\)|[^*\n]+?)\*?\s*$/m, '').trim();
    // Strip trailing --- separators
    body = body.replace(/\n---\s*$/, '').trim();
    // Clean up orphaned punctuation on its own line (". " or just ".")
    body = body.replace(/^\s*\.\s*$/gm, '').trim();
    // Rejoin sentences broken across lines (line ending without period + next line starting lowercase)
    body = body.replace(/([^.!?\n])\n([a-z])/g, '$1 $2');
    // Collapse multiple blank lines into one
    body = body.replace(/\n{3,}/g, '\n\n').trim();
    return {
      headline,
      body,
      sourceName: srcMatch ? srcMatch[1] : (srcPlain ? srcPlain[1].trim() : null),
      sourceUrl: srcMatch ? srcMatch[2] : null,
    };
  };

  // Fallback: single card if we can't parse sections
  if (sections.length <= 1) {
    return (
      <div>
        <ResultHeader icon={Newspaper} label="Health News" color={C.amber} text={text} featureType="news" savedInsights={savedInsights} />
        <div className="rounded-xl border border-salve-amber/20 bg-salve-amber/5 overflow-hidden">
          <div className="border-l-[3px] border-salve-amber/40 p-4 pl-5">
            <AIMarkdown>{stripDisclaimer(text)}</AIMarkdown>
          </div>
        </div>
        <SourcesBadges sources={sources} />
        <Disclaimer />
      </div>
    );
  }

  const stories = sections.map(parseStory);

  return (
    <div>
      <ResultHeader icon={Newspaper} label="Health News" color={C.amber} text={text} featureType="news" savedInsights={savedInsights} />
      <div className="flex flex-col gap-2.5">
        {stories.map((story, i) => (
          <div
            key={i}
            className="card-hover rounded-xl border border-salve-amber/15 bg-salve-card overflow-hidden dash-stagger"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <div className="border-l-[3px] border-salve-amber/40 p-4 pl-5">
              {story.headline && (
                <div className="flex items-start gap-2.5 mb-2">
                  <Newspaper size={14} className="text-salve-amber mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 text-[14px] font-semibold text-salve-text font-playfair leading-snug">{story.headline}</span>
                  <span className="flex items-center gap-0.5 flex-shrink-0">
                    {insightRatings && <ThumbsRating surface="news" contentKey={`story-${i}`} getRating={insightRatings.getRating} rate={insightRatings.rate} metadata={{ headline: story.headline }} size={12} />}
                    <button
                      onClick={() => toggleSave(story.headline, story.body, story.sourceName, story.sourceUrl)}
                      className="flex-shrink-0 bg-transparent border-none cursor-pointer p-0.5 transition-colors"
                      aria-label={isSaved(story.headline) ? 'Remove from saved' : 'Save story'}
                    >
                      <Bookmark size={14} className={isSaved(story.headline) ? 'text-salve-amber fill-salve-amber' : 'text-salve-textFaint hover:text-salve-amber'} strokeWidth={1.5} />
                    </button>
                  </span>
                </div>
              )}
              {confirmUnsave === story.headline && (
                <div className="flex items-center gap-2 mb-2 px-1 py-1.5 rounded-lg bg-salve-amber/10 border border-salve-amber/20">
                  <span className="flex-1 text-[13px] text-salve-amber font-montserrat">Remove saved story?</span>
                  <button onClick={() => doUnsave(story.headline)} className="text-[13px] text-salve-rose font-semibold bg-transparent border-none cursor-pointer font-montserrat">Remove</button>
                  <button onClick={() => setConfirmUnsave(null)} className="text-[13px] text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Cancel</button>
                </div>
              )}
              <div className="text-[15px] text-salve-textMid leading-relaxed font-montserrat">
                <AIMarkdown reveal>{story.body}</AIMarkdown>
              </div>
              {story.sourceName && (
                <div className="mt-2.5 pt-2 border-t border-salve-border/30">
                  {story.sourceUrl ? (
                    <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-salve-amber hover:text-salve-text transition-colors font-montserrat font-medium no-underline hover:underline">
                      <ExternalLink size={10} />
                      {story.sourceName}, Read full article
                    </a>
                  ) : (
                    <span className="text-[13px] text-salve-textFaint italic font-montserrat">Source: {story.sourceName}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <SourcesBadges sources={sources} />
      <Disclaimer />
    </div>
  );
}
