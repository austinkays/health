# Correlation Engine — Design Spec

> Salve's killer feature: automated health pattern detection that turns raw tracking data into actionable insights. The magic works behind the scenes — users just see clear, natural-language cards that help them understand their health.

## Overview

A client-side correlation engine that analyzes relationships between all tracked health metrics (vitals, symptoms, mood, sleep, medications, exercise, cycle phases) and surfaces the most meaningful patterns as natural-language insight cards. Dashboard shows top 3 insights; a full Insights section provides the complete analysis.

## Design Principles

1. **Invisible complexity** — Users never see math, p-values, or correlation coefficients. They see "Your headaches happen more on days you sleep under 6 hours."
2. **Earn trust gradually** — Confidence indicators (subtle, not scary) help users know when a pattern is solid vs. still emerging.
3. **Actionable over interesting** — Prioritize insights the user can act on ("exercise helps your mood") over trivia ("your weight fluctuates on Mondays").
4. **Fast** — Computation runs client-side on existing data. No API calls for the math. AI narration is a premium polish layer, not a dependency.

## Architecture

```
data (useHealthData)
  └─► computeCorrelations(data)          [src/utils/correlations.js]
        ├─ alignByDate(metricA, metricB)  — join two time series on date
        ├─ pearson(xs, ys)                — correlation coefficient
        ├─ categoricalSplit(metric, groups) — avg metric by category
        ├─ beforeAfter(metric, eventDate) — compare windows around an event
        └─ trendDirection(values, days)   — recent trend (up/down/flat)
  └─► rankInsights(correlations)          — score by strength + actionability
  └─► formatInsight(correlation)          — natural language template
  └─► [Premium] narrateInsights(top, profileText)  — Sage AI narration
```

### File: `src/utils/correlations.js`

Pure functions, no React dependencies. Exported:

- **`computeCorrelations(data)`** — Main entry point. Returns `Insight[]`.
- **`alignByDate(seriesA, seriesB)`** — Joins two `{date, value}[]` arrays on matching dates. Returns paired arrays. Supports `lag` parameter for next-day effects (e.g., sleep last night → pain today).
- **`pearson(xs, ys)`** — Pearson correlation coefficient (-1 to +1). Returns `{ r, n }` where n = sample count.
- **`categoricalSplit(values, categories)`** — Groups numeric values by a categorical variable, returns `{ category, avg, count }[]`. Used for "mood by cycle phase" or "pain on exercise days vs rest days".
- **`beforeAfter(values, eventDate, windowDays = 14)`** — Compares average of a metric before vs after an event (medication start, condition diagnosis). Returns `{ before, after, change, pct }`.
- **`trendDirection(values, days = 14)`** — Simple linear regression slope on last N days. Returns `{ direction: 'improving'|'worsening'|'stable', magnitude, label }`.

### Data Types for Correlation

**Numeric time series** (primary correlation targets):
| Source | Metric | Field path | Notes |
|--------|--------|-----------|-------|
| vitals | pain | `{date, value}` where type='pain' | 0-10 |
| vitals | mood | `{date, value}` where type='mood' | 0-10 |
| vitals | energy | `{date, value}` where type='energy' | 0-10 |
| vitals | sleep | `{date, value}` where type='sleep' | hours |
| vitals | hr | `{date, value}` where type='hr' | bpm |
| vitals | bp_sys | `{date, value}` where type='bp' | mmHg |
| vitals | weight | `{date, value}` where type='weight' | lbs |
| vitals | spo2 | `{date, value}` where type='spo2' | % |
| vitals | glucose | `{date, value}` where type='glucose' | mg/dL |
| vitals | hydration | `{date, value}` where type='hydration' | 1-4 |
| vitals | activity_level | `{date, value}` where type='activity_level' | 1-4 |
| journal | severity | `{date, severity}` | 1-10 |
| journal | mood_numeric | Map mood to numeric: Great=8, Good=7, Okay=5, Low=3, Sad=2, Frustrated=3, Anxious=3, Exhausted=2 | derived |
| activities | duration | `{date, duration_minutes}` | minutes |
| activities | calories | `{date, calories}` | kcal |

**Categorical groupings** (for split analysis):
| Source | Grouping | Values |
|--------|----------|--------|
| cycles | phase | Menstrual / Follicular / Ovulatory / Luteal |
| journal | mood | 8 mood categories |
| activities | exercised | boolean (any activity that day) |
| meds | adherence | taken / skipped / no data |
| journal | day_of_week | Mon-Sun |

**Events** (for before/after analysis):
| Source | Event | Date field |
|--------|-------|-----------|
| meds | medication started | start_date |
| conditions | condition diagnosed | diagnosed_date |

### Curated Correlation Pairs

Not brute-force — these are the medically/practically meaningful pairs:

**Sleep impact** (lag: 0 and +1 day):
- sleep hours → pain, mood, energy, severity, hr

