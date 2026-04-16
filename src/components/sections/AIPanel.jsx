import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, ChevronDown, Bookmark, Heart, FileText, Leaf, Clock, Trash2, ExternalLink, Plus, X } from 'lucide-react';
import AIMarkdown from '../ui/AIMarkdown';
import Button from '../ui/Button';
import AIConsentGate from '../ui/AIConsentGate';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import {
  fetchInsight, fetchConnections, fetchNews, fetchResources, fetchCostOptimization,
  fetchCyclePatterns, fetchMonthlySummary, sendHouseChat, sendChat, sendChatWithTools,
  isFeatureLocked, getDailyUsage, getConversationCap, extractMemoryUpdate,
} from '../../services/ai';
import { BILLING_ENABLED } from '../../services/billing';
import { buildProfile } from '../../services/profile';
import AIProfilePreview from '../ui/AIProfilePreview';
import { db } from '../../services/db';
import { DESTRUCTIVE_TOOLS } from '../../constants/tools';
import { createToolExecutor } from '../../services/toolExecutor';
import { computeCycleStats, getCyclePhaseForDate } from '../../utils/cycles';
import { fmtDateRelative, localISODate } from '../../utils/dates';
import CrisisModal from '../ui/CrisisModal';
import { detectCrisis } from '../../utils/crisis';

