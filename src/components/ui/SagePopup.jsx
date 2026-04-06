import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Leaf, MessageSquare } from 'lucide-react';
import { sendChat, getDailyUsage } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from './AIConsentGate';
import AIMarkdown from './AIMarkdown';

// Focusable element selector for focus-trap logic
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function SagePopup({ open, onClose, onOpenFullChat, data }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState(false);
  const [usage, setUsage] = useState(() => getDailyUsage());
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const panelRef = useRef(null);
  // Remember what was focused before the popup opened so we can restore it
  const triggerRef = useRef(null);
  const consented = hasAIConsent();

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      setTimeout(() => inputRef.current?.focus(), 60);
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  // Escape key closes the popup
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Focus trap — keep Tab/Shift+Tab inside the panel
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    panel.addEventListener('keydown', trap);
    return () => panel.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || loading || cooldown) return;
    setError(null);
    const userMsg = { role: 'user', content: q };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    inputRef.current?.focus();
    setLoading(true);
    try {
      const profile = buildProfile(data);
      const reply = await sendChat(next, profile);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e?.message || 'Something went wrong');
    } finally {
      setLoading(false);
      setUsage(getDailyUsage());
      setCooldown(true);
      setTimeout(() => setCooldown(false), 1500);
    }
  }, [input, loading, cooldown, messages, data]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ask Sage"
        className="w-full max-w-[480px] md:max-w-[700px] lg:max-w-[800px] bg-salve-card border-t border-salve-border rounded-t-2xl md:rounded-2xl flex flex-col shadow-2xl md:mb-4"
        style={{ height: '78vh', maxHeight: '78vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-salve-border">
          <div className="flex items-center gap-2">
            <Leaf size={18} className="text-salve-sage" />
            <span className="font-playfair text-lg text-salve-text">Ask Sage</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { onClose(); onOpenFullChat?.(); }}
              aria-label="Open full chat"
              className="bg-transparent border-none text-salve-textMid hover:text-salve-lav cursor-pointer p-1.5 flex transition-colors"
              title="Open full chat"
            >
              <MessageSquare size={16} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="bg-transparent border-none text-salve-textMid hover:text-salve-text cursor-pointer p-1.5 flex transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {!consented ? (
            <div className="text-center py-8">
              <p className="text-sm text-salve-textMid mb-3">
                Sage needs your consent to share health data with the AI.
              </p>
              <button
                onClick={() => { onClose(); onOpenFullChat?.(); }}
                className="text-sm text-salve-lav underline cursor-pointer bg-transparent border-none"
              >
                Review consent in full chat
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-6">
              <Leaf size={28} className="text-salve-sage mx-auto mb-3 opacity-60" />
              <p className="font-playfair text-base text-salve-text mb-1">Hey, I'm Sage.</p>
              <p className="text-[13px] text-salve-textMid">Ask me anything about your health.</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                {m.role === 'user' ? (
                  <div className="inline-block max-w-[80%] bg-salve-lav/15 border border-salve-lav/20 rounded-2xl px-3.5 py-2 text-[13px] text-salve-text font-montserrat">
                    {m.content}
                  </div>
                ) : (
                  <div className="text-[13px] text-salve-text font-montserrat leading-relaxed">
                    <AIMarkdown>{m.content}</AIMarkdown>
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="text-[12px] text-salve-textFaint font-montserrat italic flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-salve-sage animate-pulse" />
              Sage is thinking…
            </div>
          )}
          {error && (
            <div className="text-[12px] text-salve-rose font-montserrat">{error}</div>
          )}
        </div>

        {/* Input */}
        {consented && (
          <div className="border-t border-salve-border">
            {usage.remaining <= 3 && (
              <div className="px-3 pt-2 text-center">
                <span className={`text-[10px] font-montserrat ${usage.remaining === 0 ? 'text-salve-rose' : 'text-salve-amber'}`}>
                  {usage.remaining === 0 ? 'Daily limit reached — resets at midnight PT' : `${usage.remaining}/${usage.limit} calls remaining today`}
                </span>
              </div>
            )}
            <div className="p-3 flex gap-2 items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask Sage…"
                aria-label="Ask Sage"
                disabled={loading || cooldown}
                className="flex-1 bg-salve-card2 border border-salve-border rounded-full px-4 py-2.5 text-[13px] text-salve-text placeholder:text-salve-textFaint font-montserrat outline-none focus:border-salve-lav/40 transition-colors"
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading || cooldown}
                aria-label="Send"
                className="w-10 h-10 rounded-full bg-salve-sage/20 border border-salve-sage/30 text-salve-sage hover:bg-salve-sage/30 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex-shrink-0"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
