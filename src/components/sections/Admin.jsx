import { useState, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare, Bug, Lightbulb, ChevronDown, ChevronLeft, RefreshCw, Shield, Activity, Users, TrendingUp, Zap, DollarSign, AlertTriangle } from 'lucide-react';
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

// USD formatter with auto precision — shows 4 decimals under $0.01,
// 2 decimals for everything else so we don't lose fractions of a cent during
// the beta when total spend is tiny.
function formatUSD(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  if (num === 0) return '$0.00';
  if (num < 0.01) return '$' + num.toFixed(4);
  if (num < 100) return '$' + num.toFixed(2);
  return '$' + num.toLocaleString(undefined, { maximumFractionDigits: 0 });
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

function TopList({ items, labelKey, valueKey = 'count', formatValue = formatNum, secondary, emptyText, accent = C.lav, max = 8 }) {
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
        // Optional secondary metric (e.g. cost under call count for API breakdown)
        const secondaryText = secondary ? secondary(item) : null;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[11px] text-salve-textMid font-montserrat truncate">
                  {prettyLabel(item[labelKey])}
                </span>
                <span className="text-[11px] text-salve-textFaint font-montserrat tabular-nums shrink-0">
                  {formatValue(val)}
                  {secondaryText && (
                    <span className="ml-1.5 opacity-70">{secondaryText}</span>
                  )}
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

// Shared stats fetch — lifted out of StatsPanel so UserDrilldown can consume
// the same `users_by_activity_7d` without making a second RPC call.
function useAdminStats() {
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

  return { stats, loading, error, refresh: load };
}

function StatsPanel({ stats, loading, error, onRefresh }) {
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
          onClick={onRefresh}
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
          {/* Cost cards — headline spend at a glance. 7d × 52 / 12 = monthly run rate. */}
          {(stats.cost_7d_usd != null || stats.cost_30d_usd != null) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-salve-sage/25 bg-salve-sage/5 p-3">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-salve-sage font-montserrat mb-1">
                  <DollarSign size={10} />
                  <span>Spend (7d)</span>
                </div>
                <div className="text-2xl font-semibold text-salve-text font-montserrat tabular-nums leading-none">
                  {formatUSD(stats.cost_7d_usd)}
                </div>
                <div className="text-[11px] text-salve-textFaint font-montserrat mt-1.5">
                  {formatUSD((Number(stats.cost_7d_usd) || 0) * 52 / 12)}/mo run rate
                </div>
              </div>
              <div className="rounded-lg border border-salve-sage/25 bg-salve-sage/5 p-3">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-salve-sage font-montserrat mb-1">
                  <DollarSign size={10} />
                  <span>Spend (30d)</span>
                </div>
                <div className="text-2xl font-semibold text-salve-text font-montserrat tabular-nums leading-none">
                  {formatUSD(stats.cost_30d_usd)}
                </div>
                <div className="text-[11px] text-salve-textFaint font-montserrat mt-1.5">
                  {formatNum(stats.api_tokens_7d)} tokens (7d)
                </div>
              </div>
            </div>
          )}

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
              hint={
                stats.trial_expiring_7d > 0
                  ? `${formatNum(stats.trial_expiring_7d)} expiring this week`
                  : 'Premium trial active'
              }
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
            {/* Tier-gate pressure — if this climbs, the premium wall is hurting.
                Only render when there's data to avoid an empty "0" card during
                the closed-beta period. */}
            {stats.chat_blocked_7d > 0 && (
              <StatCard
                label="Claude blocked (7d)"
                value={formatNum(stats.chat_blocked_7d)}
                hint="Free users hitting premium wall"
              />
            )}
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
              secondary={renderEndpointCost}
              emptyText="No API calls yet."
              accent={C.amber}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

// Module-level helper so `secondary` is a stable reference across
// StatsPanel re-renders — otherwise TopList children would see a new
// function identity every render.
function renderEndpointCost(item) {
  if (item.cost_usd == null || Number(item.cost_usd) === 0) return null;
  return formatUSD(item.cost_usd);
}

// ─── Per-user drill-down ──────────────────────────────────────────────────
// Top-level component (not nested in Admin) so it follows React's
// rerender-no-inline-components rule — a fresh function identity on every
// parent render would remount the entire subtree and lose its state.
//
// PHI GUARD: the detail RPC is designed to return engagement counts only,
// but we also sanity-check the response at runtime so a future RPC regression
// can't silently leak record content into the admin UI.
function UserDrilldown({ users, onViewUserFeedback }) {
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Cache per-user details so re-opening the same user is instant.
  const [cache, setCache] = useState({});

  const selectUser = useCallback(async (userId) => {
    setSelectedId(userId);
    setError(null);
    if (cache[userId]) {
      setDetail(cache[userId]);
      return;
    }
    setLoading(true);
    setDetail(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_admin_user_detail', {
        p_user_id: userId,
      });
      if (rpcErr) throw rpcErr;

      // PHI assertion: response must NOT contain any known health-data table
      // names as top-level keys (those would be arrays of row content, not
      // just counts). The only allowed keys are profile/usage_7d/api_7d/
      // feedback/record_counts. record_counts itself is an object of integers.
      if (data && typeof data === 'object') {
        const forbidden = ['medications', 'meds', 'journal_entries', 'journal',
                          'vitals', 'labs', 'conditions', 'allergies'];
        for (const key of forbidden) {
          if (Array.isArray(data[key])) {
            console.error('[admin] PHI leak: RPC returned array at', key);
            throw new Error('Drill-down RPC returned record content — aborting for PHI safety.');
          }
        }
      }

      setDetail(data);
      setCache(prev => ({ ...prev, [userId]: data }));
    } catch (err) {
      console.error('Failed to load user detail:', err);
      setError(err?.message || 'Failed to load user detail');
    } finally {
      setLoading(false);
    }
  }, [cache]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setError(null);
  }, []);

  // Empty state — show guidance while the stats parent is still loading.
  if (!users || users.length === 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-salve-lav" />
          <h3 className="text-[13px] font-semibold text-salve-text font-montserrat m-0">
            Most active users (7d)
          </h3>
        </div>
        <div className="text-[11px] text-salve-textFaint font-montserrat">
          No active users in the last 7 days.
        </div>
      </Card>
    );
  }

  // Collapsed state — user list
  if (!selectedId) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-salve-lav" />
          <h3 className="text-[13px] font-semibold text-salve-text font-montserrat m-0">
            Most active users (7d)
          </h3>
          <span className="ml-auto text-[11px] text-salve-textFaint font-montserrat">
            Tap a user to drill in
          </span>
        </div>
        <div className="space-y-1.5">
          {users.map(u => (
            <UserRow key={u.user_id} user={u} onClick={() => selectUser(u.user_id)} />
          ))}
        </div>
      </Card>
    );
  }

  // Expanded state — detail pane
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={clearSelection}
          aria-label="Back to user list"
          className="flex items-center gap-1 text-[11px] text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer font-montserrat"
        >
          <ChevronLeft size={13} />
          Back
        </button>
        <span className="ml-auto text-[10px] text-salve-textFaint font-mono">
          {selectedId?.slice(0, 8)}
        </span>
      </div>

      {loading && (
        <div className="text-[12px] text-salve-textFaint font-montserrat">Loading user detail…</div>
      )}

      {error && (
        <p className="text-[12px] text-salve-rose font-montserrat m-0">{error}</p>
      )}

      {detail && <UserDetailPane detail={detail} onViewUserFeedback={onViewUserFeedback} />}
    </Card>
  );
}

