import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Sparkles, ChevronRight, Calendar, AlertTriangle, AlertOctagon,
  User, Shield, FlaskConical, Activity, Settings as SettingsIcon,
  Sun, Moon, Sunrise, Sunset, ClipboardList, Search, X,
  TrendingUp, ShieldAlert, Heart, Leaf, CheckSquare, Zap,
  Copy, Bookmark, RefreshCw, Stethoscope, Syringe, ShieldCheck,
  Building2, BadgeDollarSign, Scale, PlaneTakeoff, Dna, Apple, Pill, BookOpen,
  Compass, ExternalLink,
} from 'lucide-react';
import { OuraIcon } from '../ui/OuraIcon';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Motif, { Divider } from '../ui/Motif';
import { SectionTitle } from '../ui/FormWrap';
import { fmtDate, daysUntil, localISODate } from '../../utils/dates';
import { C } from '../../constants/colors';
import { VITAL_TYPES } from '../../constants/defaults';
import { fetchInsight, isPremiumActive } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import { searchEntities, highlightMatch } from '../../utils/search.jsx';
import useWellnessMessage from '../../hooks/useWellnessMessage';
import { findPgxMatches } from '../../constants/pgx';
import { isOuraConnected } from '../../services/oura';
import { getStarred } from '../../utils/starred';
import { matchResources } from '../../constants/resources/index.js';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useIsDesktop } from '../layout/SplitView';

/* Vital direction: which way is "good" for color-coded trend signal */
const VITAL_POLARITY = {
  sleep: 'up', hr: 'down', bp: 'down', steps: 'up',
  energy: 'up', pain: 'down', mood: 'up',
  weight: null, temp: null, glucose: null,
};

/* ── Rotating placeholder phrases ────────────────────────── */
const SEARCH_PLACEHOLDERS = [
  'Search medications, providers, labs\u2026',
  'Find a doctor or specialist\u2026',
  'Look up lab results\u2026',
  'Check conditions & allergies\u2026',
];

/* ── Helpers ─────────────────────────────────────────────── */

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return { text: 'Good evening', icon: Moon, motif: 'moon' };
  if (h < 12) return { text: 'Good morning', icon: Sunrise, motif: 'leaf' };
  if (h < 17) return { text: 'Good afternoon', icon: Sun, motif: 'sparkle' };
  if (h < 21) return { text: 'Good evening', icon: Sunset, motif: 'star' };
  return { text: 'Good evening', icon: Moon, motif: 'moon' };
}

function getContextLine(data, interactions, urgentGaps, anesthesiaCount, abnormalLabCount, alertsHidden) {
  // Priority: critical alerts → upcoming events → encouragement
  if (!alertsHidden) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const overdueTodoCount = (data.todos || []).filter(t => !t.completed && !t.dismissed && t.due_date && new Date(t.due_date + 'T00:00:00') < now).length;
    const totalAlerts = (interactions?.length || 0) + urgentGaps + (anesthesiaCount > 0 ? 1 : 0) + abnormalLabCount + (overdueTodoCount > 0 ? 1 : 0);
    if (totalAlerts > 0) return `${totalAlerts} item${totalAlerts > 1 ? 's' : ''} need${totalAlerts === 1 ? 's' : ''} your attention`;
  }

  const soon = data.appts.filter(a => {
    const d = Math.ceil((new Date(a.date) - new Date(new Date().toDateString())) / 86400000);
    return d >= 0 && d <= 7;
  });
  if (soon.length > 0) return `${soon.length} appointment${soon.length > 1 ? 's' : ''} this week`;

  const refills = data.meds.filter(m => m.active !== false && m.refill_date).filter(m => {
    const d = Math.ceil((new Date(m.refill_date) - new Date(new Date().toDateString())) / 86400000);
    return d >= 0 && d <= 7;
  });
  if (refills.length > 0) return `${refills.length} refill${refills.length > 1 ? 's' : ''} coming up soon`;

  if (data.journal.length > 0) return 'Your health journal is up to date';
  return 'All caught up — take care of yourself today';
}

/* ── Alert dismissal ──────────────────────────────────── */

const ALERT_DISMISS_KEY = 'salve:alerts-dismissed';
const SEEN_RESOURCES_KEY = 'salve:seen-resources';

function getSeenResources() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_RESOURCES_KEY) || '[]');
  } catch { return []; }
}

