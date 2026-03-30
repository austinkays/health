import { useState, useRef, useEffect } from 'react';
import { Sparkles, Link, Newspaper, HelpCircle, Send, Loader2 } from 'lucide-react';
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
      setResult('Error: ' + e.message);
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
        Ask Your Companion
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
        <Card>
          <AIMarkdown>{result}</AIMarkdown>
        </Card>
      ) : null}
    </div>
    </AIConsentGate>
  );

  return (
    <AIConsentGate>
    <div className="mt-2">
      <div className="text-center mb-5">
        <Motif type="sparkle" size={24} color={C.lav} className="block mx-auto mb-2" />
        <p className="text-[13px] text-salve-textFaint">Your AI health companion analyzes your profile to provide personalized insights.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <AIProfilePreview data={data} />

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