// Single row in the user list — memoized so parent re-renders don't cascade.
function UserRow({ user, onClick }) {
  const name = user.name?.trim() || 'Unnamed user';
  const tierColor = user.tier === 'admin' ? C.amber : user.tier === 'premium' ? C.lav : C.textFaint;
  const trialSoon = (() => {
    if (!user.trial_expires_at) return false;
    const ms = new Date(user.trial_expires_at).getTime() - Date.now();
    return ms > 0 && ms < 7 * 24 * 60 * 60 * 1000;
  })();
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-transparent hover:bg-salve-card2/40 border border-transparent hover:border-salve-border/50 cursor-pointer text-left transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-salve-text font-montserrat truncate">
            {name}
          </span>
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full font-montserrat uppercase tracking-wider"
            style={{ background: `${tierColor}15`, color: tierColor }}
          >
            {user.tier}
          </span>
          {trialSoon && (
            <AlertTriangle size={10} className="text-salve-amber" aria-label="Trial ending soon" />
          )}
        </div>
        <div className="text-[10px] text-salve-textFaint font-mono mt-0.5">
          {user.user_id?.slice(0, 8)}
        </div>
      </div>
      <span className="text-[11px] text-salve-textFaint font-montserrat tabular-nums shrink-0">
        {formatNum(user.events)} ev
      </span>
    </button>
  );
}