function getAlertDismissal() {
  try {
    const raw = localStorage.getItem(ALERT_DISMISS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.until === 'forever') return data;
    if (typeof data.until === 'number' && Date.now() < data.until) return data;
    localStorage.removeItem(ALERT_DISMISS_KEY);
    return null;
  } catch {
    return null;
  }
}

/* ── Quick Access config (static — outside component) ──── */

// Icon + label lookup for starred section tiles
const STARRED_META = {
  summary:       { label: 'Summary',      icon: ClipboardList },
  conditions:    { label: 'Conditions',   icon: Stethoscope },
  allergies:     { label: 'Allergies',    icon: ShieldAlert },
  labs:          { label: 'Labs',         icon: FlaskConical },
  procedures:    { label: 'Procedures',   icon: Syringe },
  immunizations: { label: 'Vaccines',     icon: ShieldCheck },
  genetics:      { label: 'Genetics',     icon: Dna },
  providers:     { label: 'Providers',    icon: User },
  appts:         { label: 'Visits',       icon: Calendar },
  pharmacies:    { label: 'Pharmacies',   icon: Building2 },
  insurance:     { label: 'Insurance',    icon: BadgeDollarSign },
  appeals:       { label: 'Appeals',      icon: Scale },
  vitals:        { label: 'Vitals',       icon: TrendingUp },
  sleep:         { label: 'Sleep',        icon: Moon },
  activities:    { label: 'Activities',   icon: Activity },
  cycles:        { label: 'Cycles',       icon: Heart },
  interactions:  { label: 'Interactions', icon: AlertTriangle },
  care_gaps:     { label: 'Care Gaps',    icon: AlertTriangle },
  anesthesia:    { label: 'Anesthesia',   icon: AlertOctagon },
  todos:         { label: "To-Do's",      icon: CheckSquare },
  surgical:      { label: 'Surgery',      icon: PlaneTakeoff },
  oura:          { label: 'Oura',         icon: OuraIcon },
  apple_health:  { label: 'Apple Health', icon: Apple },
  meds:          { label: 'Meds',         icon: Pill },
  journal:       { label: 'Journal',      icon: BookOpen },
};

// Hub tiles — always 6 (or 5 when no devices). Tappable → category page.
const HUB_TILES = [
  { id: 'records',  navId: 'hub_records',  label: 'Records',   icon: ClipboardList },
  { id: 'care',     navId: 'hub_care',     label: 'Care Team', icon: User },
  { id: 'tracking', navId: 'hub_tracking', label: 'Tracking',  icon: Activity },
  { id: 'safety',   navId: 'hub_safety',   label: 'Safety',    icon: Shield },
  { id: 'plans',    navId: 'hub_plans',    label: 'Plans',     icon: CheckSquare },
  { id: 'devices',  navId: 'hub_devices',  label: 'Devices',   icon: Zap, conditional: true },
];

/* ── Component ───────────────────────────────────────────── */

const CONDITIONAL_TILES = new Set(['oura', 'apple_health']);

