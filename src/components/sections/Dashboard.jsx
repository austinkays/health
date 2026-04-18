import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Sparkles, ChevronRight, ArrowRight, AlertTriangle,
  Search, X, Heart, Leaf, Copy, Bookmark, RefreshCw, Pill,
  ExternalLink, Mail, PenLine, Newspaper, Wind,
  Moon, Activity, TrendingUp, Calendar, Flame, ArrowLeftRight, Clock,
} from 'lucide-react';
import { readCachedBarometric, PRESSURE_SENSITIVE } from '../../services/barometric';
import Card from '../ui/Card';
import BarometricCard from '../ui/BarometricCard';
import Motif from '../ui/Motif';
import { SageIntroButton, shouldShowIntro } from '../ui/SageIntro';
import { SectionTitle } from '../ui/FormWrap';
import { fmtDate, daysUntil, localISODate } from '../../utils/dates';
import { C } from '../../constants/colors';
import { isPremiumActive } from '../../services/ai';
import { generateDailyInsight } from '../../services/insights';
import { trackEvent, EVENTS } from '../../services/analytics';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import { searchEntities, highlightMatch } from '../../utils/search.jsx';
import useWellnessMessage from '../../hooks/useWellnessMessage';
import { isOuraConnected } from '../../services/oura';
import { getStarred } from '../../utils/starred';
import { fetchDiscoverArticles } from '../../services/discover';
import { buildNewsFeed } from '../../services/newsCache';
import { getDailyQuote } from '../../constants/quotes';
import ThumbsRating from '../ui/ThumbsRating';
import { useIsDesktop } from '../layout/SplitView';
import { computeCorrelations, computeMicroInsights } from '../../utils/correlations';
import { getCyclePhaseForDate } from '../../utils/cycles';
import { handleSpotlight } from '../../utils/fx';
import Reveal from '../ui/Reveal';

import {
  SEARCH_PLACEHOLDERS, STARTER_TIPS, STARRED_META, HUB_TILES,
  ALERT_DISMISS_KEY, SEEN_RESOURCES_KEY, DISMISSED_TIPS_KEY, BARO_ALERT_DISMISS_KEY,
} from '../dashboard/constants';
import { getTimeGreeting, getContextLine, getDismissedTips, getSeenResources, getAlertDismissal } from '../dashboard/helpers';
import { useVitalsSnapshot, useActivitySnapshot, useMoodSnapshot } from '../dashboard/useSnapshots';
import { useSleepTrend, useHrTrend, useSpo2Trend } from '../dashboard/useTrendData';
import { useAbnormalLabs, usePriceAlertMeds, useAlerts } from '../dashboard/useAlerts';
import AlertsCard from '../dashboard/AlertsCard';
import VitalsSnapshot from '../dashboard/VitalsSnapshot';
import { MoodSnapshot, ActivitySnapshot } from '../dashboard/MoodActivity';
import HealthTrends from '../dashboard/HealthTrends';
import GettingStartedTips from '../dashboard/GettingStartedTips';

