// Picks the correlation pattern that should seed today's Sage daily insight.
//
// Separate from correlations.js (which is deliberately dependency-free, see
// comment at correlations.js:3) because this selector depends on the user's
// ratings map and recent insight history — neither belong in the pure engine.
//
// Scoring: starts from computeCorrelations() scores, then applies multipliers
// so the rotation respects user preferences and avoids repetition.
//
//   adj = score * ratingMultiplier * confidenceMultiplier * repetitionPenalty
//
//   ratingMultiplier:
//     - Pattern-level rating on (surface='pattern', content_key=pattern.id)
//       matches Dashboard's convention: -1 → 0.3, +1 → 1.1, unrated → 1.0.
//     - Category-level boost from focus-area prefs: net-positive → × 1.15,
//       net-negative → × 0.7.
//   confidenceMultiplier:
//     - 'high'   → 1.0
//     - 'medium' → 0.85
//     - anything else → 0.6 (future-proof if correlations.js adds 'weak')
//   repetitionPenalty:
//     - If category OR title appears in any of the last 5 insights' seeds
//       → × 0.4.
//     - If exact title appears in the last 2 insights → adj = 0 (hard skip).

import { computeCorrelations } from './correlations.js';

const CONFIDENCE_MULT = { high: 1.0, medium: 0.85 };
const NOISE_FLOOR = 15;

function ratingFor(ratings, contentKey) {
  if (!ratings?.getRating) return null;
  try { return ratings.getRating('pattern', contentKey); } catch { return null; }
}

function categoryNet(prefs, category) {
  const p = prefs?.[category];
  if (!p) return 0;
  return (p.up || 0) - (p.down || 0);
}

export function pickInsightSeed(data, cyclePhaseFn, { ratings, recentInsights = [], focusAreaPrefs = {} } = {}) {
  const all = computeCorrelations(data, cyclePhaseFn);
  if (!all?.length) return null;

  // Pre-compute repetition lookup structures. Most recent first.
  const last5 = recentInsights.slice(0, 5);
  const last2 = recentInsights.slice(0, 2);
  const recentTitles = new Set(last5.map(r => r.seed_pattern_title).filter(Boolean));
  const recentCategories = new Set(last5.map(r => r.seed_pattern_category).filter(Boolean));
  const last2Titles = new Set(last2.map(r => r.seed_pattern_title).filter(Boolean));

  let bestPat = null;
  let bestAdj = -Infinity;

  for (const pat of all) {
    // Hard skip: same pattern in the last 2 days — user just saw this.
    if (pat.title && last2Titles.has(pat.title)) continue;

    // Rating multiplier (pattern-level).
    const patRating = ratingFor(ratings, pat.id);
    let ratingMult = 1.0;
    if (patRating === -1) ratingMult = 0.3;
    else if (patRating === 1) ratingMult = 1.1;

    // Category-level preference boost (net of up/down).
    const net = categoryNet(focusAreaPrefs, pat.category);
    if (net > 0) ratingMult *= 1.15;
    else if (net < 0) ratingMult *= 0.7;

    // Confidence tempering.
    const confMult = CONFIDENCE_MULT[pat.confidence] ?? 0.6;

    // Repetition penalty for recurring categories or titles in last 5.
    let repMult = 1.0;
    if ((pat.title && recentTitles.has(pat.title)) || (pat.category && recentCategories.has(pat.category))) {
      repMult = 0.4;
    }

    const adj = (pat.score || 0) * ratingMult * confMult * repMult;
    if (adj > bestAdj) {
      bestAdj = adj;
      bestPat = pat;
    }
  }

  if (!bestPat || bestAdj < NOISE_FLOOR) return null;

  return {
    id:         bestPat.id,
    title:      bestPat.title,
    template:   bestPat.template,
    category:   bestPat.category,
    confidence: bestPat.confidence,
  };
}
