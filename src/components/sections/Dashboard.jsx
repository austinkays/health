import { useState, useEffect } from 'react';
import {
  Pill, Calendar, AlertTriangle, Sparkles, BookOpen, Stethoscope,
  User, Shield, Activity, Settings as SettingsIcon, ChevronRight,
  FlaskConical, Syringe, ShieldCheck, AlertOctagon, Scale, PlaneTakeoff, BadgeDollarSign,
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge, { SevBadge } from '../ui/Badge';
import Motif, { Divider } from '../ui/Motif';
import { SectionTitle } from '../ui/FormWrap';
import { fmtDate, daysUntil } from '../../utils/dates';
import { C } from '../../constants/colors';
import { fetchInsight } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';

export default function Dashboard({ data, interactions, onNav }) {
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);

  const activeMeds = data.meds.filter(m => m.active !== false);
  const upcomingRefills = activeMeds.filter(m => m.refill_date).sort((a, b) => new Date(a.refill_date) - new Date(b.refill_date)).slice(0, 3);
  const upcomingAppts = data.appts.filter(a => new Date(a.date) >= new Date(new Date().toDateString())).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 3);
  const latestJournal = data.journal.length > 0 ? data.journal[0] : null;

  // Computed urgency counts
  const urgentGaps = (data.care_gaps || []).filter(g => g.urgency === 'urgent').length;
  const anesthesiaCount = (data.anesthesia_flags || []).length;
  const openAppeals = (data.appeals_and_disputes || []).filter(a => a.status !== 'Resolved').length;

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
    if (data.settings.ai_mode === 'auto' && data.meds.length + data.conditions.length > 0 && !insight && hasAIConsent()) {
      loadInsight();
    }
  }, [data.settings.ai_mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = [
    { label: 'Medications', value: activeMeds.length, color: C.sage, icon: Pill },
    { label: 'Conditions', value: data.conditions.length, color: C.lav, icon: Stethoscope },
    { label: 'Vitals', value: data.vitals.length, color: C.amber, icon: Activity },
    { label: 'Entries', value: data.journal.length, color: C.rose, icon: BookOpen },
  ];

  const QUICK_LINKS = [
    { id: 'conditions',   label: 'Conditions',    icon: Stethoscope,      color: C.lav },
    { id: 'providers',    label: 'Providers',     icon: User,             color: C.sage },
    { id: 'allergies',    label: 'Allergies',     icon: Shield,           color: C.amber },
    { id: 'appts',        label: 'Appointments',  icon: Calendar,         color: C.rose },
    { id: 'labs',         label: 'Labs',          icon: FlaskConical,     color: C.lav },
    { id: 'procedures',   label: 'Procedures',    icon: Syringe,          color: C.sage },
    { id: 'immunizations',label: 'Vaccines',      icon: ShieldCheck,      color: C.sage },
    { id: 'care_gaps',    label: 'Care Gaps',     icon: AlertTriangle,    color: C.amber, badge: urgentGaps > 0 ? urgentGaps : null },
    { id: 'anesthesia',   label: 'Anesthesia',    icon: AlertOctagon,     color: C.rose,  badge: anesthesiaCount > 0 ? anesthesiaCount : null },
    { id: 'appeals',      label: 'Appeals',       icon: Scale,            color: C.amber, badge: openAppeals > 0 ? openAppeals : null },
    { id: 'surgical',     label: 'Surgery Plan',  icon: PlaneTakeoff,     color: C.lav },
    { id: 'insurance',    label: 'Insurance',     icon: BadgeDollarSign,  color: C.sage },
    { id: 'interactions', label: 'Interactions',  icon: AlertTriangle,    color: C.amber },
    { id: 'settings',     label: 'Settings',      icon: SettingsIcon,     color: C.textMid },
  ];

  return (
    <div className="mt-1">
      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {stats.map(s => (
          <div key={s.label} className="bg-salve-card border border-salve-border rounded-xl p-2.5 text-center">
            <s.icon size={16} color={s.color} style={{ margin: '0 auto 4px' }} />
            <div className="text-lg font-semibold text-salve-text font-montserrat">{s.value}</div>
            <div className="text-[10px] text-salve-textFaint">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Anesthesia flags alert — always show if any exist */}
      {anesthesiaCount > 0 && (
        <Card className="!p-3.5 cursor-pointer" onClick={() => onNav('anesthesia')}
          style={{ borderLeft: `3px solid ${C.rose}`, background: 'rgba(232,138,154,0.06)' }}>
          <div className="flex items-center gap-2 mb-0.5">
            <AlertOctagon size={15} color={C.rose} />
            <span className="text-[13px] font-bold" style={{ color: C.rose }}>
              {anesthesiaCount} Anesthesia Flag{anesthesiaCount > 1 ? 's' : ''} — Show before any procedure
            </span>
            <ChevronRight size={14} className="ml-auto text-salve-textFaint" />
          </div>
          <div className="text-[11px] text-salve-textFaint">Tap to review safety-critical flags</div>
        </Card>
      )}

      {/* Interaction warnings */}
      {interactions.length > 0 && (
        <Card className="!p-3.5 !border-salve-rose/30 cursor-pointer" onClick={() => onNav('interactions')}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} color={C.rose} />
            <span className="text-[13px] font-semibold text-salve-rose">{interactions.length} Interaction Warning{interactions.length > 1 ? 's' : ''}</span>
            <ChevronRight size={14} className="ml-auto text-salve-textFaint" />
          </div>
          <div className="text-xs text-salve-textMid">{interactions[0].medA} + {interactions[0].medB}: {interactions[0].msg.slice(0, 70)}...</div>
        </Card>
      )}

      {/* Urgent care gaps */}
      {urgentGaps > 0 && (
        <Card className="!p-3.5 cursor-pointer" onClick={() => onNav('care_gaps')}
          style={{ borderLeft: `3px solid ${C.amber}` }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} color={C.amber} />
            <span className="text-[13px] font-semibold text-salve-amber">{urgentGaps} Urgent Care Gap{urgentGaps > 1 ? 's' : ''}</span>
            <ChevronRight size={14} className="ml-auto text-salve-textFaint" />
          </div>
        </Card>
      )}

      {/* AI Insight */}
      <Card className="!bg-salve-lav/8 !border-salve-lav/20">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} color={C.lav} />
          <span className="font-playfair text-sm font-medium text-salve-text">Daily Insight</span>
        </div>
        {insightLoading ? (
          <div className="text-[13px] text-salve-textMid animate-pulse">Thinking...</div>
        ) : insight ? (
          <div className="text-[13px] text-salve-textMid leading-relaxed whitespace-pre-wrap">{insight}</div>
        ) : (
          <div>
            <div className="text-[13px] text-salve-textFaint mb-2">Get a personalized health insight from your AI companion.</div>
            {hasAIConsent() ? (
              <Button variant="lavender" onClick={loadInsight} className="!text-xs !py-1.5">
                <Sparkles size={13} /> Get Insight
              </Button>
            ) : (
              <div className="text-[12px] text-salve-textFaint italic">Visit the AI tab to enable AI features.</div>
            )}
          </div>
        )}
      </Card>

      {/* Upcoming appointments */}
      {upcomingAppts.length > 0 && (
        <>
          <SectionTitle>Upcoming Visits</SectionTitle>
          {upcomingAppts.map(a => (
            <Card key={a.id} className="!p-3 cursor-pointer" onClick={() => onNav('appts')} style={{ borderLeft: `3px solid ${C.sage}` }}>
              <div className="flex justify-between">
                <div>
                  <div className="text-[13px] font-medium text-salve-text">{a.reason || 'Appointment'}</div>
                  <div className="text-xs text-salve-textMid">{a.provider}</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-semibold text-salve-sage">{daysUntil(a.date)}</div>
                  <div className="text-[11px] text-salve-textFaint">{fmtDate(a.date)}</div>
                </div>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* Refills */}
      {upcomingRefills.length > 0 && (
        <>
          <SectionTitle>Refills Coming Up</SectionTitle>
          {upcomingRefills.map(m => (
            <Card key={m.id} className="!p-3" style={{ borderLeft: `3px solid ${C.amber}` }}>
              <div className="flex justify-between">
                <span className="text-[13px] text-salve-text font-medium">{m.name} {m.dose}</span>
                <span className="text-[13px] text-salve-amber font-semibold">{daysUntil(m.refill_date)}</span>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* Latest journal */}
      {latestJournal && (
        <>
          <SectionTitle>Latest Journal</SectionTitle>
          <Card className="!bg-salve-lav/8 !border-salve-lav/20 !p-3.5 cursor-pointer" onClick={() => onNav('journal')}>
            <div className="flex justify-between items-start mb-1">
              <span className="font-playfair text-sm text-salve-text font-medium">{latestJournal.title || fmtDate(latestJournal.date)}</span>
              {latestJournal.mood && <span className="text-base">{latestJournal.mood.split(' ')[0]}</span>}
            </div>
            <div className="text-xs text-salve-textMid leading-relaxed line-clamp-2">{latestJournal.content}</div>
          </Card>
        </>
      )}

      <Divider />

      {/* Quick Access */}
      <SectionTitle>Quick Access</SectionTitle>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {QUICK_LINKS.map(l => (
          <button
            key={l.id}
            onClick={() => onNav(l.id)}
            className="bg-salve-card border border-salve-border rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer hover:border-salve-border2 transition-colors relative"
          >
            <l.icon size={20} color={l.color} strokeWidth={1.5} />
            <span className="text-[11px] text-salve-textMid font-montserrat">{l.label}</span>
            {l.badge != null && (
              <span className="absolute top-1.5 right-1.5 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
                style={{ background: l.color, color: '#1a1a2e' }}>
                {l.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
