// Sage daily insight orchestrator + Supabase persistence layer.
//
// Responsibilities:
//  - Assemble the INSIGHT CONTEXT (priorities, goals, recent insights,
//    focus-area preferences, correlation seed) so buildProfile can inject it.
//  - Generate today's daily insight via fetchInsight, upsert to Supabase.
//  - Load today's row (cross-device sync) + recent history (timeline).
//  - Reconcile denormalized `rating` column against insight_ratings on read.
//
// Companion pieces:
//  - src/utils/insightSeed.js     picks the correlation pattern that seeds
//                                 today's prompt (Chunk B).
//  - src/services/profile.js      renders the INSIGHT CONTEXT block.
//  - api/_prompts.js PROMPTS.insight  consumes the block + [FOCUS:] tag.

import { supabase } from './supabase';
import { localISODate } from '../utils/dates';
import { buildProfile } from './profile';
import { fetchInsight, isDemoMode, getAIProvider } from './ai';
import { pickInsightSeed } from '../utils/insightSeed';
import { getCyclePhaseForDate } from '../utils/cycles';

const TABLE = 'generated_insights';

// Keep in sync with the CHECK constraint in migration 052.
const FOCUS_AREAS = new Set([
  'sleep','medication','nutrition','exercise','cycle',
  'symptom','prevention','condition','connection',
  'lifestyle','encouragement','research','general',
]);

function coerceFocusArea(area) {
  return FOCUS_AREAS.has(area) ? area : 'general';
}

// ─── Supabase helpers ──────────────────────────────────────────────

// Returns today's insight row (or null) for a specific local date.
// Caller passes the date explicitly so PT-evening users don't roll
// into tomorrow's UTC row.
export async function loadTodayInsight(userId, localDateIso) {
  if (!userId || !localDateIso) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, generated_at, generated_on, text, focus_area, seed_pattern_id, seed_pattern_title, seed_pattern_category, rating, model, provider')
    .eq('user_id', userId)
    .eq('generated_on', localDateIso)
    .maybeSingle();
  if (error) {
    // Table missing (pre-migration) or network — let the caller fall through
    // to localStorage / generation. Never block the UI on a read failure.
    return null;
  }
  return data || null;
}

// Last N insights (newest first) with rating reconciled against insight_ratings.
// insight_ratings is source of truth; generated_insights.rating is a cache that
// may drift after a dual-write failure, so we merge on read.
export async function loadRecentInsights(userId, limit = 5) {
  if (!userId) return [];
  const { data: rows, error } = await supabase
    .from(TABLE)
    .select('id, generated_at, generated_on, text, focus_area, seed_pattern_id, seed_pattern_title, seed_pattern_category, rating, model, provider')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(limit);
  if (error || !rows?.length) return [];

  // Reconcile against insight_ratings for the matching dates.
  const dates = rows.map(r => r.generated_on).filter(Boolean);
  if (!dates.length) return rows;

  const { data: ratings } = await supabase
    .from('insight_ratings')
    .select('content_key, rating')
    .eq('user_id', userId)
    .eq('surface', 'insight')
    .in('content_key', dates);

  const byDate = {};
  (ratings || []).forEach(r => { byDate[r.content_key] = r.rating; });

  return rows.map(r => {
    // Prefer insight_ratings when present; otherwise fall back to cached rating.
    const authoritative = byDate[r.generated_on];
    if (authoritative === undefined) return r;
    return { ...r, rating: authoritative };
  });
}

// Upsert today's row — overwrites on refresh.
export async function upsertTodayInsight(row) {
  if (!row?.user_id || !row?.generated_on) {
    throw new Error('upsertTodayInsight: user_id + generated_on required');
  }
  const { error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'user_id,generated_on' });
  if (error) throw error;
}

// Update the denormalized rating column. Called from useInsightRatings
// dual-write path. Silent-failure on the caller side: insight_ratings is
// the source of truth and loadRecentInsights reconciles on read.
export async function updateInsightRatingByDate(userId, dateIso, rating) {
  if (!userId || !dateIso) return;
  await supabase
    .from(TABLE)
    .update({ rating })
    .eq('user_id', userId)
    .eq('generated_on', dateIso);
}

// ─── Priority + goal derivation (pure helpers) ─────────────────────

