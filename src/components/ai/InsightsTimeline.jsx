import { useMemo, useState } from 'react';
import { Leaf, ThumbsUp, ThumbsDown, ChevronDown } from 'lucide-react';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import AIMarkdown from '../ui/AIMarkdown';
import ThumbsRating from '../ui/ThumbsRating';
import { fmtDate } from '../../utils/dates';
import { loadRecentInsights } from '../../services/insights';

// Per-focus-area pill colors — leans on the existing CSS variable palette so
// themes apply automatically. Ordering roughly matches the frequency we
// expect in rotation for an active user.
const FOCUS_META = {
  sleep:        { label: 'Sleep',        cls: 'bg-salve-lav/15 text-salve-lav border-salve-lav/30' },
  medication:   { label: 'Medication',   cls: 'bg-salve-sage/15 text-salve-sage border-salve-sage/30' },
  nutrition:    { label: 'Nutrition',    cls: 'bg-salve-sage/15 text-salve-sage border-salve-sage/30' },
  exercise:     { label: 'Exercise',     cls: 'bg-salve-sage/15 text-salve-sage border-salve-sage/30' },
  cycle:        { label: 'Cycle',        cls: 'bg-salve-amber/15 text-salve-amber border-salve-amber/30' },
  symptom:      { label: 'Symptom',      cls: 'bg-salve-rose/15 text-salve-rose border-salve-rose/30' },
  prevention:   { label: 'Prevention',   cls: 'bg-salve-lav/15 text-salve-lav border-salve-lav/30' },
  condition:    { label: 'Condition',    cls: 'bg-salve-lav/15 text-salve-lav border-salve-lav/30' },
  connection:   { label: 'Connection',   cls: 'bg-salve-lav/15 text-salve-lav border-salve-lav/30' },
  lifestyle:    { label: 'Lifestyle',    cls: 'bg-salve-sage/15 text-salve-sage border-salve-sage/30' },
  encouragement:{ label: 'Encouragement',cls: 'bg-salve-sage/15 text-salve-sage border-salve-sage/30' },
  research:     { label: 'Research',     cls: 'bg-salve-lav/15 text-salve-lav border-salve-lav/30' },
  general:      { label: 'General',      cls: 'bg-salve-border/30 text-salve-textFaint border-salve-border' },
};

function FocusBadge({ area }) {
  const meta = FOCUS_META[area] || FOCUS_META.general;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-montserrat ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// Bucket entries into week/month groups. Keys:
//   "This week" / "Last week" / "N weeks ago" (weeks 2-4) / "Month Year" (older).
function groupByWeek(entries) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const groups = [];
  const byKey = {};

  for (const e of entries) {
    if (!e.generated_on) continue;
    const d = new Date(e.generated_on + 'T12:00:00');
    const daysAgo = Math.floor((now - d) / 86400000);
    let key;
    if (daysAgo < 7) key = 'This week';
    else if (daysAgo < 14) key = 'Last week';
    else if (daysAgo < 28) key = `${Math.floor(daysAgo / 7)} weeks ago`;
    else key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (!byKey[key]) {
      byKey[key] = { label: key, entries: [] };
      groups.push(byKey[key]);
    }
    byKey[key].entries.push(e);
  }
  return groups;
}

function TimelineEntry({ entry, insightRatings, isOpen, onToggle }) {
  const rating = insightRatings?.getRating?.('insight', entry.generated_on) ?? entry.rating ?? 0;
  return (
    <div className="py-3 px-4 transition-colors hover:bg-salve-card2/40">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 text-left bg-transparent border-none cursor-pointer p-0"
        aria-expanded={isOpen}
      >
        <Leaf size={14} className="text-salve-sage mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <FocusBadge area={entry.focus_area} />
            <span className="text-[12px] text-salve-textFaint font-montserrat">{fmtDate(entry.generated_on)}</span>
            {rating === 1 && <ThumbsUp size={11} className="text-salve-sage" />}
            {rating === -1 && <ThumbsDown size={11} className="text-salve-rose" />}
          </div>
          {isOpen ? (
            <AIMarkdown compact>{entry.text || ''}</AIMarkdown>
          ) : (
            <p className="text-[13px] text-salve-text font-montserrat leading-relaxed line-clamp-2">
              {(entry.text || '').replace(/^[🌙🌞✨💊🌱🫀🧠💜🤍💙🌸🍃⚡️🌿🕊️☀️🌻🌷🌟]+\s*/u, '')}
            </p>
          )}
          {entry.seed_pattern_title && isOpen && (
            <p className="text-[11px] text-salve-textFaint font-montserrat mt-2 italic">
              Grounded in: {entry.seed_pattern_title}
            </p>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-salve-textFaint flex-shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && insightRatings && (
        <div className="mt-2 ml-6">
          <ThumbsRating
            surface="insight"
            contentKey={entry.generated_on}
            getRating={insightRatings.getRating}
            rate={insightRatings.rate}
            size={11}
          />
        </div>
      )}
    </div>
  );
}

// Renders the user's past daily insights. Pulls from data.generated_insights
// (already hydrated by load_all_data) for an instant render, and optionally
// refreshes from Supabase via loadRecentInsights for rating reconciliation.
export default function InsightsTimeline({ data, insightRatings }) {
  const [expandedId, setExpandedId] = useState(null);
  // Hydrated via load_all_data RPC — up to 60 newest rows, already reconciled
  // with the user's session. For MVP we trust the hydration; if the user
  // rated on another device mid-session, the denormalized `rating` on the
  // row lags until they reload — acceptable trade-off for no extra query.
  const entries = data?.generated_insights || [];

  const groups = useMemo(() => groupByWeek(entries), [entries]);

  if (!entries.length) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={Leaf}
          title="No past insights yet"
          message="When Sage writes daily insights for you, they'll show up here so you can look back and see what's been most helpful."
        />
      </div>
    );
  }

  return (
    <div className="mt-2 font-montserrat">
      {groups.map(group => (
        <div key={group.label} className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-1.5 px-1">
            {group.label}
          </div>
          <Card className="!p-0 overflow-hidden">
            {group.entries.map((e, i) => (
              <div key={e.id || e.generated_on}>
                {i > 0 && <div className="border-t border-salve-border/50 mx-4" />}
                <TimelineEntry
                  entry={e}
                  insightRatings={insightRatings}
                  isOpen={expandedId === (e.id || e.generated_on)}
                  onToggle={() => setExpandedId(prev => prev === (e.id || e.generated_on) ? null : (e.id || e.generated_on))}
                />
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}

// Re-export for call sites that want to refresh timeline data outside of
// the load_all_data RPC window (e.g. after a manual refresh on Dashboard).
export { loadRecentInsights };
