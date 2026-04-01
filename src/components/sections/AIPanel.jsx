import { useState, useRef, useEffect } from 'react';
import { Sparkles, Link, Newspaper, HelpCircle, Send, Loader2, ChevronDown, ExternalLink, Copy, Check, Info, BadgeDollarSign, Plus, Bookmark } from 'lucide-react';
import AIMarkdown from '../ui/AIMarkdown';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Motif from '../ui/Motif';
import AIConsentGate from '../ui/AIConsentGate';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { fetchInsight, fetchConnections, fetchNews, fetchResources, fetchCostOptimization, sendChat } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import AIProfilePreview from '../ui/AIProfilePreview';
import { db } from '../../services/db';

const FEATURES = [
  { id: 'insight', label: 'Health Insight', desc: 'A fresh, personalized health tip', icon: Sparkles, color: C.lav },
  { id: 'connections', label: 'Health Connections', desc: 'Patterns across your health data', icon: Link, color: C.sage },
  { id: 'news', label: 'Health News', desc: 'Recent news for your conditions', icon: Newspaper, color: C.amber },
  { id: 'resources', label: 'Resources', desc: 'Benefits, programs & assistance', icon: HelpCircle, color: C.rose },
  { id: 'costs', label: 'Cost Savings', desc: 'Ways to save on medications', icon: BadgeDollarSign, color: C.sage },
];

// Strip the AI disclaimer from markdown text for separate rendering
function stripDisclaimer(text) {
  if (!text) return '';
  return text.replace(/\n---\n\*AI suggestions are not medical advice\.[^*]*\*\s*$/, '').trim();
}

// Split markdown text into sections by ## headings or --- separators
function splitSections(text) {
  if (!text) return [];
  const cleaned = stripDisclaimer(text);
  // Split by ## headings — keep the heading with its content
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

function ResultHeader({ icon: Icon, label, color, text }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '20' }}>
          <Icon size={15} color={color} strokeWidth={1.8} />
        </div>
        <span className="text-[13px] font-semibold text-salve-text font-montserrat tracking-wide">{label}</span>
      </div>
      {text && <CopyButton text={stripDisclaimer(text)} />}
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-salve-border/30">
      <Info size={10} className="text-salve-textFaint shrink-0" />
      <p className="text-[10px] text-salve-textFaint italic m-0 font-montserrat">
        AI suggestions are not medical advice. Always consult your healthcare providers.
      </p>
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