export default function Dashboard({ data, interactions, onNav }) {
  const isDesktop = useIsDesktop();
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const wellness = useWellnessMessage();
  const [alertDismissal, setAlertDismissal] = useState(getAlertDismissal);
  const [showDismissMenu, setShowDismissMenu] = useState(false);
  const alertsDismissed = alertDismissal !== null;

  /* ── Conditional tile visibility (connected OR has existing data) ── */
  const hasAppleHealth = useMemo(() => (data.vitals || []).some(v => v.source === 'apple_health' || v.source === 'Apple Health')
    || (data.activities || []).some(a => a.source === 'apple_health' || a.source === 'Apple Health'), [data.vitals, data.activities]);
  const hasOura = useMemo(() => isOuraConnected()
    || (data.vitals || []).some(v => v.source === 'oura')
    || (data.cycles || []).some(c => c.notes?.includes('Oura'))
    || (data.activities || []).some(a => a.source === 'oura'), [data.vitals, data.cycles, data.activities]);

  /* ── Hub tiles (with conditional devices) ── */
  const hubTiles = useMemo(() => {
    return HUB_TILES.filter(t => {
      if (t.conditional && t.id === 'devices') return hasOura || hasAppleHealth;
      return true;
    });
  }, [hasOura, hasAppleHealth]);

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

  // Live search results — run once, derive count from the same result
  const allSearchResults = useMemo(
    () => searchEntities(data, debouncedSearch),
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

  const latestJournal = useMemo(
    () => data.journal.length > 0 ? data.journal[0] : null,
    [data.journal]
  );

  /* Vitals snapshot — one featured vital (with 14-day chart) + compact supporting chips */
  const vitalsSnapshot = useMemo(() => {
    const today = Date.now();
    const recentCutoff = new Date(today - 7 * 86400000).toISOString().slice(0, 10);
    const sparkCutoff = new Date(today - 14 * 86400000).toISOString().slice(0, 10);
    const vitals = data.vitals || [];
    if (!vitals.length) return null;
    const recent = vitals.filter(v => v.date >= recentCutoff);
    if (!recent.length) return null;
    const byType = {};
    for (const v of recent) {
      if (!byType[v.type] || v.date > byType[v.type].date) byType[v.type] = v;
    }
    const priority = ['sleep', 'hr', 'bp', 'weight', 'steps', 'energy', 'pain', 'mood'];
    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const buildItem = (type) => {
      const latest = byType[type];
      if (!latest) return null;
      const series = vitals
        .filter(v => v.type === type && v.date >= sparkCutoff)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(v => {
          const n = Number(v.value);
          return { date: v.date, value: Number.isFinite(n) ? n : null };
        })
        .filter(p => p.value !== null);
      const recent7 = series.filter(p => p.date >= recentCutoff).map(p => p.value);
      const recentAvg = mean(recent7);
      const latestNum = Number(latest.value);
      let delta = null, direction = 'flat', signal = 'neutral';
      // Compare the LATEST reading to the 7-day average
      if (recentAvg !== null && Number.isFinite(latestNum)) {
        delta = latestNum - recentAvg;
        const relThresh = Math.max(Math.abs(recentAvg) * 0.03, 0.1);
        direction = delta > relThresh ? 'up' : delta < -relThresh ? 'down' : 'flat';
        const polarity = VITAL_POLARITY[type];
        if (polarity && direction !== 'flat') {
          signal = (polarity === direction) ? 'good' : 'watch';
        }
      }
      return { ...latest, series, recentAvg, delta, direction, signal };
    };
    const available = priority.filter(t => byType[t]);
    if (!available.length) return null;
    // Featured: top priority vital that also has at least 2 readings for a chart
    const featuredType = available.find(t => {
      const s = vitals.filter(v => v.type === t && v.date >= sparkCutoff);
      return s.length >= 2;
    }) || available[0];
    const featured = buildItem(featuredType);
    const chips = available
      .filter(t => t !== featuredType)
      .map(buildItem)
      .filter(Boolean);
    return { featured, chips };
  }, [data.vitals]);

  const urgentGaps = useMemo(
    () => (data.care_gaps || []).filter(g => g.urgency === 'urgent').length,
    [data.care_gaps]
  );
  const anesthesiaCount = useMemo(
    () => (data.anesthesia_flags || []).length,
    [data.anesthesia_flags]
  );
  const abnormalLabs = useMemo(
    () => (data.labs || []).filter(l => ['abnormal', 'high', 'low'].includes(l.flag)),
    [data.labs]
  );

  /* Appointments within 48 hours for prep nudge */
  /* ── AI Insight ─────────────────────────────── */
  const loadInsight = async () => {
    setInsightLoading(true);
    try {
      const profile = buildProfile(data);
      const result = await fetchInsight(profile);
      setInsight(result);
    } catch (e) {
      const isDailyLimit = e.message?.includes('Daily AI limit');
      setInsight(isDailyLimit ? 'Daily insight limit reached. Resets at midnight PT.' : 'Unable to load insight. ' + e.message);
    } finally {
      setInsightLoading(false);
    }
  };

  useEffect(() => {
    if (data.settings.ai_mode === 'alwaysOn' && isPremiumActive(data.settings) && activeMeds.length + data.conditions.length > 0 && !insight && hasAIConsent()) {
      loadInsight();
    }
  }, [data.settings.ai_mode, activeMeds.length, data.conditions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Price increase detection ─────────────────── */
  const priceAlertMeds = useMemo(() => {
    const prices = data.drug_prices || [];
    if (prices.length < 2) return [];
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    const increased = [];
    for (const med of activeMeds) {
      const medPrices = prices
        .filter(p => p.medication_id === med.id && p.nadac_per_unit)
        .sort((a, b) => new Date(b.fetched_at || b.created_at) - new Date(a.fetched_at || a.created_at));
      if (medPrices.length < 2) continue;
      const latest = medPrices[0];
      const older = medPrices.find(p => new Date(p.fetched_at || p.created_at).getTime() < thirtyDaysAgo);
      if (!older) continue;
      const pct = ((latest.nadac_per_unit - older.nadac_per_unit) / older.nadac_per_unit) * 100;
      if (pct > 15) increased.push(med.display_name || med.name);
    }
    return increased;
  }, [activeMeds, data.drug_prices]);

  /* ── Severe allergy count ───────────────────── */
  const severeAllergyCount = useMemo(
    () => (data.allergies || []).filter(a => a.severity === 'severe').length,
    [data.allergies]
  );

  /* ── Alerts aggregation ─────────────────────── */
  const alerts = useMemo(() => {
    const items = [];
    if (anesthesiaCount > 0) {
      items.push({ id: 'anesthesia', icon: AlertOctagon, color: C.rose, text: `${anesthesiaCount} Anesthesia Flag${anesthesiaCount > 1 ? 's' : ''} — review before procedures`, nav: 'anesthesia' });
    }
    if (interactions.length > 0) {
      items.push({ id: 'interactions', icon: AlertTriangle, color: C.rose, text: `${interactions.length} Drug Interaction${interactions.length > 1 ? 's' : ''} detected`, nav: 'interactions' });
    }
    if (severeAllergyCount > 0) {
      items.push({ id: 'allergies', icon: ShieldAlert, color: C.rose, text: `${severeAllergyCount} Severe Allergy Alert${severeAllergyCount > 1 ? 's' : ''}`, nav: 'allergies' });
    }
    if (abnormalLabs.length > 0) {
      items.push({ id: 'labs', icon: FlaskConical, color: C.rose, text: `${abnormalLabs.length} Abnormal Lab Result${abnormalLabs.length > 1 ? 's' : ''}`, nav: 'labs' });
    }
    if (priceAlertMeds.length > 0) {
      const names = priceAlertMeds.length <= 2 ? priceAlertMeds.join(' & ') : `${priceAlertMeds.length} medications`;
      items.push({ id: 'prices', icon: TrendingUp, color: C.amber, text: `Price increase detected for ${names}`, nav: 'meds' });
    }
    if (urgentGaps > 0) {
      items.push({ id: 'care_gaps', icon: AlertTriangle, color: C.amber, text: `${urgentGaps} Urgent Care Gap${urgentGaps > 1 ? 's' : ''}`, nav: 'care_gaps' });
    }
    // Overdue or urgent to-dos
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const overdueTodos = (data.todos || []).filter(t => !t.completed && !t.dismissed && t.due_date && new Date(t.due_date + 'T00:00:00') < now);
    const urgentTodos = (data.todos || []).filter(t => !t.completed && !t.dismissed && t.priority === 'urgent');
    const todoAlertCount = new Set([...overdueTodos.map(t => t.id), ...urgentTodos.map(t => t.id)]).size;
    if (todoAlertCount > 0) {
      items.push({ id: 'todos', icon: CheckSquare, color: C.amber, text: `${todoAlertCount} To-do${todoAlertCount > 1 ? 's' : ''} need${todoAlertCount === 1 ? 's' : ''} attention`, nav: 'todos' });
    }
    // Drug-gene conflicts
    const pgxConflicts = (data.genetic_results || []).length > 0
      ? activeMeds.filter(m => findPgxMatches(m.display_name || m.name, data.genetic_results).some(p => p.severity === 'danger' || p.severity === 'caution')).length
      : 0;
    if (pgxConflicts > 0) {
      items.push({ id: 'pgx', icon: Zap, color: C.amber, text: `${pgxConflicts} medication${pgxConflicts > 1 ? 's' : ''} with gene interaction${pgxConflicts > 1 ? 's' : ''}`, nav: 'genetics' });
    }
    // Late period alert from cycle data
    const cyclePeriods = (data.cycles || []).filter(c => c.type === 'period').map(c => c.date).sort();
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
        const expected = new Date(lastStart + 'T00:00:00');
        expected.setDate(expected.getDate() + avg);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const daysLate = Math.floor((today - expected) / 86400000);
        if (daysLate >= 3) {
          items.push({ id: 'late_period', icon: Heart, color: C.rose, text: `Period is ${daysLate} day${daysLate > 1 ? 's' : ''} late`, nav: 'cycles' });
        }
      }
    }
    // Upcoming appointments within 48hr
    const nowTime = new Date();
    const cutoff = new Date(nowTime.getTime() + 48 * 60 * 60 * 1000);
    const prep = (data.appts || []).filter(a => {
      const d = new Date(a.date + (a.time ? `T${a.time}` : ''));
      return d >= nowTime && d <= cutoff;
    });
    for (const a of prep) {
      const when = new Date(a.date + (a.time ? `T${a.time}` : ''));
      const hrs = Math.round((when - nowTime) / 3600000);
      const timeLabel = hrs < 24 ? `in ${hrs}h` : 'tomorrow';
      items.push({ id: `appt-${a.id}`, icon: Calendar, color: C.rose, text: `Appointment with ${a.provider || 'provider'} ${timeLabel}`, nav: 'appts', highlightId: a.id });
    }
    return items;
  }, [anesthesiaCount, interactions, severeAllergyCount, abnormalLabs, priceAlertMeds, urgentGaps, data.cycles, data.todos, data.genetic_results, data.appts, activeMeds]);

  const displayedTimeline = useMemo(() => timeline.slice(0, isDesktop ? 6 : 4), [timeline, isDesktop]);

  const greeting = getTimeGreeting();
  const contextLine = getContextLine(data, interactions, urgentGaps, anesthesiaCount, abnormalLabs.length, alertsDismissed);


  const dismissAlerts = (duration) => {
    const val = { until: duration === 'forever' ? 'forever' : Date.now() + duration };
    localStorage.setItem(ALERT_DISMISS_KEY, JSON.stringify(val));
    setAlertDismissal(val);
    setShowDismissMenu(false);
  };

  /* ── Discover (matched resources) ─────────── */
  const [seenResources, setSeenResources] = useState(() => getSeenResources());

  const discoverItems = useMemo(() => {
    const seenSet = new Set(seenResources);
    return matchResources({
      conditions: data.conditions,
      medications: data.meds,
      journal_entries: data.journal,
      settings: data.settings,
    })
      .filter(m => !seenSet.has(m.resource.id));
  }, [data.conditions, data.meds, data.journal, data.settings, seenResources]);

  const displayedDiscover = useMemo(() => discoverItems.slice(0, isDesktop ? 4 : 3), [discoverItems, isDesktop]);

  const dismissResource = useCallback((resourceId) => {
    setSeenResources(prev => {
      const next = [...prev, resourceId];
      localStorage.setItem(SEEN_RESOURCES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);


  /* ── Render ─────────────────────────────────── */
  return (
    <div className="mt-1">

      {/* ── Contextual Greeting ────────────────── */}
      <section aria-label="Greeting" className="dash-stagger dash-stagger-1 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="greeting-motif">
                <Motif type={greeting.motif} size={16} color={C.sage} />
              </span>
              <span className="font-playfair text-lg font-medium text-salve-textMid">{greeting.text}</span>
            </div>
            <p className="text-[13px] text-salve-textMid m-0 leading-relaxed">{contextLine}</p>
          </div>
        </div>
      </section>

      {/* ── Centerpiece Search ─────────────────── */}
      <section aria-label="Search" className="dash-stagger dash-stagger-2 mb-5">
        <div className={`search-hero ${searchFocused ? 'search-hero-focused' : ''}`}>
          <div className="search-hero-inner">
            <div className="relative flex items-center">
              {/* Sparkle accent — visible when idle */}
              {!searchQuery && (
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 search-sparkle pointer-events-none z-10">
                  <Sparkles size={15} color={C.lav} strokeWidth={1.5} />
                </div>
              )}
              {/* Search icon — visible when typing */}
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
                className="w-full bg-transparent py-3.5 pl-10 pr-10 text-sm text-salve-text placeholder:text-salve-textFaint/70 font-montserrat outline-none relative z-[1]"
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
                          <div className="text-[10px] text-salve-textFaint/70 truncate italic">
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
                <span className="text-[12px] text-salve-textFaint font-light">No matches for &ldquo;{debouncedSearch}&rdquo;</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Two-column grid zone (desktop) ─────────── */}
      <div className="md:grid md:grid-cols-[3fr_2fr] md:gap-5 md:items-start">
        {/* ── Left column ── */}
        <div>
          {/* Alerts */}
          {alerts.length > 0 && !alertsDismissed && (
            <section aria-label="Needs attention" className="dash-stagger dash-stagger-3 mb-4">
              <Card className="!p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-salve-border/50">
                  <span className="text-[10px] text-salve-textFaint font-montserrat tracking-widest uppercase">Needs attention</span>
                  <button
                    onClick={() => setShowDismissMenu(!showDismissMenu)}
                    className="p-1 -mr-1 rounded-md hover:bg-salve-card2 text-salve-textFaint transition-colors"
                    aria-label="Dismiss alerts"
                  >
                    <X size={13} />
                  </button>
                </div>
                {showDismissMenu && (
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-salve-card2/50 border-b border-salve-border/50">
                    <span className="text-[10.5px] text-salve-textFaint mr-auto">Hide for:</span>
                    <button onClick={() => dismissAlerts(86400000)} className="text-[10.5px] px-2 py-1 rounded-md bg-salve-card text-salve-textMid border border-salve-border hover:border-salve-lav/30 transition-colors">1 day</button>
                    <button onClick={() => dismissAlerts(604800000)} className="text-[10.5px] px-2 py-1 rounded-md bg-salve-card text-salve-textMid border border-salve-border hover:border-salve-lav/30 transition-colors">1 week</button>
                    <button onClick={() => dismissAlerts('forever')} className="text-[10.5px] px-2 py-1 rounded-md bg-salve-card text-salve-textMid border border-salve-border hover:border-salve-lav/30 transition-colors">Always</button>
                  </div>
                )}
                {alerts.map((a, i) => (
                  <button
                    key={a.id}
                    onClick={() => onNav(a.nav, a.highlightId ? { highlightId: a.highlightId } : undefined)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 bg-transparent border-0 cursor-pointer alert-row transition-colors ${i < alerts.length - 1 ? 'border-b border-salve-border' : ''}`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                    <a.icon size={14} color={a.color} className="flex-shrink-0" />
                    <span className="text-[12.5px] text-salve-textMid text-left flex-1">{a.text}</span>
                    <ChevronRight size={13} className="text-salve-textFaint flex-shrink-0" />
                  </button>
                ))}
              </Card>
            </section>
          )}

          {/* AI Insight teaser */}
          {hasAIConsent() && !insight && !insightLoading && data.settings.ai_mode !== 'off' && activeMeds.length + data.conditions.length > 0 && (
            <section aria-label="Get insight from Sage" className="dash-stagger dash-stagger-3 mb-4">
              <button
                onClick={loadInsight}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-salve-sage/5 border border-salve-sage/15 cursor-pointer hover:bg-salve-sage/10 hover:border-salve-sage/25 transition-all font-montserrat text-left"
              >
                <Leaf size={13} className="text-salve-sage/70 flex-shrink-0" />
                <span className="text-[12px] text-salve-sageDim/80 flex-1">Get today's insight from Sage</span>
                <ChevronRight size={12} className="text-salve-sage/40 flex-shrink-0" />
              </button>
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
                  <p className="text-[10px] text-salve-textFaint/50 font-montserrat tracking-widest uppercase mb-3 text-center">Breathe with me</p>
                  <div key={wellness.key} className="wellness-msg text-[12px] text-salve-lavDim/80 font-montserrat italic text-center" role="status" aria-live="polite">{wellness.message}</div>
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
                          const clean = insight.replace(/\n---\n\*(?:AI|Sage'?s?) suggestions[^*]*\*\s*$/, '').trim();
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
                        onClick={() => { const clean = insight.replace(/\n---\n\*(?:AI|Sage'?s?) suggestions[^*]*\*\s*$/, '').trim(); navigator.clipboard.writeText(clean); }}
                        className="p-1 rounded-md bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-sage transition-colors"
                        aria-label="Copy insight"
                      ><Copy size={12} /></button>
                      <button
                        onClick={() => { setInsight(null); loadInsight(); }}
                        className="p-1 rounded-md bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-sage transition-colors"
                        aria-label="New insight"
                      ><RefreshCw size={12} /></button>
                    </div>
                  </div>
                  <AIMarkdown compact>{insight}</AIMarkdown>
                </Card>
              )}
            </section>
          )}

          {/* Discover resources */}
          {displayedDiscover.length > 0 && (
            <section aria-label="Discover resources" className="dash-stagger dash-stagger-4 mb-4">
              <Card className="!p-0 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-salve-border/50">
                  <Compass size={13} className="text-salve-lav" />
                  <span className="text-[10px] text-salve-textFaint font-montserrat tracking-widest uppercase">Discover</span>
                </div>
                {displayedDiscover.map((d, i) => {
                  const isEveryCure = d.resource.source === 'EveryCure';
                  const accentColor = isEveryCure ? C.sage : C.rose;
                  return (
                    <div
                      key={d.resource.id}
                      className={`flex items-start gap-3 px-4 py-3 ${i < displayedDiscover.length - 1 ? 'border-b border-salve-border/40' : ''}`}
                    >
                      <div
                        className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5"
                        style={{ background: accentColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isEveryCure && <span className="text-[10px]" aria-hidden="true">🔬</span>}
                          <span
                            className="text-[9px] font-montserrat tracking-wider uppercase"
                            style={{ color: accentColor }}
                          >
                            {d.resource.source}
                          </span>
                        </div>
                        <a
                          href={d.resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12.5px] text-salve-text font-medium hover:text-salve-lav transition-colors inline-flex items-center gap-1"
                        >
                          {d.resource.title}
                          <ExternalLink size={10} className="text-salve-textFaint/50 flex-shrink-0" />
                        </a>
                        <p className="text-[11px] text-salve-textFaint leading-relaxed mt-0.5 mb-0">{d.resource.blurb}</p>
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
            </section>
          )}
        </div>

        {/* ── Right column ── */}
        <div>
          {/* Coming Up timeline */}
          {displayedTimeline.length > 0 && (
            <section aria-label="Coming up" className="dash-stagger dash-stagger-3 mb-4">
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
                      className="w-full flex items-center gap-3 py-2.5 px-1 rounded-lg group timeline-row"
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                      <button
                        onClick={() => onNav('cycles')}
                        className="flex-1 text-left min-w-0 bg-transparent border-0 cursor-pointer p-0"
                      >
                        <div className="text-[13px] text-salve-text font-medium truncate">{label}</div>
                        <div className="text-[11px] text-salve-textFaint">{sub}</div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onNav('cycles', { quickLog: true }); }}
                        className="ml-auto py-1 px-2.5 rounded-full text-[10px] font-medium font-montserrat cursor-pointer border border-salve-rose/30 bg-salve-rose/10 text-salve-rose hover:bg-salve-rose/20 transition-colors flex-shrink-0"
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
                    className="w-full flex items-center gap-3 bg-transparent border-0 cursor-pointer py-2.5 px-1 rounded-lg group timeline-row"
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-[13px] text-salve-text font-medium truncate">{label}</div>
                      <div className="text-[11px] text-salve-textFaint">{sub}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[12px] font-semibold" style={{ color: dotColor }}>{daysUntil(item._sortDate)}</div>
                      <div className="text-[10px] text-salve-textFaint">{fmtDate(item._sortDate)}</div>
                    </div>
                  </button>
                );
              })}
            </section>
          )}

          {/* Vitals Snapshot */}
          {vitalsSnapshot && vitalsSnapshot.featured && (() => {
            const f = vitalsSnapshot.featured;
            const fType = VITAL_TYPES.find(t => t.id === f.type);
            const fLabel = fType?.label || f.type;
            const fUnit = fType?.unit || f.unit || '';
            const fDisplay = f.type === 'bp' && f.value2 ? `${f.value}/${f.value2}` : f.value;
            const fHasChart = f.series && f.series.length >= 2;
            const fmtNum = (n) => {
              if (n === null || n === undefined) return '—';
              return Math.abs(n) >= 10 ? Math.round(n).toString() : n.toFixed(1);
            };
            const captionText = (() => {
              if (f.delta === null || f.recentAvg === null) return null;
              if (f.direction === 'flat') return 'In line with your 7-day average';
              const absDelta = Math.abs(f.delta);
              const dir = f.direction === 'up' ? 'above' : 'below';
              return `${fmtNum(absDelta)}${fUnit ? ` ${fUnit}` : ''} ${dir} your 7-day average`;
            })();
            const fSignalColor = f.signal === 'good' ? C.sage : f.signal === 'watch' ? C.amber : C.textMid;
            const fArrow = f.direction === 'up' ? '↑' : f.direction === 'down' ? '↓' : '→';
            return (
              <section aria-label="Recent vitals" className="dash-stagger dash-stagger-4 mb-2">
                <Card className="!p-4 cursor-pointer" onClick={() => onNav('vitals')}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] text-salve-textMid font-montserrat tracking-wider uppercase">Recent Vitals</span>
                      <span className="text-[9px] text-salve-textFaint font-montserrat">last 14 days</span>
                    </div>
                    <ChevronRight size={12} className="text-salve-textFaint" />
                  </div>
                  <div className="mb-3">
                    <div className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-1">{fLabel}</div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <div className="text-[32px] font-medium text-salve-text font-montserrat leading-none">{fDisplay}</div>
                      <div className="text-[12px] text-salve-textMid font-montserrat">{fUnit}</div>
                    </div>
                    {fHasChart && (
                      <div className="w-full h-[56px] -mx-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={f.series} margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
                            <defs>
                              <linearGradient id="vitals-hero-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={C.lav} stopOpacity={0.22} />
                                <stop offset="100%" stopColor={C.lav} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="value" stroke={C.textMid} strokeWidth={1.5} strokeOpacity={0.55} fill="url(#vitals-hero-grad)" dot={false} isAnimationActive={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {captionText && (
                      <div className="flex items-center gap-1.5 text-[11px] font-montserrat mt-1" style={{ color: fSignalColor }}>
                        <span className="text-[12px]" aria-hidden="true">{fArrow}</span>
                        <span>{captionText}</span>
                      </div>
                    )}
                  </div>
                  {vitalsSnapshot.chips.length > 0 && (
                    <div className="pt-3 border-t border-salve-border flex items-center gap-3 flex-wrap">
                      {vitalsSnapshot.chips.map(c => {
                        const cType = VITAL_TYPES.find(t => t.id === c.type);
                        const cLabel = cType?.label || c.type;
                        const cUnit = cType?.unit || c.unit || '';
                        const cDisplay = c.type === 'bp' && c.value2 ? `${c.value}/${c.value2}` : c.value;
                        const cSignalColor = c.signal === 'good' ? C.sage : c.signal === 'watch' ? C.amber : C.textFaint;
                        const cArrow = c.direction === 'up' ? '↑' : c.direction === 'down' ? '↓' : '→';
                        return (
                          <div key={c.type} className="flex items-baseline gap-1.5 min-w-0">
                            <span className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">{cLabel}</span>
                            <span className="text-[13px] font-medium text-salve-text font-montserrat">
                              {cDisplay}<span className="text-[9px] text-salve-textFaint ml-0.5">{cUnit}</span>
                            </span>
                            {c.delta !== null && (
                              <span className="text-[11px] font-montserrat leading-none" style={{ color: cSignalColor }} aria-hidden="true">
                                {cArrow}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </section>
            );
          })()}
        </div>
      </div>

      <Divider />

      {/* ── Pinned shortcuts (user-starred) ─────── */}
      {starredTiles.length > 0 && (
        <section aria-label="Pinned shortcuts" className="dash-stagger dash-stagger-5 mb-3">
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-3">
            {starredTiles.map(t => (
              <button
                key={t.id}
                onClick={() => onNav(t.id)}
                className="bg-salve-card border border-salve-border rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer tile-magic transition-all relative"
              >
                <div className="absolute top-1.5 right-1.5">
                  <span className="text-salve-amber text-[8px]">★</span>
                </div>
                <t.icon size={20} color={C.lav} strokeWidth={1.5} />
                <span className="text-[11px] text-salve-textMid font-montserrat">{t.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Quick Access (hub tiles) ───────────── */}
      <section aria-label="Quick access" className="dash-stagger dash-stagger-5">
        {starredTiles.length > 0 && (
          <p className="text-[9px] text-salve-textFaint/60 font-montserrat tracking-widest uppercase mb-1.5 px-1">Browse</p>
        )}
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-3 mb-4">
          {hubTiles.map(h => (
            <button
              key={h.id}
              onClick={() => onNav(h.navId)}
              className="bg-salve-card border border-salve-border rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer tile-magic transition-all"
            >
              <h.icon size={20} color={C.lav} strokeWidth={1.5} />
              <span className="text-[11px] text-salve-textMid font-montserrat">{h.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