**Exercise impact** (same day + next day):
- exercised (bool) → mood, energy, pain, sleep hours
- activity duration → mood, energy, pain

**Medication impact** (before/after windows):
- For each active medication with start_date: compare pain, mood, energy, severity, sleep in 14-day windows before vs after start

**Cycle correlations** (for users with cycle data):
- cycle phase → mood, pain, energy, severity, sleep, hr
- day of cycle → mood, pain, energy

**Symptom patterns**:
- Journal symptom frequency by: day of week, cycle phase, sleep bracket, exercise day
- Top 3 most-logged symptoms: individual correlation with sleep, exercise, cycle phase

**Trends** (not correlations, but high-value insights):
- Each vital type: 14-day trend direction
- Journal severity: 14-day trend
- Medication adherence rate: 30-day trend

### Insight Scoring & Ranking

Each insight gets a score (0-100) based on:
- **Strength**: |r| for correlations, |pct_change| for before/after, slope magnitude for trends
- **Confidence**: sample size (n). Minimum 7 overlapping data points to show. n≥14 = high confidence, 7-13 = medium.
- **Actionability**: sleep and exercise insights score higher (user can change behavior). Cycle phase insights score lower (informational, not actionable).
- **Novelty**: insights the user hasn't seen before score higher (tracked via localStorage dismissed list)

Top insights are selected by score. Dashboard shows top 3. Full section shows all that pass the minimum threshold.

### Confidence Indicators

Subtle, not clinical:
- **High confidence** (n≥14): no indicator needed, just show the insight
- **Medium confidence** (n=7-13): small "Based on X days of data" footer text
- **Below threshold** (n<7): don't show, or show as "emerging" with muted styling

## UI Components

### Dashboard: "Patterns" Card

Position: after the "Needs Attention" alerts, before Discover. Replaces nothing — new card.

```
┌──────────────────────────────────────────────────┐
│  ✦ PATTERNS                              See all →│
│                                                    │
│  💤 Sleep & Pain                                   │
│  Your pain tends to be lower on days after         │
│  7+ hours of sleep.                                │
│                                                    │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─           │
│                                                    │
│  💊 Since starting Lexapro (14 days)               │
│  Your average mood has improved from 4.2 to 5.8.   │
│                                                    │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─           │
│                                                    │
│  📈 Energy Trend                                   │
│  Your energy has been trending up over the          │
│  last 2 weeks. ↑ 1.3 points.                      │
│                                                    │
└──────────────────────────────────────────────────┘
```

- Card uses standard `bg-salve-card` surface
- Each insight has a small themed icon (not emoji — use Lucide icons)
- Dividers between insights (thin border line)
- "See all →" navigates to the full Insights section
- Card hidden when no insights pass the threshold
- Sage AI narration renders as the insight text (premium). Free tier uses template strings.

**Insight card styling**:
- Left accent border per category: `border-l-2`
  - Sleep: lavender
  - Medication: sage
  - Exercise: sage
  - Cycle: amber
  - Trends: lavender
  - Symptoms: rose
- Text: `text-xs font-montserrat text-salve-textMid`
- Title: `text-[11px] font-medium text-salve-text`

### Full Insights Section

New section accessible via:
- Dashboard "See all →" link
- Quick Access grid tile (add to ALL_LINKS in Dashboard.jsx)
- SideNav: not in primary 7 — accessible via Quick Access

**Layout**:
```
┌──────────────────────────────────────────────────┐
│  INSIGHTS                                         │
│                                                    │
│  Filter: [All] [Sleep] [Meds] [Exercise] [Cycle]  │
│                                                    │
│  ┌── Sleep & Pain ─────────────────────────────┐  │
│  │  Your pain averages 3.2 on days after 7+    │  │
│  │  hours of sleep, vs 5.8 on days after       │  │
│  │  less than 6 hours.                         │  │
│  │                                             │  │
│  │  ░░░░░░░░░░░░░░░░░░░░  (mini bar chart)    │  │
│  │  < 6hrs    6-7hrs    7+ hrs                 │  │
│  │                                             │  │
│  │  Based on 23 days of data · High confidence │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  ┌── Since starting Lexapro ───────────────────┐  │
│  │  ...                                        │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  ┌── Mood by Cycle Phase ──────────────────────┐  │
│  │  ...                                        │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  ── TRENDS ──                                     │
│  Pain    ↓ improving  (-1.2 over 14 days)         │
│  Mood    ↑ improving  (+0.8 over 14 days)         │
│  Energy  → stable                                  │
│  Sleep   ↑ improving  (+0.5 hrs over 14 days)     │
│                                                    │
└──────────────────────────────────────────────────┘
```

**Mini visualizations** inside insight cards:
- **Bar chart** for categorical splits (mood by cycle phase, pain by sleep bracket)
- **Before/after** comparison bars for medication impact
- **Trend arrow** with magnitude for trend insights
- Built with simple div bars (no Recharts needed — keep the section lightweight)
- Color follows the category accent

### Inline Badges (Other Sections)

