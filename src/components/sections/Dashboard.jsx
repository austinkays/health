import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Sparkles, ChevronRight, Calendar, AlertTriangle, AlertOctagon,
  User, Shield, FlaskConical, Activity, Settings as SettingsIcon,
  Sun, Moon, Sunrise, Sunset, ClipboardList, Search, X,
  TrendingUp, ShieldAlert, Heart, Leaf, CheckSquare, Zap,
  Copy, Bookmark, RefreshCw, Stethoscope, Syringe, ShieldCheck,
  Building2, BadgeDollarSign, Scale, PlaneTakeoff, Dna, Apple, Pill, BookOpen,
  Compass, ExternalLink, MessageCircle, Watch, Upload, PlusCircle, Lightbulb, Mail,
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
import { AreaChart, Area, ComposedChart, BarChart, Bar, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { useIsDesktop } from '../layout/SplitView';

/* Vital direction: which way is "good" for color-coded trend signal */
const VITAL_POLARITY = {
  sleep: 'up', hr: 'down', bp: 'down', steps: 'up',
  energy: 'up', pain: 'down', mood: 'up',
  spo2: 'up', resp: null,
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
const DISMISSED_TIPS_KEY = 'salve:dismissed-tips';

// dismissBehavior:
//   'auto'      — hidden by data check (no dismiss needed); snoozes 7d if dismissed before data exists
//   'snooze'    — first X snoozes for snoozeDays, second X is permanent
//   'permanent' — one X and it's gone for good (optional integrations user may not want)
const STARTER_TIPS = [
  {
    id: 'add-meds',
    icon: Pill,
    color: 'lav',
    title: 'Add your medications',
    body: 'Start by adding your current meds to get drug interaction checks, refill tracking, and AI-powered insights.',
    action: 'meds',
    actionLabel: 'Add medications',
    dismissBehavior: 'auto',
    snoozeDays: 7,
  },
  {
    id: 'chat-sage',
    icon: Leaf,
    color: 'sage',
    title: 'Meet Sage, your health companion',
    body: 'Tap the leaf icon to chat with Sage. Ask health questions, add records by voice, or get personalized insights.',
    action: 'ai',
    actionLabel: 'Open Sage',
    dismissBehavior: 'snooze',
    snoozeDays: 3,
  },
  {
    id: 'connect-oura',
    icon: Watch,
    color: 'amber',
    title: 'Connect a wearable',
    body: 'Link your Oura Ring to automatically sync sleep, heart rate, temperature, and readiness data.',
    action: 'settings',
    actionLabel: 'Connect in Settings',
    dismissBehavior: 'permanent',
  },
  {
    id: 'import-data',
    icon: Upload,
    color: 'lav',
    title: 'Import existing health data',
    body: 'Bring in data from Apple Health exports, Flo period tracker, or a previous Salve backup file.',
    action: 'settings',
    actionLabel: 'Import in Settings',
    dismissBehavior: 'snooze',
    snoozeDays: 7,
  },
  {
    id: 'claude-sync',
    icon: Sparkles,
    color: 'sage',
    title: 'Sync from Claude AI',
    body: 'Use the Salve Sync artifact in Claude.ai to push health data directly into your account. Grab it from Settings → Claude Sync.',
    action: 'settings',
    actionLabel: 'Get artifact',
    dismissBehavior: 'permanent',
  },
  {
    id: 'add-providers',
    icon: User,
    color: 'lav',
    title: 'Add your care team',
    body: 'Add doctors and providers to cross-reference medications, auto-fill appointments, and look up NPI registry info.',
    action: 'providers',
    actionLabel: 'Add providers',
    dismissBehavior: 'auto',
    snoozeDays: 7,
  },
  // feedback is not a card — it renders as a persistent footer line in the section
];

function getDismissedTips() {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_TIPS_KEY) || '[]');
    // Migrate from old format (array of strings → array of record objects)
    if (raw.length > 0 && typeof raw[0] === 'string') {
      return raw.map(id => ({ id, permanent: true }));
    }
    return raw;
  } catch { return []; }
}

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
    const sparkCutoff = new Date(today - 7 * 86400000).toISOString().slice(0, 10);
    const vitals = data.vitals || [];
    if (!vitals.length) return null;
    const recent = vitals.filter(v => v.date >= recentCutoff);
    if (!recent.length) return null;
    const byType = {};
    for (const v of recent) {
      if (!byType[v.type] || v.date > byType[v.type].date) byType[v.type] = v;
    }
    const priority = ['sleep', 'hr', 'bp', 'weight', 'steps', 'energy', 'pain', 'mood', 'spo2', 'resp', 'temp', 'glucose'];
    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const buildItem = (type) => {
      const latest = byType[type];
      if (!latest) return null;
      // Aggregate to daily averages so high-frequency wearable data doesn't make a blob
      const byDateMap = new Map();
      for (const v of vitals.filter(v2 => v2.type === type && v2.date >= sparkCutoff)) {
        const n = Number(v.value);
        if (!Number.isFinite(n)) continue;
        if (!byDateMap.has(v.date)) byDateMap.set(v.date, []);
        byDateMap.get(v.date).push(n);
      }
      const series = [...byDateMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, vals]) => ({
          date,
          value: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10,
        }));
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

  /* Activity snapshot — last 7 days summary + per-day bar data */
  const activitySnapshot = useMemo(() => {
    const activities = data.activities || [];
    if (!activities.length) return null;
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const recent = activities.filter(a => a.date >= cutoff);
    if (!recent.length) return null;
    const totalMinutes = recent.reduce((s, a) => s + (Number(a.duration_minutes) || 0), 0);
    const totalCalories = recent.reduce((s, a) => s + (Number(a.calories) || 0), 0);
    const dayBars = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayMins = activities.filter(a => a.date === dateStr).reduce((s, a) => s + (Number(a.duration_minutes) || 0), 0);
      dayBars.push({ date: dateStr, mins: dayMins, label: d.toLocaleDateString('en', { weekday: 'short' })[0] });
    }
    const lastActivity = [...activities].sort((a, b) => b.date.localeCompare(a.date))[0];
    return { count: recent.length, totalMinutes, totalCalories, dayBars, lastActivity };
  }, [data.activities]);

  /* ── Health Trend Cards ─────────────────── */
  // Sleep: 7-night bar chart
  const sleepTrend = useMemo(() => {
    const sleepVitals = (data.vitals || []).filter(v => v.type === 'sleep');
    if (sleepVitals.length < 4) return null;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const recs = sleepVitals.filter(v => v.date === dateStr);
      const val = recs.length ? recs.reduce((s, v) => s + Number(v.value), 0) / recs.length : null;
      days.push({ dateStr, label: d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 2), value: val !== null ? Math.round(val * 10) / 10 : null });
    }
    const withData = days.filter(d => d.value !== null);
    if (withData.length < 4) return null;
    const avg = Math.round(withData.reduce((s, d) => s + d.value, 0) / withData.length * 10) / 10;
    const last = withData[withData.length - 1];
    return { days, avg, last };
  }, [data.vitals]);

  // Heart Rate: 7-day daily min/avg/max band chart
  const hrTrend = useMemo(() => {
    const hrVitals = (data.vitals || []).filter(v => v.type === 'hr');
    if (hrVitals.length < 4) return null;
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const recent = hrVitals.filter(v => v.date >= cutoff);
    if (recent.length < 4) return null;
    const byDate = new Map();
    for (const v of recent) {
      if (!byDate.has(v.date)) byDate.set(v.date, []);
      byDate.get(v.date).push(Number(v.value));
    }
    const days = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, vals]) => {
        const min = Math.round(Math.min(...vals));
        const max = Math.round(Math.max(...vals));
        const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
        return { date, min, band: max - min, avg, label: new Date(date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' }).slice(0, 2) };
      });
    if (days.length < 4) return null;
    const avg = Math.round(days.reduce((s, d) => s + d.avg, 0) / days.length);
    const min = Math.min(...days.map(d => d.min));
    const max = Math.max(...days.map(d => d.min + d.band));
    return { days, avg, min, max };
  }, [data.vitals]);

  // Blood Oxygen: 7-day daily min/avg/max band chart
  const spo2Trend = useMemo(() => {
    const spo2Vitals = (data.vitals || []).filter(v => v.type === 'spo2');
    if (spo2Vitals.length < 4) return null;
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const recent = spo2Vitals.filter(v => v.date >= cutoff);
    if (recent.length < 4) return null;
    const byDate = new Map();
    for (const v of recent) {
      if (!byDate.has(v.date)) byDate.set(v.date, []);
      byDate.get(v.date).push(Number(v.value));
    }
    const days = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, vals]) => {
        const min = Math.round(Math.min(...vals) * 10) / 10;
        const max = Math.round(Math.max(...vals) * 10) / 10;
        const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10;
        return { date, min, band: Math.round((max - min) * 10) / 10, avg };
      });
    if (days.length < 4) return null;
    const avg = Math.round(days.reduce((s, d) => s + d.avg, 0) / days.length * 10) / 10;
    const lowNights = days.filter(d => d.min < 95).length;
    const minVal = Math.min(...days.map(d => d.min));
    return { days, avg, lowNights, minVal };
  }, [data.vitals]);

  // Lab highlights — recent 6 labs sorted by date
  const labHighlights = useMemo(() => {
    const labs = data.labs || [];
    if (labs.length < 2) return [];
    return [...labs].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
  }, [data.labs]);

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

  /* Today chips — compact at-a-glance strip above search */
  const todayChips = useMemo(() => {
    const chips = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const upcomingAppts = [...data.appts]
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
        id: 'todos', icon: CheckSquare, color: C.rose,
        label: `${overdueTodos.length} overdue`,
        sub: `to-do${overdueTodos.length > 1 ? 's' : ''}`, nav: 'todos',
      });
    }
    return chips;
  }, [data.appts, activeMeds, data.todos]);

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

  /* ── Whether the left column has any visible content (for responsive layout) ── */
  const hasLeftContent = useMemo(() => {
    const hasAlerts = alerts.length > 0 && !alertsDismissed;
    const aiConsent = hasAIConsent();
    const hasAITeaser = aiConsent && !insight && !insightLoading && data.settings.ai_mode !== 'off' && activeMeds.length + data.conditions.length > 0;
    const hasAIInsight = aiConsent && (insight || insightLoading);
    const hasDiscover = displayedDiscover.length > 0;
    return hasAlerts || hasAITeaser || hasAIInsight || hasDiscover;
  }, [alerts, alertsDismissed, insight, insightLoading, data.settings.ai_mode, activeMeds.length, data.conditions.length, displayedDiscover.length]);

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
      if (tip.id === 'connect-oura' && hasOura) return false;
      const record = dismissMap.get(tip.id);
      if (!record) return true;
      if (record.permanent) return false;
      if (record.snoozedUntil && now < record.snoozedUntil) return false;
      return true; // Snooze expired — resurface
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
              <span className="font-playfair text-lg md:text-xl font-medium text-salve-textMid">{greeting.text}</span>
            </div>
            <p className="text-[13px] md:text-[15px] text-salve-textMid m-0 leading-relaxed">{contextLine}</p>
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

      {/* ── Centerpiece Search ─────────────────── */}
      <section aria-label="Search" className="dash-stagger dash-stagger-2 mb-5 md:mb-7">
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

      {/* ── Quick Navigation Hub ───────────────── */}
      <section aria-label="Quick navigation" className="dash-stagger dash-stagger-3 mb-5 md:mb-7">
        <div className={`grid gap-2 md:gap-3 ${hubTiles.length <= 5 ? 'grid-cols-' + hubTiles.length : 'grid-cols-3 md:grid-cols-6'}`}
          style={{ gridTemplateColumns: `repeat(${Math.min(hubTiles.length, 6)}, 1fr)` }}>
          {hubTiles.map((h) => (
            <button
              key={h.id}
              onClick={() => onNav(h.navId)}
              className="bg-salve-card border border-salve-border rounded-xl p-3 md:p-4 flex flex-col items-center gap-1.5 cursor-pointer tile-magic transition-all"
            >
              <h.icon size={20} color={C.lav} strokeWidth={1.5} className="md:!w-6 md:!h-6" />
              <span className="text-[10.5px] md:text-[12px] text-salve-textMid font-montserrat text-center leading-tight">{h.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Two-column grid zone (desktop) — collapses to single col when left is empty ── */}
      <div className={hasLeftContent ? 'md:grid md:grid-cols-[3fr_2fr] md:gap-6 lg:gap-8 md:items-start' : ''}>
        {/* ── Left column ── */}
        {hasLeftContent && <div>
          {/* Alerts */}
          {alerts.length > 0 && !alertsDismissed && (
            <section aria-label="Needs attention" className="dash-stagger dash-stagger-3 mb-4 md:mb-6">
              <Card className="!p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 md:px-5 py-2.5 border-b border-salve-border/50">
                  <span className="text-[10px] md:text-xs text-salve-textFaint font-montserrat tracking-widest uppercase">Needs attention</span>
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
                    className={`w-full flex items-center gap-2.5 md:gap-3 px-4 md:px-5 py-3 md:py-3.5 bg-transparent border-0 cursor-pointer alert-row transition-colors ${i < alerts.length - 1 ? 'border-b border-salve-border' : ''}`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                    <a.icon size={14} color={a.color} className="flex-shrink-0" />
                    <span className="text-[12.5px] md:text-sm text-salve-textMid text-left flex-1">{a.text}</span>
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
                <span className="text-[12px] md:text-[13px] text-salve-sageDim/80 flex-1">Get today's insight from Sage</span>
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
                <div className="flex items-center gap-2 px-4 md:px-5 py-2.5 border-b border-salve-border/50">
                  <Compass size={13} className="text-salve-lav" />
                  <span className="text-[10px] md:text-xs text-salve-textFaint font-montserrat tracking-widest uppercase">Discover</span>
                </div>
                {displayedDiscover.map((d, i) => {
                  const isEveryCure = d.resource.source === 'EveryCure';
                  const accentColor = isEveryCure ? C.sage : C.rose;
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
                          {isEveryCure && <span className="text-[10px]" aria-hidden="true">🔬</span>}
                          <span
                            className="text-[9px] md:text-[11px] font-montserrat tracking-wider uppercase"
                            style={{ color: accentColor }}
                          >
                            {d.resource.source}
                          </span>
                        </div>
                        <a
                          href={d.resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12.5px] md:text-sm text-salve-text font-medium hover:text-salve-lav transition-colors inline-flex items-center gap-1"
                        >
                          {d.resource.title}
                          <ExternalLink size={10} className="text-salve-textFaint/50 flex-shrink-0" />
                        </a>
                        <p className="text-[11px] md:text-[13px] text-salve-textFaint leading-relaxed mt-0.5 mb-0">{d.resource.blurb}</p>
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
        </div>}

        {/* ── Right column (or single column when left is empty) ── */}
        <div className={!hasLeftContent ? 'md:grid md:grid-cols-2 md:gap-4 lg:gap-6' : ''}>
          {/* Coming Up timeline */}
          {displayedTimeline.length > 0 && (
            <section aria-label="Coming up" className={`dash-stagger dash-stagger-3 mb-4 ${!hasLeftContent ? 'md:col-span-2' : ''}`}>
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
                        <div className="text-[13px] md:text-sm text-salve-text font-medium truncate">{label}</div>
                        <div className="text-[11px] md:text-xs text-salve-textFaint">{sub}</div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onNav('cycles', { quickLog: true }); }}
                        className="ml-auto py-1 px-2.5 rounded-full text-[10px] md:text-[11px] font-medium font-montserrat cursor-pointer border border-salve-rose/30 bg-salve-rose/10 text-salve-rose hover:bg-salve-rose/20 transition-colors flex-shrink-0"
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
                      <div className="text-[13px] md:text-sm text-salve-text font-medium truncate">{label}</div>
                      <div className="text-[11px] md:text-xs text-salve-textFaint">{sub}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[12px] md:text-[13px] font-semibold" style={{ color: dotColor }}>{daysUntil(item._sortDate)}</div>
                      <div className="text-[10px] md:text-[11px] text-salve-textFaint">{fmtDate(item._sortDate)}</div>
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
                <Card className="!p-4 md:!p-6 cursor-pointer" onClick={() => onNav('vitals')}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] md:text-xs text-salve-textMid font-montserrat tracking-wider uppercase">Recent Vitals</span>
                      <span className="text-[9px] md:text-[11px] text-salve-textFaint font-montserrat">last 14 days</span>
                    </div>
                    <ChevronRight size={12} className="text-salve-textFaint" />
                  </div>
                  <div className="mb-3">
                    <div className="text-[9px] md:text-[11px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-1">{fLabel}</div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <div className="text-[32px] font-medium text-salve-text font-montserrat leading-none">{fDisplay}</div>
                      <div className="text-[12px] md:text-[13px] text-salve-textMid font-montserrat">{fUnit}</div>
                    </div>
                    {fHasChart && (
                      <div className="w-full h-[64px] -mx-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={f.series} margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
                            <defs>
                              <linearGradient id="vitals-hero-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={C.lav} stopOpacity={0.22} />
                                <stop offset="100%" stopColor={C.lav} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Tooltip
                              content={({ active, payload }) => active && payload?.[0] ? (
                                <div className="bg-salve-card border border-salve-border/60 rounded-lg px-2 py-1 text-[11px] font-montserrat text-salve-text shadow-sm">
                                  {payload[0].value}{fUnit}
                                </div>
                              ) : null}
                              cursor={{ stroke: C.lav, strokeWidth: 1, strokeOpacity: 0.4 }}
                            />
                            <Area type="monotone" dataKey="value" stroke={C.lav} strokeWidth={2} strokeOpacity={0.7} fill="url(#vitals-hero-grad)" dot={{ r: 3, fill: C.lav, strokeWidth: 0, fillOpacity: 0.8 }} activeDot={{ r: 4, fill: C.lav }} isAnimationActive={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {captionText && (
                      <div className="flex items-center gap-1.5 text-[11px] md:text-xs font-montserrat mt-1" style={{ color: fSignalColor }}>
                        <span className="text-[12px]" aria-hidden="true">{fArrow}</span>
                        <span>{captionText}</span>
                      </div>
                    )}
                  </div>
                  {vitalsSnapshot.chips.length > 0 && (
                    <div className={`pt-3 border-t border-salve-border ${vitalsSnapshot.chips.length >= 2 ? 'grid grid-cols-2 gap-x-3 gap-y-2.5' : 'flex items-center gap-3'}`}>
                      {vitalsSnapshot.chips.map(c => {
                        const cType = VITAL_TYPES.find(t => t.id === c.type);
                        const cLabel = cType?.label || c.type;
                        const cUnit = cType?.unit || c.unit || '';
                        const cDisplay = c.type === 'bp' && c.value2 ? `${c.value}/${c.value2}` : c.value;
                        const cSignalColor = c.signal === 'good' ? C.sage : c.signal === 'watch' ? C.amber : C.textFaint;
                        const cArrow = c.direction === 'up' ? '↑' : c.direction === 'down' ? '↓' : '→';
                        const hasSparkline = c.series && c.series.length >= 2;
                        return (
                          <div key={c.type} className="flex items-center justify-between gap-1.5 min-w-0">
                            <div className="min-w-0">
                              <div className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider leading-none mb-0.5">{cLabel}</div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-[14px] font-medium text-salve-text font-montserrat leading-none">{cDisplay}</span>
                                <span className="text-[9px] text-salve-textFaint font-montserrat">{cUnit}</span>
                                {c.delta !== null && (
                                  <span className="text-[11px] font-montserrat" style={{ color: cSignalColor }} aria-hidden="true">{cArrow}</span>
                                )}
                              </div>
                            </div>
                            {hasSparkline && (
                              <AreaChart width={52} height={24} data={c.series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                                <defs>
                                  <linearGradient id={`chip-grad-${c.type}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={cSignalColor} stopOpacity={0.25} />
                                    <stop offset="100%" stopColor={cSignalColor} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="value" stroke={cSignalColor} strokeWidth={1.5} strokeOpacity={0.65} fill={`url(#chip-grad-${c.type})`} dot={false} isAnimationActive={false} />
                              </AreaChart>
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
          {/* Activity snapshot */}
          {activitySnapshot && (
            <section aria-label="Recent activity" className="dash-stagger dash-stagger-4 mb-2">
              <Card className="!p-4 md:!p-5 cursor-pointer" onClick={() => onNav('activities')}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] md:text-xs text-salve-textMid font-montserrat tracking-wider uppercase">Activity</span>
                    <span className="text-[9px] md:text-[11px] text-salve-textFaint font-montserrat">last 7 days</span>
                  </div>
                  <ChevronRight size={12} className="text-salve-textFaint" />
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-[28px] font-medium text-salve-text font-montserrat leading-none">{activitySnapshot.count}</span>
                  <span className="text-[13px] text-salve-textMid font-montserrat">session{activitySnapshot.count !== 1 ? 's' : ''}</span>
                  {activitySnapshot.totalMinutes > 0 && (
                    <>
                      <span className="text-salve-textFaint/40 text-[13px]">·</span>
                      <span className="text-[13px] text-salve-textMid font-montserrat">
                        {activitySnapshot.totalMinutes >= 60
                          ? `${Math.floor(activitySnapshot.totalMinutes / 60)}h ${activitySnapshot.totalMinutes % 60}m`
                          : `${activitySnapshot.totalMinutes}m`}
                      </span>
                    </>
                  )}
                </div>
                {/* 7-day bar chart */}
                <div className="flex items-end gap-1 h-10 mb-1">
                  {activitySnapshot.dayBars.map((bar, i) => {
                    const maxMins = Math.max(...activitySnapshot.dayBars.map(b => b.mins), 1);
                    const pct = bar.mins > 0 ? Math.max(bar.mins / maxMins, 0.12) : 0;
                    const isToday = i === 6;
                    return (
                      <div key={bar.date} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                        <div
                          className="w-full rounded-sm"
                          style={{
                            height: bar.mins > 0 ? `${Math.round(pct * 32)}px` : '2px',
                            background: bar.mins > 0 ? (isToday ? C.sage : `${C.sage}55`) : `${C.border}`,
                          }}
                        />
                        <span className="text-[8px] font-montserrat" style={{ color: isToday ? C.sage : C.textFaint }}>
                          {bar.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {activitySnapshot.totalCalories > 0 && (
                  <div className="mt-2 pt-2 border-t border-salve-border flex items-center gap-1.5">
                    <Zap size={11} className="text-salve-amber" />
                    <span className="text-[11px] text-salve-textFaint font-montserrat">{Math.round(activitySnapshot.totalCalories).toLocaleString()} cal active</span>
                  </div>
                )}
              </Card>
            </section>
          )}
        </div>
      </div>

      {/* ── Health Trends grid ─────────────────── */}
      {(sleepTrend || hrTrend || spo2Trend || labHighlights.length > 0) && (
        <section aria-label="Health trends" className="dash-stagger dash-stagger-4 mb-4">
          <SectionTitle>Health Trends</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5 md:gap-4">

            {/* Sleep 14-night bar chart */}
            {sleepTrend && (
              <button
                onClick={() => onNav('vitals')}
                className="col-span-2 bg-salve-card border border-salve-border rounded-xl p-4 text-left cursor-pointer hover:border-salve-lav/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">Sleep</span>
                    <span className="text-[9px] text-salve-textFaint/60 font-montserrat ml-1.5">7 nights</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[22px] font-medium text-salve-text font-montserrat leading-none">{sleepTrend.avg}</span>
                    <span className="text-[11px] text-salve-textFaint font-montserrat">hrs avg</span>
                  </div>
                </div>
                <div className="flex items-end gap-[3px] h-12 mt-2">
                  {sleepTrend.days.map((d, i) => {
                    const maxVal = Math.max(...sleepTrend.days.filter(x => x.value).map(x => x.value), 1);
                    const barColor = !d.value ? `${C.border}` : d.value >= 7 ? C.sage : d.value >= 5 ? C.amber : C.rose;
                    const pct = d.value ? Math.max(d.value / maxVal, 0.1) : 0;
                    const isLast = i === sleepTrend.days.length - 1;
                    return (
                      <div key={d.dateStr} className="flex-1 flex flex-col items-center justify-end gap-[2px]">
                        <div className="w-full rounded-sm transition-all" style={{ height: d.value ? `${Math.round(pct * 36)}px` : '2px', background: barColor, opacity: isLast ? 1 : 0.7 }} />
                        {(i % 2 === 0) && <span className="text-[7px] font-montserrat" style={{ color: isLast ? C.sage : C.textFaint }}>{d.label}</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-salve-border/50">
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: C.sage }} /><span className="text-[9px] text-salve-textFaint font-montserrat">≥7h</span></div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: C.amber }} /><span className="text-[9px] text-salve-textFaint font-montserrat">5–7h</span></div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: C.rose }} /><span className="text-[9px] text-salve-textFaint font-montserrat">&lt;5h</span></div>
                  {sleepTrend.last && (
                    <div className="ml-auto text-[10px] font-montserrat" style={{ color: sleepTrend.last.value >= 7 ? C.sage : sleepTrend.last.value >= 5 ? C.amber : C.rose }}>
                      Last night: {sleepTrend.last.value}h
                    </div>
                  )}
                </div>
              </button>
            )}

            {/* Heart Rate 7-day band chart */}
            {hrTrend && (
              <button
                onClick={() => onNav('vitals')}
                className="bg-salve-card border border-salve-border rounded-xl p-3.5 text-left cursor-pointer hover:border-salve-lav/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">Heart Rate</div>
                  <div className="text-[9px] text-salve-textFaint font-montserrat">7 days</div>
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[24px] font-medium text-salve-text font-montserrat leading-none">{hrTrend.avg}</span>
                  <span className="text-[11px] text-salve-textFaint font-montserrat">bpm avg</span>
                  <span className="text-[10px] font-montserrat ml-auto" style={{ color: hrTrend.avg >= 60 && hrTrend.avg <= 100 ? C.sage : C.amber }}>
                    {hrTrend.avg >= 60 && hrTrend.avg <= 100 ? 'Normal' : 'Attention'}
                  </span>
                </div>
                <div className="h-[80px] -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={hrTrend.days} margin={{ top: 4, right: 8, bottom: 16, left: 24 }}>
                      <defs>
                        <linearGradient id="hr-band-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.rose} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={C.rose} stopOpacity={0.06} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.textFaint, fontFamily: 'Montserrat' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis domain={[Math.max(40, hrTrend.min - 8), hrTrend.max + 8]} tick={{ fontSize: 9, fill: C.textFaint, fontFamily: 'Montserrat' }} tickLine={false} axisLine={false} tickCount={3} width={20} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload;
                          return (
                            <div style={{ fontFamily: 'Montserrat', fontSize: 11, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, padding: '4px 8px' }}>
                              <p style={{ margin: 0, color: C.text }}>{d.label}</p>
                              <p style={{ margin: 0, color: C.rose }}>{d.avg} bpm avg</p>
                              {d.band > 0 && <p style={{ margin: '2px 0 0', color: C.textFaint, fontSize: 10 }}>{d.min}–{d.min + d.band} range</p>}
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine y={60} stroke={C.amber} strokeDasharray="3 3" strokeOpacity={0.4} />
                      <ReferenceLine y={100} stroke={C.amber} strokeDasharray="3 3" strokeOpacity={0.4} />
                      <Area type="monotone" dataKey="min" stackId="hr" fill="transparent" stroke="none" isAnimationActive={false} legendType="none" />
                      <Area type="monotone" dataKey="band" stackId="hr" fill="url(#hr-band-grad)" stroke="none" isAnimationActive={false} legendType="none" />
                      <Line type="monotone" dataKey="avg" stroke={C.rose} strokeWidth={1.5} dot={{ r: 2, fill: C.rose, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[9px] text-salve-textFaint font-montserrat">Range: {hrTrend.min}–{hrTrend.max} bpm</span>
                  <span className="text-[9px] text-salve-textFaint font-montserrat opacity-60">Normal: 60–100</span>
                </div>
              </button>
            )}

            {/* Blood Oxygen 7-day band chart */}
            {spo2Trend && (
              <button
                onClick={() => onNav('vitals')}
                className="bg-salve-card border border-salve-border rounded-xl p-3.5 text-left cursor-pointer hover:border-salve-lav/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">Blood Oxygen</div>
                  <div className="text-[9px] text-salve-textFaint font-montserrat">7 days</div>
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[24px] font-medium text-salve-text font-montserrat leading-none">{spo2Trend.avg}</span>
                  <span className="text-[11px] text-salve-textFaint font-montserrat">% avg</span>
                  <span className="text-[10px] font-montserrat ml-auto" style={{ color: spo2Trend.lowNights === 0 ? C.sage : C.amber }}>
                    {spo2Trend.lowNights === 0 ? 'Normal' : `${spo2Trend.lowNights} low`}
                  </span>
                </div>
                <div className="h-[80px] -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={spo2Trend.days} margin={{ top: 4, right: 8, bottom: 16, left: 24 }}>
                      <defs>
                        <linearGradient id="spo2-band-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.lav} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={C.lav} stopOpacity={0.06} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tickFormatter={(d) => new Date(d + 'T12:00:00').toLocaleDateString('en', { month: 'numeric', day: 'numeric' })} tick={{ fontSize: 9, fill: C.textFaint, fontFamily: 'Montserrat' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis domain={[Math.min(90, spo2Trend.minVal - 2), 100]} tick={{ fontSize: 9, fill: C.textFaint, fontFamily: 'Montserrat' }} tickLine={false} axisLine={false} tickCount={3} width={20} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload;
                          return (
                            <div style={{ fontFamily: 'Montserrat', fontSize: 11, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, padding: '4px 8px' }}>
                              <p style={{ margin: 0, color: C.text }}>{d.date ? new Date(d.date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) : ''}</p>
                              <p style={{ margin: 0, color: C.lav }}>{d.avg}% avg</p>
                              {d.band > 0 && <p style={{ margin: '2px 0 0', color: C.textFaint, fontSize: 10 }}>{d.min}–{Math.round((d.min + d.band) * 10) / 10}% range</p>}
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine y={95} stroke={C.amber} strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: '95%', position: 'right', fontSize: 8, fill: C.amber, fontFamily: 'Montserrat' }} />
                      <Area type="monotone" dataKey="min" stackId="spo2" fill="transparent" stroke="none" isAnimationActive={false} legendType="none" />
                      <Area type="monotone" dataKey="band" stackId="spo2" fill="url(#spo2-band-grad)" stroke="none" isAnimationActive={false} legendType="none" />
                      <Line type="monotone" dataKey="avg" stroke={C.lav} strokeWidth={1.5} dot={{ r: 2, fill: C.lav, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[9px] font-montserrat" style={{ color: spo2Trend.lowNights > 0 ? C.amber : C.textFaint }}>
                    {spo2Trend.lowNights > 0 ? `${spo2Trend.lowNights} night${spo2Trend.lowNights > 1 ? 's' : ''} below 95%` : 'All readings ≥95%'}
                  </span>
                  <span className="text-[9px] text-salve-textFaint font-montserrat opacity-60">Normal: ≥95%</span>
                </div>
              </button>
            )}

            {/* Lab highlights */}
            {labHighlights.length > 0 && (
              <button
                onClick={() => onNav('labs')}
                className="col-span-2 bg-salve-card border border-salve-border rounded-xl p-3.5 text-left cursor-pointer hover:border-salve-lav/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">Recent Labs</span>
                  <ChevronRight size={11} className="text-salve-textFaint/50" />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {labHighlights.map(lab => {
                    const flag = lab.flag;
                    const hasFlag = ['abnormal', 'high', 'low', 'critical'].includes(flag);
                    const flagColor = hasFlag ? C.rose : flag === 'normal' || flag === 'completed' ? C.sage : C.textFaint;
                    const flagLabel = flag === 'high' ? '↑ High' : flag === 'low' ? '↓ Low' : flag === 'critical' ? '‼ Critical' : flag === 'abnormal' ? '! Abnormal' : '✓ Normal';
                    return (
                      <div key={lab.id} className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-salve-textMid font-montserrat font-medium truncate">{lab.test_name || '—'}</div>
                          <div className="text-[10px] text-salve-textFaint font-montserrat">{lab.date ? fmtDate(lab.date) : ''}</div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {lab.result && <div className="text-[12px] font-semibold font-montserrat" style={{ color: hasFlag ? flagColor : C.textMid }}>{lab.result}{lab.unit ? ` ${lab.unit}` : ''}</div>}
                          <div className="text-[9px] font-montserrat" style={{ color: flagColor }}>{flagLabel}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2.5 pt-2 border-t border-salve-border/50 text-[9px] text-salve-textFaint font-montserrat">
                  {labHighlights.length} recent result{labHighlights.length !== 1 ? 's' : ''} · Last: {fmtDate(labHighlights[0].date)}
                </div>
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Getting Started tips (onboarding, dismissible) ── */}
      {visibleTips.length > 0 && (
        <section aria-label="Getting started" className="dash-stagger dash-stagger-5 mb-4 mt-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <Lightbulb size={13} className="text-salve-amber" />
              <span className="text-[10px] md:text-xs text-salve-textFaint font-montserrat tracking-widest uppercase">Getting Started</span>
            </div>
            <button
              onClick={dismissAllTips}
              className="text-[10px] text-salve-textFaint/60 hover:text-salve-textMid font-montserrat bg-transparent border-none cursor-pointer transition-colors px-1"
              aria-label="Dismiss all tips"
            >
              Hide all
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-4">
            {visibleTips.map((tip, i) => {
              const TipIcon = tip.icon;
              const colorVar = tip.color === 'sage' ? C.sage : tip.color === 'amber' ? C.amber : C.lav;
              const isLastOdd = visibleTips.length % 2 !== 0 && i === visibleTips.length - 1;
              return (
                <div
                  key={tip.id}
                  className={`bg-salve-card border border-salve-border rounded-xl p-3 md:p-5 flex flex-col relative${isLastOdd ? ' col-span-2' : ''}`}
                >
                  <button
                    onClick={() => dismissTip(tip.id)}
                    className="absolute top-2 right-2 p-1 rounded-md bg-transparent border-none cursor-pointer text-salve-textFaint/30 hover:text-salve-textFaint hover:bg-salve-card2 transition-colors"
                    aria-label={`Dismiss ${tip.title}`}
                  >
                    <X size={11} />
                  </button>
                  <div
                    className="w-7 h-7 md:w-9 md:h-9 rounded-lg flex items-center justify-center mb-2"
                    style={{ background: `${colorVar}15` }}
                  >
                    <TipIcon size={14} color={colorVar} strokeWidth={1.5} />
                  </div>
                  <div className="text-[12px] md:text-sm text-salve-text font-medium mb-1 pr-5">{tip.title}</div>
                  <p className="text-[10.5px] md:text-[13px] text-salve-textFaint leading-relaxed m-0 mb-2 flex-1">{tip.body}</p>
                  {tip.href ? (
                    <a
                      href={tip.href}
                      className="inline-flex items-center gap-1 text-[10.5px] md:text-xs font-medium font-montserrat no-underline transition-colors mt-auto"
                      style={{ color: colorVar }}
                    >
                      {tip.actionLabel}
                      <ExternalLink size={9} />
                    </a>
                  ) : (
                    <button
                      onClick={() => onNav(tip.action)}
                      className="inline-flex items-center gap-1 text-[10.5px] md:text-xs font-medium font-montserrat bg-transparent border-none cursor-pointer p-0 transition-colors mt-auto"
                      style={{ color: colorVar }}
                    >
                      {tip.actionLabel}
                      <ChevronRight size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {/* Persistent feedback footer — always present at bottom of onboarding section */}
          <button
            onClick={() => onNav('feedback')}
            className="w-full flex items-center justify-center gap-1.5 mt-3 pt-2.5 border-t border-salve-border/40 bg-transparent border-x-0 border-b-0 cursor-pointer font-montserrat group"
          >
            <Mail size={11} className="text-salve-textFaint/50 group-hover:text-salve-amber transition-colors" />
            <span className="text-[11px] text-salve-textFaint/60 group-hover:text-salve-textMid transition-colors">Share feedback or ideas</span>
          </button>
        </section>
      )}

      <Divider />

      {/* ── Pinned shortcuts (user-starred) ─────── */}
      {starredTiles.length > 0 && (
        <section aria-label="Pinned shortcuts" className="dash-stagger dash-stagger-5 mb-3">
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3 lg:grid-cols-5 lg:gap-4">
            {starredTiles.map((t, i) => {
              const remainder = starredTiles.length % 3;
              const isLast = i === starredTiles.length - 1;
              const span = isLast && remainder !== 0 ? 3 - remainder + 1 : 1;
              return (
                <button
                  key={t.id}
                  onClick={() => onNav(t.id)}
                  className={`bg-salve-card border border-salve-border rounded-xl p-3 md:p-5 flex flex-col items-center gap-1.5 md:gap-2 cursor-pointer tile-magic transition-all relative${span === 2 ? ' col-span-2 md:col-span-1' : span === 3 ? ' col-span-3 md:col-span-1' : ''}`}
                >
                  <div className="absolute top-1.5 right-1.5">
                    <span className="text-salve-amber text-[8px]">★</span>
                  </div>
                  <t.icon size={20} color={C.lav} strokeWidth={1.5} className="md:!w-6 md:!h-6" />
                  <span className="text-[11px] md:text-[13px] text-salve-textMid font-montserrat">{t.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}
