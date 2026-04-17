import { useMemo } from 'react';
import { Activity, Users, TrendingUp, Zap, DollarSign, RefreshCw, Palette, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import Card from '../ui/Card';
import { C } from '../../constants/colors';
import { themes } from '../../constants/themes';
import { formatNum, formatUSD } from './formatters';
import StatCard from './StatCard';
import DauSparkline from './DauSparkline';
import TopList, { renderEndpointCost } from './TopList';

const THEME_PIE_TOP = 8;

function ThemeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-salve-card px-2 py-1 rounded shadow text-xs text-salve-text border border-salve-border">
      <span className="font-medium capitalize">{d.theme}</span>: {d.count}
    </div>
  );
}

function themeColor(name) {
  if (name === 'other') return C.textFaint;
  return themes[name]?.colors?.lav || C.lav;
}

function ThemeDistributionChart({ data }) {
  if (!data?.length) return null;
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, THEME_PIE_TOP);
  const rest = sorted.slice(THEME_PIE_TOP);
  const items = [...top];
  if (rest.length) {
    items.push({ theme: 'other', count: rest.reduce((s, r) => s + r.count, 0) });
  }
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Palette size={11} className="text-salve-textFaint" />
        <span className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat">
          Theme popularity (30d)
        </span>
      </div>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="count"
              nameKey="theme"
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={70}
              paddingAngle={2}
            >
              {items.map((entry, i) => (
                <Cell key={i} fill={themeColor(entry.theme)} />
              ))}
            </Pie>
            <RechartsTooltip content={<ThemeTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 justify-center">
        {items.map(entry => (
          <div key={entry.theme} className="flex items-center gap-1 text-[10px] text-salve-textMid">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: themeColor(entry.theme) }} />
            {entry.theme}
          </div>
        ))}
      </div>
    </div>
  );
}

function getPTOffset() {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' });
  const match = fmt.format(new Date()).match(/GMT([+-]\d+)/);
  return match ? Number(match[1]) : -8;
}

const PT_OFFSET = getPTOffset();

function utcHourToPT(h) {
  return ((h + PT_OFFSET) % 24 + 24) % 24;
}

function HourlyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-salve-card px-2 py-1 rounded shadow text-xs text-salve-text border border-salve-border">
      <span className="font-medium">{String(d.hour).padStart(2, '0')}:00 PT</span>
      <span className="mx-1">·</span>
      {d.events} events · {d.users} users
    </div>
  );
}

function HourlyDistributionChart({ data }) {
  if (!data?.length) return null;
  const ptData = data.map(d => ({ ...d, hour: utcHourToPT(d.hour) })).sort((a, b) => a.hour - b.hour);
  const maxEvents = Math.max(...ptData.map(d => d.events), 1);
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Clock size={11} className="text-salve-textFaint" />
        <span className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat">
          Usage by hour — last 7 days (PT)
        </span>
      </div>
      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={ptData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 9, fill: C.textFaint }}
              tickFormatter={h => h % 3 === 0 ? `${String(h).padStart(2, '0')}:00` : ''}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: C.textFaint }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <RechartsTooltip content={<HourlyTooltip />} cursor={{ fill: C.lav, opacity: 0.08 }} />
            <Bar dataKey="events" radius={[3, 3, 0, 0]}>
              {ptData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={C.lav}
                  fillOpacity={0.3 + 0.7 * (entry.events / maxEvents)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[9px] text-salve-textFaint font-montserrat text-center mt-1 m-0">
        All times Pacific · brighter bars = more activity
      </p>
    </div>
  );
}

export default function StatsPanel({ stats, loading, error, onRefresh }) {
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

      {/* Live users badge */}
      {stats?.active_now != null && (
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg bg-salve-sage/10 border border-salve-sage/20 w-fit">
          <span className="pulse-dot w-2 h-2 rounded-full bg-salve-sage shrink-0" />
          <span className="text-[12px] font-medium text-salve-sage font-montserrat tabular-nums">
            {stats.active_now} active now
          </span>
          <span className="text-[10px] text-salve-textFaint font-montserrat">last 5 min</span>
        </div>
      )}

      {error && (
        <p className="text-[12px] text-salve-rose font-montserrat m-0 mb-2">{error}</p>
      )}

      {loading && !stats && (
        <div className="text-[12px] text-salve-textFaint font-montserrat">Loading stats…</div>
      )}

      {stats && (
        <div className="space-y-4">
          {/* Cost cards — Claude is the paid one that threatens the budget,
              Gemini is shown as context. Split so the admin can tell at a
              glance whether the run rate is from the provider that costs
              real money. Rose = attention; muted = free tier. */}
          {(stats.claude_cost_7d != null || stats.gemini_cost_7d != null) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-salve-rose/30 bg-salve-rose/5 p-3">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-salve-rose font-montserrat mb-1">
                  <DollarSign size={10} />
                  <span>Claude spend (7d)</span>
                </div>
                <div className="text-2xl font-semibold text-salve-text font-montserrat tabular-nums leading-none">
                  {formatUSD(stats.claude_cost_7d)}
                </div>
                <div className="text-[11px] text-salve-textFaint font-montserrat mt-1.5">
                  {formatUSD((Number(stats.claude_cost_7d) || 0) * 52 / 12)}/mo run rate
                  {stats.claude_cost_30d != null && stats.claude_cost_30d > 0 && (
                    <span className="opacity-70"> · {formatUSD(stats.claude_cost_30d)} in 30d</span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-salve-border bg-salve-card2/40 p-3">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-salve-textMid font-montserrat mb-1">
                  <DollarSign size={10} />
                  <span>Gemini spend (7d)</span>
                </div>
                <div className="text-2xl font-semibold text-salve-textMid font-montserrat tabular-nums leading-none">
                  {formatUSD(stats.gemini_cost_7d)}
                </div>
                <div className="text-[11px] text-salve-textFaint font-montserrat mt-1.5">
                  Free tier · {formatNum(stats.api_tokens_7d)} tokens total
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

          {/* Theme popularity pie chart */}
          <ThemeDistributionChart data={stats.theme_distribution} />

          {/* Hourly usage heatmap */}
          <HourlyDistributionChart data={stats.hourly_distribution} />
        </div>
      )}
    </Card>
  );
}
