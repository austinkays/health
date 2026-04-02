import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Sparkles, ChevronRight, Calendar, Pill, AlertTriangle, AlertOctagon,
  Stethoscope, User, Shield, FlaskConical, Syringe, ShieldCheck, Scale,
  PlaneTakeoff, BadgeDollarSign, Activity, BookOpen, Settings as SettingsIcon,
  Grid, Sun, Moon, Sunrise, Sunset, Building2, ClipboardList, Search, X,
  TrendingUp, ShieldAlert, ArrowRight, Pencil, Check, ArrowLeftRight, Plus, Heart,
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Motif, { Divider } from '../ui/Motif';
import { SectionTitle } from '../ui/FormWrap';
import { fmtDate, daysUntil } from '../../utils/dates';
import { C } from '../../constants/colors';
import { fetchInsight } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import { searchEntities, highlightMatch } from '../../utils/search.jsx';
import useWellnessMessage from '../../hooks/useWellnessMessage';

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
    const totalAlerts = (interactions?.length || 0) + urgentGaps + (anesthesiaCount > 0 ? 1 : 0) + abnormalLabCount;
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

const ALL_LINKS = [
  { id: 'summary',      label: 'Summary',      icon: ClipboardList,   color: C.lav },
  { id: 'conditions',   label: 'Conditions',   icon: Stethoscope,     color: C.lav },
  { id: 'providers',    label: 'Providers',    icon: User,            color: C.sage },
  { id: 'allergies',    label: 'Allergies',    icon: Shield,          color: C.amber },
  { id: 'appts',        label: 'Appointments', icon: Calendar,        color: C.rose },
  { id: 'labs',         label: 'Labs',         icon: FlaskConical,    color: C.lav },
  { id: 'insurance',    label: 'Insurance',    icon: BadgeDollarSign, color: C.sage },
  { id: 'procedures',   label: 'Procedures',   icon: Syringe,         color: C.sage },
  { id: 'immunizations',label: 'Vaccines',     icon: ShieldCheck,     color: C.sage },
  { id: 'care_gaps',    label: 'Care Gaps',    icon: AlertTriangle,   color: C.amber },
  { id: 'anesthesia',   label: 'Anesthesia',   icon: AlertOctagon,    color: C.rose },
  { id: 'appeals',      label: 'Appeals',      icon: Scale,           color: C.amber },
  { id: 'surgical',     label: 'Surgery Plan', icon: PlaneTakeoff,    color: C.lav },
  { id: 'interactions', label: 'Interactions', icon: AlertTriangle,   color: C.amber },
  { id: 'pharmacies',   label: 'Pharmacies',   icon: Building2,       color: C.sage },
  { id: 'cycles',       label: 'Cycles',       icon: Heart,           color: C.rose },
  { id: 'settings',     label: 'Settings',     icon: SettingsIcon,    color: C.textMid },
];

const DEFAULT_PRIMARY_IDS = ['summary', 'conditions', 'providers', 'allergies', 'appts', 'labs'];
const DASH_PRIMARY_KEY = 'salve:dash-primary';

/* ── Component ───────────────────────────────────────────── */