// Detail pane body — pure render, no fetching. Fetching happens in parent.
function UserDetailPane({ detail, onViewUserFeedback }) {
  const profile = detail?.profile || {};
  const api7d = detail?.api_7d || {};
  const usage7d = detail?.usage_7d || {};
  const counts = detail?.record_counts || {};
  const feedbackCount = Array.isArray(detail?.feedback) ? detail.feedback.length : 0;

  return (
    <div className="space-y-4">
      {/* Profile header */}
      <div>
        <div className="text-[14px] font-semibold text-salve-text font-montserrat">
          {profile.name?.trim() || 'Unnamed user'}
        </div>
        {profile.email && (
          <div className="text-[11px] text-salve-textFaint font-montserrat mt-0.5">
            {profile.email}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full font-montserrat uppercase tracking-wider"
            style={{
              background: `${profile.tier === 'admin' ? C.amber : profile.tier === 'premium' ? C.lav : C.textFaint}18`,
              color:       profile.tier === 'admin' ? C.amber : profile.tier === 'premium' ? C.lav : C.textFaint,
            }}
          >
            {profile.tier || 'free'}
          </span>
          {profile.trial_expires_at && (
            <span className="text-[10px] text-salve-textFaint font-montserrat">
              trial ends {new Date(profile.trial_expires_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Record counts — engagement, not content */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-2">
          Records (counts only — no content)
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
          {[
            ['Meds',    counts.medications],
            ['Conds',   counts.conditions],
            ['Vitals',  counts.vitals],
            ['Journal', counts.journal],
            ['Todos',   counts.todos],
            ['Activity',counts.activities],
          ].map(([label, n]) => (
            <div key={label} className="rounded-md border border-salve-border bg-salve-card2/40 p-2 text-center">
              <div className="text-[9px] uppercase tracking-wider text-salve-textFaint font-montserrat">
                {label}
              </div>
              <div className="text-[14px] font-semibold text-salve-text font-montserrat tabular-nums">
                {n ?? '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* API usage + cost */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-2">
          API usage (7d)
        </div>
        <div className="flex items-baseline gap-3 mb-2">
          <div className="text-[18px] font-semibold text-salve-text font-montserrat tabular-nums">
            {formatUSD(api7d.cost_usd)}
          </div>
          <div className="text-[11px] text-salve-textFaint font-montserrat">
            {formatNum(api7d.calls_total)} calls · {formatNum(api7d.tokens_total)} tokens
          </div>
        </div>
        <TopList
          items={api7d.by_endpoint}
          labelKey="endpoint"
          valueKey="calls"
          secondary={renderEndpointCost}
          emptyText="No API calls in the last 7d."
          accent={C.amber}
          max={6}
        />
      </div>

      {/* Section + AI feature mini-lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-2">
            Top sections (7d)
          </div>
          <TopList
            items={usage7d.sections}
            labelKey="section"
            emptyText="No section traffic."
            accent={C.lav}
            max={5}
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-2">
            AI features (7d)
          </div>
          <TopList
            items={usage7d.ai_features}
            labelKey="feature"
            emptyText="No AI features run."
            accent={C.sage}
            max={5}
          />
        </div>
      </div>

      {/* Feedback filter shortcut */}
      {feedbackCount > 0 && onViewUserFeedback && (
        <button
          onClick={() => onViewUserFeedback(profile.user_id)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-salve-lav/10 border border-salve-lav/25 text-[12px] text-salve-lav font-montserrat cursor-pointer hover:bg-salve-lav/15"
        >
          <MessageSquare size={12} />
          View {feedbackCount} feedback {feedbackCount === 1 ? 'item' : 'items'} from this user
        </button>
      )}
    </div>
  );
}

export default function Admin({ data, onNav }) {
  const isAdmin = isAdminActive(data?.settings);

  // Silently redirect non-admins to home so the page feels like it doesn't exist.
  useEffect(() => {
    if (!isAdmin) onNav('dash');
  }, [isAdmin, onNav]);

  // Shared stats fetch — feeds both StatsPanel and UserDrilldown.
  const { stats, loading: statsLoading, error: statsError, refresh: refreshStats } = useAdminStats();

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [items, setItems]     = useState([]);
  const [filter, setFilter]   = useState('unreviewed');
  const [userFilterId, setUserFilterId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId]     = useState(null);
  // Per-feedback-item reply drafts. Keyed by feedback id so each card has its own state.
  const [replyDraft, setReplyDraft] = useState({});
  const [savingReply, setSavingReply] = useState(null);

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

  // Called from UserDrilldown → filters the feedback list to this user + switches
  // to the 'all' pill so they see everything regardless of triage status.
  const handleViewUserFeedback = useCallback((userId) => {
    setUserFilterId(userId);
    setFilter('all');
    // Smooth scroll to the feedback section for clarity
    requestAnimationFrame(() => {
      window.scrollBy({ top: 200, behavior: 'smooth' });
    });
  }, []);

  const clearUserFilter = useCallback(() => setUserFilterId(null), []);

  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      <StatsPanel
        stats={stats}
        loading={statsLoading}
        error={statsError}
        onRefresh={refreshStats}
      />

      <UserDrilldown
        users={stats?.users_by_activity_7d}
        onViewUserFeedback={handleViewUserFeedback}
      />

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

      {/* Active user filter chip (shown when drill-down called handleViewUserFeedback) */}
      {userFilterId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-salve-lav/8 border border-salve-lav/20">
          <span className="text-[11px] text-salve-lav font-montserrat">
            Filtering feedback by user <span className="font-mono opacity-70">{userFilterId.slice(0, 8)}</span>
          </span>
          <button
            onClick={clearUserFilter}
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
