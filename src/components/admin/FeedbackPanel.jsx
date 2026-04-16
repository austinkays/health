import { useState, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare, ChevronDown, RefreshCw, Shield, Trash2, Copy } from 'lucide-react';
import { supabase } from '../../services/supabase';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import SkeletonList from '../ui/SkeletonCard';
import ConfirmBar from '../ui/ConfirmBar';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import { C } from '../../constants/colors';
import { TYPE_META, STATUS_META, FILTERS, STATUS_ACTIONS } from './constants';
import { formatDate } from './formatters';

// Feedback triage panel — the biggest chunk of the former Admin.jsx.
// Admin.jsx owns `userFilterId` so UserDrilldown can cross-filter into
// this panel via the onViewUserFeedback callback; everything else
// (items, reply drafts, expansion, delete confirms) lives here.
export default function FeedbackPanel({ userFilterId, onClearUserFilter }) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [items, setItems]     = useState([]);
  const [filter, setFilter]   = useState('unreviewed');
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId]     = useState(null);
  // Per-feedback-item reply drafts. Keyed by feedback id so each card has its own state.
  const [replyDraft, setReplyDraft] = useState({});
  const [savingReply, setSavingReply] = useState(null);
  const [copiedId, setCopiedId]       = useState(null);
  // Feedback delete confirmation — uses the standard ConfirmBar pattern
  // from useConfirmDelete, matching Todos.jsx/Medications.jsx/etc.
  const delFeedback = useConfirmDelete();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try the nested join first. If PostgREST can't resolve the relationship
      // (feedback.user_id FKs to auth.users, not profiles), fall back to a
      // two-step fetch that looks up profile names separately.
      let rows = null;
      const joinRes = await supabase
        .from('feedback')
        .select('id, user_id, type, message, status, response, responded_at, created_at, updated_at, profiles:user_id(name)')
        .order('created_at', { ascending: false });

      if (!joinRes.error) {
        rows = (joinRes.data || []).map(r => ({
          ...r,
          user_name: r.profiles?.name || '',
        }));
      } else {
        const baseRes = await supabase
          .from('feedback')
          .select('id, user_id, type, message, status, response, responded_at, created_at, updated_at')
          .order('created_at', { ascending: false });
        if (baseRes.error) throw baseRes.error;
        const base = baseRes.data || [];
        const uids = [...new Set(base.map(r => r.user_id).filter(Boolean))];
        let nameById = {};
        if (uids.length) {
          const profRes = await supabase.from('profiles').select('id, name').in('id', uids);
          if (!profRes.error && profRes.data) {
            nameById = Object.fromEntries(profRes.data.map(p => [p.id, p.name || '']));
          }
        }
        rows = base.map(r => ({ ...r, user_name: nameById[r.user_id] || '' }));
      }
      setItems(rows);
    } catch (err) {
      console.error('Failed to load feedback:', err);
      setError(err?.message || 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // When userFilterId changes externally (from UserDrilldown), flip to 'all'
  // so the user sees every item from that user regardless of triage status.
  useEffect(() => {
    if (userFilterId) setFilter('all');
  }, [userFilterId]);

  const filtered = useMemo(() => {
    // Apply user filter first if set (from the drill-down "View feedback" link)
    let base = userFilterId ? items.filter(i => i.user_id === userFilterId) : items;
    if (filter === 'all') return base;
    if (filter === 'unreviewed') return base.filter(i => (i.status || 'open') === 'open');
    return base.filter(i => i.type === filter);
  }, [items, filter, userFilterId]);

  const unreviewedCount = useMemo(
    () => items.filter(i => (i.status || 'open') === 'open').length,
    [items]
  );

  async function setStatus(id, newStatus) {
    setSavingId(id);
    // Optimistic update
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
    try {
      const { error: upErr } = await supabase
        .from('feedback')
        .update({ status: newStatus })
        .eq('id', id);
      if (upErr) throw upErr;
    } catch (err) {
      console.error('Failed to update feedback status:', err);
      // Revert on error
      await load();
      setError(err?.message || 'Failed to update status');
    } finally {
      setSavingId(null);
    }
  }

  // Save a reply to a feedback item. Uses migration 042's admin UPDATE policy.
  // Auto-advances status from 'open' → 'seen' so replying counts as triage.
  async function saveReply(id) {
    const text = (replyDraft[id] || '').trim();
    if (!text) return;
    setSavingReply(id);
    const responded_at = new Date().toISOString();
    // Optimistic update so the Response Sent card renders immediately
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, response: text, responded_at } : i
    ));
    try {
      const { error: upErr } = await supabase
        .from('feedback')
        .update({ response: text, responded_at })
        .eq('id', id);
      if (upErr) throw upErr;
      // Auto-advance open → seen so replying counts as triage
      const current = items.find(i => i.id === id)?.status || 'open';
      if (current === 'open') {
        await setStatus(id, 'seen');
      }
      // Clear draft so placeholder reappears
      setReplyDraft(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      console.error('Failed to save reply:', err);
      // Revert on error
      await load();
      setError(err?.message || 'Failed to save reply');
    } finally {
      setSavingReply(null);
    }
  }

  // Pre-seed the reply draft when a card is expanded if it already has a
  // response — this way editing an existing reply is an inline edit, not
  // a blank textarea surprise.
  const handleToggleExpand = useCallback((item) => {
    setExpandedId(prev => {
      if (prev === item.id) return null;
      // Opening this item — pre-seed the draft if there's an existing response
      // and no draft yet. useMemo would be wrong here since we're writing state.
      setReplyDraft(draft => {
        if (draft[item.id] != null) return draft;
        if (!item.response) return draft;
        return { ...draft, [item.id]: item.response };
      });
      return item.id;
    });
  }, []);

  // Hard delete a feedback row. Uses migration 045's "Admins delete all
  // feedback" RLS policy. Called from inside delFeedback.confirm() so the
  // ConfirmBar has already captured user intent before we hit the DB.
  async function deleteFeedback(id) {
    // Optimistic removal so the list updates immediately
    const prevItems = items;
    setItems(prev => prev.filter(i => i.id !== id));
    setExpandedId(prev => (prev === id ? null : prev));
    try {
      const { error: delErr } = await supabase
        .from('feedback')
        .delete()
        .eq('id', id);
      if (delErr) throw delErr;
    } catch (err) {
      console.error('Failed to delete feedback:', err);
      // Revert on error
      setItems(prevItems);
      setError(err?.message || 'Failed to delete feedback');
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 mt-1">
        <Shield size={14} className="text-salve-lav" />
        <p className="text-sm text-salve-textFaint font-montserrat m-0">
          Beta tester feedback. {unreviewedCount > 0 && (
            <span className="text-salve-lav font-medium">{unreviewedCount} unreviewed</span>
          )}
          {unreviewedCount === 0 && items.length > 0 && (
            <span>All caught up.</span>
          )}
        </p>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refresh feedback list"
          className="ml-auto flex items-center gap-1 text-[12px] text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer font-montserrat disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Active user filter chip (shown when drill-down called onViewUserFeedback) */}
      {userFilterId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-salve-lav/8 border border-salve-lav/20">
          <span className="text-[11px] text-salve-lav font-montserrat">
            Filtering feedback by user <span className="font-mono opacity-70">{userFilterId.slice(0, 8)}</span>
          </span>
          <button
            onClick={onClearUserFilter}
            className="ml-auto text-[11px] text-salve-lav/80 hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-montserrat font-medium border transition-all cursor-pointer ${
                active
                  ? 'border-salve-lav/40 bg-salve-lav/10 text-salve-text'
                  : 'border-salve-border bg-transparent text-salve-textFaint hover:border-salve-border2'
              }`}
            >
              {f.label}
              {f.value === 'unreviewed' && unreviewedCount > 0 && (
                <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-salve-lav/20 text-salve-lav">
                  {unreviewedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <Card>
          <p className="text-xs text-salve-rose font-montserrat m-0">{error}</p>
        </Card>
      )}

      {loading && <SkeletonList count={3} />}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          text={filter === 'unreviewed' ? 'Nothing new to review' : 'No feedback yet'}
          hint={filter === 'unreviewed' ? 'All submissions have been triaged.' : 'When beta testers submit feedback it will show up here.'}
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((item) => {
            const meta = TYPE_META[item.type] || TYPE_META.feedback;
            const Icon = meta.icon;
            const isExpanded = expandedId === item.id;
            const status = item.status || 'open';
            const statusMeta = STATUS_META[status] || STATUS_META.open;
            const isUnreviewed = status === 'open';
            const dateStr = formatDate(item.created_at);
            const userLabel = item.user_name?.trim() || 'Unnamed user';
            const userIdShort = item.user_id ? item.user_id.slice(0, 8) : '';

            return (
              <Card key={item.id}>
                <button
                  className="w-full flex items-start gap-2.5 bg-transparent border-none cursor-pointer p-0 text-left"
                  onClick={() => handleToggleExpand(item)}
                  aria-expanded={isExpanded}
                  aria-label={`${meta.label} from ${userLabel}`}
                >
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 relative"
                    style={{ background: `${meta.color}15` }}
                  >
                    <Icon size={12} color={meta.color} />
                    {isUnreviewed && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                        style={{ background: C.lav }}
                        aria-label="Unreviewed"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full font-montserrat"
                        style={{ background: `${meta.color}18`, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full font-montserrat"
                        style={{ background: `${statusMeta.color}18`, color: statusMeta.color }}
                      >
                        {statusMeta.label}
                      </span>
                      {item.response && (
                        <span className="w-1.5 h-1.5 rounded-full bg-salve-sage shrink-0" title="Response sent" />
                      )}
                      <span className="text-[12px] text-salve-textFaint font-montserrat">{dateStr}</span>
                    </div>
                    <div className="text-[12px] text-salve-textFaint font-montserrat mb-1 truncate">
                      {userLabel}
                      {userIdShort && (
                        <span className="ml-1.5 opacity-60 font-mono">({userIdShort})</span>
                      )}
                    </div>
                    <p className={`text-xs text-salve-textMid font-montserrat m-0 whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-2'}`}>
                      {item.message}
                    </p>
                  </div>
                  <ChevronDown
                    size={13}
                    className={`text-salve-textFaint shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-salve-border/50">
                    {/* Copy full feedback to clipboard */}
                    <button
                      onClick={async () => {
                        const text = `[${meta.label}] from ${userLabel} (${dateStr})\n\n${item.message}`;
                        await navigator.clipboard.writeText(text);
                        setCopiedId(item.id);
                        setTimeout(() => setCopiedId(prev => prev === item.id ? null : prev), 1500);
                      }}
                      className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 mb-3 rounded-full border border-salve-border text-salve-textFaint hover:text-salve-text hover:border-salve-lav/40 bg-transparent font-montserrat cursor-pointer transition-colors"
                      aria-label="Copy feedback to clipboard"
                    >
                      <Copy size={11} />
                      {copiedId === item.id ? 'Copied!' : 'Copy feedback'}
                    </button>

                    {/* Reply to user — uses migration 042's admin UPDATE policy */}
                    <p className="text-[11px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-2">
                      {item.response ? 'Edit reply' : 'Reply to user'}
                    </p>
                    <textarea
                      value={replyDraft[item.id] ?? ''}
                      onChange={e => setReplyDraft(prev => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="Your response — the user will see this in their Feedback section"
                      rows={3}
                      className="w-full text-[13px] text-salve-text font-montserrat rounded-lg border border-salve-border bg-salve-card2/40 px-3 py-2 resize-y focus:outline-none focus:border-salve-lav/50"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => saveReply(item.id)}
                        disabled={!replyDraft[item.id]?.trim() || savingReply === item.id}
                        className="text-[12px] px-3 py-1.5 rounded-full bg-salve-lav/15 border border-salve-lav/30 text-salve-lav font-montserrat cursor-pointer hover:bg-salve-lav/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {savingReply === item.id
                          ? 'Saving…'
                          : (item.response ? 'Update reply' : 'Send reply')}
                      </button>
                      {item.response && replyDraft[item.id] != null && replyDraft[item.id] !== item.response && (
                        <button
                          onClick={() => setReplyDraft(prev => ({ ...prev, [item.id]: item.response }))}
                          className="text-[11px] text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer font-montserrat underline"
                        >
                          Revert
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-2 mt-4">
                      Set status
                    </p>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      {STATUS_ACTIONS.map(a => {
                        const current = status === a.value;
                        const disabled = savingId === item.id;
                        return (
                          <button
                            key={a.value}
                            onClick={() => setStatus(item.id, a.value)}
                            disabled={disabled || current}
                            className={`text-[12px] px-2.5 py-1 rounded-full border font-montserrat transition-colors cursor-pointer disabled:cursor-default ${
                              current
                                ? 'border-salve-sage/40 bg-salve-sage/10 text-salve-sage'
                                : 'border-salve-border text-salve-textMid hover:border-salve-lav/40 hover:text-salve-lav'
                            } ${disabled ? 'opacity-60' : ''}`}
                          >
                            {a.label}
                          </button>
                        );
                      })}
                      {/* Delete — sits alongside status buttons on the right. Opens
                          the standard ConfirmBar so mis-clicks can't nuke data. */}
                      <button
                        onClick={() => delFeedback.ask(item.id, `${meta.label} from ${userLabel}`)}
                        className="ml-auto flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-full border border-salve-rose/30 text-salve-rose bg-transparent hover:bg-salve-rose/5 font-montserrat cursor-pointer"
                        aria-label={`Delete ${meta.label}`}
                      >
                        <Trash2 size={11} />
                        Delete
                      </button>
                    </div>
                    <ConfirmBar
                      pending={delFeedback.pending}
                      onConfirm={() => delFeedback.confirm(deleteFeedback)}
                      onCancel={delFeedback.cancel}
                      itemId={item.id}
                    />
                    {item.response && (
                      <div className="mt-3 p-2.5 rounded-lg bg-salve-sage/8 border border-salve-sage/15">
                        <p className="text-[11px] text-salve-sage font-montserrat uppercase tracking-wider mb-1">
                          Response sent
                          {item.responded_at && (
                            <span className="ml-2 opacity-70 normal-case tracking-normal">
                              {formatDate(item.responded_at)}
                            </span>
                          )}
                        </p>
                        <p className="text-[13px] text-salve-textMid font-montserrat m-0 leading-relaxed whitespace-pre-wrap">
                          {item.response}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
