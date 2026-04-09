import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { Sparkles, Link, Newspaper, HelpCircle, Send, Loader2, ChevronDown, ExternalLink, Copy, Check, Info, BadgeDollarSign, Plus, Bookmark, CheckCircle2, XCircle, AlertTriangle, Heart, Leaf, Lock, Stethoscope, Shield, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AIMarkdown from '../ui/AIMarkdown';
import Card from '../ui/Card';
import ThumbsRating from '../ui/ThumbsRating';
import Button from '../ui/Button';
import Motif from '../ui/Motif';
import AIConsentGate from '../ui/AIConsentGate';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { fetchInsight, fetchConnections, fetchNews, fetchResources, fetchCostOptimization, fetchCyclePatterns, fetchMonthlySummary, sendHouseChat, sendChat, sendChatWithTools, getAIProvider, isFeatureLocked, getDailyUsage } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import AIProfilePreview from '../ui/AIProfilePreview';
import { db } from '../../services/db';
import useWellnessMessage from '../../hooks/useWellnessMessage';
import { DESTRUCTIVE_TOOLS } from '../../constants/tools';
import { createToolExecutor } from '../../services/toolExecutor';
import { computeCycleStats, getCyclePhaseForDate } from '../../utils/cycles';
import CrisisModal from '../ui/CrisisModal';
import { detectCrisis } from '../../utils/crisis';

// Feature ID → ai.js feature name for lock checking
const FEATURE_TO_AI = { connections: 'connections', resources: 'resources', costs: 'costOptimization', cycle_patterns: 'cyclePatterns', monthly_summary: 'monthlySummary', house: 'houseConsultation' };

const FEATURES = [
  { id: 'insight', label: 'Health Insight', desc: 'A fresh, personalized health tip', icon: Sparkles, color: C.lav },
  { id: 'connections', label: 'Health Connections', desc: 'Patterns across your health data', icon: Link, color: C.sage, premium: true },
  { id: 'news', label: 'Health News', desc: 'Recent news for your conditions', icon: Newspaper, color: C.amber },
  { id: 'resources', label: 'Resources', desc: 'Benefits, programs & assistance', icon: HelpCircle, color: C.rose, premium: true },
  { id: 'costs', label: 'Cost Savings', desc: 'Ways to save on medications', icon: BadgeDollarSign, color: C.sage, premium: true },
  { id: 'cycle_patterns', label: 'Cycle Patterns', desc: 'Phase-correlated health trends', icon: Heart, color: C.rose, premium: true },
  { id: 'monthly_summary', label: 'Monthly Summary', desc: 'Clinical overview for your provider', icon: FileText, color: C.sage, premium: true },
  { id: 'house', label: 'House Consultation', desc: 'Claude & Gemini debate your health', icon: Stethoscope, color: C.amber, admin: true },
];

const INSIGHTS_SAVE_KEY = 'salve:saved-insights';

function useSavedInsights() {
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem(INSIGHTS_SAVE_KEY) || '[]'); } catch { return []; }
  });
  const save = useCallback((type, label, text) => {
    setSaved(prev => {
      const next = [...prev, { type, label, text: stripDisclaimer(text), savedAt: new Date().toISOString() }];
      localStorage.setItem(INSIGHTS_SAVE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const remove = useCallback((index) => {
    setSaved(prev => {
      const next = prev.filter((_, i) => i !== index);
      localStorage.setItem(INSIGHTS_SAVE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const isSaved = useCallback((type, text) =>
    saved.some(s => s.type === type && s.text === stripDisclaimer(text)), [saved]);
  return { saved, save, remove, isSaved };
}

function SaveInsightButton({ type, label, text, savedInsights }) {
  const { save, isSaved } = savedInsights;
  const alreadySaved = isSaved(type, text);
  if (alreadySaved) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-salve-sage font-montserrat font-medium px-2.5 py-1 rounded-full bg-salve-sage/10">
        <Bookmark size={11} className="fill-salve-sage" /> Saved
      </span>
    );
  }
  return (
    <button
      onClick={() => save(type, label, text)}
      className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 transition-all duration-200 border-none cursor-pointer font-montserrat bg-salve-card2 text-salve-textFaint hover:text-salve-text hover:bg-salve-border"
      aria-label="Save this insight"
    >
      <Bookmark size={11} /> Save
    </button>
  );
}

// Strip the AI disclaimer from markdown text for separate rendering
function stripDisclaimer(text) {
  if (!text) return '';
  return text.replace(/\n---\n\*(?:AI|Sage'?s?) suggestions are not medical advice\.[^*]*\*\s*$/, '').trim();
}

// Split markdown text into sections by ## headings or --- separators
function splitSections(text) {
  if (!text) return [];
  const cleaned = stripDisclaimer(text);
  // Split by ## headings, keep the heading with its content
  const parts = cleaned.split(/(?=^## )/m).filter(s => s.trim());
  if (parts.length > 1) {
    // Drop preamble text before first ## heading
    const filtered = parts.filter(p => p.trimStart().startsWith('## '));
    if (filtered.length > 0) return filtered;
    return parts;
  }
  // Fallback: split by horizontal rules
  const hrParts = cleaned.split(/\n---\n/).filter(s => s.trim());
  return hrParts.length > 1 ? hrParts : [cleaned];
}

/* ── Shared Components ───────────────────────────────────── */

function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 transition-all duration-200 border-none cursor-pointer font-montserrat ${
        copied
          ? 'bg-salve-sage/20 text-salve-sage'
          : 'bg-salve-card2 text-salve-textFaint hover:text-salve-text hover:bg-salve-border'
      } ${className}`}
      aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
    >
      {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
    </button>
  );
}

function ResultHeader({ icon: Icon, label, color, text, featureType, savedInsights, insightRatings }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '20' }}>
          <Icon size={15} color={color} strokeWidth={1.8} />
        </div>
        <span className="text-[13px] font-semibold text-salve-text font-montserrat tracking-wide">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {insightRatings && <ThumbsRating surface={featureType} contentKey={featureType} getRating={insightRatings.getRating} rate={insightRatings.rate} size={12} />}
        {text && savedInsights && <SaveInsightButton type={featureType} label={label} text={text} savedInsights={savedInsights} insightRatings={insightRatings} />}
        {text && <CopyButton text={stripDisclaimer(text)} />}
      </div>
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-salve-border/30">
      <Info size={10} className="text-salve-textFaint shrink-0" />
      <p className="text-[10px] text-salve-textFaint italic m-0 font-montserrat">
        Sage's suggestions are not medical advice. Always consult your healthcare providers.
      </p>
    </div>
  );
}

function SavedInsightsSection({ savedInsights }) {
  const [open, setOpen] = useState(false);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const featureColors = { insight: C.lav, connections: C.sage, news: C.amber, resources: C.rose, costs: C.sage, cycle_patterns: C.rose };
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-[12px] text-salve-textMid font-montserrat bg-transparent border-none cursor-pointer py-2"
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
                  <span className="text-[10px] font-montserrat font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ color: featureColors[s.type] || C.lav, background: (featureColors[s.type] || C.lav) + '15' }}>{s.label}</span>
                  <span className="flex-1" />
                  <button onClick={() => setConfirmIdx(i)} className="flex-shrink-0 bg-transparent border-none cursor-pointer p-0.5" aria-label="Remove saved insight">
                    <Bookmark size={13} className="text-salve-lav fill-salve-lav" strokeWidth={1.5} />
                  </button>
                </div>
                {confirmIdx === i && (
                  <div className="flex items-center gap-2 mb-1.5 px-1 py-1.5 rounded-lg bg-salve-lav/10 border border-salve-lav/20">
                    <span className="flex-1 text-[11px] text-salve-lav font-montserrat">Remove saved insight?</span>
                    <button onClick={() => { savedInsights.remove(i); setConfirmIdx(null); }} className="text-[11px] text-salve-rose font-semibold bg-transparent border-none cursor-pointer font-montserrat">Remove</button>
                    <button onClick={() => setConfirmIdx(null)} className="text-[11px] text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Cancel</button>
                  </div>
                )}
                {isExpanded ? (
                  <AIMarkdown compact>{s.text}</AIMarkdown>
                ) : (
                  <div className="text-[12px] text-salve-textMid leading-relaxed font-montserrat line-clamp-3">
                    {s.text.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/^- /gm, '').replace(/^\d+\.\s/gm, '').slice(0, 250)}
                  </div>
                )}
                <div className="flex items-center justify-between mt-1.5">
                  <div className="text-[9px] text-salve-textFaint">Saved {new Date(s.savedAt).toLocaleDateString()}</div>
                  {isLong && (
                    <button
                      onClick={() => setExpandedIdx(isExpanded ? null : i)}
                      className="text-[10px] text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline"
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

function SourcesBadges({ sources }) {
  if (!sources?.length) return null;
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-4 pt-3 border-t border-salve-border/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-textMid transition-colors"
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
              className="text-[10px] text-salve-textFaint hover:text-salve-lav transition-colors font-montserrat truncate no-underline hover:underline"
            >
              {s.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Insight Result ──────────────────────────────────────── */

function InsightResult({ result, savedInsights, insightRatings }) {
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

/* ── Connections Result ───────────────────────────────────── */

function ConnectionsResult({ result, savedInsights, insightRatings }) {
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
                  <span className="text-[13px] font-semibold text-salve-text font-montserrat">{section.title}</span>
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

/* ── News Result ─────────────────────────────────────────── */

const NEWS_SAVE_KEY = 'salve:saved-news';

function NewsResult({ result, onSaveChange, savedInsights, insightRatings }) {
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
                  <span className="flex-1 text-[11px] text-salve-amber font-montserrat">Remove saved story?</span>
                  <button onClick={() => doUnsave(story.headline)} className="text-[11px] text-salve-rose font-semibold bg-transparent border-none cursor-pointer font-montserrat">Remove</button>
                  <button onClick={() => setConfirmUnsave(null)} className="text-[11px] text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Cancel</button>
                </div>
              )}
              <div className="text-[13px] text-salve-textMid leading-relaxed font-montserrat">
                <AIMarkdown reveal>{story.body}</AIMarkdown>
              </div>
              {story.sourceName && (
                <div className="mt-2.5 pt-2 border-t border-salve-border/30">
                  {story.sourceUrl ? (
                    <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-salve-amber hover:text-salve-text transition-colors font-montserrat font-medium no-underline hover:underline">
                      <ExternalLink size={10} />
                      {story.sourceName}, Read full article
                    </a>
                  ) : (
                    <span className="text-[11px] text-salve-textFaint italic font-montserrat">Source: {story.sourceName}</span>
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

/* ── Accordion Section (for Resources) ───────────────────── */

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
          <span className="text-[13px] font-semibold text-salve-text font-montserrat">{title}</span>
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

/* ── Resources Result ────────────────────────────────────── */

function ResourcesResult({ result, savedInsights, insightRatings }) {
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

/* ── Cost Savings Result ─────────────────────────────────── */

function CostResult({ result, savedInsights, insightRatings }) {
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
                <span className="text-[13px] font-semibold text-salve-text font-montserrat">{section.title}</span>
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

/* ── House Consultation Chat Room ──────────────────────────── */

function HouseChatRoom({ messages, loadingWho, input, onInputChange, onSend, inputRef, endRef }) {
  return (
    <div>
      <div className="rounded-xl border border-salve-amber/20 bg-salve-amber/5 p-4 mb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Stethoscope size={15} className="text-salve-amber" />
          <span className="text-[12px] font-semibold font-montserrat text-salve-amber">Group Consultation</span>
        </div>
        <p className="text-[11px] text-salve-textFaint leading-relaxed font-montserrat">
          A group chat with Claude and Gemini. Claude responds first, then Gemini reacts, they can agree, disagree, or build on each other's ideas.
        </p>
      </div>

      <div className="flex flex-col gap-3 mb-4 max-h-[60vh] overflow-y-auto no-scrollbar">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[12px] text-salve-textFaint font-montserrat italic">Ask a health question to start the conversation.</p>
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === 'user') return (
            <div key={i} className="self-end max-w-[80%] bg-salve-lav/10 border border-salve-lav/20 rounded-xl px-4 py-2.5">
              <p className="text-[13px] text-salve-text font-montserrat m-0">{msg.content}</p>
            </div>
          );
          const isClaude = msg.role === 'claude';
          const color = isClaude ? 'lav' : 'sage';
          const Icon = isClaude ? Sparkles : Shield;
          const name = isClaude ? 'Claude' : 'Gemini';
          return (
            <div key={i} className={`max-w-[88%] rounded-xl border border-salve-${color}/20 bg-salve-${color}/5 overflow-hidden`}>
              <div className={`border-l-[3px] border-salve-${color}/40 p-3.5 pl-4`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={`w-4 h-4 rounded-full bg-salve-${color}/15 flex items-center justify-center`}>
                    <Icon size={9} className={`text-salve-${color}`} />
                  </div>
                  <span className={`text-[10px] font-semibold font-montserrat text-salve-${color} tracking-wide uppercase`}>{name}</span>
                </div>
                <AIMarkdown>{msg.content}</AIMarkdown>
              </div>
            </div>
          );
        })}
        {loadingWho && (
          <div className={`max-w-[88%] rounded-xl border border-salve-${loadingWho === 'claude' ? 'lav' : 'sage'}/20 bg-salve-${loadingWho === 'claude' ? 'lav' : 'sage'}/5 overflow-hidden`}>
            <div className={`border-l-[3px] border-salve-${loadingWho === 'claude' ? 'lav' : 'sage'}/40 p-3.5 pl-4`}>
              <div className="flex items-center gap-1.5">
                <Loader2 size={11} className={`text-salve-${loadingWho === 'claude' ? 'lav' : 'sage'} animate-spin`} />
                <span className={`text-[11px] font-montserrat text-salve-${loadingWho === 'claude' ? 'lav' : 'sage'}/80`}>{loadingWho === 'claude' ? 'Claude' : 'Gemini'} is thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <Disclaimer />

      <div className="flex gap-2 mt-3">
        <input
          ref={inputRef}
          className="flex-1 bg-salve-card2 border border-salve-border rounded-xl px-3.5 py-2.5 text-[13px] text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint"
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && onSend()}
          placeholder="Ask both your AI consultants..."
          disabled={!!loadingWho}
        />
        <Button onClick={onSend} disabled={!input.trim() || !!loadingWho} className="!px-3" aria-label="Send to both AI consultants">
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}

function FeatureLoading({ ready, onReveal }) {
  const { message, key } = useWellnessMessage();
  return (
    <div className="rounded-xl border border-salve-border bg-salve-card text-center py-12 px-6 breathe-container">
      <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-salve-lav/30 breathe-ring" />
        <div className="absolute -inset-2 rounded-full border border-salve-lav/15 breathe-ring" style={{ animationDelay: '1.5s' }} />
        <Leaf size={30} className="breathe-icon text-salve-sage" />
      </div>
      <p className="text-[11px] text-salve-textFaint/60 font-montserrat tracking-widest uppercase mb-4">Breathe with me</p>
      <div key={key} className="wellness-msg text-[13px] text-salve-textMid font-montserrat italic mb-5" role="status" aria-live="polite">{message}</div>
      <div className="relative h-10 flex items-center justify-center">
        <div className={`flex items-center justify-center gap-2 text-salve-textFaint/40 transition-opacity duration-1000 ${ready ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <Loader2 size={12} className="animate-spin" />
          <span className="text-[10px] font-montserrat tracking-wider uppercase">Sage is thinking</span>
        </div>
        {ready && (
          <button
            onClick={onReveal}
            className="absolute inset-0 m-auto w-fit inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-salve-lav/25 bg-salve-lav/8 text-salve-lav text-xs font-montserrat font-medium tracking-wide cursor-pointer transition-all duration-300 hover:bg-salve-lav/15 hover:border-salve-lav/40 ready-reveal"
            aria-label="View your insight"
          >
            <Leaf size={14} />
            Sage has your insight
          </button>
        )}
      </div>
    </div>
  );
}

function ChatThinking() {
  const { message, key } = useWellnessMessage();
  return (
    <div className="self-start flex items-start gap-2 text-salve-textFaint text-xs">
      <div className="w-5 h-5 rounded-full bg-salve-sage/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Leaf size={11} className="text-salve-sage" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold text-salve-sage font-montserrat tracking-wide">Sage</span>
        <span key={key} className="wellness-msg italic" role="status" aria-live="polite">{message}</span>
      </div>
    </div>
  );
}

/* ── Tool Execution Card ──────────────────────────────────── */

const TOOL_LABELS = {
  add_medication: 'Add medication', update_medication: 'Update medication', remove_medication: 'Remove medication',
  add_condition: 'Add condition', update_condition: 'Update condition', remove_condition: 'Remove condition',
  add_allergy: 'Add allergy', remove_allergy: 'Remove allergy',
  add_appointment: 'Add appointment', update_appointment: 'Update appointment', remove_appointment: 'Remove appointment',
  add_provider: 'Add provider', update_provider: 'Update provider', remove_provider: 'Remove provider',
  add_vital: 'Log vital', add_journal_entry: 'Add journal entry', update_settings: 'Update profile',
  add_todo: 'Add to-do', update_todo: 'Update to-do', remove_todo: 'Remove to-do',
  add_activity: 'Log activity',
  add_genetic_result: 'Add genetic result',
  search_records: 'Search records', list_records: 'List records',
};

function ToolExecutionCard({ execution, onConfirm }) {
  const { name, status, message, input } = execution;
  const label = TOOL_LABELS[name] || name;
  const isDestructive = DESTRUCTIVE_TOOLS.has(name);
  const summary = input?.name || input?.substance || input?.query || input?.table || '';

  if (status === 'pending' && onConfirm) {
    return (
      <div className="rounded-lg border border-salve-rose/30 bg-salve-rose/5 p-2.5 text-[12px] font-montserrat" role="alertdialog">
        <div className="flex items-center gap-1.5 mb-1.5">
          <AlertTriangle size={13} className="text-salve-rose" />
          <span className="font-semibold text-salve-rose">{label}</span>
          {summary && <span className="text-salve-textFaint">,  {summary}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onConfirm(true)} className="text-[11px] font-semibold text-salve-text bg-salve-rose/20 hover:bg-salve-rose/30 rounded-md px-2.5 py-1 border-none cursor-pointer font-montserrat transition-colors">Confirm</button>
          <button onClick={() => onConfirm(false)} className="text-[11px] text-salve-textFaint hover:text-salve-text bg-salve-card2 rounded-md px-2.5 py-1 border-none cursor-pointer font-montserrat transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  const colors = {
    running: { border: 'border-salve-lav/20', bg: 'bg-salve-lav/5', icon: <Loader2 size={12} className="animate-spin text-salve-lav" /> },
    success: { border: 'border-salve-sage/20', bg: 'bg-salve-sage/5', icon: <CheckCircle2 size={12} className="text-salve-sage" /> },
    error: { border: 'border-salve-rose/20', bg: 'bg-salve-rose/5', icon: <XCircle size={12} className="text-salve-rose" /> },
    cancelled: { border: 'border-salve-border', bg: 'bg-salve-card2', icon: <XCircle size={12} className="text-salve-textFaint" /> },
  }[status] || { border: 'border-salve-border', bg: 'bg-salve-card2', icon: null };

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} px-2.5 py-1.5 text-[11px] font-montserrat flex items-center gap-1.5`}>
      {colors.icon}
      <span className="text-salve-textMid">{label}</span>
      {summary && <span className="text-salve-textFaint">,  {summary}</span>}
      {status === 'cancelled' && <span className="text-salve-textFaint italic ml-1">cancelled</span>}
    </div>
  );
}

function fmtMsgTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays > 6) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (diffDays > 0) return `${diffDays}d ago`;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const ChatMessageList = memo(function ChatMessageList({ messages, toolExecutions, loading, confirmPending, chatEndRef }) {
  return (
    <div className="flex flex-col gap-2 mb-3" style={{ minHeight: 200 }}>
      {messages.map((m, i) => (
        <article key={i} className={`max-w-[85%] md:max-w-[70%] rounded-xl ${
          m.role === 'user'
            ? 'self-end bg-salve-lav/20 text-salve-text ml-auto px-3.5 py-2.5 text-[13px] leading-relaxed'
            : 'self-start bg-salve-card border border-salve-border text-salve-textMid px-3.5 pt-2.5 pb-1.5'
        }`}>
          {m.role === 'assistant' ? (
            <>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-4 h-4 rounded-full bg-salve-sage/15 flex items-center justify-center flex-shrink-0">
                  <Leaf size={9} className="text-salve-sage" />
                </div>
                <span className="text-[10px] font-semibold text-salve-sage font-montserrat tracking-wide">Sage</span>
                <span className="text-[9px] text-salve-textFaint font-montserrat ml-auto">{fmtMsgTime(m.ts)}{fmtMsgTime(m.ts) && ' · '}via {getAIProvider() === 'anthropic' ? 'Claude' : 'Gemini'}</span>
              </div>
              <AIMarkdown compact>{stripDisclaimer(m.content)}</AIMarkdown>
              {m.toolExecutions?.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {m.toolExecutions.map(t => (
                    <ToolExecutionCard key={t.id} execution={t} />
                  ))}
                </div>
              )}
              <div className="flex justify-end mt-1.5 -mr-1">
                <CopyButton text={stripDisclaimer(m.content)} className="!text-[10px] !px-2 !py-0.5" />
              </div>
            </>
          ) : (
            <>
              {m.content}
              {m.ts && <div className="text-[9px] text-salve-lav/40 font-montserrat text-right mt-1">{fmtMsgTime(m.ts)}</div>}
            </>
          )}
        </article>
      ))}
      {toolExecutions.length > 0 && loading && (
        <div className="self-start flex flex-col gap-1 max-w-[85%] md:max-w-[70%]">
          {toolExecutions.map(t => (
            <ToolExecutionCard key={t.id} execution={t} onConfirm={confirmPending} />
          ))}
        </div>
      )}
      {loading && <ChatThinking />}
      <div ref={chatEndRef} />
    </div>
  );
});

function CyclePatternChart({ data }) {
  const PHASE_ORDER = ['Menstrual', 'Follicular', 'Ovulatory', 'Luteal'];
  const PHASE_COLORS = { Menstrual: C.rose, Follicular: C.sage, Ovulatory: C.amber, Luteal: C.lav };
  const VITAL_TYPES_FOR_CHART = ['pain', 'mood', 'energy', 'sleep'];
  const VITAL_LABELS = { pain: 'Pain', mood: 'Mood', energy: 'Energy', sleep: 'Sleep' };

  const chartData = useMemo(() => {
    const phaseData = {};
    for (const phase of PHASE_ORDER) phaseData[phase] = {};

    for (const v of (data.vitals || [])) {
      if (!VITAL_TYPES_FOR_CHART.includes(v.type)) continue;
      const cp = getCyclePhaseForDate(v.date, data.cycles);
      if (!cp) continue;
      if (!phaseData[cp.phase][v.type]) phaseData[cp.phase][v.type] = [];
      phaseData[cp.phase][v.type].push(Number(v.value));
    }

    return PHASE_ORDER.map(phase => {
      const row = { phase };
      let hasData = false;
      for (const type of VITAL_TYPES_FOR_CHART) {
        const vals = phaseData[phase][type] || [];
        if (vals.length >= 3) {
          row[type] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
          hasData = true;
        }
      }
      row._hasData = hasData;
      row._color = PHASE_COLORS[phase];
      return row;
    }).filter(r => r._hasData);
  }, [data.vitals, data.cycles]);

  const vitalKeys = VITAL_TYPES_FOR_CHART.filter(type =>
    chartData.some(row => row[type] !== undefined)
  );

  if (chartData.length < 2 || vitalKeys.length === 0) {
    return (
      <div className="text-xs text-salve-textFaint font-montserrat text-center py-3">
        Not enough data for chart visualization yet. Keep tracking vitals across your cycle.
      </div>
    );
  }

  const barColors = { pain: C.rose, mood: C.lav, energy: C.amber, sleep: C.sage };

  return (
    <Card className="mb-3">
      <div className="text-xs font-medium font-montserrat text-salve-textFaint uppercase tracking-wider mb-2">Average by Cycle Phase</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey="phase" tick={{ fontSize: 10, fill: C.textFaint }} />
          <YAxis tick={{ fontSize: 10, fill: C.textFaint }} domain={[0, 10]} />
          <Tooltip contentStyle={{ fontFamily: 'Montserrat', fontSize: 11, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card }} />
          {vitalKeys.map(type => (
            <Bar key={type} dataKey={type} name={VITAL_LABELS[type]} fill={barColors[type]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-3 mt-1.5">
        {vitalKeys.map(type => (
          <div key={type} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: barColors[type] }} />
            <span className="text-[9px] text-salve-textFaint font-montserrat">{VITAL_LABELS[type]}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AIPanel({ data, addItem, updateItem, removeItem, updateSettings, insightRatings }) {
  const [mode, setMode] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [usage, setUsage] = useState(() => getDailyUsage());
  const [revealed, setRevealed] = useState(false);
  const savedInsights = useSavedInsights();
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [savedNews, setSavedNews] = useState(() => {
    try { return JSON.parse(localStorage.getItem(NEWS_SAVE_KEY) || '[]'); } catch { return []; }
  });
  const [showSaved, setShowSaved] = useState(false);
  const [confirmRemoveHeadline, setConfirmRemoveHeadline] = useState(null);
  const removeSavedNews = (headline) => {
    const next = savedNews.filter(s => s.headline !== headline);
    localStorage.setItem(NEWS_SAVE_KEY, JSON.stringify(next));
    setSavedNews(next);
    setConfirmRemoveHeadline(null);
  };

  // Tool execution state for AI-powered data control
  const [toolExecutions, setToolExecutions] = useState([]);
  const toolExecutionsRef = useRef([]);
  const pendingConfirmRef = useRef(null);

  // House Consultation chat state
  const [houseMessages, setHouseMessages] = useState([]); // flat: { role: 'user'|'claude'|'gemini', content }
  const [houseHistory, setHouseHistory] = useState([]); // API-format shared history for both models
  const [houseInput, setHouseInput] = useState('');
  const [houseLoadingWho, setHouseLoadingWho] = useState(null); // null | 'claude' | 'gemini'
  const [crisisType, setCrisisType] = useState(null);
  const houseEndRef = useRef(null);
  const houseInputRef = useRef(null);

  // Keep ref in sync with state
  useEffect(() => { toolExecutionsRef.current = toolExecutions; }, [toolExecutions]);

  const toolExecutor = useCallback(() => {
    if (!addItem || !updateItem || !removeItem) return null;
    return createToolExecutor({ data, addItem, updateItem, removeItem, updateSettings: updateSettings || (() => {}) });
  }, [data, addItem, updateItem, removeItem, updateSettings]);

  // onToolCall: callback for the agentic loop
  // Returns tool_result objects for each tool call
  const onToolCall = useCallback(async (toolUseBlocks) => {
    const exec = toolExecutor();
    if (!exec) return toolUseBlocks.map(t => ({ tool_use_id: t.id, content: 'Tool execution unavailable', is_error: true }));

    const results = [];
    for (const toolCall of toolUseBlocks) {
      const isDestructive = DESTRUCTIVE_TOOLS.has(toolCall.name);

      if (isDestructive) {
        // Wait for user confirmation
        const confirmed = await new Promise(resolve => {
          pendingConfirmRef.current = { toolCall, resolve };
          setToolExecutions(prev => [...prev, { id: toolCall.id, name: toolCall.name, input: toolCall.input, status: 'pending' }]);
        });

        if (!confirmed) {
          setToolExecutions(prev => prev.map(t => t.id === toolCall.id ? { ...t, status: 'cancelled' } : t));
          results.push({ tool_use_id: toolCall.id, content: 'User cancelled this action.' });
          continue;
        }
      }

      // Execute the tool
      setToolExecutions(prev => {
        const exists = prev.find(t => t.id === toolCall.id);
        if (exists) return prev.map(t => t.id === toolCall.id ? { ...t, status: 'running' } : t);
        return [...prev, { id: toolCall.id, name: toolCall.name, input: toolCall.input, status: 'running' }];
      });

      const result = await exec(toolCall);
      setToolExecutions(prev => prev.map(t => t.id === toolCall.id ? {
        ...t, status: result.is_error ? 'error' : 'success', message: result.content
      } : t));
      results.push(result);
    }
    return results;
  }, [toolExecutor]);

  const confirmPending = (confirm) => {
    if (pendingConfirmRef.current) {
      pendingConfirmRef.current.resolve(confirm);
      pendingConfirmRef.current = null;
    }
  };

  const profile = useMemo(() => buildProfile(data), [data]);

  // Auto-scroll house chat to latest message
  useEffect(() => {
    houseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [houseMessages]);

  // Load most recent conversation on entering chat mode
  useEffect(() => {
    if (mode !== 'ask') return;
    let cancelled = false;
    db.conversations.list().then(convos => {
      if (cancelled || !convos?.length) return;
      const latest = convos[0];
      if (latest.messages?.length) {
        setChatMessages(latest.messages);
        setConversationId(latest.id);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [mode]);

  const saveConversation = async (msgs) => {
    try {
      const title = msgs.find(m => m.role === 'user')?.content?.slice(0, 80) || 'Chat';
      if (conversationId) {
        await db.conversations.update(conversationId, { title, messages: msgs });
      } else {
        const saved = await db.conversations.add({ title, messages: msgs });
        if (saved?.id) setConversationId(saved.id);
      }
    } catch {}
  };

  const handleHouseChat = async () => {
    if (!houseInput.trim() || houseLoadingWho) return;
    const msg = houseInput.trim();
    setHouseInput('');
    const withUser = [...houseMessages, { role: 'user', content: msg }];
    setHouseMessages(withUser);
    setHouseLoadingWho('claude');
    try {
      const { claude, gemini } = await sendHouseChat(
        houseHistory, msg, profile,
        // onClaudeReply: show Claude's bubble immediately while Gemini thinks
        (claudeText) => {
          setHouseMessages(prev => [...prev, { role: 'claude', content: claudeText }]);
          setHouseLoadingWho('gemini');
        }
      );
      // Add Gemini's response and update shared history
      setHouseMessages(prev => [...prev, { role: 'gemini', content: gemini }]);
      setHouseHistory(prev => [
        ...prev,
        { role: 'user', content: msg },
        { role: 'assistant', content: `[Claude]: ${claude}\n\n[Gemini]: ${gemini}` },
      ]);
    } catch (e) {
      setHouseMessages(prev => [...prev, { role: 'claude', content: `Error: ${e.message}` }]);
    } finally {
      setHouseLoadingWho(null);
      setTimeout(() => houseInputRef.current?.focus(), 50);
    }
  };

  const startNewChat = () => {
    setChatMessages([]);
    setConversationId(null);
    setChatInput('');
  };

  const runFeature = async (id) => {
    if (id === 'house') {
      setMode('house');
      setLoading(false);
      return;
    }
    setMode(id);
    setResult(null);
    setRevealed(false);
    setLoading(true);
    try {
      if (id === 'cycle_patterns') {
        const stats = computeCycleStats(data.cycles || []);
        if (stats.periodStarts.length < 2) {
          setResult('Log more cycle and vitals data to unlock pattern analysis. Aim for at least one full cycle with regular vitals tracking.');
          setLoading(false);
          return;
        }
        const totalEntries = (data.vitals?.length || 0) + (data.journal?.length || 0);
        if (totalEntries < 10) {
          setResult('Log more vitals or journal entries alongside your cycle data. Aim for at least 10 entries for meaningful pattern analysis.');
          setLoading(false);
          return;
        }

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const cutoff = threeMonthsAgo.toISOString().slice(0, 10);

        const recentVitals = (data.vitals || [])
          .filter(v => v.date >= cutoff && ['pain', 'mood', 'energy', 'sleep'].includes(v.type))
          .map(v => {
            const cp = getCyclePhaseForDate(v.date, data.cycles);
            return `${v.date} | ${v.type}: ${v.value} | ${cp ? `${cp.phase} day ${cp.dayOfCycle}` : 'no cycle data'}`;
          });

        const recentJournal = (data.journal || [])
          .filter(e => e.date >= cutoff)
          .map(e => {
            const cp = getCyclePhaseForDate(e.date, data.cycles);
            return `${e.date} | mood: ${e.mood || '?'} severity: ${e.severity || '?'} | ${cp ? `${cp.phase} day ${cp.dayOfCycle}` : 'no cycle data'} | ${(e.content || '').slice(0, 100)}`;
          });

        const activeMeds = (data.meds || []).filter(m => m.active !== false).map(m => m.name).join(', ');

        const cycleProfile = `Cycle stats: avg length ${stats.avgLength} days, last period ${stats.lastPeriod}, ${stats.periodStarts.length} tracked cycles\n\nRecent vitals (last 3 months, tagged by cycle phase):\n${recentVitals.join('\n') || 'No recent vitals'}\n\nRecent journal entries (last 3 months, tagged by cycle phase):\n${recentJournal.join('\n') || 'No recent journal entries'}\n\nActive medications: ${activeMeds || 'None'}`;

        const r = await fetchCyclePatterns(cycleProfile);
        setResult(r);
      } else if (id === 'monthly_summary') {
        const r = await fetchMonthlySummary(profile);
        setResult(r);
      } else {
        const fn = { insight: fetchInsight, connections: fetchConnections, news: fetchNews, resources: fetchResources, costs: fetchCostOptimization }[id];
        const r = await fn(profile);
        setResult(r);
        // Cache news articles for the News feed section
        if (id === 'news' && r) {
          try {
            const { cacheSageNewsFromResult } = await import('../../services/newsCache');
            cacheSageNewsFromResult(r);
          } catch { /* non-critical */ }
        }
      }
    } catch (e) {
      const isDailyLimit = e.message?.includes('Daily AI limit');
      const isPremium = e.message?.includes('Premium feature');
      const isAdmin = e.message?.includes('Admin feature') || e.message?.includes('admin tier');
      const msg = isDailyLimit
        ? '⏳ **Daily Limit Reached**\n\nYou\'ve used all 10 free AI calls for today. Resets at midnight PT.\n\nUpgrade to **Claude Premium** in Settings for unlimited access.'
        : isAdmin
          ? '🔒 **Admin Feature**\n\nHouse Consultation requires admin tier. Both Claude and Gemini analyze your health data together in a debate-style consultation.'
          : isPremium
            ? '🔒 **Premium Feature**\n\nUpgrade to Claude for advanced analysis.\n\nGo to **Settings → AI Provider** to upgrade.'
            : 'Error: ' + e.message;
      setResult({ text: msg, sources: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || cooldown) return;
    // Crisis detection, show resources instead of sending to AI
    const crisis = detectCrisis(chatInput);
    if (crisis.isCrisis) {
      setCrisisType(crisis.type);
      return;
    }
    const msgs = [...chatMessages, { role: 'user', content: chatInput, ts: Date.now() }];
    setChatMessages(msgs);
    setChatInput('');
    chatInputRef.current?.focus();
    setLoading(true);
    setToolExecutions([]);
    try {
      const hasCrud = addItem && updateItem && removeItem;
      if (hasCrud) {
        const r = await sendChatWithTools(msgs, profile, onToolCall);
        const executions = toolExecutionsRef.current.length ? [...toolExecutionsRef.current] : undefined;
        const updated = [...msgs, { role: 'assistant', content: r.text, toolExecutions: executions, ts: Date.now() }];
        setChatMessages(updated);
        saveConversation(updated);
      } else {
        const r = await sendChat(msgs, profile);
        const updated = [...msgs, { role: 'assistant', content: r, ts: Date.now() }];
        setChatMessages(updated);
        saveConversation(updated);
      }
      setCooldown(true);
      setTimeout(() => setCooldown(false), 1500);
    } catch (e) {
      const isDailyLimit = e.message?.includes('Daily AI limit');
      const errMsg = isDailyLimit
        ? '⏳ You\'ve used all 10 free AI calls for today. Resets at midnight PT. Upgrade to Claude Premium in Settings for unlimited access.'
        : 'Error: ' + e.message;
      const updated = [...msgs, { role: 'assistant', content: errMsg, ts: Date.now() }];
      setChatMessages(updated);
    } finally {
      setLoading(false);
      setToolExecutions([]);
      setUsage(getDailyUsage());
    }
  };

  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, loading]);

  if (mode === 'ask') return (
    <AIConsentGate>
    {crisisType && <CrisisModal type={crisisType} onClose={() => setCrisisType(null)} />}
    <div className="mt-2">
      <SectionTitle action={<button onClick={() => { setMode(null); }} className="text-xs text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Back</button>}>
        Chat with Sage
      </SectionTitle>
      {chatMessages.length > 0 && (
        <div className="flex justify-end mb-2">
          <button onClick={startNewChat} className="inline-flex items-center gap-1 text-[11px] text-salve-lav bg-salve-lav/10 hover:bg-salve-lav/20 rounded-full px-2.5 py-1 transition-colors font-montserrat border-none cursor-pointer">
            <Plus size={11} /> New Chat
          </button>
        </div>
      )}
      <ChatMessageList messages={chatMessages} toolExecutions={toolExecutions} loading={loading} confirmPending={confirmPending} chatEndRef={chatEndRef} />
      {usage.remaining <= 3 && (
        <div className="text-center mb-2">
          <span className="text-[10px] font-montserrat text-salve-rose">
            {usage.remaining === 0 ? 'Daily limit reached, resets at midnight PT' : `${usage.remaining}/${usage.limit} calls remaining today`}
          </span>
        </div>
      )}
      <div className="flex gap-2">
        <input
          ref={chatInputRef}
          className="flex-1 bg-salve-card2 border border-salve-border rounded-xl px-3.5 py-2.5 text-[13px] text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleChat()}
          placeholder="Ask Sage about your health..."
          disabled={loading || cooldown}
        />
        <Button onClick={handleChat} disabled={!chatInput.trim() || loading || cooldown} className="!px-3" aria-label="Send message">
          <Send size={16} />
        </Button>
      </div>
    </div>
    </AIConsentGate>
  );

  if (mode && mode !== 'ask') return (
    <AIConsentGate>
    <div className="mt-2">
      <SectionTitle action={<button onClick={() => { setMode(null); setResult(null); setRevealed(false); if (mode === 'house') { setHouseMessages([]); setHouseHistory([]); } }} className="text-xs text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Back</button>}>
        {FEATURES.find(f => f.id === mode)?.label}
      </SectionTitle>
      {mode === 'house' ? (
        <HouseChatRoom
          messages={houseMessages}
          loadingWho={houseLoadingWho}
          input={houseInput}
          onInputChange={setHouseInput}
          onSend={handleHouseChat}
          inputRef={houseInputRef}
          endRef={houseEndRef}
        />
      ) : (loading || (result && !revealed)) ? (
        <FeatureLoading ready={!loading && !!result} onReveal={() => setRevealed(true)} />
      ) : result && revealed ? (
        mode === 'insight' ? <InsightResult result={result} savedInsights={savedInsights} insightRatings={insightRatings} /> :
        mode === 'connections' ? <ConnectionsResult result={result} savedInsights={savedInsights} insightRatings={insightRatings} /> :
        mode === 'news' ? <NewsResult result={result} onSaveChange={setSavedNews} savedInsights={savedInsights} insightRatings={insightRatings} /> :
        mode === 'resources' ? <ResourcesResult result={result} savedInsights={savedInsights} insightRatings={insightRatings} /> :
        mode === 'costs' ? <CostResult result={result} savedInsights={savedInsights} insightRatings={insightRatings} /> :
        mode === 'cycle_patterns' ? (
          <div>
            <ResultHeader icon={Heart} label="Cycle Patterns" color={C.rose} text={typeof result === 'string' ? result : result?.text} featureType="cycle_patterns" savedInsights={savedInsights} insightRatings={insightRatings} />
            <CyclePatternChart data={data} />
            <div className="rounded-xl border border-salve-rose/20 bg-salve-rose/5 overflow-hidden">
              <div className="border-l-[3px] border-salve-rose/40 p-4 pl-5">
                <AIMarkdown reveal>{stripDisclaimer(typeof result === 'string' ? result : result?.text)}</AIMarkdown>
              </div>
            </div>
            <Disclaimer />
          </div>
        ) :
        mode === 'monthly_summary' ? (
          <div>
            <ResultHeader icon={FileText} label="Monthly Summary" color={C.sage} text={typeof result === 'string' ? result : result?.text} featureType="monthly_summary" savedInsights={savedInsights} insightRatings={insightRatings} />
            <div className="rounded-xl border border-salve-sage/20 bg-salve-sage/5 overflow-hidden">
              <div className="border-l-[3px] border-salve-sage/40 p-4 pl-5">
                <AIMarkdown reveal>{stripDisclaimer(typeof result === 'string' ? result : result?.text)}</AIMarkdown>
              </div>
            </div>
            <Disclaimer />
          </div>
        ) :
        null
      ) : null}
    </div>
    </AIConsentGate>
  );

  return (
    <AIConsentGate>
    <div className="mt-2">
      <div className="text-center mb-5">
        <div className="w-10 h-10 rounded-full bg-salve-sage/15 flex items-center justify-center mx-auto mb-2">
          <Leaf size={20} className="text-salve-sage" />
        </div>
        <p className="text-[15px] font-playfair font-semibold text-salve-text mb-0.5">Hey, I'm Sage</p>
        <p className="text-[13px] text-salve-textFaint italic">Your health companion, powered by your data.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-4">
      {FEATURES.map(f => {
          const locked = (f.premium || f.admin) && isFeatureLocked(FEATURE_TO_AI[f.id] || f.id);
          const badgeLabel = f.admin ? 'Admin' : 'Premium';
          const badgeColor = f.admin ? 'amber' : 'lav';
          return (
            <button
              key={f.id}
              onClick={() => {
                if (locked) {
                  const msg = f.admin
                    ? '🔒 **Admin Feature**\n\nHouse Consultation requires admin tier. Both Claude and Gemini analyze your health data together in a debate-style differential diagnosis.'
                    : '🔒 **Premium Feature**\n\nUpgrade to Claude for advanced analysis including health connections, cost savings, cycle patterns, and more.\n\nGo to **Settings → AI Provider** to upgrade.';
                  setResult({ text: msg });
                  setMode(f.id);
                  setRevealed(true);
                  return;
                }
                runFeature(f.id);
              }}
              className={`bg-salve-card border border-salve-border rounded-xl p-4 text-left cursor-pointer transition-colors ${locked ? 'opacity-50' : 'hover:border-salve-border2'}`}
            >
              <div className="flex items-center justify-between">
                <f.icon size={22} color={locked ? C.textFaint : f.color} strokeWidth={1.5} />
                {locked && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full bg-salve-${badgeColor}/15 text-salve-${badgeColor} font-medium font-montserrat flex items-center gap-0.5`}>
                    <Lock size={8} /> {badgeLabel}
                  </span>
                )}
              </div>
              <div className="text-[13px] font-semibold text-salve-text mt-2.5 font-montserrat">{f.label}</div>
              <div className="text-[11px] text-salve-textFaint mt-0.5 leading-relaxed">{f.desc}</div>
            </button>
          );
        })}
      </div>

      <Button variant="lavender" onClick={() => setMode('ask')} className="w-full justify-center">
        <Send size={15} /> Chat with Sage
      </Button>

      {savedNews.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="w-full flex items-center justify-between text-[12px] text-salve-textMid font-montserrat bg-transparent border-none cursor-pointer py-2"
          >
            <span className="flex items-center gap-1.5">
              <Bookmark size={13} className="text-salve-amber" />
              Saved News ({savedNews.length})
            </span>
            <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${showSaved ? 'rotate-180' : ''}`} />
          </button>
          {showSaved && (
            <div className="flex flex-col gap-2 mt-1">
              {savedNews.map((s, i) => (
                <div key={i} className="rounded-xl border border-salve-amber/15 bg-salve-card p-3.5">
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="flex-1 text-[13px] font-semibold text-salve-text font-playfair leading-snug">{s.headline}</span>
                    <button onClick={() => setConfirmRemoveHeadline(s.headline)} className="flex-shrink-0 bg-transparent border-none cursor-pointer p-0.5" aria-label="Remove saved story">
                      <Bookmark size={13} className="text-salve-amber fill-salve-amber" strokeWidth={1.5} />
                    </button>
                  </div>
                  {confirmRemoveHeadline === s.headline && (
                    <div className="flex items-center gap-2 mb-1.5 px-1 py-1.5 rounded-lg bg-salve-amber/10 border border-salve-amber/20">
                      <span className="flex-1 text-[11px] text-salve-amber font-montserrat">Remove saved story?</span>
                      <button onClick={() => removeSavedNews(s.headline)} className="text-[11px] text-salve-rose font-semibold bg-transparent border-none cursor-pointer font-montserrat">Remove</button>
                      <button onClick={() => setConfirmRemoveHeadline(null)} className="text-[11px] text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Cancel</button>
                    </div>
                  )}
                  <div className="text-[12px] text-salve-textMid leading-relaxed line-clamp-3 font-montserrat">{s.body}</div>
                  {s.sourceUrl && (
                    <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-salve-amber mt-1.5 font-montserrat hover:underline no-underline">
                      <ExternalLink size={9} /> {s.sourceName || 'Read article'}
                    </a>
                  )}
                  <div className="text-[9px] text-salve-textFaint mt-1">Saved {new Date(s.savedAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {savedInsights.saved.length > 0 && (
        <SavedInsightsSection savedInsights={savedInsights} insightRatings={insightRatings} />
      )}

      <div className="mt-4 flex flex-col items-center gap-1.5">
        <AIProfilePreview data={data} />
        <button
          onClick={() => setMode('ask')}
          className="text-[10px] text-salve-lav/60 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0"
        >
          Update your data via Sage →
        </button>
      </div>
      <p className="text-[10px] text-salve-textFaint italic text-center mt-3">Sage's suggestions are not medical advice. Always consult your healthcare providers.</p>
    </div>
    </AIConsentGate>
  );
}
