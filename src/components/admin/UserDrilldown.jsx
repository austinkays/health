import { useState, useCallback } from 'react';
import { MessageSquare, ChevronLeft, Users } from 'lucide-react';
import { supabase } from '../../services/supabase';
import Card from '../ui/Card';
import { C } from '../../constants/colors';
import { formatNum, formatUSD, trialStatus } from './formatters';
import TopList, { renderEndpointCost } from './TopList';

// Top-level component (not nested in Admin) so it follows React's
// rerender-no-inline-components rule — a fresh function identity on every
// parent render would remount the entire subtree and lose its state.
//
// PHI GUARD: the detail RPC is designed to return engagement counts only,
// but we also sanity-check the response at runtime so a future RPC regression
// can't silently leak record content into the admin UI.
export default function UserDrilldown({ users, onViewUserFeedback }) {
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

// Single row in the user list. Shows everything Austin needs at a glance
// for beta-code budget math: who they are, tier, trial countdown, Claude
// cost burn, events, and an unread feedback flag.
function UserRow({ user, onClick }) {
  const name = user.name?.trim() || 'Unnamed user';
  const tierColor =
    user.tier === 'admin'   ? C.amber :
    user.tier === 'premium' ? C.lav   :
                              C.textFaint;
  const { days: trialDays, urgency } = trialStatus(user.trial_expires_at);
  const trialColor =
    urgency === 'expired' ? C.rose :
    urgency === 'soon'    ? C.rose :
    urgency === 'watch'   ? C.amber :
                            C.textFaint;
  const claudeCost = Number(user.claude_cost_7d) || 0;
  const hasUnreviewed = (user.unreviewed_feedback || 0) > 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-transparent hover:bg-salve-card2/40 border border-transparent hover:border-salve-border/50 cursor-pointer text-left transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] text-salve-text font-montserrat truncate">
            {name}
          </span>
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full font-montserrat uppercase tracking-wider"
            style={{ background: `${tierColor}15`, color: tierColor }}
          >
            {user.tier}
          </span>
          {/* Trial countdown — only shown for trial users (premium + trial_expires_at set).
              Paid premium and admin have no countdown. */}
          {trialDays != null && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full font-montserrat"
              style={{ background: `${trialColor}15`, color: trialColor }}
              title={`Trial ends ${new Date(user.trial_expires_at).toLocaleDateString()}`}
            >
              {urgency === 'expired'
                ? 'trial expired'
                : `${trialDays}d left`}
            </span>
          )}
          {hasUnreviewed && (
            <span
              className="flex items-center gap-0.5 text-[9px] font-semibold text-salve-lav"
              title={`${user.unreviewed_feedback} unreviewed feedback ${user.unreviewed_feedback === 1 ? 'item' : 'items'}`}
            >
              <MessageSquare size={9} />
              {user.unreviewed_feedback}
            </span>
          )}
        </div>
        <div className="text-[10px] text-salve-textFaint font-mono mt-0.5">
          {user.user_id?.slice(0, 8)}
        </div>
      </div>
      {/* Right column: events + claude cost stacked. Events in faint,
          Claude spend beneath in rose if > 0 (the number that matters
          for beta-code budget math). */}
      <div className="shrink-0 text-right">
        <div className="text-[11px] text-salve-textFaint font-montserrat tabular-nums">
          {formatNum(user.events)} events
        </div>
        {claudeCost > 0 && (
          <div className="text-[10px] text-salve-rose font-montserrat tabular-nums mt-0.5">
            {formatUSD(claudeCost)} Claude
          </div>
        )}
      </div>
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

  const { days: trialDays, urgency: trialUrgency } = trialStatus(profile.trial_expires_at);
  const trialBadgeColor =
    trialUrgency === 'expired' ? C.rose :
    trialUrgency === 'soon'    ? C.rose :
    trialUrgency === 'watch'   ? C.amber :
                                 C.textFaint;

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
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full font-montserrat uppercase tracking-wider"
            style={{
              background: `${profile.tier === 'admin' ? C.amber : profile.tier === 'premium' ? C.lav : C.textFaint}18`,
              color:       profile.tier === 'admin' ? C.amber : profile.tier === 'premium' ? C.lav : C.textFaint,
            }}
          >
            {profile.tier || 'free'}
          </span>
          {/* Trial countdown: only shown when trial_expires_at is set.
              Paid premium users (no trial) get no badge. */}
          {trialDays != null && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full font-montserrat"
              style={{ background: `${trialBadgeColor}15`, color: trialBadgeColor }}
            >
              {trialUrgency === 'expired'
                ? `trial expired ${Math.abs(trialDays)}d ago`
                : `trial ends in ${trialDays}d`}
            </span>
          )}
          {profile.trial_expires_at && (
            <span className="text-[10px] text-salve-textFaint font-montserrat">
              · {new Date(profile.trial_expires_at).toLocaleDateString()}
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
