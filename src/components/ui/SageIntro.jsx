import { useState, useRef, useEffect, useCallback } from 'react';
import { Leaf, Send, X, Sparkles, Home, ClipboardPaste, MessageCircle } from 'lucide-react';
import { buildProfile } from '../../services/profile';
import { sendSageIntro, getDailyUsage } from '../../services/ai';
import { createToolExecutor } from '../../services/toolExecutor';
import { DESTRUCTIVE_TOOLS } from '../../constants/tools';
import AIConsentGate from './AIConsentGate';
import AIMarkdown from './AIMarkdown';
import { hasAIConsent } from './AIConsentGate';
import useWellnessMessage from '../../hooks/useWellnessMessage';

// Magical floating particles for the intro button
function IntroParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none" aria-hidden="true">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-salve-sage/40"
          style={{
            left: `${15 + i * 14}%`,
            animation: `sage-float ${3 + i * 0.5}s ease-in-out infinite`,
            animationDelay: `${i * 0.4}s`,
          }}
        />
      ))}
    </div>
  );
}

// The magical CTA button
export function SageIntroButton({ onClick, compact = false }) {
  return (
    <button
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-2xl border border-salve-sage/30 bg-gradient-to-br from-salve-sage/10 via-salve-card to-salve-lav/10 cursor-pointer transition-all duration-500 hover:border-salve-sage/50 hover:shadow-lg hover:shadow-salve-sage/10 hover:scale-[1.01] active:scale-[0.99] ${compact ? 'px-4 py-3' : 'px-5 py-5 md:py-6'}`}
    >
      <IntroParticles />
      {/* Shimmer sweep */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/8 to-transparent pointer-events-none" />

      <div className={`relative flex items-center ${compact ? 'gap-3' : 'gap-4'}`}>
        <div className={`${compact ? 'w-10 h-10' : 'w-12 h-12 md:w-14 md:h-14'} rounded-xl bg-salve-sage/15 flex items-center justify-center shrink-0 group-hover:bg-salve-sage/25 transition-colors duration-300`}>
          <div className="relative">
            <Leaf className={`text-salve-sage ${compact ? 'w-5 h-5' : 'w-6 h-6 md:w-7 md:h-7'}`} strokeWidth={1.5} />
            <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-salve-amber opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </div>
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className={`font-playfair font-semibold text-salve-text ${compact ? 'text-[14px]' : 'text-[16px] md:text-lg'}`}>
            Introduce Yourself to Sage
          </div>
          <p className={`text-salve-textFaint font-montserrat m-0 ${compact ? 'text-[11px]' : 'text-[12px] md:text-[13px]'} leading-snug mt-0.5`}>
            {compact
              ? 'Quick chat to set up your profile'
              : 'A quick, friendly chat to get your profile set up — Sage saves everything for you'
            }
          </p>
        </div>
        <div className="shrink-0 w-8 h-8 rounded-full bg-salve-sage/10 flex items-center justify-center group-hover:bg-salve-sage/20 transition-colors">
          <span className="text-salve-sage text-sm">→</span>
        </div>
      </div>
    </button>
  );
}

const INTRO_DISMISSED_KEY = 'salve:sage-intro-done';

// Read dismissal synchronously at module load — prevents any render flash
let _introDismissed = false;
try { _introDismissed = !!localStorage.getItem(INTRO_DISMISSED_KEY); } catch {}

// Check whether to show the intro prompt
export function shouldShowIntro(data, dataLoading) {
  if (_introDismissed) return false;
  if (dataLoading) return false;
  if (!data) return false;
  const about = data.settings?.about_me || {};
  const filledAbout = Object.values(about).filter(v => v && String(v).trim()).length;
  const totalRecords = (data.meds?.length || 0) + (data.conditions?.length || 0) +
    (data.providers?.length || 0) + (data.allergies?.length || 0);
  return filledAbout < 3 && totalRecords < 3;
}

export function dismissIntro() {
  _introDismissed = true;
  try { localStorage.setItem(INTRO_DISMISSED_KEY, '1'); } catch {}
}

// The full-screen intro chat experience
// Detect if the conversation has wrapped up
function isConversationComplete(messages) {
  if (messages.length < 4) return false;
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return false;
  const text = lastAssistant.content.toLowerCase();
  return (text.includes('welcome to salve') || text.includes("you're all set") ||
    text.includes('youre all set') || text.includes('all saved') ||
    (text.includes('let me know') && text.includes('anything')) ||
    text.includes('happy to have you'));
}

export default function SageIntroChat({ data, addItem, updateItem, removeItem, updateSettings, onClose: rawOnClose, onNav }) {
  const onClose = () => { dismissIntro(); rawOnClose(); };
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const wellness = useWellnessMessage(10000);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Tool executor
  const toolExecutor = useCallback(() => {
    if (!addItem || !updateItem || !removeItem) return null;
    return createToolExecutor({ data, addItem, updateItem, removeItem, updateSettings: updateSettings || (() => {}) });
  }, [data, addItem, updateItem, removeItem, updateSettings]);

  const onToolCall = useCallback(async (toolUseBlocks) => {
    const exec = toolExecutor();
    if (!exec) return toolUseBlocks.map(t => ({ tool_use_id: t.id, content: 'Tool execution unavailable', is_error: true }));
    const results = [];
    for (const toolCall of toolUseBlocks) {
      // In intro mode, auto-execute all tools (no confirmation needed for adds)
      const result = await exec(toolCall);
      results.push(result);
    }
    return results;
  }, [toolExecutor]);

  // Start the conversation — Sage sends the first message
  const startIntro = async () => {
    setStarted(true);
    setLoading(true);
    try {
      const profile = buildProfile(data);
      const initMsg = [{ role: 'user', content: 'Hi Sage! I\'m new here. Can you help me get set up?' }];
      const r = await sendSageIntro(initMsg, profile, onToolCall);
      setMessages([{ role: 'assistant', content: r.text }]);
    } catch (e) {
      setError(e.message);
      setMessages([{ role: 'assistant', content: 'Hey! 👋 I\'m Sage. I\'d love to get to know you! What should I call you?' }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setError(null);
    const userMsg = { role: 'user', content: q };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    setInput('');
    setLoading(true);

    try {
      const profile = buildProfile(data);
      // Build API messages: include the hidden initial user message
      const apiMsgs = [
        { role: 'user', content: 'Hi Sage! I\'m new here. Can you help me get set up?' },
        ...allMsgs,
      ];
      const r = await sendSageIntro(apiMsgs, profile, onToolCall);
      setMessages(prev => [...prev, { role: 'assistant', content: r.text }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Hmm, I hit a snag. Could you try that again? 😊' }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  if (!hasAIConsent()) {
    return (
      <div className="fixed inset-0 z-50 bg-salve-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <AIConsentGate>
            <div />
          </AIConsentGate>
          <button onClick={onClose} className="mt-4 text-sm text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer font-montserrat mx-auto block">
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-salve-bg flex flex-col md:pl-[260px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-salve-border/50 bg-salve-card/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-salve-sage/15 flex items-center justify-center">
            <Leaf size={16} className="text-salve-sage" />
          </div>
          <div>
            <span className="text-[14px] font-semibold text-salve-text font-montserrat">Getting to know you</span>
            <span className="text-[10px] text-salve-textFaint font-montserrat block -mt-0.5">with Sage</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-salve-card2 hover:bg-salve-rose/10 flex items-center justify-center cursor-pointer border-none transition-colors"
          aria-label="Close"
        >
          <X size={16} className="text-salve-textMid" />
        </button>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 max-w-[600px] mx-auto w-full">
        {!started ? (
          /* Welcome screen before starting */
          <div className="flex flex-col items-center justify-center h-full text-center gap-6 px-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-salve-sage/15 flex items-center justify-center sage-intro-bloom">
                <Leaf size={36} className="text-salve-sage" strokeWidth={1.5} />
              </div>
              <Sparkles size={16} className="absolute -top-1 -right-1 text-salve-amber sage-intro-sparkle" />
              <Sparkles size={12} className="absolute -bottom-0.5 -left-2 text-salve-lav sage-intro-sparkle" style={{ animationDelay: '0.5s' }} />
            </div>
            <div>
              <h2 className="font-playfair text-2xl md:text-3xl font-semibold text-salve-text mb-2">
                Hey, I'm Sage 🌿
              </h2>
              <p className="text-salve-textMid font-montserrat text-sm md:text-base leading-relaxed max-w-[360px] mx-auto">
                I'd love to learn a bit about you. I'll ask a few questions and save everything to your profile — so I can help fill out forms and give better health tips.
              </p>
              <p className="text-salve-textFaint font-montserrat text-xs mt-3 max-w-[300px] mx-auto">
                Takes about 3 minutes · Skip anything you want · Everything stays private
              </p>
            </div>
            <button
              onClick={startIntro}
              className="group relative px-8 py-3.5 rounded-xl bg-salve-sage text-white font-montserrat font-semibold text-[15px] border-none cursor-pointer transition-all duration-300 hover:bg-salve-sage/90 hover:shadow-lg hover:shadow-salve-sage/20 active:scale-[0.97] overflow-hidden"
            >
              <span className="relative z-10">Let's do it!</span>
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </button>
          </div>
        ) : (
          /* Chat messages */
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] md:max-w-[70%] rounded-xl px-3.5 py-2.5 ${
                  m.role === 'user'
                    ? 'bg-salve-lav/20 text-salve-text text-[13px] leading-relaxed'
                    : 'bg-salve-card border border-salve-border'
                }`}>
                  {m.role === 'assistant' ? (
                    <>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className="w-4 h-4 rounded-full bg-salve-sage/15 flex items-center justify-center shrink-0">
                          <Leaf size={9} className="text-salve-sage" />
                        </div>
                        <span className="text-[10px] font-semibold text-salve-sage font-montserrat tracking-wide">Sage</span>
                      </div>
                      <AIMarkdown compact>{m.content.replace(/\n---\n\*Sage's suggestions.*?\*/s, '')}</AIMarkdown>
                    </>
                  ) : (
                    <p className="m-0 font-montserrat">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-salve-card border border-salve-border rounded-xl px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-salve-sage/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-salve-sage/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-salve-sage/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[11px] text-salve-textFaint font-montserrat italic">{wellness.message}</span>
                </div>
              </div>
            )}

            {/* Completion card */}
            {!loading && isConversationComplete(messages) && (
              <div className="mt-6 rounded-2xl border border-salve-sage/30 bg-gradient-to-br from-salve-sage/5 via-salve-card to-salve-lav/5 p-5 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-salve-sage/15 flex items-center justify-center mx-auto sage-intro-bloom">
                  <Sparkles size={22} className="text-salve-sage" />
                </div>
                <div>
                  <h3 className="font-playfair text-lg font-semibold text-salve-text m-0">You're all set!</h3>
                  <p className="text-[12px] text-salve-textFaint font-montserrat mt-1 mb-0">
                    Everything's been saved to your profile.
                  </p>
                </div>
                <div className="flex flex-col gap-2 max-w-[280px] mx-auto">
                  <button
                    onClick={onClose}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-salve-sage text-white font-montserrat font-semibold text-[13px] border-none cursor-pointer transition-all hover:bg-salve-sage/90 active:scale-[0.97]"
                  >
                    <Home size={14} />
                    Go to Dashboard
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { onClose(); onNav?.('formhelper'); }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-salve-lav/10 text-salve-lav font-montserrat font-medium text-[12px] border border-salve-lav/20 cursor-pointer transition-all hover:bg-salve-lav/20"
                    >
                      <ClipboardPaste size={12} />
                      Form Helper
                    </button>
                    <button
                      onClick={() => { onClose(); onNav?.('ai'); }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-salve-sage/10 text-salve-sage font-montserrat font-medium text-[12px] border border-salve-sage/20 cursor-pointer transition-all hover:bg-salve-sage/20"
                    >
                      <MessageCircle size={12} />
                      Chat with Sage
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area — hidden when conversation is complete */}
      {started && !isConversationComplete(messages) && (
        <div className="shrink-0 border-t border-salve-border/50 bg-salve-card/80 backdrop-blur-sm px-4 py-3 max-w-[600px] mx-auto w-full">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type your answer..."
              disabled={loading}
              className="flex-1 py-2.5 px-3.5 rounded-xl border border-salve-border bg-salve-card2 text-sm font-montserrat text-salve-text focus:outline-none focus:border-salve-sage/50 transition-colors disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="w-10 h-10 rounded-xl bg-salve-sage hover:bg-salve-sage/80 flex items-center justify-center border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              aria-label="Send"
            >
              <Send size={16} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
