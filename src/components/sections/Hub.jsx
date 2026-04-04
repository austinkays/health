import { useMemo } from 'react';
import {
  ChevronRight, ClipboardList, User, Activity, Shield, CheckSquare, Link2,
  Stethoscope, ShieldAlert, Calendar, FlaskConical, Syringe, ShieldCheck, Dna,
  Building2, BadgeDollarSign, Scale, Heart, Moon, TrendingUp, AlertTriangle,
  AlertOctagon, PlaneTakeoff, Apple, Thermometer,
} from 'lucide-react';
import { OuraIcon } from '../ui/OuraIcon';
import Card from '../ui/Card';
import { C } from '../../constants/colors';
import { fmtDate } from '../../utils/dates';
import { isOuraConnected } from '../../services/oura';

/* ── Hub definitions ─────────────────────────────── */
export const HUBS = {
  records: {
    label: 'Records',
    description: 'Your medical history',
    icon: ClipboardList,
    sections: ['summary', 'conditions', 'allergies', 'labs', 'procedures', 'immunizations', 'genetics'],
  },
  care: {
    label: 'Care Team',
    description: 'Providers, appointments & insurance',
    icon: User,
    sections: ['providers', 'appts', 'pharmacies', 'insurance', 'appeals'],
  },
  tracking: {
    label: 'Tracking',
    description: 'Vitals, sleep & activity',
    icon: Activity,
    sections: ['vitals', 'sleep', 'activities', 'cycles'],
  },
  safety: {
    label: 'Safety',
    description: 'Interactions & alerts',
    icon: Shield,
    sections: ['interactions', 'care_gaps', 'anesthesia'],
  },
  plans: {
    label: 'Plans',
    description: 'To-dos & upcoming care',
    icon: CheckSquare,
    sections: ['todos', 'surgical'],
  },
  devices: {
    label: 'Devices',
    description: 'Connected wearables',
    icon: Link2,
    sections: ['oura', 'apple_health'],
  },
};

/* ── Section display config ─────────────────────── */
const SECTIONS = {
  summary:      { label: 'Summary',       icon: ClipboardList },
  conditions:   { label: 'Conditions',    icon: Stethoscope },
  allergies:    { label: 'Allergies',     icon: ShieldAlert },
  labs:         { label: 'Labs',          icon: FlaskConical },
  procedures:   { label: 'Procedures',    icon: Syringe },
  immunizations:{ label: 'Vaccines',      icon: ShieldCheck },
  genetics:     { label: 'Genetics',      icon: Dna },
  providers:    { label: 'Providers',     icon: User },
  appts:        { label: 'Appointments',  icon: Calendar },
  pharmacies:   { label: 'Pharmacies',    icon: Building2 },
  insurance:    { label: 'Insurance',     icon: BadgeDollarSign },
  appeals:      { label: 'Appeals',       icon: Scale },
  vitals:       { label: 'Vitals',        icon: TrendingUp },
  sleep:        { label: 'Sleep',         icon: Moon },
  activities:   { label: 'Activities',    icon: Activity },
  cycles:       { label: 'Cycles',        icon: Heart },
  interactions: { label: 'Interactions',  icon: AlertTriangle },
  care_gaps:    { label: 'Care Gaps',     icon: AlertTriangle },
  anesthesia:   { label: 'Anesthesia',    icon: AlertOctagon },
  todos:        { label: "To-Do's",       icon: CheckSquare },
  surgical:     { label: 'Surgery Plan',  icon: PlaneTakeoff },
  oura:         { label: 'Oura Ring',     icon: OuraIcon },
  apple_health: { label: 'Apple Health',  icon: Apple },
};