Subtle cross-links from existing sections back to relevant insights:

- **Medication cards**: "↗ Mood improved since starting" badge (sage, links to insight)
- **Vitals chart**: "Correlated with sleep" small label when viewing a metric that has a strong correlation
- **Journal cards**: cycle phase badge already exists — extend concept

These are additive polish, not required for v1. Can ship after core engine works.

## AI Narration (Premium)

For premium users, the top insights are sent to Sage for natural-language narration:

**Prompt approach**: Send the raw correlation data (not health records) to the AI with a prompt like:
```
You are a health pattern analyst. The user's health tracking data shows these correlations:
[structured correlation results]

Write 3-5 short, warm, actionable insight cards. Each should be 1-2 sentences.
Tone: supportive, clear, never alarming. Say "tends to" not "causes".
Focus on what the user can DO with this information.
```

**Feature tier**: `'insight'` (Lite model — cheap, fast)

**Free tier fallback**: Template strings. "Your {metric} tends to be {better/worse} on days {condition}." Still useful, just less personal.

**Caching**: AI narration cached in localStorage keyed by a hash of the correlation results. Only re-narrate when correlations change meaningfully (new data shifts rankings).

## New Files

| File | Purpose |
|------|---------|
| `src/utils/correlations.js` | Pure correlation math + insight generation |
| `src/components/sections/Insights.jsx` | Full insights section (code-split, lazy loaded) |

## Modified Files

| File | Change |
|------|--------|
| `src/components/sections/Dashboard.jsx` | Add "Patterns" card (renders top 3 insights) |
| `src/App.jsx` | Add Insights to lazy imports + section routing |
| `src/utils/search.jsx` | Add insights to search config (searchable by insight text) |
| `src/constants/defaults.js` | Add 'insights' to Quick Access ALL_LINKS |

## Data Flow

```
1. App loads → useHealthData populates `data`
2. Dashboard renders → calls computeCorrelations(data) (memoized)
3. correlations.js:
   a. Extract numeric time series from data.vitals, data.journal, data.activities
   b. Run curated correlation pairs (sleep→pain, exercise→mood, etc.)
   c. Run medication before/after analysis
   d. Run cycle phase splits (if cycle data exists)
   e. Compute 14-day trends for each vital type
   f. Score and rank all insights
   g. Return Insight[] sorted by score
4. Dashboard "Patterns" card renders top 3
5. [Premium] Top insights sent to Sage for AI narration (cached)
6. Full Insights section shows all insights with mini charts
```

## Insight Object Shape

```js
{
  id: string,           // deterministic hash for dedup/dismiss tracking
  type: 'correlation' | 'medication' | 'trend' | 'cycle',
  category: 'sleep' | 'exercise' | 'medication' | 'cycle' | 'symptom' | 'trend',
  title: string,        // short label: "Sleep & Pain"
  template: string,     // natural language: "Your pain tends to be lower..."
  narrative: string?,   // AI-generated narration (premium, cached)
  score: number,        // 0-100 ranking score
  confidence: 'high' | 'medium',
  n: number,            // sample size
  data: {               // raw data for mini chart rendering
    type: 'bar' | 'comparison' | 'trend',
    values: any[],
  },
  metricA: string,      // e.g. 'sleep'
  metricB: string,      // e.g. 'pain'
  direction: 'positive' | 'negative' | 'neutral',
  dismissed: boolean,   // user dismissed this insight
}
```

## Edge Cases

- **Not enough data**: Show encouraging empty state: "Keep logging for a few more days — Salve is learning your patterns." Track days of data and show progress: "3 of 7 days logged."
- **No correlations found**: "Your health metrics are holding steady. That's a good thing." Don't make the user feel like they failed.
- **Single metric only**: If user only tracks one thing (e.g., just mood), show trends but not correlations. Still valuable.
- **Stale data**: If no new entries in 7+ days, show last computed insights with "Based on data through [date]" label.
- **Contradictory correlations**: If sleep both correlates and doesn't correlate with pain in different windows, only show the stronger signal. Don't confuse users.

## Performance

- `computeCorrelations()` wrapped in `useMemo` keyed on `data` reference
- Correlation math is O(n) per pair where n = number of days — fast for typical user data (30-365 days)
- Results cached in localStorage with `JSON.stringify(data).length` hash for invalidation
- AI narration is lazy — only requested when Dashboard card is visible AND user is premium
- Full Insights section is code-split (lazy loaded) — doesn't affect initial bundle

## Privacy

- All computation is client-side. No health data leaves the device for correlations.
- AI narration sends aggregated correlation results (not raw health records) to the API.
- Dismissed insights tracked in localStorage, not Supabase.

## What This Does NOT Include (Future)

- Weather correlation (needs external API — separate feature)
- Social/community comparison ("people like you...")
- Predictive modeling ("you're likely to have a flare tomorrow")
- Export correlation reports as PDF (Phase 3 doctor reports will cover this)