import { FEATURES, FEATURE_TO_AI, NEWS_SAVE_KEY } from '../ai/constants';
import { stripDisclaimer } from '../ai/helpers';
import useSavedInsights from '../ai/useSavedInsights';
import { ResultHeader, Disclaimer } from '../ai/SharedButtons';
import PremiumGateCard from '../ai/PremiumGateCard';
import SavedInsightsSection from '../ai/SavedInsightsSection';
import InsightResult from '../ai/results/InsightResult';
import ConnectionsResult from '../ai/results/ConnectionsResult';
import NewsResult from '../ai/results/NewsResult';
import ResourcesResult from '../ai/results/ResourcesResult';
import CostResult from '../ai/results/CostResult';
import CyclePatternChart from '../ai/CyclePatternChart';
import HouseChatRoom from '../ai/chat/HouseChatRoom';
import FeatureLoading from '../ai/chat/FeatureLoading';
import ChatMessageList from '../ai/chat/ChatMessageList';

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
  const [showHistory, setShowHistory] = useState(false);
  const [conversationList, setConversationList] = useState([]);
  const [deletingConvoId, setDeletingConvoId] = useState(null);
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

  // Load most recent conversation + full list on entering chat mode
  const refreshConversationList = useCallback(() => {
    return db.conversations.list().then(convos => {
      setConversationList(convos || []);
      return convos || [];
    }).catch(() => []);
  }, []);

  useEffect(() => {
    if (mode !== 'ask') return;
    let cancelled = false;
    refreshConversationList().then(convos => {
      if (cancelled || !convos?.length) return;
      const latest = convos[0];
      if (latest.messages?.length) {
        setChatMessages(latest.messages);
        setConversationId(latest.id);
      }
    });
    return () => { cancelled = true; };
  }, [mode, refreshConversationList]);

  const saveConversation = async (msgs) => {
    try {
      const title = msgs.find(m => m.role === 'user')?.content?.slice(0, 80) || 'Chat';
      if (conversationId) {
        await db.conversations.update(conversationId, { title, messages: msgs });
      } else {
        // Enforce conversation cap for free users
        const cap = getConversationCap();
        if (cap !== Infinity) {
          const all = await db.conversations.list();
          if (all && all.length >= cap) {
            // Delete oldest conversations to make room
            const toRemove = all.slice(cap - 1); // keep (cap - 1), new one will be #cap
            for (const old of toRemove) {
              await db.conversations.remove(old.id);
            }
          }
        }
        const saved = await db.conversations.add({ title, messages: msgs });
        if (saved?.id) setConversationId(saved.id);
      }
      refreshConversationList();
    } catch {}
  };

  const loadConversation = (convo) => {
    setChatMessages(convo.messages || []);
    setConversationId(convo.id);
    setChatInput('');
    setToolExecutions([]);
    setShowHistory(false);
  };

  const deleteConversation = async (id) => {
    try {
      await db.conversations.remove(id);
      if (conversationId === id) {
        setChatMessages([]);
        setConversationId(null);
      }
      setDeletingConvoId(null);
      refreshConversationList();
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
    // Fire-and-forget memory extraction from the conversation being closed
    const userMsgCount = chatMessages.filter(m => m.role === 'user').length;
    if (userMsgCount >= 2) {
      extractMemoryUpdate(chatMessages, data?.settings?.sage_memory).catch(() => {});
    }
    setChatMessages([]);
    setConversationId(null);
    setChatInput('');
    setToolExecutions([]);
    refreshConversationList();
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
        const cutoff = localISODate(threeMonthsAgo);

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
      const isDailyLimit = e.message?.includes('Daily AI limit') || e.message?.includes('Daily Sage limit');
      const isPremium = e.message?.includes('Premium feature');
      const isAdmin = e.message?.includes('Admin feature') || e.message?.includes('admin tier');
      const msg = isDailyLimit
        ? '⏳ **You\'re all caught up for today**\n\nYour daily Sage calls refresh at midnight Pacific. Come back tomorrow — Sage will be here.'
        : isAdmin
          ? '🔒 **Admin Feature**\n\nHouse Consultation requires admin tier. Both Claude and Gemini analyze your health data together in a debate-style consultation.'
          : isPremium
            ? (BILLING_ENABLED
                ? '🔒 **Premium Feature**\n\nUpgrade to Claude for advanced analysis.\n\nGo to **Settings → AI Provider** to upgrade.'
                : '🔒 **Premium Feature**\n\nThis feature is part of the Premium tier. Premium isn\'t open yet. We\'ll let you know when it is.')
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
    const msgs = [...chatMessages, { role: 'user', content: chatInput }];
    setChatMessages(msgs);
    setChatInput('');
    chatInputRef.current?.focus();
    setLoading(true);
    setToolExecutions([]);
    try {
      const hasCrud = addItem && updateItem && removeItem && !isFeatureLocked('toolUse');
      if (hasCrud) {
        const r = await sendChatWithTools(msgs, profile, onToolCall);
        const executions = toolExecutionsRef.current.length ? [...toolExecutionsRef.current] : undefined;
        const updated = [...msgs, { role: 'assistant', content: r.text, toolExecutions: executions }];
        setChatMessages(updated);
        saveConversation(updated);
      } else {
        const r = await sendChat(msgs, profile);
        const updated = [...msgs, { role: 'assistant', content: r }];
        setChatMessages(updated);
        saveConversation(updated);
      }
      setCooldown(true);
      setTimeout(() => setCooldown(false), 1500);
    } catch (e) {
      const isDailyLimit = e.message?.includes('Daily AI limit') || e.message?.includes('Daily Sage limit');
      const errMsg = isDailyLimit
        ? (BILLING_ENABLED
            ? "You've used your daily Sage allowance. It resets at midnight Pacific. If you're on premium, you can switch to the free Gemini provider in Settings, then AI Provider to keep going today."
            : "You've used your daily Sage allowance. It resets at midnight Pacific. During the beta we cap usage so Sage stays free for everyone. Thanks for understanding.")
        : 'Error: ' + e.message;
      const updated = [...msgs, { role: 'assistant', content: errMsg }];
      setChatMessages(updated);
    } finally {
      setLoading(false);
      setToolExecutions([]);
      setUsage(getDailyUsage());
    }
  };

  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const chatPanelRef = useRef(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, loading]);

  // Focus input when overlay opens; restore focus on close
  const chatOverlayTriggerRef = useRef(null);
  useEffect(() => {
    if (mode === 'ask') {
      chatOverlayTriggerRef.current = document.activeElement;
      setTimeout(() => chatInputRef.current?.focus(), 60);
    } else if (chatOverlayTriggerRef.current) {
      chatOverlayTriggerRef.current.focus();
      chatOverlayTriggerRef.current = null;
    }
  }, [mode]);

  // Escape key closes the chat overlay
  useEffect(() => {
    if (mode !== 'ask') return;
    const handleKey = (e) => { if (e.key === 'Escape') setMode(null); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode]);

  // Focus trap inside chat overlay panel
  const FOCUSABLE_SEL = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  useEffect(() => {
    if (mode !== 'ask') return;
    const panel = chatPanelRef.current;
    if (!panel) return;
    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SEL));
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
  }, [mode]);

  if (mode === 'ask') return (
    <AIConsentGate>
    {crisisType && <CrisisModal type={crisisType} onClose={() => setCrisisType(null)} />}
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:pl-[260px] bg-black/50 backdrop-blur-sm"
      onClick={() => setMode(null)}
    >
      <div
        ref={chatPanelRef}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Chat with Sage"
        className="w-full max-w-[480px] md:max-w-[700px] bg-salve-card border-t border-salve-border rounded-t-2xl md:rounded-2xl flex flex-col shadow-2xl md:mb-4"
        style={{ height: '78vh', maxHeight: '78vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-salve-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Leaf size={18} className="text-salve-sage" />
            <span className="font-playfair text-lg text-salve-text">Chat with Sage</span>
          </div>
          <button
            onClick={() => setMode(null)}
            aria-label="Close"
            className="bg-transparent border-none text-salve-textMid hover:text-salve-text cursor-pointer p-1.5 flex transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {chatMessages.length > 0 && (
            <div className="flex justify-end gap-1.5 mb-2">
              <button onClick={() => { setShowHistory(h => !h); refreshConversationList(); }} className="inline-flex items-center gap-1 text-[13px] text-salve-textMid bg-salve-card2 hover:bg-salve-lav/10 rounded-full px-2.5 py-1 transition-colors font-montserrat border border-salve-border cursor-pointer" aria-label="Chat history">
                <Clock size={11} /> History
              </button>
              <button onClick={startNewChat} className="inline-flex items-center gap-1 text-[13px] text-salve-lav bg-salve-lav/10 hover:bg-salve-lav/20 rounded-full px-2.5 py-1 transition-colors font-montserrat border-none cursor-pointer">
                <Plus size={11} /> New Chat
              </button>
            </div>
          )}
          {!chatMessages.length && conversationList.length > 0 && (
            <div className="flex justify-end mb-2">
              <button onClick={() => { setShowHistory(h => !h); refreshConversationList(); }} className="inline-flex items-center gap-1 text-[13px] text-salve-textMid bg-salve-card2 hover:bg-salve-lav/10 rounded-full px-2.5 py-1 transition-colors font-montserrat border border-salve-border cursor-pointer" aria-label="Chat history">
                <Clock size={11} /> History
              </button>
            </div>
          )}
          {showHistory && (
            <div className="mb-3 rounded-xl border border-salve-border bg-salve-card overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-salve-border/50">
                <span className="text-[13px] font-montserrat font-medium text-salve-text">Chat History</span>
                <div className="flex items-center gap-2">
                  {getConversationCap() !== Infinity && (
                    <span className="text-[11px] font-montserrat text-salve-textFaint">
                      {conversationList.length}/{getConversationCap()} saved
                    </span>
                  )}
                  <button onClick={() => setShowHistory(false)} className="text-salve-textFaint hover:text-salve-text transition-colors bg-transparent border-none cursor-pointer p-0.5" aria-label="Close history">
                    <X size={14} />
                  </button>
                </div>
              </div>
              {conversationList.length === 0 ? (
                <p className="text-[12px] text-salve-textFaint font-montserrat text-center py-4">No saved chats yet</p>
              ) : (
                <div className="max-h-[240px] overflow-y-auto">
                  {conversationList.map(c => (
                    <div key={c.id} className={`flex items-center gap-2 px-3 py-2 hover:bg-salve-lav/5 transition-colors cursor-pointer border-b border-salve-border/30 last:border-0 ${conversationId === c.id ? 'bg-salve-lav/10' : ''}`}>
                      <button onClick={() => loadConversation(c)} className="flex-1 text-left bg-transparent border-none cursor-pointer p-0 min-w-0">
                        <p className="text-[13px] text-salve-text font-montserrat truncate">{c.title || 'Chat'}</p>
                        <p className="text-[11px] text-salve-textFaint font-montserrat">{fmtDateRelative(c.updated_at || c.created_at)}</p>
                      </button>
                      {deletingConvoId === c.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => deleteConversation(c.id)} className="text-[11px] text-salve-rose bg-salve-rose/10 rounded-full px-2 py-0.5 font-montserrat border-none cursor-pointer">Delete</button>
                          <button onClick={() => setDeletingConvoId(null)} className="text-[11px] text-salve-textFaint bg-transparent rounded-full px-1.5 py-0.5 font-montserrat border-none cursor-pointer">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setDeletingConvoId(c.id); }} className="text-salve-textFaint hover:text-salve-rose transition-colors bg-transparent border-none cursor-pointer p-1 shrink-0" aria-label="Delete conversation">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {getConversationCap() !== Infinity && conversationList.length >= getConversationCap() && (
                <div className="px-3 py-2 border-t border-salve-border/50 bg-salve-card2/50">
                  <p className="text-[11px] text-salve-lav/70 font-montserrat text-center">
                    ✦ <span className="italic">Upgrade for unlimited chat history</span>
                  </p>
                </div>
              )}
            </div>
          )}
          <ChatMessageList messages={chatMessages} toolExecutions={toolExecutions} loading={loading} confirmPending={confirmPending} chatEndRef={chatEndRef} />
        </div>

        {/* Pinned bottom: usage counter + input + upsell */}
        <div className="border-t border-salve-border flex-shrink-0 px-4 pb-4 pt-3">
          {usage.remaining <= 3 && (
            <div className="text-center mb-2">
              <span className="text-[12px] font-montserrat text-salve-amber">
                {usage.remaining === 0 ? 'Daily calls refresh at midnight PT' : `${usage.remaining} of ${usage.limit} remaining today`}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={chatInputRef}
              className="flex-1 bg-salve-card2 border border-salve-border rounded-xl px-3.5 py-2.5 text-[15px] text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint"
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
          {isFeatureLocked('toolUse') && (
            <p className="text-[11px] text-salve-lav/70 font-montserrat mt-1 text-center">
              ✦ <span className="italic">Upgrade for data commands</span> — "add Lexapro 10mg", "log today's BP"
            </p>
          )}
        </div>
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
      ) : result?._premiumGate ? (
        <PremiumGateCard featureId={result.featureId} />
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
        <p className="text-[15px] text-salve-textFaint italic">Your health companion, powered by your data.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-4">
      {FEATURES.map(f => {
          const locked = (f.premium || f.admin) && isFeatureLocked(FEATURE_TO_AI[f.id] || f.id);
          const badgeLabel = f.admin ? 'Admin' : 'Premium';
          return (
            <button
              key={f.id}
              onClick={() => {
                if (locked) {
                  setResult({ _premiumGate: true, featureId: f.id });
                  setMode(f.id);
                  setRevealed(true);
                  return;
                }
                runFeature(f.id);
              }}
              className={`bg-salve-card border border-salve-border rounded-xl p-4 text-left cursor-pointer transition-colors hover:border-salve-border2`}
            >
              <div className="flex items-center justify-between">
                <f.icon size={22} color={f.color} strokeWidth={1.5} />
                {locked && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${f.admin ? 'bg-salve-amber/15 text-salve-amber' : 'bg-salve-lav/15 text-salve-lav'} font-medium font-montserrat`}>
                    ✦ {badgeLabel}
                  </span>
                )}
              </div>
              <div className="text-[15px] font-semibold text-salve-text mt-2.5 font-montserrat">{f.label}</div>
              <div className="text-[13px] text-salve-textFaint mt-0.5 leading-relaxed">{f.desc}</div>
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
            className="w-full flex items-center justify-between text-[14px] text-salve-textMid font-montserrat bg-transparent border-none cursor-pointer py-2"
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
                    <span className="flex-1 text-[15px] font-semibold text-salve-text font-playfair leading-snug">{s.headline}</span>
                    <button onClick={() => setConfirmRemoveHeadline(s.headline)} className="flex-shrink-0 bg-transparent border-none cursor-pointer p-0.5" aria-label="Remove saved story">
                      <Bookmark size={13} className="text-salve-amber fill-salve-amber" strokeWidth={1.5} />
                    </button>
                  </div>
                  {confirmRemoveHeadline === s.headline && (
                    <div className="flex items-center gap-2 mb-1.5 px-1 py-1.5 rounded-lg bg-salve-amber/10 border border-salve-amber/20">
                      <span className="flex-1 text-[13px] text-salve-amber font-montserrat">Remove saved story?</span>
                      <button onClick={() => removeSavedNews(s.headline)} className="text-[13px] text-salve-rose font-semibold bg-transparent border-none cursor-pointer font-montserrat">Remove</button>
                      <button onClick={() => setConfirmRemoveHeadline(null)} className="text-[13px] text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat">Cancel</button>
                    </div>
                  )}
                  <div className="text-[14px] text-salve-textMid leading-relaxed line-clamp-3 font-montserrat">{s.body}</div>
                  {s.sourceUrl && (
                    <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-salve-amber mt-1.5 font-montserrat hover:underline no-underline">
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
          className="text-[12px] text-salve-lav/60 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0"
        >
          Update your data via Sage →
        </button>
      </div>
      <p className="text-[12px] text-salve-textFaint italic text-center mt-3">Sage's suggestions are not medical advice. Always consult your healthcare providers.</p>
    </div>
    </AIConsentGate>
  );
}