export default function Dashboard({ data, interactions, onNav }) {
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const wellness = useWellnessMessage();
  const [showMore, setShowMore] = useState(() => localStorage.getItem('salve:dash-more') === '1');
  const [alertDismissal, setAlertDismissal] = useState(getAlertDismissal);
  const [showDismissMenu, setShowDismissMenu] = useState(false);
  const alertsDismissed = alertDismissal !== null;

  /* ── Customizable Quick Access state ──────── */
  const [primaryIds, setPrimaryIds] = useState(() => {
    try {
      const raw = localStorage.getItem(DASH_PRIMARY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= 1 && parsed.length <= ALL_LINKS.length && parsed.every(id => ALL_LINKS.some(l => l.id === id)))
          return parsed;
      }
    } catch { /* ignore corrupt data */ }
    return DEFAULT_PRIMARY_IDS;
  });
  const [editing, setEditing] = useState(false);
  const [replacingIndex, setReplacingIndex] = useState(null);
  const [addingMode, setAddingMode] = useState(false);

  const primaryLinks = useMemo(() => primaryIds.map(id => ALL_LINKS.find(l => l.id === id)).filter(Boolean), [primaryIds]);
  const moreLinks = useMemo(() => ALL_LINKS.filter(l => !primaryIds.includes(l.id)), [primaryIds]);

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

  // Live search results (max 5 on dashboard)
  const searchResults = useMemo(
    () => searchEntities(data, debouncedSearch).slice(0, 5),
    [data, debouncedSearch]
  );
  const totalResults = useMemo(
    () => searchEntities(data, debouncedSearch).length,
    [data, debouncedSearch]
  );

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
          periodEntry = [{ _type: 'period', _sortDate: nextDate.toISOString().slice(0, 10), _label: 'Predicted period' }];
        }
      }
    }

    return [...appts, ...refills, ...periodEntry]
      .sort((a, b) => new Date(a._sortDate) - new Date(b._sortDate))
      .slice(0, 4);
  }, [data.appts, activeMeds, data.cycles]);

  const latestJournal = useMemo(
    () => data.journal.length > 0 ? data.journal[0] : null,
    [data.journal]
  );

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
  const prepAppts = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    return data.appts.filter(a => {
      const d = new Date(a.date + (a.time ? `T${a.time}` : ''));
      return d >= now && d <= cutoff;
    });
  }, [data.appts]);

  /* ── AI Insight ─────────────────────────────── */
  const loadInsight = async () => {
    setInsightLoading(true);
    try {
      const profile = buildProfile(data);
      const result = await fetchInsight(profile);
      setInsight(result);
    } catch (e) {
      setInsight('Unable to load insight. ' + e.message);
    } finally {
      setInsightLoading(false);
    }
  };

  useEffect(() => {
    if (data.settings.ai_mode === 'auto' && activeMeds.length + data.conditions.length > 0 && !insight && hasAIConsent()) {
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
    return items;
  }, [anesthesiaCount, interactions, severeAllergyCount, abnormalLabs, priceAlertMeds, urgentGaps, data.cycles]);

  const greeting = getTimeGreeting();
  const contextLine = getContextLine(data, interactions, urgentGaps, anesthesiaCount, abnormalLabs.length, alertsDismissed);

  const toggleMore = () => {
    const next = !showMore;
    setShowMore(next);
    localStorage.setItem('salve:dash-more', next ? '1' : '0');
  };

  const handleSwap = (newId) => {
    if (replacingIndex === null) return;
    const next = [...primaryIds];
    next[replacingIndex] = newId;
    setPrimaryIds(next);
    localStorage.setItem(DASH_PRIMARY_KEY, JSON.stringify(next));
    setReplacingIndex(null);
  };

  const handleAdd = (id) => {
    const next = [...primaryIds, id];
    setPrimaryIds(next);
    localStorage.setItem(DASH_PRIMARY_KEY, JSON.stringify(next));
    setAddingMode(false);
  };

  const handleRemove = (index) => {
    if (primaryIds.length <= 1) return;
    const next = primaryIds.filter((_, i) => i !== index);
    setPrimaryIds(next);
    localStorage.setItem(DASH_PRIMARY_KEY, JSON.stringify(next));
    if (replacingIndex === index) setReplacingIndex(null);
  };

  const finishEditing = () => {
    setEditing(false);
    setReplacingIndex(null);
    setAddingMode(false);
  };

  const dismissAlerts = (duration) => {
    const val = { until: duration === 'forever' ? 'forever' : Date.now() + duration };
    localStorage.setItem(ALERT_DISMISS_KEY, JSON.stringify(val));
    setAlertDismissal(val);
    setShowDismissMenu(false);
  };



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
              <span className="font-playfair text-lg font-medium text-gradient-magic">{greeting.text}</span>
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

      {/* ── Needs Attention (consolidated alerts) ── */}
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
                onClick={() => onNav(a.nav)}
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

      {/* ── AI Insight (only when loaded or loading) ── */}
      {hasAIConsent() && (insight || insightLoading) && (
        <section aria-label="Daily insight" className="dash-stagger dash-stagger-3 mb-4">
          {insightLoading ? (
            <Card className="!bg-salve-lav/5 !border-salve-lav/15 shimmer-bg insight-glow">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} color={C.lavDim} />
                <span className="text-xs text-salve-lavDim font-montserrat tracking-wide">DAILY INSIGHT</span>
              </div>
              <div className="relative w-14 h-14 mx-auto mb-3 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-salve-lav/20 breathe-ring" />
                <div className="absolute inset-2 rounded-full border border-salve-lav/10 breathe-ring" style={{ animationDelay: '0.4s' }} />
                <Sparkles size={18} className="breathe-icon text-salve-lavDim" />
              </div>
              <p className="text-[10px] text-salve-textFaint/50 font-montserrat tracking-widest uppercase mb-3 text-center">Breathe with me</p>
              <div key={wellness.key} className="wellness-msg text-[12px] text-salve-lavDim/80 font-montserrat italic text-center" role="status" aria-live="polite">{wellness.message}</div>
            </Card>
          ) : insight && (
            <Card className="!bg-salve-lav/5 !border-salve-lav/15 insight-glow">
              <div className="flex items-center gap-2 mb-2.5">
                <Sparkles size={14} color={C.lav} />
                <span className="text-xs text-salve-lavDim font-montserrat tracking-wide">DAILY INSIGHT</span>
              </div>
              <AIMarkdown compact>{insight}</AIMarkdown>
            </Card>
          )}
        </section>
      )}

      {/* ── Appointment Prep Nudge (within 48 hrs) ──── */}
      {prepAppts.length > 0 && (
        <section aria-label="Upcoming appointment prep" className="dash-stagger dash-stagger-4 mb-2">
          {prepAppts.map(a => (
            <Card key={a.id} className="!bg-salve-rose/5 !border-salve-rose/20 cursor-pointer" onClick={() => onNav('appts', { highlightId: a.id })}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-8 h-8 rounded-full bg-salve-rose/15 flex items-center justify-center flex-shrink-0">
                  <Calendar size={14} color={C.rose} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-salve-rose tracking-wide mb-0.5">PREPARE FOR YOUR VISIT</div>
                  <div className="text-[13px] font-medium text-salve-text truncate">{a.reason || 'Appointment'}{a.provider ? ` with ${a.provider}` : ''}</div>
                  <div className="text-[11px] text-salve-textFaint mt-0.5">{daysUntil(a.date)}{a.time ? ` at ${a.time}` : ''}{a.location ? ` · ${a.location}` : ''}</div>
                  {!a.questions && <div className="text-[11px] text-salve-rose/80 mt-1 italic">Tap to add questions for your provider</div>}
                </div>
                <ChevronRight size={14} className="text-salve-rose/50 mt-2 flex-shrink-0" />
              </div>
            </Card>
          ))}
        </section>
      )}

      {/* ── Coming Up (unified timeline) ──────────── */}
      {timeline.length > 0 && (
        <section aria-label="Coming up" className="dash-stagger dash-stagger-4 mb-2">
          <SectionTitle>Coming Up</SectionTitle>
          {timeline.map((item, i) => {
            const isAppt = item._type === 'appt';
            const isPeriod = item._type === 'period';
            const dotColor = isAppt ? C.sage : isPeriod ? C.rose : C.amber;
            const label = isAppt ? (item.reason || 'Appointment') : isPeriod ? item._label : `${item.name} ${item.dose || ''}`.trim();
            const sub = isAppt ? item.provider : isPeriod ? 'Predicted' : 'Refill';
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
                onClick={() => onNav(isAppt ? 'appts' : 'meds')}
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

      {/* ── Latest Journal (subtle) ──────────────── */}
      {latestJournal && (
        <section aria-label="Latest journal entry" className="dash-stagger dash-stagger-4 mb-2">
          <Card className="!bg-salve-lav/5 !border-salve-lav/10 !p-3.5 cursor-pointer" onClick={() => onNav('journal')}>
            <div className="flex items-start gap-2.5">
              {latestJournal.mood && (
                <span className="text-lg leading-none mt-0.5">{latestJournal.mood.split(' ')[0]}</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-salve-text font-medium truncate">
                  {latestJournal.title || fmtDate(latestJournal.date)}
                </div>
                <div className="text-[11px] text-salve-textMid leading-relaxed line-clamp-1 mt-0.5">{latestJournal.content}</div>
              </div>
              <BookOpen size={13} className="text-salve-textFaint flex-shrink-0 mt-1" />
            </div>
          </Card>
        </section>
      )}

      <Divider />

      {/* ── Quick Access (customizable primary + expandable) ── */}
      <section aria-label="Quick access" className="dash-stagger dash-stagger-5">
        {/* Edit / Done header */}
        <div className="flex justify-end mb-1">
          <button
            onClick={() => editing ? finishEditing() : setEditing(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-montserrat opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: editing ? C.sage : C.textFaint }}
            aria-label={editing ? 'Done editing' : 'Edit quick access'}
          >
            {editing ? <Check size={11} /> : <Pencil size={11} />}
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>

        {/* Primary tiles */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          {primaryLinks.map((l, i) => (
            <button
              key={l.id}
              onClick={() => editing ? setReplacingIndex(replacingIndex === i ? null : i) : onNav(l.id)}
              className={`relative bg-salve-card border rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer tile-magic transition-all ${
                editing
                  ? replacingIndex === i
                    ? 'border-salve-lav ring-1 ring-salve-lav'
                    : 'border-dashed border-salve-border2'
                  : 'border-salve-border'
              }`}
            >
              {/* Remove button (edit mode, min 1 tile) */}
              {editing && primaryIds.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); handleRemove(i); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleRemove(i); } }}
                  className="absolute top-1 right-1 z-10 w-4.5 h-4.5 rounded-full bg-salve-rose/90 flex items-center justify-center cursor-pointer hover:bg-salve-rose transition-colors shadow-sm"
                  aria-label={`Remove ${l.label}`}
                >
                  <X size={10} className="text-salve-bg" />
                </span>
              )}
              <l.icon size={20} color={l.color} strokeWidth={1.5} />
              <span className="text-[11px] text-salve-textMid font-montserrat">{l.label}</span>
              {editing && <ArrowLeftRight size={10} className="text-salve-textFaint" />}
            </button>
          ))}

          {/* Add tile (edit mode, when more tiles are available) */}
          {editing && moreLinks.length > 0 && (
            <button
              onClick={() => { setAddingMode(true); setReplacingIndex(null); }}
              className="bg-salve-card border border-dashed border-salve-border2 rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer tile-magic transition-all hover:border-salve-sage"
              aria-label="Add a section"
            >
              <Plus size={20} color={C.sage} strokeWidth={1.5} />
              <span className="text-[11px] text-salve-sage font-montserrat">Add</span>
            </button>
          )}
        </div>

        {/* Bottom sheet: Swap mode (replacing a tile) */}
        {editing && replacingIndex !== null && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setReplacingIndex(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative w-full max-w-[480px] bg-salve-card border-t border-salve-border rounded-t-2xl p-4 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-xs text-salve-textMid font-montserrat mb-3 text-center">
                Replace <strong className="text-salve-text">{primaryLinks[replacingIndex]?.label}</strong> with:
              </p>
              <div className="grid grid-cols-3 gap-2">
                {moreLinks.map(l => (
                  <button
                    key={l.id}
                    onClick={() => handleSwap(l.id)}
                    className="bg-salve-card2 border border-salve-border rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer tile-magic"
                  >
                    <l.icon size={20} color={l.color} strokeWidth={1.5} />
                    <span className="text-[11px] text-salve-textMid font-montserrat">{l.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bottom sheet: Add mode (adding a new tile) */}
        {editing && addingMode && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setAddingMode(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative w-full max-w-[480px] bg-salve-card border-t border-salve-border rounded-t-2xl p-4 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-xs text-salve-textMid font-montserrat mb-3 text-center">
                Add a section:
              </p>
              <div className="grid grid-cols-3 gap-2">
                {moreLinks.map(l => (
                  <button
                    key={l.id}
                    onClick={() => handleAdd(l.id)}
                    className="bg-salve-card2 border border-salve-border rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer tile-magic"
                  >
                    <l.icon size={20} color={l.color} strokeWidth={1.5} />
                    <span className="text-[11px] text-salve-textMid font-montserrat">{l.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* More sections toggle (hidden during edit or when all tiles are promoted) */}
        {!editing && moreLinks.length > 0 && (
          <>
            <button
              onClick={toggleMore}
              className="w-full flex items-center justify-center gap-1.5 py-2 mb-2 bg-transparent border border-salve-border rounded-xl cursor-pointer tile-magic"
            >
              <Grid size={13} className="text-salve-textFaint" />
              <span className="text-[11px] text-salve-textFaint font-montserrat">
                {showMore ? 'Show less' : 'More sections'}
              </span>
            </button>

            {showMore && (
              <div className="grid grid-cols-3 gap-2 mb-4 dash-stagger" style={{ animationDelay: '0s', animationDuration: '0.3s' }}>
                {moreLinks.map(l => (
                  <button
                    key={l.id}
                    onClick={() => onNav(l.id)}
                    className="bg-salve-card border border-salve-border rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer tile-magic"
                  >
                    <l.icon size={20} color={l.color} strokeWidth={1.5} />
                    <span className="text-[11px] text-salve-textMid font-montserrat">{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
