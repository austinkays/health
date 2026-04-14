import { useState, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare, Bug, Lightbulb, ChevronDown, RefreshCw, Shield } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { isAdminActive } from '../../services/ai';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import SkeletonList from '../ui/SkeletonCard';
import { C } from '../../constants/colors';

const TYPE_META = {
  feedback:   { label: 'Feedback',   icon: MessageSquare, color: C.lav },
  bug:        { label: 'Bug',        icon: Bug,           color: C.rose },
  suggestion: { label: 'Suggestion', icon: Lightbulb,     color: C.amber },
};

const STATUS_META = {
  open:        { label: 'Unreviewed', color: C.lav },
  seen:        { label: 'Seen',        color: C.textFaint },
  in_progress: { label: 'In Progress', color: C.amber },
  resolved:    { label: 'Resolved',    color: C.sage },
  wont_fix:    { label: "Won't fix",   color: C.textFaint },
};

const FILTERS = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'all',        label: 'All' },
  { value: 'bug',        label: 'Bugs' },
  { value: 'suggestion', label: 'Suggestions' },
  { value: 'feedback',   label: 'Feedback' },
];

const STATUS_ACTIONS = [
  { value: 'seen',        label: 'Mark reviewed' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'wont_fix',    label: "Won't fix" },
];

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Admin({ data, onNav }) {
  const isAdmin = isAdminActive(data?.settings);

  // Silently redirect non-admins to home so the page feels like it doesn't exist.
  useEffect(() => {
    if (!isAdmin) onNav('dash');
  }, [isAdmin, onNav]);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [items, setItems]     = useState([]);
  const [filter, setFilter]   = useState('unreviewed');
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId]     = useState(null);

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

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'unreviewed') return items.filter(i => (i.status || 'open') === 'open');
    return items.filter(i => i.type === filter);
  }, [items, filter]);

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

  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
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
          {filtered.map(item => {
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
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
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
                    <p className="text-[11px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-2">
                      Set status
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
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
                    </div>
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
    </div>
  );
}