/* ── Preview/stat calculators per section ───────── */
function getStat(id, data) {
  switch (id) {
    case 'summary':
      return 'Full health profile';
    case 'conditions': {
      const active = (data.conditions || []).filter(c => c.status === 'active' || c.status === 'managed').length;
      const total = (data.conditions || []).length;
      return total ? `${active} active · ${total} total` : 'None yet';
    }
    case 'allergies': {
      const n = (data.allergies || []).length;
      return n ? `${n} recorded` : 'None yet';
    }
    case 'labs': {
      const labs = (data.labs || []);
      if (!labs.length) return 'None yet';
      const latest = labs.reduce((a, b) => (a.date > b.date ? a : b));
      return `Latest: ${fmtDate(latest.date)}`;
    }
    case 'procedures': {
      const n = (data.procedures || []).length;
      return n ? `${n} on record` : 'None yet';
    }
    case 'immunizations': {
      const n = (data.immunizations || []).length;
      return n ? `${n} recorded` : 'None yet';
    }
    case 'genetics': {
      const n = (data.genetic_results || []).length;
      return n ? `${n} variant${n !== 1 ? 's' : ''}` : 'None yet';
    }
    case 'providers': {
      const n = (data.providers || []).length;
      return n ? `${n} provider${n !== 1 ? 's' : ''}` : 'None yet';
    }
    case 'appts': {
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = (data.appts || []).filter(a => a.date >= today).length;
      return upcoming ? `${upcoming} upcoming` : 'None scheduled';
    }
    case 'pharmacies': {
      const n = (data.pharmacies || []).length;
      return n ? `${n} saved` : 'None yet';
    }
    case 'insurance': {
      const plan = data.settings?.insurance_plan;
      return plan || 'Not set';
    }
    case 'appeals': {
      const n = (data.appeals_and_disputes || []).length;
      return n ? `${n} on record` : 'None yet';
    }
    case 'vitals': {
      const v = (data.vitals || []);
      if (!v.length) return 'Nothing logged';
      const latest = v.reduce((a, b) => (a.date > b.date ? a : b));
      return `Latest: ${fmtDate(latest.date)}`;
    }
    case 'sleep': {
      const s = (data.vitals || []).filter(v => v.type === 'sleep').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      if (!s.length) return 'Not tracking';
      return `${s[0].value} hrs · ${fmtDate(s[0].date)}`;
    }
    case 'activities': {
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const n = (data.activities || []).filter(a => a.date >= cutoff).length;
      return n ? `${n} this week` : 'Nothing this week';
    }
    case 'cycles': {
      const periods = (data.cycles || []).filter(c => c.type === 'period').map(c => c.date).sort();
      if (!periods.length) return 'Not tracking';
      // Compute day of cycle from last period start
      const starts = [];
      let prev = null;
      for (const d of periods) {
        const dt = new Date(d + 'T00:00:00');
        if (!prev || (dt - prev) > 2 * 86400000) starts.push(d);
        prev = dt;
      }
      if (!starts.length) return 'Not tracking';
      const lastStart = new Date(starts[starts.length - 1] + 'T00:00:00');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const day = Math.floor((today - lastStart) / 86400000) + 1;
      return `Day ${day} of cycle`;
    }
    case 'interactions': {
      // We don't have interactions computed here, just link
      return 'Check drug interactions';
    }
    case 'care_gaps': {
      const n = (data.care_gaps || []).length;
      return n ? `${n} flagged` : 'None flagged';
    }
    case 'anesthesia': {
      const n = (data.anesthesia_flags || []).length;
      return n ? `${n} flag${n !== 1 ? 's' : ''}` : 'None flagged';
    }
    case 'todos': {
      const active = (data.todos || []).filter(t => !t.completed && !t.dismissed).length;
      return active ? `${active} open` : 'Nothing open';
    }
    case 'surgical': {
      const n = (data.surgical_planning || []).length;
      return n ? 'Configured' : 'Not set';
    }
    case 'oura': {
      const connected = isOuraConnected();
      const hasData = (data.vitals || []).some(v => v.source === 'oura');
      if (connected) return 'Connected · syncing';
      if (hasData) return 'Reconnect to sync';
      return 'Not connected';
    }
    case 'apple_health': {
      const has = (data.vitals || []).some(v => v.source === 'apple_health' || v.source === 'Apple Health')
        || (data.activities || []).some(a => a.source === 'apple_health' || a.source === 'Apple Health');
      return has ? 'Data imported' : 'Not imported';
    }
    default:
      return '';
  }
}

/* ── Visibility filter for conditional sections ── */
function isVisible(id, data) {
  if (id === 'oura') {
    return isOuraConnected()
      || (data.vitals || []).some(v => v.source === 'oura')
      || (data.cycles || []).some(c => c.notes?.includes('Oura'))
      || (data.activities || []).some(a => a.source === 'oura');
  }
  if (id === 'apple_health') {
    return (data.vitals || []).some(v => v.source === 'apple_health' || v.source === 'Apple Health')
      || (data.activities || []).some(a => a.source === 'apple_health' || a.source === 'Apple Health');
  }
  return true;
}

/* ── Component ───────────────────────────────────── */
export default function Hub({ hubId, data, onNav }) {
  const hub = HUBS[hubId];

  const visibleSections = useMemo(() => {
    if (!hub) return [];
    return hub.sections.filter(id => isVisible(id, data));
  }, [hub, data]);

  if (!hub) {
    return (
      <div className="mt-2">
        <p className="text-sm text-salve-textMid font-montserrat">Hub not found.</p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {/* Hub description */}
      <p className="text-[12px] text-salve-textFaint font-montserrat italic mb-3 px-1">{hub.description}</p>

      {/* Section rows */}
      <div className="space-y-2">
        {visibleSections.map(id => {
          const section = SECTIONS[id];
          if (!section) return null;
          const Icon = section.icon;
          const stat = getStat(id, data);
          return (
            <Card
              key={id}
              className="!p-3.5 cursor-pointer hover:!border-salve-lav/30 transition-colors"
              onClick={() => onNav(id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-salve-lav/10 flex-shrink-0">
                  <Icon size={16} className="text-salve-lav" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-salve-text font-montserrat">{section.label}</div>
                  <div className="text-[11px] text-salve-textFaint font-montserrat truncate">{stat}</div>
                </div>
                <ChevronRight size={14} className="text-salve-textFaint flex-shrink-0" />
              </div>
            </Card>
          );
        })}
      </div>

      {visibleSections.length === 0 && (
        <p className="text-[12px] text-salve-textFaint font-montserrat italic text-center py-8">
          Nothing here yet.
        </p>
      )}
    </div>
  );
}
