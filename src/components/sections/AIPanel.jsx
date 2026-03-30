import { useState, useRef, useEffect } from 'react';
import { Sparkles, Link, Newspaper, HelpCircle, Send, Loader2, ChevronDown, ExternalLink } from 'lucide-react';
import AIMarkdown from '../ui/AIMarkdown';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Motif from '../ui/Motif';
import AIConsentGate from '../ui/AIConsentGate';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { fetchInsight, fetchConnections, fetchNews, fetchResources, sendChat } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import AIProfilePreview from '../ui/AIProfilePreview';

const FEATURES = [
  { id: 'insight', label: 'Health Insight', desc: 'A fresh, personalized health tip', icon: Sparkles, color: C.lav },
  { id: 'connections', label: 'Health Connections', desc: 'Patterns across your health data', icon: Link, color: C.sage },
  { id: 'news', label: 'Health News', desc: 'Recent news for your conditions', icon: Newspaper, color: C.amber },
  { id: 'resources', label: 'Resources', desc: 'Benefits, programs & assistance', icon: HelpCircle, color: C.rose },
];

// Split markdown text into sections by ## headings or --- separators
function splitSections(text) {
  if (!text) return [];
  // Remove the disclaimer at the end before splitting
  const cleaned = text.replace(/\n---\n\*AI suggestions are not medical advice\.[^*]*\*\s*$/, '').trim();
  // Split by ## headings — keep the heading with its content
  const parts = cleaned.split(/(?=^## )/m).filter(s => s.trim());
  if (parts.length > 1) return parts;
  // Fallback: split by horizontal rules
  const hrParts = cleaned.split(/\n---\n/).filter(s => s.trim());
  return hrParts.length > 1 ? hrParts : [cleaned];
}

function SourcesBadges({ sources }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-4 pt-3 border-t border-salve-border/50">
      <div className="text-[10px] text-salve-textFaint uppercase tracking-wider mb-2 font-montserrat">Sources</div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-salve-lav bg-salve-lav/10 hover:bg-salve-lav/20 rounded-full px-2.5 py-1 transition-colors font-montserrat"
            title={s.url}
          >
            <ExternalLink size={10} />
            <span className="max-w-[140px] truncate">{s.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function NewsResult({ result }) {
  const text = typeof result === 'string' ? result : result?.text;
  const sources = typeof result === 'object' ? result?.sources : [];
  const sections = splitSections(text);

  // Fallback: single card if we can't parse sections
  if (sections.length <= 1) {
    return (
      <div>
        <Card><AIMarkdown>{text}</AIMarkdown></Card>
        <SourcesBadges sources={sources} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((section, i) => (
        <div
          key={i}
          className="card-hover bg-salve-card border border-salve-border rounded-xl p-4 dash-stagger"
          style={{ animationDelay: `${i * 0.08}s` }}
        >
          <div className="flex items-start gap-2.5 mb-1">
            <Newspaper size={15} className="text-salve-amber mt-0.5 flex-shrink-0" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <AIMarkdown>{section.trim()}</AIMarkdown>
            </div>
          </div>
        </div>
      ))}
      <SourcesBadges sources={sources} />
      <p className="text-[10px] text-salve-textFaint italic text-center mt-1">AI suggestions are not medical advice. Always consult your healthcare providers.</p>
    </div>
  );
}

function AccordionSection({ title, content, defaultOpen = false, index }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="card-hover bg-salve-card border border-salve-border rounded-xl overflow-hidden dash-stagger"
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
        <div className="px-4 pb-4 pt-0">
          <AIMarkdown>{content.trim()}</AIMarkdown>
        </div>
      </div>
    </div>
  );
}

function ResourcesResult({ result }) {
  const text = typeof result === 'string' ? result : result?.text;
  const sources = typeof result === 'object' ? result?.sources : [];
  const sections = splitSections(text);

  // Fallback: single card if we can't parse sections
  if (sections.length <= 1) {
    return (
      <div>
        <Card><AIMarkdown>{text}</AIMarkdown></Card>
        <SourcesBadges sources={sources} />
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
      <SourcesBadges sources={sources} />
      <p className="text-[10px] text-salve-textFaint italic text-center mt-1">AI suggestions are not medical advice. Always consult your healthcare providers.</p>
    </div>
  );
}

export default function AIPanel({ data }) {
  const [mode, setMode] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const profile = buildProfile(data);

  const runFeature = async (id) => {
    setMode(id);
    setResult(null);
    setLoading(true);
    try {
      const fn = { insight: fetchInsight, connections: fetchConnections, news: fetchNews, resources: fetchResources }[id];
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
      setChatMessages([...msgs, { role: 'assistant', content: r }]);
    } catch (e) {
      setChatMessages([...msgs, { role: 'assistant', content: 'Error: ' + e.message }]);
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
      <SectionTitle action={<button onClick={() => { setMode(null); setChatMessages([]); }} className="text-xs text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Back</button>}>
        Ask Insight
      </SectionTitle>
      <div className="flex flex-col gap-2 mb-3" style={{ minHeight: 200 }}>
        {chatMessages.map((m, i) => (
          <article key={i} className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
            m.role === 'user'
              ? 'self-end bg-salve-lav/20 text-salve-text ml-auto text-[13px] leading-relaxed'
              : 'self-start bg-salve-card border border-salve-border text-salve-textMid'
          }`}>
            {m.role === 'assistant' ? <AIMarkdown compact>{m.content}</AIMarkdown> : m.content}
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
        <Card className="text-center !py-8">
          <Loader2 size={24} className="animate-spin mx-auto mb-2 text-salve-lav" />
          <div className="text-[13px] text-salve-textMid">Analyzing your health profile...</div>
        </Card>
      ) : result ? (
        mode === 'news' ? <NewsResult result={result} /> :
        mode === 'resources' ? <ResourcesResult result={result} /> :
        <Card>
          <AIMarkdown>{typeof result === 'string' ? result : result?.text}</AIMarkdown>
        </Card>
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
        <div className="mt-3 flex justify-center">
          <AIProfilePreview data={data} />
        </div>
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

      <p className="text-[10px] text-salve-textFaint italic text-center mt-3">AI suggestions are not medical advice. Always consult your healthcare providers.</p>
    </div>
    </AIConsentGate>
  );
}
