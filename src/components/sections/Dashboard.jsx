import { useState, useEffect, useMemo } from 'react';
import {
  Sparkles, ChevronRight, Calendar, Pill, AlertTriangle, AlertOctagon,
  Stethoscope, User, Shield, FlaskConical, Syringe, ShieldCheck, Scale,
  PlaneTakeoff, BadgeDollarSign, Activity, BookOpen, Settings as SettingsIcon,
  Grid, Sun, Moon, Sunrise, Sunset,
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

/* ── Helpers ─────────────────────────────────────────────── */

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return { text: 'Good evening', icon: Moon, motif: 'moon' };
  if (h < 12) return { text: 'Good morning', icon: Sunrise, motif: 'leaf' };
  if (h < 17) return { text: 'Good afternoon', icon: Sun, motif: 'sparkle' };
  if (h < 21) return { text: 'Good evening', icon: Sunset, motif: 'star' };
  return { text: 'Good evening', icon: Moon, motif: 'moon' };
}

function getContextLine(data, interactions, urgentGaps, anesthesiaCount, abnormalLabCount) {
  // Priority: critical alerts → upcoming events → encouragement
  const totalAlerts = (interactions?.length || 0) + urgentGaps + (anesthesiaCount > 0 ? 1 : 0) + abnormalLabCount;
  if (totalAlerts > 0) return `${totalAlerts} item${totalAlerts > 1 ? 's' : ''} need${totalAlerts === 1 ? 's' : ''} your attention`;

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

/* ── Quick Access config (static — outside component) ──── */

const PRIMARY_LINKS = [
  { id: 'conditions',   label: 'Conditions',   icon: Stethoscope,   color: C.lav },
  { id: 'providers',    label: 'Providers',     icon: User,          color: C.sage },
  { id: 'allergies',    label: 'Allergies',     icon: Shield,        color: C.amber },
  { id: 'appts',        label: 'Appointments',  icon: Calendar,      color: C.rose },
  { id: 'labs',         label: 'Labs',          icon: FlaskConical,  color: C.lav },
  { id: 'insurance',    label: 'Insurance',     icon: BadgeDollarSign, color: C.sage },
];

const MORE_LINKS = [
  { id: 'procedures',    label: 'Procedures',    icon: Syringe,       color: C.sage },
  { id: 'immunizations', label: 'Vaccines',      icon: ShieldCheck,   color: C.sage },
  { id: 'care_gaps',     label: 'Care Gaps',     icon: AlertTriangle, color: C.amber },
  { id: 'anesthesia',    label: 'Anesthesia',    icon: AlertOctagon,  color: C.rose },
  { id: 'appeals',       label: 'Appeals',       icon: Scale,         color: C.amber },
  { id: 'surgical',      label: 'Surgery Plan',  icon: PlaneTakeoff,  color: C.lav },
  { id: 'interactions',  label: 'Interactions',  icon: AlertTriangle, color: C.amber },
  { id: 'settings',      label: 'Settings',      icon: SettingsIcon,  color: C.textMid },
];

/* ── Component ───────────────────────────────────────────── */

export default function Dashboard({ data, interactions, onNav }) {
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [showMore, setShowMore] = useState(() => localStorage.getItem('salve:dash-more') === '1');

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
    return [...appts, ...refills]
      .sort((a, b) => new Date(a._sortDate) - new Date(b._sortDate))
      .slice(0, 3);
  }, [data.appts, activeMeds]);

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

  /* ── Alerts aggregation ─────────────────────── */
  const alerts = useMemo(() => {
    const items = [];
    if (anesthesiaCount > 0) {
      items.push({ id: 'anesthesia', icon: AlertOctagon, color: C.rose, text: `${anesthesiaCount} Anesthesia Flag${anesthesiaCount > 1 ? 's' : ''} — review before procedures`, nav: 'anesthesia' });
    }
    if (interactions.length > 0) {
      items.push({ id: 'interactions', icon: AlertTriangle, color: C.rose, text: `${interactions.length} Drug Interaction${interactions.length > 1 ? 's' : ''} detected`, nav: 'interactions' });
    }
    if (abnormalLabs.length > 0) {
      items.push({ id: 'labs', icon: FlaskConical, color: C.rose, text: `${abnormalLabs.length} Abnormal Lab Result${abnormalLabs.length > 1 ? 's' : ''}`, nav: 'labs' });
    }
    if (urgentGaps > 0) {
      items.push({ id: 'care_gaps', icon: AlertTriangle, color: C.amber, text: `${urgentGaps} Urgent Care Gap${urgentGaps > 1 ? 's' : ''}`, nav: 'care_gaps' });
    }
    return items;
  }, [anesthesiaCount, interactions, abnormalLabs, urgentGaps]);

  const greeting = getTimeGreeting();
  const contextLine = getContextLine(data, interactions, urgentGaps, anesthesiaCount, abnormalLabs.length);

  const toggleMore = () => {
    const next = !showMore;
    setShowMore(next);
    localStorage.setItem('salve:dash-more', next ? '1' : '0');
  };

  /* ── Render ─────────────────────────────────── */
  return (
    <div className="mt-1">

      {/* ── Contextual Greeting ────────────────── */}
      <section aria-label="Greeting" className="dash-stagger dash-stagger-1 mb-5">
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

      {/* ── Needs Attention (consolidated alerts) ── */}
      {alerts.length > 0 && (
        <section aria-label="Needs attention" className="dash-stagger dash-stagger-2 mb-4">
          <Card className="!p-0 overflow-hidden">
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
              <div className="space-y-2">
                <div className="h-3 bg-salve-lav/10 rounded-full w-full" />
                <div className="h-3 bg-salve-lav/10 rounded-full w-4/5" />
                <div className="h-3 bg-salve-lav/10 rounded-full w-3/5" />
              </div>
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

      {/* ── Coming Up (unified timeline) ──────────── */}
      {timeline.length > 0 && (
        <section aria-label="Coming up" className="dash-stagger dash-stagger-3 mb-2">
          <SectionTitle>Coming Up</SectionTitle>
          {timeline.map((item, i) => {
            const isAppt = item._type === 'appt';
            const dotColor = isAppt ? C.sage : C.amber;
            const label = isAppt ? (item.reason || 'Appointment') : `${item.name} ${item.dose || ''}`.trim();
            const sub = isAppt ? item.provider : 'Refill';
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

      {/* ── Quick Access (6 primary + expandable) ── */}
      <section aria-label="Quick access" className="dash-stagger dash-stagger-5">
        <div className="grid grid-cols-3 gap-2 mb-2">
          {PRIMARY_LINKS.map(l => (
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

        {/* Expand / collapse more sections */}
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
            {MORE_LINKS.map(l => (
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
      </section>
    </div>
  );
}