// Top 3 health priorities for the insight prompt. Blends active conditions
// (prefer severe / recently diagnosed) with frequently-mentioned journal
// symptoms over the last ~60 days, so the model sees what the user is
// actively living with — not just their chart history.
export function derivePriorities(data) {
  if (!data) return [];
  const out = [];

  // Active conditions, most recent first. "Active" includes the default and
  // 'managed' states; skip resolved/remission so Sage doesn't re-surface old diagnoses.
  const activeStatuses = new Set(['active', 'managed', '', undefined, null]);
  const conds = (data.conditions || [])
    .filter(c => activeStatuses.has(c.status))
    .sort((a, b) => (b.diagnosed_date || '').localeCompare(a.diagnosed_date || ''))
    .slice(0, 3);

  for (const c of conds) {
    const why = c.status && c.status !== 'active' ? c.status : 'active';
    out.push({ name: c.name, why });
  }

  // Top journal symptoms (last 60 days). Aggregate symptom.name frequencies
  // across journal_entries.symptoms[] — this reflects what the user is
  // tracking *right now*, not the static condition list.
  if (out.length < 3) {
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const freq = {};
    for (const j of data.journal_entries || []) {
      if (!j.date || j.date < cutoff) continue;
      const syms = Array.isArray(j.symptoms) ? j.symptoms : [];
      for (const s of syms) {
        const name = (s?.name || '').trim().toLowerCase();
        if (!name) continue;
        freq[name] = (freq[name] || 0) + 1;
      }
    }
    const topSymptoms = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3 - out.length);
    for (const [name, n] of topSymptoms) {
      out.push({ name, why: `logged ${n}x in last 60 days` });
    }
  }

  return out.slice(0, 3);
}

// Pulls user-stated goals / context from About Me. These are the most direct
// signal of "what the user cares about" — Sage should lean toward them.
export function deriveGoals(data) {
  const about = data?.settings?.about_me || {};
  const keys = ['therapy_goals', 'whats_going_well', 'health_context'];
  const out = [];
  for (const k of keys) {
    const v = about[k];
    if (!v) continue;
    // Support semicolon / newline / bullet as separators.
    const parts = String(v)
      .split(/[;\n•]+/)
      .map(s => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      out.push(p);
      if (out.length >= 5) return out;
    }
  }
  return out;
}

export function computeFocusAreaPrefs(recentInsights) {
  const prefs = {};
  for (const row of recentInsights || []) {
    if (!row.focus_area || row.rating == null) continue;
    prefs[row.focus_area] = prefs[row.focus_area] || { up: 0, down: 0 };
    if (row.rating === 1) prefs[row.focus_area].up += 1;
    else if (row.rating === -1) prefs[row.focus_area].down += 1;
  }
  return prefs;
}

// ─── End-to-end orchestrator ──────────────────────────────────────

// Resolve the current user id — matches the pattern in ratings.js / db.js so
// callers don't need to thread session through the component tree.
async function currentUserId() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

// Generates today's insight with full context and persists it to Supabase.
// Returns the row shape the Dashboard renders: { text, focus_area, id, generated_on }.
//
// Called from Dashboard.loadInsight when no row exists yet for today, OR
// when the user taps refresh (forceRefresh path).
//
// `ratings` is the useInsightRatings hook result (so we can consult pattern
// ratings when picking the correlation seed). Optional — omit for cold-start.
export async function generateDailyInsight(data, { ratings } = {}) {
  const now = new Date();
  const generated_on = localISODate(now);

  // Demo mode: return a canned insight but do NOT write to Supabase.
  // Keeps the shared demo user's history empty and avoids polluting the
  // row with whatever demo theme the browser happens to be in.
  if (isDemoMode()) {
    const text = await fetchInsight(buildProfile(data)).then(r => r.text);
    return { text, focus_area: 'general', id: null, generated_on };
  }

  const userId = await currentUserId();
  const recentInsights = userId ? await loadRecentInsights(userId, 5).catch(() => []) : [];
  const focusAreaPrefs = computeFocusAreaPrefs(recentInsights);
  const seedPattern = pickInsightSeed(data, getCyclePhaseForDate, {
    ratings,
    recentInsights,
    focusAreaPrefs,
  });

  const insightContext = {
    topPriorities: derivePriorities(data),
    goals:         deriveGoals(data),
    recentInsights,
    seedPattern,
    focusAreaPrefs,
  };

  const profileText = buildProfile(data, { insightContext });
  const result = await fetchInsight(profileText, {
    seedPattern: insightContext.seedPattern,
    recentInsights,
  });

  const focus_area = coerceFocusArea(result.focus_area);
  const provider = getAIProvider();
  // Best-effort model capture — getModel('insight') lives in ai.js; we don't
  // re-export it because the model is a consequence of provider + feature tier
  // and is mirrored in the raw response envelope on the server side (api_usage).
  const model = provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gemini-2.5-flash-lite';

  const row = {
    user_id: userId,
    generated_on,
    generated_at: now.toISOString(),
    text: result.text,
    focus_area,
    seed_pattern_id:       insightContext.seedPattern?.id       || null,
    seed_pattern_title:    insightContext.seedPattern?.title    || null,
    seed_pattern_category: insightContext.seedPattern?.category || null,
    model,
    provider,
  };

  // Best-effort write; never block the UI on persistence failure.
  let id = null;
  if (userId) {
    try {
      await upsertTodayInsight(row);
      // Re-read to get the server-assigned id (upsert doesn't return by default
      // without .select()).
      const fresh = await loadTodayInsight(userId, generated_on);
      id = fresh?.id || null;
    } catch (_) {
      // Silent — user still sees the insight from the in-memory result.
    }
  }

  return { text: result.text, focus_area, id, generated_on };
}