export default function Dashboard({ data, interactions, onNav, onSage, onSageIntro, dataLoading, insightRatings }) {
  const isDesktop = useIsDesktop();
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);

  /* ── Lazy-load Recharts (367KB), keep it off the critical render path ── */
  const [chartsReady, setChartsReady] = useState(false);
  const chartsRef = useRef({});
  useEffect(() => {
    import('recharts').then(mod => {
      chartsRef.current = mod;
      setChartsReady(true);
    });
  }, []);

  /* ── Desktop "made with love" scroll-reveal ── */
  const [showTagline, setShowTagline] = useState(false);
  useEffect(() => {
    if (!isDesktop) return;
    let hasScrolled = false;
    let ticking = false;
    const check = () => {
      const scrollY = window.scrollY || window.pageYOffset;
      if (scrollY > 80) hasScrolled = true;
      const nearBottom = window.innerHeight + scrollY >= document.body.scrollHeight - 40;
      setShowTagline(hasScrolled && nearBottom);
      ticking = false;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(check); } };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [isDesktop]);
  const wellness = useWellnessMessage();
  const [alertDismissal, setAlertDismissal] = useState(getAlertDismissal);
  const alertsDismissed = alertDismissal !== null;

  /* ── Conditional tile visibility (connected OR has existing data) ── */
  const hasAppleHealth = useMemo(() => (data.vitals || []).some(v => v.source === 'apple_health' || v.source === 'Apple Health')
    || (data.activities || []).some(a => a.source === 'apple_health' || a.source === 'Apple Health'), [data.vitals, data.activities]);
  const hasOura = useMemo(() => isOuraConnected()
    || (data.vitals || []).some(v => v.source === 'oura')
    || (data.cycles || []).some(c => c.notes?.includes('Oura'))
    || (data.activities || []).some(a => a.source === 'oura'), [data.vitals, data.cycles, data.activities]);

  /* ── Hub tiles ── */
  const hubTiles = HUB_TILES;

  /* ── Starred sections (user-pinned favorites) ── */
  const [starredIds, setStarredIds] = useState(() => getStarred());
  useEffect(() => {
    const onChange = () => setStarredIds(getStarred());
    window.addEventListener('salve:starred-change', onChange);
    return () => window.removeEventListener('salve:starred-change', onChange);
  }, []);
  const starredTiles = useMemo(() =>
    starredIds.map(id => ({ id, ...STARRED_META[id] })).filter(t => t.icon),
  [starredIds]);

  /* ── Search state ───────────────────────────── */
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  // Debounce search input
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  // Rotate placeholder text
  useEffect(() => {
    if (searchFocused || searchQuery) return;
    const id = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % SEARCH_PLACEHOLDERS.length);
    }, 3500);
    return () => clearInterval(id);
  }, [searchFocused, searchQuery]);

  // Live search results, only compute when actually searching (not on every data change)
  const allSearchResults = useMemo(
    () => debouncedSearch.length >= 2 ? searchEntities(data, debouncedSearch) : [],
    [data, debouncedSearch]
  );
  const searchResults = useMemo(() => allSearchResults.slice(0, 5), [allSearchResults]);
  const totalResults = allSearchResults.length;

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      if (searchQuery) {
        setSearchQuery('');
      } else {
        searchRef.current?.blur();
      }
    }
  }, [searchQuery]);

  /* ── Memoized computations ──────────────────── */
  const activeMeds = useMemo(() => data.meds.filter(m => m.active !== false), [data.meds]);

  const allInsights = useMemo(() => computeCorrelations(data, getCyclePhaseForDate), [data.vitals, data.journal_entries, data.meds, data.activities, data.cycles]);
  // Daily rotation: offset into the sorted insights list by day-of-year so
  // users see different patterns each day. Thumbs-down decays score (×0.3),
  // thumbs-up boosts slightly (×1.1) so disliked patterns sink and fresh
  // ones surface. Unrated patterns still get priority over rated ones.
  const topInsights = useMemo(() => {
    if (!allInsights.length) return [];
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

    const scored = allInsights.map(ins => {
      const rating = insightRatings?.getRating('pattern', ins.id);
      let multiplier = 1;
      if (rating === -1) multiplier = 0.3;
      else if (rating === 1) multiplier = 1.1;
      const isUnrated = !rating;
      return { ...ins, _adj: ins.score * multiplier, _unrated: isUnrated };
    });

    // Sort: unrated first, then by adjusted score descending
    scored.sort((a, b) => {
      if (a._unrated !== b._unrated) return a._unrated ? -1 : 1;
      return b._adj - a._adj;
    });

    // Rotate by day-of-year so the window shifts daily
    const pool = scored.length;
    const offset = dayOfYear % Math.max(pool, 1);
    const rotated = [];
    for (let i = 0; i < Math.min(3, pool); i++) {
      rotated.push(scored[(offset + i) % pool]);
    }
    return rotated;
  }, [allInsights, insightRatings]);

  // Track which pattern categories are surfaced (fire once per page load)
  const patternCatsTracked = useRef(false);
  useEffect(() => {
    if (patternCatsTracked.current || !topInsights.length) return;
    patternCatsTracked.current = true;
    const seen = new Set();
    for (const ins of topInsights) {
      if (ins.category && !seen.has(ins.category)) {
        seen.add(ins.category);
        trackEvent(`${EVENTS.PATTERN_VIEWED}:${ins.category}`);
      }
    }
  }, [topInsights]);

  // Micro-insights: 2 daily-rotating quick stat chips
  const microInsights = useMemo(() => {
    const all = computeMicroInsights(data);
    if (!all.length) return [];
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const pick = [];
    for (let i = 0; i < Math.min(2, all.length); i++) {
      pick.push(all[(dayOfYear + i) % all.length]);
    }
    return pick;
  }, [data.vitals, data.journal_entries, data.meds, data.activities, data.appts, data.conditions]);

  const timeline = useMemo(() => {
    const now = new Date(new Date().toDateString());
    const appts = data.appts
      .filter(a => new Date(a.date) >= now)
      .map(a => ({ ...a, _type: 'appt', _sortDate: a.date }));
    const refills = activeMeds
      .filter(m => m.refill_date && new Date(m.refill_date) >= now)
      .map(m => ({ ...m, _type: 'refill', _sortDate: m.refill_date }));

    // Predicted period from cycle data
    const cyclePeriods = (data.cycles || []).filter(c => c.type === 'period').map(c => c.date).sort();
    let periodEntry = [];
    if (cyclePeriods.length >= 2) {
      const starts = [];
      let prev = null;
      for (const d of cyclePeriods) {
        const dt = new Date(d + 'T00:00:00');
        if (!prev || (dt - prev) > 2 * 86400000) starts.push(d);
        prev = dt;
      }
      if (starts.length >= 2) {
        const lengths = [];
        for (let i = 1; i < starts.length; i++) {
          const diff = Math.round((new Date(starts[i] + 'T00:00:00') - new Date(starts[i - 1] + 'T00:00:00')) / 86400000);
          if (diff >= 18 && diff <= 45) lengths.push(diff);
        }
        const avg = lengths.length > 0 ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 28;
        const lastStart = starts[starts.length - 1];
        const nextDate = new Date(lastStart + 'T00:00:00');
        nextDate.setDate(nextDate.getDate() + avg);
        if (nextDate >= now) {
          periodEntry = [{ _type: 'period', _sortDate: localISODate(nextDate), _label: 'Predicted period' }];
        }
      }
    }

    // Due-soon to-dos (next 7 days, not completed/dismissed)
    const weekFromNow = new Date(now.getTime() + 7 * 86400000);
    const dueTodos = (data.todos || [])
      .filter(t => !t.completed && !t.dismissed && t.due_date && new Date(t.due_date + 'T00:00:00') >= now && new Date(t.due_date + 'T00:00:00') <= weekFromNow)
      .map(t => ({ ...t, _type: 'todo', _sortDate: t.due_date }));

    return [...appts, ...refills, ...periodEntry, ...dueTodos]
      .sort((a, b) => new Date(a._sortDate) - new Date(b._sortDate));
  }, [data.appts, activeMeds, data.cycles, data.todos]);

  /* ── Snapshots (vitals + activity + mood) ── */
  const vitalsSnapshot = useVitalsSnapshot(data.vitals);
  const activitySnapshot = useActivitySnapshot(data.activities);
  const moodSnapshot = useMoodSnapshot(data.journal);

  /* ── Health trend cards ── */
  const sleepTrend = useSleepTrend(data.vitals);
  const hrTrend = useHrTrend(data.vitals);
  const spo2Trend = useSpo2Trend(data.vitals);

  // Lab highlights, recent 6 labs sorted by date
  const labHighlights = useMemo(() => {
    const labs = data.labs || [];
    if (labs.length < 2) return [];
    return [...labs].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
  }, [data.labs]);

  /* ── Alert inputs + aggregation ── */
  const urgentGaps = useMemo(
    () => (data.care_gaps || []).filter(g => g.urgency === 'urgent').length,
    [data.care_gaps]
  );
  const anesthesiaCount = useMemo(
    () => (data.anesthesia_flags || []).length,
    [data.anesthesia_flags]
  );
  const abnormalLabs = useAbnormalLabs(data.labs);
  const priceAlertMeds = usePriceAlertMeds(activeMeds, data.drug_prices);

  /* ── AI Insight ─────────────────────────────── */
  // State shape: { text, focus_area, id, generated_on } | error-string | null
  // localStorage keeps a per-day JSON cache for offline / fast-path rendering;
  // Supabase `generated_insights` is the source of truth and enables cross-device sync.
  const insightCacheKey = `salve:daily-insight-${localISODate(new Date())}`;

  const loadInsight = async (forceRefresh = false) => {
    const todayIso = localISODate(new Date());
    // Fast path: localStorage cache (JSON as of this deploy; fall back to
    // treating as plain text for old per-day entries written before the
    // state-shape change).
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(insightCacheKey);
        if (cached) {
          let parsed;
          try { parsed = JSON.parse(cached); } catch { parsed = null; }
          if (parsed && typeof parsed === 'object' && parsed.text) {
            setInsight(parsed);
          } else {
            // Legacy plain-text cache — upgrade on-the-fly.
            setInsight({ text: cached, focus_area: 'general', id: null, generated_on: todayIso });
          }
          return;
        }
      } catch (_) { /* localStorage unavailable */ }

      // Freshness check: if another device generated today's insight,
      // pull it so we don't regenerate and burn tokens.
      try {
        const row = data.generated_insights?.[0];
        if (row && row.generated_on === todayIso) {
          setInsight(row);
          try { localStorage.setItem(insightCacheKey, JSON.stringify(row)); } catch {}
          return;
        }
      } catch (_) { /* fall through to generate */ }
    }

    setInsightLoading(true);
    try {
      const result = await generateDailyInsight(data, { ratings: insightRatings });
      setInsight(result);
      try { localStorage.setItem(insightCacheKey, JSON.stringify(result)); } catch (_) { /* quota */ }
    } catch (e) {
      const isDailyLimit = e.message?.includes('Daily AI limit');
      const text = isDailyLimit ? 'Daily insight limit reached. Resets at midnight PT.' : 'Unable to load insight. ' + e.message;
      setInsight({ text, focus_area: 'general', id: null, generated_on: todayIso, error: true });
    } finally {
      setInsightLoading(false);
    }
  };

  useEffect(() => {
    if (data.settings.ai_mode === 'alwaysOn' && isPremiumActive(data.settings) && activeMeds.length + data.conditions.length > 0 && !insight && hasAIConsent()) {
      loadInsight();
    }
  }, [data.settings.ai_mode, activeMeds.length, data.conditions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const alerts = useAlerts({
    anesthesiaCount, interactions, abnormalLabs, priceAlertMeds, urgentGaps,
    data, activeMeds,
  });

  const displayedTimeline = useMemo(() => timeline.slice(0, isDesktop ? 6 : 4), [timeline, isDesktop]);

  /* Barometric pressure chip — reads cached data (no fetch here) */
  const [baroChip, setBaroChip] = useState(() => {
    const cached = readCachedBarometric();
    if (!cached?.current) return null;
    return cached;
  });
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const cached = readCachedBarometric();
        setBaroChip(cached?.current ? cached : null);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  /* Barometric pressure advisory — only for pressure-sensitive users on significant changes */
  const [baroAlertDismissed, setBaroAlertDismissed] = useState(() => {
    try {
      const raw = localStorage.getItem(BARO_ALERT_DISMISS_KEY);
      return raw === localISODate();
    } catch { return false; }
  });
  const dismissBaroAlert = useCallback(() => {
    localStorage.setItem(BARO_ALERT_DISMISS_KEY, localISODate());
    setBaroAlertDismissed(true);
  }, []);
  const baroAlert = useMemo(() => {
    if (!baroChip || baroAlertDismissed) return null;
    const change24h = baroChip.change24h ?? 0;
    const change3h = baroChip.change3h ?? 0;
    if (Math.abs(change24h) < 5 && Math.abs(change3h) < 3) return null;
    const matchedConditions = (data.conditions || [])
      .filter(c => PRESSURE_SENSITIVE.some(ps => c.name?.toLowerCase().includes(ps)))
      .map(c => c.name);
    if (matchedConditions.length === 0) return null;
    const direction = change24h < 0 || change3h < -1 ? 'falling' : 'rising';
    const magLabel = Math.abs(change24h) >= 1
      ? `${Math.abs(change24h).toFixed(1)} hPa in 24h`
      : `${Math.abs(change3h).toFixed(1)} hPa in 3h`;
    const tips = direction === 'falling' ? [
      'Stay well-hydrated — dehydration worsens pressure-related symptoms.',
      'Avoid skipping medications today.',
      'Rest proactively; don\'t wait until you\'re in a flare.',
      'Heat therapy (warm compress or heating pad) can ease joint and muscle pain.',
      'Track your symptoms in your journal to spot patterns over time.',
    ] : [
      'Gentle movement may help — rising pressure is often better tolerated.',
      'A mild walk or light stretching may reduce stiffness.',
      'Keep your normal medication schedule.',
      'Consider this a good day for mild activity if you\'re feeling well.',
    ];
    return { current: baroChip.current, change24h, change3h, trend: baroChip.trend, direction, magLabel, matchedConditions, tips };
  }, [baroChip, baroAlertDismissed, data.conditions]);


  const todayChips = useMemo(() => {
    const chips = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const upcomingAppts = [...(data.appts || [])]
      .filter(a => new Date(a.date + 'T00:00:00') >= now)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (upcomingAppts.length > 0) {
      const next = upcomingAppts[0];
      const days = Math.round((new Date(next.date + 'T00:00:00') - now) / 86400000);
      chips.push({
        id: 'appt', icon: Calendar, color: C.sage,
        label: next.provider || 'Appointment',
        sub: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`,
        nav: 'appts',
      });
    }
    const refillsDue = activeMeds.filter(m => {
      if (!m.refill_date) return false;
      const d = Math.round((new Date(m.refill_date + 'T00:00:00') - now) / 86400000);
      return d >= 0 && d <= 7;
    });
    if (refillsDue.length > 0) {
      chips.push({
        id: 'refills', icon: Pill, color: C.amber,
        label: `${refillsDue.length} refill${refillsDue.length > 1 ? 's' : ''}`,
        sub: 'this week', nav: 'meds',
      });
    }
    const overdueTodos = (data.todos || []).filter(t =>
      !t.completed && !t.dismissed && t.due_date && new Date(t.due_date + 'T00:00:00') < now
    );
    if (overdueTodos.length > 0) {
      chips.push({
        id: 'todos', icon: AlertTriangle, color: C.rose,
        label: `${overdueTodos.length} overdue`,
        sub: `to-do${overdueTodos.length > 1 ? 's' : ''}`, nav: 'todos',
      });
    }
    return chips;
  }, [data.appts, activeMeds, data.todos]);

  const greeting = getTimeGreeting();
  const contextLine = getContextLine(data, interactions, urgentGaps, anesthesiaCount, abnormalLabs.length, alertsDismissed);

  const dismissAlerts = useCallback((duration) => {
    const val = { until: duration === 'forever' ? 'forever' : Date.now() + duration };
    localStorage.setItem(ALERT_DISMISS_KEY, JSON.stringify(val));
    setAlertDismissal(val);
  }, []);

  /* ── Discover (personalized news only) ─────────── */
  const [seenResources, setSeenResources] = useState(() => getSeenResources());
  const [rssArticles, setRssArticles] = useState([]);
  const dailyQuote = useMemo(() => getDailyQuote(), []);
  const discoverConditionNames = (data.conditions || []).map(c => c.name).filter(Boolean).join('|');

  // Fetch trusted RSS articles, then let the shared news-ranking logic decide
  // what is actually relevant enough to appear on Home.
  useEffect(() => {
    const conditions = (data.conditions || []).map(c => c.name).filter(Boolean);
    if (conditions.length === 0 && (data.meds || []).length === 0) return;
    fetchDiscoverArticles(conditions).then(articles => {
      setRssArticles(articles || []);
    });
  }, [discoverConditionNames, data.meds?.length]);

  const discoverItems = useMemo(() => {
    const seenSet = new Set(seenResources);
    const feed = buildNewsFeed({
      rssArticles,
      conditions: data.conditions,
      medications: data.meds,
    });

    return feed
      .filter(article => !seenSet.has(article.id))
      .filter(article => article.type !== 'rss' || article.relevance > 0)
      .map(article => ({ resource: article, dynamic: article.type === 'rss' }));
  }, [data.conditions, data.meds, seenResources, rssArticles]);

  const displayedDiscover = useMemo(() => discoverItems.slice(0, isDesktop ? 4 : 3), [discoverItems, isDesktop]);

  /* ── Whether the left column has any visible content (for responsive layout) ── */
  const hasLeftContent = useMemo(() => {
    const hasAlerts = alerts.length > 0 && !alertsDismissed;
    const hasPatterns = topInsights.length > 0;
    const aiConsent = hasAIConsent();
    const hasAITeaser = aiConsent && !insight && !insightLoading && data.settings.ai_mode !== 'off' && activeMeds.length + data.conditions.length > 0;
    const hasAIInsight = aiConsent && (insight || insightLoading);
    const hasDiscover = displayedDiscover.length > 0;
    const hasBaro = !!data.settings.location;
    return hasAlerts || hasPatterns || hasAITeaser || hasAIInsight || hasDiscover || hasBaro;
  }, [alerts, alertsDismissed, topInsights.length, insight, insightLoading, data.settings.ai_mode, activeMeds.length, data.conditions.length, displayedDiscover.length, data.settings.location]);

  const dismissResource = useCallback((resourceId) => {
    setSeenResources(prev => {
      const next = [...prev, resourceId];
      localStorage.setItem(SEEN_RESOURCES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /* ── Getting Started tips ──────────────────── */
  const [dismissedTips, setDismissedTips] = useState(() => getDismissedTips());

  const visibleTips = useMemo(() => {
    const now = Date.now();
    const dismissMap = new Map(dismissedTips.map(d => [d.id, d]));
    return STARTER_TIPS.filter(tip => {
      // Data-proven complete: auto-hide regardless of dismissal
      if (tip.id === 'add-meds' && activeMeds.length > 0) return false;
      if (tip.id === 'add-providers' && data.providers.length > 0) return false;
      if (tip.id === 'connect-oura' && (hasOura || hasAppleHealth
        || (data.vitals || []).some(v => /^(fitbit|withings|dexcom|whoop|terra)$/.test(v.source)))) return false;
      // Theme nudge: only show after 2+ days of use AND still on default theme
      if (tip.id === 'try-a-theme') {
        try {
          const installed = parseInt(localStorage.getItem('salve:installed-at') || '0', 10);
          const ageDays = installed > 0 ? (now - installed) / 86400000 : 0;
          const theme = localStorage.getItem('salve:theme') || 'lilac';
          if (!(installed > 0 && ageDays >= 2 && theme === 'lilac')) return false;
        } catch { return false; }
      }
      const record = dismissMap.get(tip.id);
      if (!record) return true;
      if (record.permanent) return false;
      if (record.snoozedUntil && now < record.snoozedUntil) return false;
      return true; // Snooze expired, resurface
    });
  }, [dismissedTips, activeMeds, data.providers, hasOura]);

  const dismissTip = useCallback((tipId) => {
    setDismissedTips(prev => {
      const tip = STARTER_TIPS.find(t => t.id === tipId);
      const existing = prev.find(d => d.id === tipId);
      const behavior = tip?.dismissBehavior || 'permanent';
      let record;
      if (behavior === 'permanent' || behavior === 'auto') {
        // 'auto' tips: if data isn't there yet, snooze; otherwise they'd already be hidden by data check
        if (behavior === 'auto') {
          record = existing?.snoozedUntil
            ? { id: tipId, permanent: true }
            : { id: tipId, snoozedUntil: Date.now() + (tip.snoozeDays || 7) * 86400000 };
        } else {
          record = { id: tipId, permanent: true };
        }
      } else {
        // 'snooze': first dismiss snoozes, second is permanent
        record = existing?.snoozedUntil
          ? { id: tipId, permanent: true }
          : { id: tipId, snoozedUntil: Date.now() + (tip.snoozeDays || 7) * 86400000 };
      }
      const next = prev.filter(d => d.id !== tipId);
      if (record) next.push(record);
      localStorage.setItem(DISMISSED_TIPS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const dismissAllTips = useCallback(() => {
    const records = STARTER_TIPS.map(t => ({ id: t.id, permanent: true }));
    localStorage.setItem(DISMISSED_TIPS_KEY, JSON.stringify(records));
    setDismissedTips(records);
  }, []);

  /* ── Unread feedback responses ─────────────── */
  const unreadFeedbackCount = useMemo(() => {
    const items = data.feedback || [];
    const withResponse = items.filter(i => i.response);
    if (withResponse.length === 0) return 0;
    try {
      const seen = JSON.parse(localStorage.getItem('salve:feedback-responses-seen') || '[]');
      const seenSet = new Set(seen);
      return withResponse.filter(i => !seenSet.has(i.id)).length;
    } catch { return withResponse.length; }
  }, [data.feedback]);


  /* ── Render ─────────────────────────────────── */
  return (
    <div className="mt-1">

      {/* ── Contextual Greeting ────────────────── */}
      <section aria-label="Greeting" className="dash-stagger dash-stagger-1 mb-4 md:mb-6">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="greeting-motif">
                <Motif type={greeting.motif} size={16} color={C.sage} />
              </span>
              <span className="font-playfair text-display-md font-medium text-salve-textMid">{greeting.text}</span>
            </div>
            <p className="text-ui-lg text-salve-textMid m-0 leading-relaxed">{contextLine}</p>
            <p className="text-ui-sm text-salve-textMid m-0 mt-2 italic font-montserrat">
              "{dailyQuote.q}" <span className="not-italic text-salve-textMid/80">, {dailyQuote.a}</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── Today at a Glance chips ────────────── */}
      {todayChips.length > 0 && (
        <section aria-label="Today at a glance" className="dash-stagger dash-stagger-2 mb-4 -mt-1">
          <div className="flex items-center gap-2 flex-wrap">
            {todayChips.map(chip => {
              const ChipIcon = chip.icon;
              return (
                <button
                  key={chip.id}
                  onClick={() => onNav(chip.nav)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer font-montserrat transition-all hover:opacity-80 active:scale-[0.97]"
                  style={{ background: `${chip.color}12`, outline: `1px solid ${chip.color}28` }}
                >
                  <ChipIcon size={11} style={{ color: chip.color }} />
                  <span className="text-[11.5px] font-medium" style={{ color: chip.color }}>{chip.label}</span>
                  <span className="text-[10.5px] ml-0.5" style={{ color: chip.color, opacity: 0.65 }}>{chip.sub}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Micro-insights: quick rotating stat chips ── */}
      {microInsights.length > 0 && (
        <div className="dash-stagger dash-stagger-2 mb-3 flex items-center gap-2 flex-wrap">
          {microInsights.map(mi => (
            <span
              key={mi.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-salve-card2/60 border border-salve-border/40 font-montserrat text-[11.5px] text-salve-textMid"
            >
              <span>{mi.emoji}</span>
              <span>{mi.text}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Centerpiece Search, hidden on desktop (SideNav ⌘K handles it) ── */}
      <section aria-label="Search" className="dash-stagger dash-stagger-2 mb-5 md:mb-7 md:hidden">
        <div className={`search-hero ${searchFocused ? 'search-hero-focused' : ''}`}>
          <div className="search-hero-inner">
            <div className="relative flex items-center">
              {/* Sparkle accent, visible when idle */}
              {!searchQuery && (
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 search-sparkle pointer-events-none z-10">
                  <Sparkles size={15} color={C.lav} strokeWidth={1.5} />
                </div>
              )}
              {/* Search icon, visible when typing */}
              {searchQuery && (
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-salve-lav pointer-events-none z-10" />
              )}
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={handleSearchKeyDown}
                placeholder={SEARCH_PLACEHOLDERS[placeholderIdx]}
                aria-label="Search your health data"
                className="w-full bg-transparent py-3.5 md:py-4 pl-10 pr-10 text-sm md:text-[15px] text-salve-text placeholder:text-salve-textFaint/70 font-montserrat outline-none relative z-[1]"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-salve-textFaint hover:text-salve-text bg-salve-card2 rounded-full w-5 h-5 flex items-center justify-center border-none cursor-pointer transition-colors"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* ── Inline Results ──────────────────── */}
            {debouncedSearch.length >= 2 && searchResults.length > 0 && (
              <div className="border-t border-salve-border/40 px-2 pt-1.5 pb-2">
                {searchResults.map((r, i) => {
                  const Icon = r.config.icon;
                  return (
                    <button
                      key={`${r.entityKey}-${r.id}-${i}`}
                      onClick={() => onNav(r.config.tab, { highlightId: r.id })}
                      className="search-result-enter w-full flex items-center gap-2.5 py-2 px-2 rounded-xl bg-transparent border-0 cursor-pointer transition-colors hover:bg-salve-card2/60 text-left"
                      style={{ animationDelay: `${i * 0.04}s` }}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${r.config.color}15` }}
                      >
                        <Icon size={13} color={r.config.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] text-salve-text font-medium truncate">
                          {highlightMatch(r.config.primary(r.item), debouncedSearch)}
                        </div>
                        {r.config.secondary(r.item) && (
                          <div className="text-[10.5px] text-salve-textFaint truncate">
                            {highlightMatch(r.config.secondary(r.item), debouncedSearch)}
                          </div>
                        )}
                        {r.matchContext && (
                          <div className="text-[12px] text-salve-textFaint/70 truncate italic">
                            {r.matchContext.label}: {highlightMatch(r.matchContext.value, debouncedSearch)}
                          </div>
                        )}
                      </div>
                      <span
                        className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full tracking-wide flex-shrink-0"
                        style={{ background: `${r.config.color}12`, color: r.config.color }}
                      >
                        {r.config.label}
                      </span>
                      <ChevronRight size={12} className="text-salve-textFaint/50 flex-shrink-0" />
                    </button>
                  );
                })}

                {/* "See all" link */}
                {totalResults > 5 && (
                  <button
                    onClick={() => onNav('search')}
                    className="search-see-all w-full flex items-center justify-center gap-1.5 pt-2 pb-1 mt-1 border-t border-salve-border/30 bg-transparent border-x-0 border-b-0 cursor-pointer"
                  >
                    <span className="text-[11.5px] font-medium text-gradient-magic">
                      See all {totalResults} results
                    </span>
                    <ArrowRight size={12} className="text-salve-lav" />
                  </button>
                )}
              </div>
            )}

            {/* No results message */}
            {debouncedSearch.length >= 2 && searchResults.length === 0 && (
              <div className="border-t border-salve-border/40 px-4 py-3 text-center">
                <span className="text-[14px] text-salve-textFaint font-light">No matches for &ldquo;{debouncedSearch}&rdquo;</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Quick Navigation Hub ───────────────── */}
      <section aria-label="Quick navigation" className="dash-stagger dash-stagger-3 mb-5 md:mb-7">
        <div className={`grid gap-fluid-sm ${hubTiles.length <= 5 ? 'grid-cols-' + hubTiles.length : 'grid-cols-3 md:grid-cols-6'}`}
          style={{ gridTemplateColumns: `repeat(${Math.min(hubTiles.length, 6)}, 1fr)` }}>
          {hubTiles.map((h) => (
            <button
              key={h.id}
              onClick={() => onNav(h.navId)}
              onPointerMove={handleSpotlight}
              className="bg-salve-card border border-salve-border rounded-xl p-fluid-sm flex flex-col items-center gap-1.5 cursor-pointer tile-magic transition-all"
            >
              <h.icon size={20} color={C.lav} strokeWidth={1.5} className="md:!w-6 md:!h-6" />
              <span className="text-[10px] md:text-ui-sm text-salve-textMid font-montserrat text-center leading-tight">{h.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Introduce Yourself to Sage (shown when profile is sparse) ── */}
      {onSageIntro && shouldShowIntro(data, dataLoading) && (
        <section className="dash-stagger dash-stagger-3 mb-5 md:mb-6">
          <SageIntroButton onClick={onSageIntro} />
        </section>
      )}

      {/* ── Chat with Sage (mobile only, desktop uses sidebar "Ask Sage" button) ── */}
      {onSage && (
        <section className="dash-stagger dash-stagger-3 mb-5 md:hidden">
          <button
            onClick={onSage}
            className="w-full flex items-center gap-3 px-4 py-3 bg-salve-card border border-salve-border rounded-xl cursor-pointer hover:border-salve-sage/50 hover:bg-salve-sage/5 transition-all group text-left"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${C.sage}18` }}>
              <Leaf size={15} color={C.sage} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium text-salve-text">Chat with Sage</div>
              <div className="text-[13px] text-salve-textFaint truncate">Ask about your health, medications, or records</div>
            </div>
            <ChevronRight size={14} className="text-salve-textFaint group-hover:text-salve-sage transition-colors flex-shrink-0" />
          </button>
        </section>
      )}

      {/* ── Scribe (mobile only, desktop uses sidebar) ── */}
      <section className="dash-stagger dash-stagger-3 mb-5 md:hidden">
        <button
          onClick={() => onNav('formhelper')}
          className="w-full flex items-center gap-3 px-4 py-3 bg-salve-card border border-salve-border rounded-xl cursor-pointer hover:border-salve-lav/50 hover:bg-salve-lav/5 transition-all group text-left"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${C.lav}18` }}>
            <PenLine size={15} color={C.lav} strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-medium text-salve-text">Form Scribe</div>
            <div className="text-[13px] text-salve-textFaint truncate">Sage fills out forms from your records</div>
          </div>
          <ChevronRight size={14} className="text-salve-textFaint group-hover:text-salve-lav transition-colors flex-shrink-0" />
        </button>
      </section>

      {/* ── Two-column grid zone (desktop), collapses to single col when left is empty ── */}
      <div className={hasLeftContent ? 'md:grid md:grid-cols-[3fr_2fr] md:gap-6 lg:gap-8 md:items-start' : ''}>
        {/* ── Left column ── */}
        {hasLeftContent && <div>
          {/* Alerts */}
          {!alertsDismissed && (
            <AlertsCard alerts={alerts} onDismiss={dismissAlerts} onNav={onNav} />
          )}

          {/* Barometric pressure advisory */}
          {baroAlert && (
            <section aria-label="Barometric pressure advisory" className="dash-stagger dash-stagger-3 mb-4 md:mb-6">
              <Card className="!p-0 overflow-hidden" style={{ borderLeft: `3px solid ${C.amber}40` }}>
                <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-salve-border/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wind size={13} style={{ color: C.amber }} aria-hidden="true" />
                    <span className="text-ui-sm font-semibold font-montserrat" style={{ color: C.amber }}>
                      Pressure {baroAlert.direction === 'falling' ? '↓ dropping' : '↑ rising'}
                    </span>
                    <span className="text-[11px] text-salve-textFaint truncate">{baroAlert.current} hPa · {baroAlert.magLabel}</span>
                  </div>
                  <button
                    onClick={dismissBaroAlert}
                    className="p-1 -mr-1 rounded-md hover:bg-salve-card2 text-salve-textFaint transition-colors flex-shrink-0 ml-2"
                    aria-label="Dismiss pressure advisory"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="px-4 md:px-5 py-3">
                  <p className="text-ui-sm text-salve-textMid mb-2.5">
                    {baroAlert.matchedConditions.length > 0
                      ? `This pressure shift may affect your ${baroAlert.matchedConditions.slice(0, 2).join(' and ')}.`
                      : 'A significant pressure shift has been detected near you.'}
                  </p>
                  <ul className="flex flex-col gap-1.5 mb-3" aria-label="Tips for today">
                    {baroAlert.tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[11px] font-bold mt-0.5 flex-shrink-0" style={{ color: C.amber }}>·</span>
                        <span className="text-ui-sm text-salve-textMid">{tip}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => onNav('vitals')}
                    className="text-[12px] font-medium font-montserrat transition-colors hover:opacity-80"
                    style={{ color: C.amber }}
                  >
                    Log your pressure →
                  </button>
                </div>
              </Card>
            </section>
          )}

          {/* Barometric pressure card */}
          {data.settings.location && (
            <Reveal as="section" aria-label="Barometric pressure" className="dash-stagger dash-stagger-3">
              <BarometricCard
                locationStr={data.settings.location}
                onLogPressure={() => onNav('vitals')}
                onNav={onNav}
              />
            </Reveal>
          )}

          {/* Health patterns */}
          {topInsights.length > 0 && (
            <section aria-label="Health patterns" className="dash-stagger dash-stagger-3 mb-4">
              <Card className="!p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={13} className="text-salve-lav" />
                    <span className="text-[13px] text-salve-textFaint font-montserrat tracking-wide uppercase">Patterns</span>
                  </div>
                  <button
                    onClick={() => onNav('insights')}
                    className="text-[13px] text-salve-lav/70 hover:text-salve-lav font-montserrat transition-colors bg-transparent border-0 cursor-pointer"
                  >
                    See all &rarr;
                  </button>
                </div>
                {topInsights.map((ins, i) => {
                  const catColors = {
                    sleep: 'border-salve-lav', exercise: 'border-salve-sage', medication: 'border-salve-sage',
                    cycle: 'border-salve-amber', trend: 'border-salve-lav', symptom: 'border-salve-rose',
                    dayofweek: 'border-salve-amber', streak: 'border-salve-sage', comparison: 'border-salve-lav', timeofday: 'border-salve-lav',
                  };
                  const catIcons = {
                    sleep: Moon, exercise: Activity, medication: Pill,
                    cycle: Heart, trend: TrendingUp, symptom: Activity,
                    dayofweek: Calendar, streak: Flame, comparison: ArrowLeftRight, timeofday: Clock,
                  };
                  const catHex = {
                    sleep: C.lav, exercise: C.sage, medication: C.sage,
                    cycle: C.amber, trend: C.lav, symptom: C.rose,
                    dayofweek: C.amber, streak: C.sage, comparison: C.lav, timeofday: C.lav,
                  };
                  const Icon = catIcons[ins.category] || Sparkles;
                  const borderCls = catColors[ins.category] || 'border-salve-lav';
                  const hex = catHex[ins.category] || C.lav;
                  return (
                    <div key={ins.id}>
                      {i > 0 && <div className="border-t border-salve-border/50 mx-4" />}
                      <div className="px-4 py-2.5">
                        <div className={`border-l-2 ${borderCls} pl-3`}>
                          <div className="flex items-center gap-2 mb-0.5">
                            <Icon size={12} style={{ color: hex }} className="flex-shrink-0" />
                            <span className="text-[11.5px] font-semibold text-salve-text font-montserrat">{ins.title}</span>
                          </div>
                          <p className="text-[11.5px] text-salve-textMid font-montserrat leading-relaxed m-0">{ins.template}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10.5px] text-salve-textFaint/70 font-montserrat">
                              {ins.data?.values?.length ? (() => {
                                const dates = ins.data.values.map(v => v.date).filter(Boolean).sort();
                                if (!dates.length) return `${ins.n} data points`;
                                const newest = new Date(dates[dates.length - 1] + 'T00:00:00');
                                const daysAgo = Math.round((Date.now() - newest) / 86400000);
                                return daysAgo <= 1 ? `Last ${dates.length} days · Updated today` : `Last ${dates.length} days · ${daysAgo}d ago`;
                              })() : ins.n >= 14 ? 'Last 14 days' : `${ins.n} data points`}
                            </span>
                            {insightRatings && <ThumbsRating surface="pattern" contentKey={ins.id} getRating={insightRatings.getRating} rate={insightRatings.rate} metadata={{ category: ins.category, title: ins.title }} size={11} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          )}

          {/* AI Insight teaser */}
          {hasAIConsent() && !insight && !insightLoading && data.settings.ai_mode !== 'off' && activeMeds.length + data.conditions.length > 0 && (
            <section aria-label="Get insight from Sage" className="dash-stagger dash-stagger-3 mb-4">
              <Card className="!p-0 overflow-hidden cursor-pointer hover:border-salve-sage/30 transition-colors" onClick={loadInsight}>
                <div className="px-4 md:px-5 py-3.5 md:py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${C.sage}15` }}>
                      <Leaf size={16} color={C.sage} strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-ui-md font-medium text-salve-text font-montserrat">Daily Insight</div>
                      <div className="text-[13px] md:text-xs text-salve-textFaint font-montserrat">Personalized health insight from Sage</div>
                    </div>
                    <ChevronRight size={13} className="text-salve-textFaint flex-shrink-0" />
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* AI Insight loaded */}
          {hasAIConsent() && (insight || insightLoading) && (
            <section aria-label="Daily insight" className="dash-stagger dash-stagger-3 mb-4">
              {insightLoading ? (
                <Card className="!bg-salve-sage/5 !border-salve-sage/15 shimmer-bg insight-glow">
                  <div className="flex items-center gap-2 mb-2">
                    <Leaf size={14} className="text-salve-sageDim" />
                    <span className="text-xs text-salve-sageDim font-montserrat tracking-wide">FROM SAGE</span>
                  </div>
                  <div className="relative w-14 h-14 mx-auto mb-3 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-salve-sage/20 breathe-ring" />
                    <div className="absolute inset-2 rounded-full border border-salve-sage/10 breathe-ring" style={{ animationDelay: '0.4s' }} />
                    <Leaf size={18} className="breathe-icon text-salve-sageDim" />
                  </div>
                  <p className="text-[12px] text-salve-textFaint/50 font-montserrat tracking-widest uppercase mb-3 text-center">Breathe with me</p>
                  <div key={wellness.key} className="wellness-msg text-[14px] text-salve-lavDim/80 font-montserrat italic text-center" role="status" aria-live="polite">{wellness.message}</div>
                </Card>
              ) : insight && (
                <Card className="!bg-salve-sage/5 !border-salve-sage/15 insight-glow">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <Leaf size={14} className="text-salve-sage" />
                      <span className="text-xs text-salve-sageDim font-montserrat tracking-wide">FROM SAGE</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const clean = (insight.text || '').replace(/\n---\n\*(?:AI|Sage'?s?) suggestions[^*]*\*\s*$/, '').trim();
                          const key = 'salve:saved-insights';
                          try {
                            const arr = JSON.parse(localStorage.getItem(key) || '[]');
                            if (!arr.some(s => s.type === 'insight' && s.text === clean)) {
                              arr.push({ type: 'insight', label: 'Health Insight', text: clean, savedAt: new Date().toISOString() });
                              localStorage.setItem(key, JSON.stringify(arr));
                            }
                          } catch {}
                        }}
                        className="p-1 rounded-md bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-sage transition-colors"
                        aria-label="Save insight"
                      ><Bookmark size={12} /></button>
                      <button
                        onClick={() => { const clean = (insight.text || '').replace(/\n---\n\*(?:AI|Sage'?s?) suggestions[^*]*\*\s*$/, '').trim(); navigator.clipboard.writeText(clean); }}
                        className="p-1 rounded-md bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-sage transition-colors"
                        aria-label="Copy insight"
                      ><Copy size={12} /></button>
                      <button
                        onClick={() => { setInsight(null); loadInsight(true); trackEvent(EVENTS.INSIGHT_REFRESHED); }}
                        className="p-1 rounded-md bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-sage transition-colors"
                        aria-label="New insight"
                      ><RefreshCw size={12} /></button>
                      {insightRatings && insight.generated_on && !insight.error && (
                        <ThumbsRating surface="insight" contentKey={insight.generated_on} getRating={insightRatings.getRating} rate={insightRatings.rate} size={11} />
                      )}
                    </div>
                  </div>
                  <AIMarkdown compact>{insight.text || ''}</AIMarkdown>
                  {(data.generated_insights?.length || 0) > 1 && (
                    <div className="mt-2 text-right">
                      <button
                        onClick={() => onNav('insights', { tab: 'history' })}
                        className="text-[12px] text-salve-sageDim/80 hover:text-salve-sage font-montserrat transition-colors bg-transparent border-0 cursor-pointer p-0"
                      >See past insights &rarr;</button>
                    </div>
                  )}
                </Card>
              )}
            </section>
          )}

          {/* Discover news */}
          {displayedDiscover.length > 0 && (
            <Reveal as="section" aria-label="Personalized health news" className="mb-4">
              <Card className="!p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 md:px-5 py-2.5 border-b border-salve-border/50">
                  <div className="flex items-center gap-2">
                    <Newspaper size={13} className="text-salve-lav" />
                    <span className="text-ui-sm text-salve-textFaint font-montserrat tracking-widest uppercase">For You</span>
                  </div>
                  <button
                    onClick={() => onNav('news')}
                    className="text-[13px] text-salve-lav/70 hover:text-salve-lav font-montserrat transition-colors bg-transparent border-0 cursor-pointer"
                  >
                    See all &rarr;
                  </button>
                </div>
                {displayedDiscover.map((d, i) => {
                  const src = d.resource.source;
                  const isDynamic = d.dynamic;
                  const accentColor = src === 'FDA Drug Safety' ? C.amber : src === 'Sage' ? C.sage : C.lav;
                  return (
                    <div
                      key={d.resource.id}
                      className={`flex items-start gap-3 px-4 md:px-5 py-3 md:py-4 ${i < displayedDiscover.length - 1 ? 'border-b border-salve-border/40' : ''}`}
                    >
                      <div
                        className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5"
                        style={{ background: accentColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="text-ui-xs font-montserrat tracking-wider uppercase"
                            style={{ color: accentColor }}
                          >
                            {src}
                          </span>
                          {d.resource.relevance > 0 && isDynamic && (
                            <span className="text-[9px] text-salve-textFaint/60 font-montserrat tracking-wide uppercase">
                              Matched
                            </span>
                          )}
                          {d.resource.date && <span className="text-[9px] text-salve-textFaint/50 font-montserrat">{d.resource.date}</span>}
                        </div>
                        <a
                          href={d.resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ui-md text-salve-text font-medium hover:text-salve-lav transition-colors inline-flex items-center gap-1"
                        >
                          {d.resource.title}
                          <ExternalLink size={10} className="text-salve-textFaint/50 flex-shrink-0" />
                        </a>
                        <p className="text-ui-base text-salve-textFaint leading-relaxed mt-0.5 mb-0">{d.resource.blurb}</p>
                      </div>
                      <button
                        onClick={() => dismissResource(d.resource.id)}
                        className="p-1.5 -mr-1 rounded-md bg-transparent border-none cursor-pointer text-salve-textFaint/40 hover:text-salve-textFaint hover:bg-salve-card2 transition-colors flex-shrink-0"
                        aria-label={`Dismiss ${d.resource.title}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </Card>
            </Reveal>
          )}
        </div>}

        {/* ── Right column (or single column when left is empty) ── */}
        <div className={!hasLeftContent ? 'md:grid md:grid-cols-2 md:gap-4 lg:gap-6' : ''}>
          {/* Coming Up timeline */}
          {displayedTimeline.length > 0 && (
            <Reveal as="section" aria-label="Coming up" className={`mb-4 ${!hasLeftContent ? 'md:col-span-2' : ''}`}>
              <SectionTitle>Coming Up</SectionTitle>
              {displayedTimeline.map((item, i) => {
                const isAppt = item._type === 'appt';
                const isPeriod = item._type === 'period';
                const isTodo = item._type === 'todo';
                const dotColor = isAppt ? C.sage : isPeriod ? C.rose : isTodo ? C.lav : C.amber;
                const label = isAppt ? (item.reason || 'Appointment') : isPeriod ? item._label : isTodo ? item.title : `${item.name} ${item.dose || ''}`.trim();
                const sub = isAppt ? item.provider : isPeriod ? 'Predicted' : isTodo ? 'To-do' : 'Refill';
                if (isPeriod) {
                  return (
                    <div
                      key={item.id || i}
                      className="w-full flex items-center gap-3 py-2.5 md:py-3.5 px-1 rounded-lg group timeline-row"
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                      <button
                        onClick={() => onNav('cycles')}
                        className="flex-1 text-left min-w-0 bg-transparent border-0 cursor-pointer p-0"
                      >
                        <div className="text-[15px] md:text-sm text-salve-text font-medium truncate">{label}</div>
                        <div className="text-[13px] md:text-xs text-salve-textFaint">{sub}</div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onNav('cycles', { quickLog: true }); }}
                        className="ml-auto py-1 px-2.5 rounded-full text-ui-sm font-medium font-montserrat cursor-pointer border border-salve-rose/30 bg-salve-rose/10 text-salve-rose hover:bg-salve-rose/20 transition-colors flex-shrink-0"
                        aria-label="Log period for today"
                      >
                        Log today
                      </button>
                    </div>
                  );
                }
                return (
                  <button
                    key={item.id || i}
                    onClick={() => onNav(isAppt ? 'appts' : isTodo ? 'todos' : 'meds')}
                    className="w-full flex items-center gap-3 bg-transparent border-0 cursor-pointer py-2.5 md:py-3.5 px-1 rounded-lg group timeline-row"
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-[15px] md:text-sm text-salve-text font-medium truncate">{label}</div>
                      <div className="text-[13px] md:text-xs text-salve-textFaint">{sub}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-ui-md font-semibold" style={{ color: dotColor }}>{daysUntil(item._sortDate)}</div>
                      <div className="text-ui-sm text-salve-textFaint">{fmtDate(item._sortDate)}</div>
                    </div>
                  </button>
                );
              })}
            </Reveal>
          )}

          <VitalsSnapshot snapshot={vitalsSnapshot} chartsReady={chartsReady} chartsRef={chartsRef} onNav={onNav} unitSystem={data?.settings?.unit_system || 'imperial'} />

          {/* Mood + Activity, side-by-side at lg+ only when both exist */}
          <div className={moodSnapshot && activitySnapshot ? 'lg:grid lg:grid-cols-2 lg:gap-4' : ''}>
            <MoodSnapshot snapshot={moodSnapshot} onNav={onNav} />
            <ActivitySnapshot snapshot={activitySnapshot} onNav={onNav} />
          </div>
        </div>
      </div>

      {/* ── Pinned shortcuts (user-starred) ─────── */}
      {starredTiles.length > 0 && (
        <Reveal as="section" aria-label="Pinned shortcuts" className="mb-4">
          <SectionTitle>Favorites</SectionTitle>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3 lg:grid-cols-5 lg:gap-4">
            {starredTiles.map((t, i) => {
              const remainder = starredTiles.length % 3;
              const isLast = i === starredTiles.length - 1;
              const span = isLast && remainder !== 0 ? 3 - remainder + 1 : 1;
              return (
                <button
                  key={t.id}
                  onClick={() => onNav(t.id)}
                  onPointerMove={handleSpotlight}
                  className={`bg-salve-card border border-salve-border rounded-xl p-fluid-lg flex flex-col items-center gap-fluid-xs cursor-pointer tile-magic transition-all relative${span === 2 ? ' col-span-2 md:col-span-1' : span === 3 ? ' col-span-3 md:col-span-1' : ''}`}
                >
                  <div className="absolute top-1.5 right-1.5">
                    <span className="text-salve-amber text-[8px]">★</span>
                  </div>
                  <t.icon size={20} color={C.lav} strokeWidth={1.5} className="md:!w-6 md:!h-6" />
                  <span className="text-ui-base text-salve-textMid font-montserrat">{t.label}</span>
                </button>
              );
            })}
          </div>
        </Reveal>
      )}

      <HealthTrends
        sleepTrend={sleepTrend}
        hrTrend={hrTrend}
        spo2Trend={spo2Trend}
        labHighlights={labHighlights}
        chartsReady={chartsReady}
        chartsRef={chartsRef}
        onNav={onNav}
      />

      <GettingStartedTips
        tips={visibleTips}
        onDismiss={dismissTip}
        onDismissAll={dismissAllTips}
        onNav={onNav}
      />

      {/* ── Feedback response notification ── */}
      {unreadFeedbackCount > 0 && (
        <Reveal as="section" aria-label="Feedback response" className="dash-stagger mb-3 md:mb-4">
          <button
            onClick={() => onNav('feedback')}
            className="feedback-response-notify group relative w-full flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer text-left overflow-hidden"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative z-10"
              style={{ background: `${C.sage}20` }}
            >
              <Leaf size={16} color={C.sage} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <span className="text-[13px] md:text-[14px] font-semibold text-salve-text font-montserrat">
                {unreadFeedbackCount === 1 ? 'The Salve team responded to your feedback' : `${unreadFeedbackCount} new feedback responses`}
              </span>
              <span className="text-[11px] md:text-[12px] text-salve-textMid font-montserrat block mt-0.5">
                Tap to read {unreadFeedbackCount === 1 ? 'the response' : 'your responses'}
              </span>
            </div>
            <ChevronRight
              size={16}
              className="text-salve-sage flex-shrink-0 relative z-10 transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </Reveal>
      )}

      {/* ── Beta feedback card (prominent, always visible during beta) ── */}
      <Reveal as="section" aria-label="Beta feedback" className="dash-stagger mb-5 md:mb-6">
        <button
          onClick={() => onNav('feedback')}
          className="feedback-cta group relative w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl cursor-pointer text-left overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${C.amber}1a 0%, ${C.rose}18 55%, ${C.lav}1a 100%)`,
            border: `1px solid ${C.amber}55`,
            boxShadow: `0 4px 18px -6px ${C.amber}55, 0 0 0 1px ${C.amber}22 inset`,
          }}
        >
          <span
            aria-hidden="true"
            className="feedback-cta-shimmer pointer-events-none absolute inset-0"
          />
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative z-10"
            style={{
              background: `linear-gradient(135deg, ${C.amber}, ${C.rose})`,
              boxShadow: `0 2px 10px -2px ${C.amber}80`,
            }}
          >
            <Mail size={17} color="#fff" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0 relative z-10">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-[14px] md:text-[15px] font-semibold text-salve-text font-montserrat">
                Help shape Salve
              </span>
              <span
                className="text-[9px] tracking-widest uppercase font-montserrat font-bold px-1.5 py-0.5 rounded"
                style={{ color: '#fff', background: C.amber, boxShadow: `0 1px 4px -1px ${C.amber}99` }}
              >
                Beta
              </span>
            </div>
            <span className="text-[12px] md:text-[13px] text-salve-textMid font-montserrat leading-snug block">
              Your feedback makes Salve better — tell us what you think
            </span>
          </div>
          <ChevronRight
            size={18}
            className="text-salve-amber flex-shrink-0 relative z-10 transition-transform group-hover:translate-x-0.5"
          />
        </button>
      </Reveal>

      {/* Recovery link for users who dismissed all tips but still have no data —
          gives them a path back to the onboarding wizard. Silent for engaged users. */}
      {visibleTips.length === 0 && (data.meds?.length || 0) === 0 && (data.conditions?.length || 0) === 0 && (data.vitals?.length || 0) === 0 && (
        <Reveal as="section" aria-label="Onboarding recovery" className="mb-4 mt-2">
          <button
            onClick={() => {
              try { localStorage.removeItem('salve:onboarded'); } catch { /* */ }
              window.location.reload();
            }}
            className="w-full flex items-center justify-center gap-1.5 text-ui-sm text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat py-2 transition-colors"
          >
            <Sparkles size={11} />
            Need help getting started? Re-run setup
          </button>
        </Reveal>
      )}

      {/* Desktop "made with love" tagline, mirrors mobile BottomNav behaviour */}
      <p className={`hidden md:block text-center text-salve-textFaint text-[12px] tracking-wider py-6 font-montserrat transition-all duration-500 ease-out ${showTagline ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        made with love for my best friend &amp; soulmate
      </p>

    </div>
  );
}
