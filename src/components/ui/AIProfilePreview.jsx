import { useState, useMemo } from 'react';
import {
  Eye, ChevronDown, MessageSquare, Pill, Stethoscope, Shield,
  User, Heart, Calendar, BookOpen, FlaskConical, Dna, CheckSquare,
  Activity, BadgeDollarSign, FileText, Leaf,
} from 'lucide-react';
import { C } from '../../constants/colors';
import { fmtDate } from '../../utils/dates';

/* ── Section config ───────────────────────────────────── */

function buildSections(data) {
  const s = data.settings || {};
  const activeMeds = (data.meds || []).filter(m => m.active !== false);
  const now = new Date(new Date().toDateString());

  const sections = [];

  // Profile
  if (s.name || s.location) {
    sections.push({
      id: 'profile', label: 'Profile', icon: User, color: C.textMid,
      items: [s.name, s.location].filter(Boolean).map(v => ({ text: v })),
    });
  }

  // Active Medications
  if (activeMeds.length) {
    sections.push({
      id: 'meds', label: 'Active Medications', icon: Pill, color: C.sage,
      items: activeMeds.map(m => ({
        text: m.display_name || m.name,
        detail: [m.dose, m.frequency].filter(Boolean).join(' · ') || undefined,
        badge: m.rxcui ? undefined : undefined, // clean, no badge noise
      })),
    });
  }

  // Conditions
  const conditions = (data.conditions || []).filter(c => c.name);
  if (conditions.length) {
    sections.push({
      id: 'conditions', label: 'Conditions', icon: Stethoscope, color: C.lav,
      items: conditions.map(c => ({
        text: c.name,
        badge: c.status && c.status !== 'active' ? c.status : undefined,
        badgeColor: c.status === 'resolved' ? C.sage : c.status === 'managed' ? C.amber : C.lav,
      })),
    });
  }

  // Allergies
  const allergies = (data.allergies || []).filter(a => a.substance);
  if (allergies.length) {
    sections.push({
      id: 'allergies', label: 'Allergies', icon: Shield, color: C.rose,
      items: allergies.map(a => ({
        text: a.substance,
        detail: a.reaction || undefined,
        badge: a.severity || undefined,
        badgeColor: a.severity === 'severe' ? C.rose : a.severity === 'moderate' ? C.amber : C.sage,
      })),
    });
  }

  // Providers
  const providers = (data.providers || []).filter(p => p.name);
  if (providers.length) {
    sections.push({
      id: 'providers', label: 'Providers', icon: User, color: C.sage,
      items: providers.map(p => ({
        text: p.name,
        detail: p.specialty || undefined,
      })),
    });
  }

  // Recent Vitals (last 5)
  const vitals = (data.vitals || []).slice(0, 5);
  if (vitals.length) {
    sections.push({
      id: 'vitals', label: 'Recent Vitals', icon: Heart, color: C.amber,
      items: vitals.map(v => ({
        text: `${v.type}: ${v.value}${v.value2 ? '/' + v.value2 : ''}${v.unit ? ' ' + v.unit : ''}`,
        detail: v.date ? fmtDate(v.date) : undefined,
      })),
    });
  }

  // Upcoming Appointments (next 3)
  const upcoming = (data.appts || [])
    .filter(a => a.date && new Date(a.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3);
  if (upcoming.length) {
    sections.push({
      id: 'appts', label: 'Upcoming Appointments', icon: Calendar, color: C.rose,
      items: upcoming.map(a => ({
        text: a.reason || 'Appointment',
        detail: [a.provider, fmtDate(a.date)].filter(Boolean).join(' · '),
      })),
    });
  }

  // Recent Journal (last 3)
  const journal = (data.journal || []).slice(0, 3);
  if (journal.length) {
    sections.push({
      id: 'journal', label: 'Recent Journal', icon: BookOpen, color: C.lav,
      items: journal.map(e => ({
        text: e.title || fmtDate(e.date) || 'Entry',
        detail: e.mood || undefined,
      })),
    });
  }

  // Abnormal Labs
  const abnormalLabs = (data.labs || []).filter(l => l.flag && l.flag !== 'normal' && l.flag !== 'completed');
  if (abnormalLabs.length) {
    sections.push({
      id: 'labs', label: 'Abnormal Labs', icon: FlaskConical, color: C.rose,
      items: abnormalLabs.slice(0, 5).map(l => ({
        text: l.test_name || 'Lab',
        detail: `${l.result}${l.unit ? ' ' + l.unit : ''}`,
        badge: l.flag,
        badgeColor: l.flag === 'high' || l.flag === 'low' || l.flag === 'abnormal' ? C.rose : C.amber,
      })),
    });
  }

  // Genetics
  const genetics = (data.genetic_results || []).filter(g => g.gene);
  if (genetics.length) {
    sections.push({
      id: 'genetics', label: 'Pharmacogenomics', icon: Dna, color: C.lav,
      items: genetics.map(g => ({
        text: g.gene,
        badge: g.phenotype || undefined,
        badgeColor: (g.phenotype || '').includes('poor') ? C.rose : (g.phenotype || '').includes('intermediate') ? C.amber : C.sage,
        detail: g.affected_drugs?.length ? `${g.affected_drugs.length} drugs affected` : undefined,
      })),
    });
  }

  // Active To-Do's
  const activeTodos = (data.todos || []).filter(t => !t.completed);
  if (activeTodos.length) {
    const urgent = activeTodos.filter(t => t.priority === 'urgent' || t.priority === 'high').length;
    sections.push({
      id: 'todos', label: "Active To-Do's", icon: CheckSquare, color: C.lav,
      items: activeTodos.slice(0, 5).map(t => ({
        text: t.title,
        badge: t.priority !== 'medium' && t.priority !== 'low' ? t.priority : undefined,
        badgeColor: t.priority === 'urgent' ? C.rose : C.amber,
        detail: t.due_date ? `Due ${fmtDate(t.due_date)}` : undefined,
      })),
      extra: activeTodos.length > 5 ? `+${activeTodos.length - 5} more` : undefined,
    });
  }

  // Recent Activities (last 3)
  const activities = (data.activities || []).slice(0, 3);
  if (activities.length) {
    sections.push({
      id: 'activities', label: 'Recent Activities', icon: Activity, color: C.sage,
      items: activities.map(a => ({
        text: a.type || 'Activity',
        detail: [a.duration_minutes ? `${a.duration_minutes} min` : '', a.date ? fmtDate(a.date) : ''].filter(Boolean).join(' · '),
      })),
    });
  }

  // Insurance
  const ins = s.insurance_plan;
  if (ins) {
    sections.push({
      id: 'insurance', label: 'Insurance', icon: BadgeDollarSign, color: C.sage,
      items: [{ text: ins }],
    });
  }

  // Health Background
  const bg = s.health_background;
  if (bg) {
    sections.push({
      id: 'background', label: 'Health Background', icon: FileText, color: C.textMid,
      items: [{ text: bg.length > 120 ? bg.slice(0, 120) + '...' : bg }],
    });
  }

  // Cycle stats
  const cycles = data.cycles || [];
  if (cycles.length > 0) {
    const periodDays = cycles.filter(c => c.type === 'period').length;
    const symptoms = cycles.filter(c => c.type === 'symptom').length;
    sections.push({
      id: 'cycles', label: 'Cycle Data', icon: Heart, color: C.rose,
      items: [
        { text: `${periodDays} period entries, ${symptoms} symptom entries` },
      ],
    });
  }

  return sections;
}

/* ── Component ────────────────────────────────────────── */

export default function AIProfilePreview({ data }) {
  const [open, setOpen] = useState(false);
  const sections = useMemo(() => buildSections(data), [data]);
  const dataPoints = useMemo(() => sections.reduce((sum, s) => sum + s.items.length, 0), [sections]);

  return (
    <div className="w-full">
      {/* Pill button (collapsed state) */}
      {!open && (
        <div className="flex justify-center">
          <button
            onClick={() => setOpen(true)}
            className="group relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium font-montserrat cursor-pointer transition-all duration-200 bg-transparent border border-salve-sage/40 text-salve-sage hover:border-salve-sage hover:shadow-[0_0_12px_rgba(143,191,160,0.15)]"
          >
            <Eye size={12} strokeWidth={2} />
            <span>What Sage Sees</span>
            <span className="text-salve-textFaint">· {dataPoints}</span>
          </button>
        </div>
      )}

      {/* Expanded card (inline) */}
      {open && (
        <div className="rounded-xl border border-salve-sage/20 bg-salve-card overflow-hidden mt-1">
          {/* Header */}
          <button
            onClick={() => setOpen(false)}
            className="w-full flex items-center justify-between px-4 py-3 bg-transparent border-none cursor-pointer border-b border-salve-border/50"
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-salve-sage/15 flex items-center justify-center">
                <Leaf size={11} className="text-salve-sage" />
              </div>
              <span className="text-[15px] font-semibold text-salve-text font-montserrat">What Sage Sees</span>
              <span className="text-[12px] text-salve-textFaint font-montserrat rounded-full bg-salve-card2 px-1.5 py-0.5">{dataPoints}</span>
            </div>
            <ChevronDown size={14} className="text-salve-textFaint rotate-180" />
          </button>

          {/* Content */}
          <div className="px-4 pt-3 pb-4">
            <p className="text-[12px] text-salve-textFaint italic mb-1 leading-relaxed">
              Health data Sage uses to personalize your insights.
            </p>
            <p className="text-[12px] text-salve-lav/70 mb-3 leading-relaxed flex items-center gap-1">
              <MessageSquare size={9} className="flex-shrink-0" />
              <span>Tell <strong className="text-salve-lav">Sage</strong> to update anything, e.g. "add Lexapro 10mg"</span>
            </p>

            {sections.length === 0 ? (
              <div className="text-center py-4">
                <Leaf size={20} className="text-salve-sage/30 mx-auto mb-1.5" />
                <p className="text-[13px] text-salve-textFaint">No health data yet.</p>
              </div>
            ) : (
              sections.map((sec, i) => (
                <Section key={sec.id} section={sec} defaultOpen={i < 3} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Collapsible section ──────────────────────────────── */

function Section({ section, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const { label, icon: Icon, color, items, extra } = section;

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0 py-2.5 group"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '20' }}>
            <Icon size={11} style={{ color }} />
          </div>
          <span className="text-[14px] font-semibold text-salve-text font-montserrat">{label}</span>
          <span className="text-[12px] font-montserrat rounded-full bg-salve-card2 px-1.5 py-0.5 text-salve-textFaint min-w-[18px] text-center">{items.length}</span>
        </div>
        <ChevronDown size={13} className={`text-salve-textFaint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`expand-section ${open ? 'open' : ''}`}><div>
        <div className="pb-2 ml-[10px] pl-3 border-l border-salve-border/30">
          {items.map((item, j) => (
            <div key={j} className="flex items-baseline gap-2 py-[3px]">
              <div className="w-1 h-1 rounded-full flex-shrink-0 mt-[6px]" style={{ backgroundColor: color }} />
              <span className="text-[14px] text-salve-textMid leading-snug">{item.text}</span>
              {item.badge && (
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 capitalize whitespace-nowrap"
                  style={{ color: item.badgeColor || C.textFaint, backgroundColor: (item.badgeColor || C.textFaint) + '20' }}
                >
                  {item.badge}
                </span>
              )}
              {item.detail && (
                <span className="text-[12px] text-salve-textFaint flex-shrink-0 whitespace-nowrap">{item.detail}</span>
              )}
            </div>
          ))}
          {extra && <div className="text-[12px] text-salve-textFaint italic pt-0.5">{extra}</div>}
        </div>
      </div></div>
    </div>
  );
}
