import { useState, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare, Bug, Lightbulb, ChevronDown, RefreshCw, Shield, Activity, Users, TrendingUp, Zap } from 'lucide-react';
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

function formatNum(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 10_000) return (num / 1000).toFixed(0) + 'k';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toLocaleString();
}

// Short section/feature/endpoint labels for the top-N lists
function prettyLabel(raw) {
  if (!raw) return '(unknown)';
  // /api/gemini → gemini, section keys → title-case
  return String(raw)
    .replace(/^\/?api\//, '')
    .replace(/\.js$/, '')
    .replace(/_/g, ' ');
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-salve-border bg-salve-card2/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-1">
        {label}
      </div>
      <div className="text-xl font-semibold text-salve-text font-montserrat tabular-nums leading-none">
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-salve-textFaint font-montserrat mt-1.5">
          {hint}
        </div>
      )}
    </div>
  );
}

// Tiny inline SVG bar chart for the 14-day DAU series. No Recharts
// dependency — keeps this panel cheap.
function DauSparkline({ series }) {
  if (!Array.isArray(series) || series.length === 0) {
    return <div className="text-[11px] text-salve-textFaint font-montserrat">No activity yet.</div>;
  }
  const max = Math.max(1, ...series.map(d => d.users || 0));
  const W = 280;
  const H = 48;
  const gap = 3;
  const barW = Math.max(1, (W - gap * (series.length - 1)) / series.length);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`Daily active users, last ${series.length} days`}
      className="block"
    >
      {series.map((d, i) => {
        const h = Math.max(2, ((d.users || 0) / max) * (H - 4));
        const x = i * (barW + gap);
        const y = H - h;
        return (
          <rect
            key={d.date || i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1.5}
            fill={C.lav}
            opacity={d.users > 0 ? 0.85 : 0.2}
          >
            <title>{`${d.date}: ${d.users} ${d.users === 1 ? 'user' : 'users'}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function TopList({ items, labelKey, valueKey = 'count', emptyText, accent = C.lav, max = 8 }) {
  if (!items || items.length === 0) {
    return <div className="text-[11px] text-salve-textFaint font-montserrat">{emptyText}</div>;
  }
  const top = items.slice(0, max);
  const peak = Math.max(1, ...top.map(i => i[valueKey] || 0));
  return (
    <div className="space-y-1.5">
      {top.map((item, i) => {
        const val = item[valueKey] || 0;
        const pct = (val / peak) * 100;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[11px] text-salve-textMid font-montserrat truncate">
                  {prettyLabel(item[labelKey])}
                </span>
                <span className="text-[11px] text-salve-textFaint font-montserrat tabular-nums shrink-0">
                  {formatNum(val)}
                </span>
              </div>
              <div className="h-1 rounded-full bg-salve-border/50 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: accent, opacity: 0.7 }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [stats, setStats]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_admin_stats');
      if (rpcErr) throw rpcErr;
      setStats(data || null);
    } catch (err) {
      console.error('Failed to load admin stats:', err);
      setError(err?.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tierBreakdown = useMemo(() => {
    const byTier = stats?.users_by_tier || {};
    return Object.entries(byTier)
      .sort((a, b) => b[1] - a[1])
      .map(([tier, n]) => `${n} ${tier}`)
      .join(' · ');
  }, [stats]);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Activity size={14} className="text-salve-lav" />
        <h3 className="text-[13px] font-semibold text-salve-text font-montserrat m-0">
          Beta traffic & usage
        </h3>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refresh stats"
          className="ml-auto flex items-center gap-1 text-[11px] text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer font-montserrat disabled:opacity-50"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-[12px] text-salve-rose font-montserrat m-0 mb-2">{error}</p>
      )}

      {loading && !stats && (
        <div className="text-[12px] text-salve-textFaint font-montserrat">Loading stats…</div>
      )}

      {stats && (
        <div className="space-y-4">
          {/* Headline stat grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard
              label="Total users"
              value={formatNum(stats.users_total)}
              hint={tierBreakdown || '—'}
            />
            <StatCard
              label="Active (24h)"
              value={formatNum(stats.dau)}
              hint={`${formatNum(stats.wau)} this week`}
            />
            <StatCard
              label="Active (30d)"
              value={formatNum(stats.mau)}
              hint={`${formatNum(stats.events_last_30d)} events`}
            />
            <StatCard
              label="New signups"
              value={formatNum(stats.signups_last_7d)}
              hint={`${formatNum(stats.signups_last_30d)} last 30d`}
            />
            <StatCard
              label="On trial"
              value={formatNum(stats.users_in_trial)}
              hint="Premium trial active"
            />
            <StatCard
              label="API calls (7d)"
              value={formatNum(stats.api_calls_7d)}
              hint={`${formatNum(stats.api_tokens_7d)} tokens`}
            />
            <StatCard
              label="Feedback"
              value={formatNum(stats.feedback_total)}
              hint={`${formatNum(stats.feedback_unreviewed)} unreviewed`}
            />
            <StatCard
              label="Events (7d)"
              value={formatNum(stats.events_last_7d)}
              hint="All tracked events"
            />
          </div>

          {/* DAU sparkline */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp size={11} className="text-salve-textFaint" />
              <span className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat">
                Daily active users — last 14 days
              </span>
            </div>
            <DauSparkline series={stats.dau_series_14d} />
          </div>

          {/* Two-column top lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users size={11} className="text-salve-textFaint" />
                <span className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat">
                  Top sections (30d)
                </span>
              </div>
              <TopList
                items={stats.sections_30d}
                labelKey="section"
                emptyText="No section traffic yet."
                accent={C.lav}
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Zap size={11} className="text-salve-textFaint" />
                <span className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat">
                  AI features used (30d)
                </span>
              </div>
              <TopList
                items={stats.ai_features_30d}
                labelKey="feature"
                emptyText="No AI features run yet."
                accent={C.sage}
              />
            </div>
          </div>

          {/* API endpoint breakdown */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Activity size={11} className="text-salve-textFaint" />
              <span className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat">
                API calls by endpoint (7d)
              </span>
            </div>
            <TopList
              items={stats.api_by_endpoint_7d}
              labelKey="endpoint"
              valueKey="calls"
              emptyText="No API calls yet."
              accent={C.amber}
            />
          </div>
        </div>
      )}
    </Card>
  );
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
      <StatsPanel />

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