function InsightResult({ result }) {
  const text = typeof result === 'string' ? result : result?.text;
  const cleaned = stripDisclaimer(text);

  return (
    <div>
      <ResultHeader icon={Sparkles} label="Health Insight" color={C.lav} text={text} />
      <div className="rounded-xl border border-salve-lav/20 bg-salve-lav/5 insight-glow overflow-hidden dash-stagger">
        <div className="border-l-[3px] border-salve-lav/40 p-4 pl-5">
          <AIMarkdown>{cleaned}</AIMarkdown>
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}

/* ── Connections Result ───────────────────────────────────── */

function ConnectionsResult({ result }) {
  const text = typeof result === 'string' ? result : result?.text;
  const sections = splitSections(text);

  // Single section fallback
  if (sections.length <= 1) {
    return (
      <div>
        <ResultHeader icon={Link} label="Health Connections" color={C.sage} text={text} />
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
      <ResultHeader icon={Link} label="Health Connections" color={C.sage} text={text} />
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
              <AIMarkdown>{section.content.trim()}</AIMarkdown>
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

function NewsResult({ result, onSaveChange }) {
  const text = typeof result === 'string' ? result : result?.text;
  const sources = typeof result === 'object' ? result?.sources : [];
  const sections = splitSections(text);

  // Saved stories in localStorage
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem(NEWS_SAVE_KEY) || '[]'); } catch { return []; }
  });
  const [confirmUnsave, setConfirmUnsave] = useState(null);
  const toggleSave = (headline, body, sourceName, sourceUrl) => {
    const exists = saved.find(s => s.headline === headline);
    if (exists) {
      // Unsaving — require confirmation
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
    const headMatch = section.match(/^##\s+(.+?)\s*[\n\r]/);
    const headline = headMatch ? headMatch[1].trim() : null;
    let body = headMatch ? section.replace(/^##\s+.+?[\n\r]/, '') : section;
    // Extract inline source link: "Source: [Name](url)" or "*Source: [Name](url)*"
    const srcMatch = body.match(/\*?\**Source:?\**\s*\[([^\]]+)\]\(([^)]+)\)\*?/);
    const srcPlain = !srcMatch ? body.match(/\*?\**Source:?\**\s*([^*\n]+?)\*?\s*$/) : null;
    // Strip the source line from body text
    body = body.replace(/\n*\*?\**Source:?\**\s*(?:\[[^\]]+\]\([^)]+\)|[^*\n]+?)\*?\s*$/m, '').trim();
    // Also strip any trailing --- separator
    body = body.replace(/\n---\s*$/, '').trim();
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
        <ResultHeader icon={Newspaper} label="Health News" color={C.amber} text={text} />
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
      <ResultHeader icon={Newspaper} label="Health News" color={C.amber} text={text} />
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
                  <button
                    onClick={() => toggleSave(story.headline, story.body, story.sourceName, story.sourceUrl)}
                    className="flex-shrink-0 bg-transparent border-none cursor-pointer p-0.5 transition-colors"
                    aria-label={isSaved(story.headline) ? 'Remove from saved' : 'Save story'}
                  >
                    <Bookmark size={14} className={isSaved(story.headline) ? 'text-salve-amber fill-salve-amber' : 'text-salve-textFaint hover:text-salve-amber'} strokeWidth={1.5} />
                  </button>
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
                <AIMarkdown>{story.body}</AIMarkdown>
              </div>
              {story.sourceName && (
                <div className="mt-2.5 pt-2 border-t border-salve-border/30">
                  {story.sourceUrl ? (
                    <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-salve-amber hover:text-salve-text transition-colors font-montserrat font-medium no-underline hover:underline">
                      <ExternalLink size={10} />
                      {story.sourceName} — Read full article
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
        <div className="border-l-[3px] border-salve-rose/40 mx-4 mb-4 pl-4 pt-0">
          <AIMarkdown>{content.trim()}</AIMarkdown>
        </div>
      </div>
    </div>
  );
}

/* ── Resources Result ────────────────────────────────────── */

function ResourcesResult({ result }) {
  const text = typeof result === 'string' ? result : result?.text;
  const sources = typeof result === 'object' ? result?.sources : [];
  const sections = splitSections(text);

  // Fallback: single card if we can't parse sections
  if (sections.length <= 1) {
    return (
      <div>
        <ResultHeader icon={HelpCircle} label="Resources" color={C.rose} text={text} />
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
      <ResultHeader icon={HelpCircle} label="Resources" color={C.rose} text={text} />
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

function CostResult({ result }) {
  const text = typeof result === 'string' ? result : result?.text;
  const sources = typeof result === 'object' ? result?.sources : [];
  const sections = splitSections(text);

  if (sections.length <= 1) {
    return (
      <div>
        <ResultHeader icon={BadgeDollarSign} label="Cost Savings" color={C.sage} text={text} />
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
      <ResultHeader icon={BadgeDollarSign} label="Cost Savings" color={C.sage} text={text} />
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
              <AIMarkdown>{section.content.trim()}</AIMarkdown>
            </div>
          </div>
        ))}
      </div>
      <SourcesBadges sources={sources} />
      <Disclaimer />
    </div>
  );
}

export default function AIPanel({ data }) {
  const [mode, setMode] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
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

  const profile = buildProfile(data);

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

  const startNewChat = () => {
    setChatMessages([]);
    setConversationId(null);
    setChatInput('');
  };

  const runFeature = async (id) => {
    setMode(id);
    setResult(null);
    setLoading(true);
    try {
      const fn = { insight: fetchInsight, connections: fetchConnections, news: fetchNews, resources: fetchResources, costs: fetchCostOptimization }[id];
      const r = await fn(profile);
      setResult(r);
    } catch (e) {
      setResult({ text: 'Error: ' + e.message, sources: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msgs = [...chatMessages, { role: 'user', content: chatInput }];
    setChatMessages(msgs);
    setChatInput('');
    setLoading(true);
    try {
      const r = await sendChat(msgs, profile);
      const updated = [...msgs, { role: 'assistant', content: r }];
      setChatMessages(updated);
      saveConversation(updated);
    } catch (e) {
      const updated = [...msgs, { role: 'assistant', content: 'Error: ' + e.message }];
      setChatMessages(updated);
    } finally {
      setLoading(false);
    }
  };

  const chatEndRef = useRef(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, loading]);

  if (mode === 'ask') return (
    <AIConsentGate>
    <div className="mt-2">
      <SectionTitle action={<button onClick={() => { setMode(null); }} className="text-xs text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Back</button>}>
        Ask Insight
      </SectionTitle>
      {chatMessages.length > 0 && (
        <div className="flex justify-end mb-2">
          <button onClick={startNewChat} className="inline-flex items-center gap-1 text-[11px] text-salve-lav bg-salve-lav/10 hover:bg-salve-lav/20 rounded-full px-2.5 py-1 transition-colors font-montserrat border-none cursor-pointer">
            <Plus size={11} /> New Chat
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 mb-3" style={{ minHeight: 200 }}>
        {chatMessages.map((m, i) => (
          <article key={i} className={`max-w-[85%] rounded-xl ${
            m.role === 'user'
              ? 'self-end bg-salve-lav/20 text-salve-text ml-auto px-3.5 py-2.5 text-[13px] leading-relaxed'
              : 'self-start bg-salve-card border border-salve-border text-salve-textMid px-3.5 pt-2.5 pb-1.5'
          }`}>
            {m.role === 'assistant' ? (
              <>
                <AIMarkdown compact>{stripDisclaimer(m.content)}</AIMarkdown>
                <div className="flex justify-end mt-1.5 -mr-1">
                  <CopyButton text={stripDisclaimer(m.content)} className="!text-[10px] !px-2 !py-0.5" />
                </div>
              </>
            ) : m.content}
          </article>
        ))}
        {loading && (
          <div className="self-start flex items-center gap-2 text-salve-textFaint text-xs">
            <Loader2 size={14} className="animate-spin" /> Thinking...
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 bg-salve-card2 border border-salve-border rounded-xl px-3.5 py-2.5 text-[13px] text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleChat()}
          placeholder="Ask about your health..."
        />
        <Button onClick={handleChat} disabled={!chatInput.trim() || loading} className="!px-3" aria-label="Send message">
          <Send size={16} />
        </Button>
      </div>
    </div>
    </AIConsentGate>
  );

  if (mode && mode !== 'ask') return (
    <AIConsentGate>
    <div className="mt-2">
      <SectionTitle action={<button onClick={() => { setMode(null); setResult(null); }} className="text-xs text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Back</button>}>
        {FEATURES.find(f => f.id === mode)?.label}
      </SectionTitle>
      {loading ? (
        <div className="rounded-xl border border-salve-border bg-salve-card text-center py-10">
          <div className="w-10 h-10 rounded-full bg-salve-lav/10 flex items-center justify-center mx-auto mb-3">
            <Loader2 size={20} className="animate-spin text-salve-lav" />
          </div>
          <div className="text-[13px] text-salve-textMid font-montserrat">Analyzing your health profile...</div>
          <div className="text-[11px] text-salve-textFaint mt-1">This may take a moment</div>
        </div>
      ) : result ? (
        mode === 'insight' ? <InsightResult result={result} /> :
        mode === 'connections' ? <ConnectionsResult result={result} /> :
        mode === 'news' ? <NewsResult result={result} onSaveChange={setSavedNews} /> :
        mode === 'resources' ? <ResourcesResult result={result} /> :
        mode === 'costs' ? <CostResult result={result} /> :
        null
      ) : null}
    </div>
    </AIConsentGate>
  );

  return (
    <AIConsentGate>
    <div className="mt-2">
      <div className="text-center mb-5">
        <div className="text-3xl mb-2 opacity-60 text-salve-lav">✦</div>
        <p className="text-[13px] text-salve-textFaint italic">AI-powered insights from the health data you've gathered.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
      {FEATURES.map(f => (
          <button
            key={f.id}
            onClick={() => runFeature(f.id)}
            className="bg-salve-card border border-salve-border rounded-xl p-4 text-left cursor-pointer hover:border-salve-border2 transition-colors"
          >
            <f.icon size={22} color={f.color} strokeWidth={1.5} />
            <div className="text-[13px] font-semibold text-salve-text mt-2.5 font-montserrat">{f.label}</div>
            <div className="text-[11px] text-salve-textFaint mt-0.5 leading-relaxed">{f.desc}</div>
          </button>
        ))}
      </div>

      <Button variant="lavender" onClick={() => setMode('ask')} className="w-full justify-center">
        <Send size={15} /> Ask a Question
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

      <div className="mt-4 flex justify-center">
        <AIProfilePreview data={data} />
      </div>
      <p className="text-[10px] text-salve-textFaint italic text-center mt-3">AI suggestions are not medical advice. Always consult your healthcare providers.</p>
    </div>
    </AIConsentGate>
  );
}
