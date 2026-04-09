import {
  Pill, Stethoscope, User, Shield, Calendar,
  BookOpen, FlaskConical, Building2, Syringe, ShieldCheck, AlertTriangle,
  AlertOctagon, Scale, PlaneTakeoff, BadgeDollarSign, Activity, Heart, CheckSquare, Dna,
} from 'lucide-react';
import { C } from '../constants/colors';

/* ── Entity search config ────────────────────────────────── */

export const ENTITY_CONFIG = {
  meds: {
    label: 'Medications',
    icon: Pill,
    color: C.lav,
    tab: 'meds',
    fields: ['name', 'display_name', 'dose', 'prescriber', 'pharmacy', 'purpose', 'notes'],
    primary: m => m.display_name || m.name,
    secondary: m => [m.dose, m.frequency].filter(Boolean).join(' · '),
    idField: 'id',
  },
  conditions: {
    label: 'Conditions',
    icon: Stethoscope,
    color: C.lav,
    tab: 'conditions',
    fields: ['name', 'provider', 'notes', 'status'],
    primary: c => c.name,
    secondary: c => [c.status, c.provider].filter(Boolean).join(' · '),
    idField: 'id',
  },
  providers: {
    label: 'Providers',
    icon: User,
    color: C.sage,
    tab: 'providers',
    fields: ['name', 'specialty', 'clinic', 'phone', 'notes', 'address'],
    primary: p => p.name,
    secondary: p => [p.specialty, p.clinic].filter(Boolean).join(' · '),
    idField: 'id',
  },
  allergies: {
    label: 'Allergies',
    icon: Shield,
    color: C.amber,
    tab: 'allergies',
    fields: ['substance', 'reaction', 'notes'],
    primary: a => a.substance,
    secondary: a => [a.severity, a.reaction].filter(Boolean).join(' · '),
    idField: 'id',
  },
  pharmacies: {
    label: 'Pharmacies',
    icon: Building2,
    color: C.sage,
    tab: 'pharmacies',
    fields: ['name', 'address', 'phone', 'notes', 'website'],
    primary: p => p.name,
    secondary: p => p.address || p.phone || '',
    idField: 'id',
  },
  appts: {
    label: 'Appointments',
    icon: Calendar,
    color: C.rose,
    tab: 'appts',
    fields: ['reason', 'provider', 'location', 'post_notes', 'questions'],
    primary: a => a.reason || 'Appointment',
    secondary: a => [a.provider, a.date].filter(Boolean).join(' · '),
    idField: 'id',
  },
  journal: {
    label: 'Journal',
    icon: BookOpen,
    color: C.lav,
    tab: 'journal',
    fields: ['title', 'content', 'tags', 'gratitude', 'triggers', 'interventions'],
    primary: e => e.title || 'Journal entry',
    secondary: e => e.date || '',
    idField: 'id',
  },
  labs: {
    label: 'Labs',
    icon: FlaskConical,
    color: C.lav,
    tab: 'labs',
    fields: ['test_name', 'name', 'value', 'notes'],
    primary: l => l.test_name || l.name || 'Lab result',
    secondary: l => [l.value, l.unit, l.date].filter(Boolean).join(' · '),
    idField: 'id',
  },
  procedures: {
    label: 'Procedures',
    icon: Syringe,
    color: C.sage,
    tab: 'procedures',
    fields: ['name', 'provider', 'notes', 'outcome'],
    primary: p => p.name,
    secondary: p => [p.provider, p.date].filter(Boolean).join(' · '),
    idField: 'id',
  },
  immunizations: {
    label: 'Vaccines',
    icon: ShieldCheck,
    color: C.sage,
    tab: 'immunizations',
    fields: ['name', 'provider', 'notes'],
    primary: i => i.name,
    secondary: i => [i.provider, i.date].filter(Boolean).join(' · '),
    idField: 'id',
  },
  care_gaps: {
    label: 'Care Gaps',
    icon: AlertTriangle,
    color: C.amber,
    tab: 'care_gaps',
    fields: ['item', 'category', 'notes'],
    primary: g => g.item || g.name,
    secondary: g => g.urgency || '',
    idField: 'id',
  },
  anesthesia_flags: {
    label: 'Anesthesia',
    icon: AlertOctagon,
    color: C.rose,
    tab: 'anesthesia',
    fields: ['condition', 'implication', 'notes', 'action_required'],
    primary: f => f.condition || 'Anesthesia flag',
    secondary: f => f.implication || '',
    idField: 'id',
  },
  appeals_and_disputes: {
    label: 'Appeals',
    icon: Scale,
    color: C.amber,
    tab: 'appeals',
    fields: ['subject', 'against', 'status', 'notes', 'reason'],
    primary: a => a.subject || 'Appeal',
    secondary: a => [a.against, a.status].filter(Boolean).join(' · '),
    idField: 'id',
  },
  surgical_planning: {
    label: 'Surgery Plan',
    icon: PlaneTakeoff,
    color: C.lav,
    tab: 'surgical',
    fields: ['facility', 'surgeon', 'notes', 'procedure_name'],
    primary: s => s.facility || s.procedure_name || 'Surgery plan',
    secondary: s => [s.surgeon, s.target_date].filter(Boolean).join(' · '),
    idField: 'id',
  },
  insurance: {
    label: 'Insurance',
    icon: BadgeDollarSign,
    color: C.sage,
    tab: 'insurance',
    fields: ['name', 'plan_name', 'provider_name', 'notes', 'policy_number'],
    primary: i => i.name || i.plan_name || 'Insurance',
    secondary: i => i.provider_name || '',
    idField: 'id',
  },
  vitals: {
    label: 'Vitals',
    icon: Activity,
    color: C.sage,
    tab: 'vitals',
    fields: ['type', 'value', 'unit', 'notes'],
    primary: v => `${v.type || 'Vital'}: ${v.value || ''}${v.unit ? ' ' + v.unit : ''}`,
    secondary: v => v.date || '',
    idField: 'id',
  },
  genetic_results: {
    label: 'Genetics',
    icon: Dna,
    color: C.lav,
    tab: 'genetics',
    fields: ['gene', 'variant', 'phenotype', 'source', 'notes'],
    primary: g => g.gene || 'Genetic result',
    secondary: g => [g.phenotype, g.source].filter(Boolean).join(' · '),
    idField: 'id',
  },
  activities: {
    label: 'Activities',
    icon: Activity,
    color: C.sage,
    tab: 'activities',
    fields: ['type', 'notes', 'date', 'source'],
    primary: a => a.type || 'Activity',
    secondary: a => [a.duration_minutes ? `${a.duration_minutes} min` : '', a.date].filter(Boolean).join(' · '),
    idField: 'id',
  },
  todos: {
    label: "To-Do's",
    icon: CheckSquare,
    color: C.lav,
    tab: 'todos',
    fields: ['title', 'notes', 'category', 'priority'],
    primary: t => t.title || 'To-do',
    secondary: t => [t.priority, t.due_date, t.completed ? '✓ Done' : ''].filter(Boolean).join(' · '),
    idField: 'id',
  },
  cycles: {
    label: 'Cycles',
    icon: Heart,
    color: C.rose,
    tab: 'cycles',
    fields: ['type', 'value', 'symptom', 'notes'],
    primary: c => c.type === 'period' ? `Period: ${c.value || ''}` : c.type === 'symptom' ? (c.symptom || 'Symptom') : c.type,
    secondary: c => c.date || '',
    idField: 'id',
  },
};

/* ── Filter pill categories ──────────────────────────────── */

export const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'meds', label: 'Meds' },
  { key: 'conditions', label: 'Conditions' },
  { key: 'providers', label: 'Providers' },
  { key: 'pharmacies', label: 'Pharmacies' },
  { key: 'appts', label: 'Visits' },
  { key: 'journal', label: 'Journal' },
  { key: 'labs', label: 'Labs' },
  { key: 'more', label: 'More' },
];

export const MORE_CATEGORIES = [
  'allergies', 'procedures', 'immunizations', 'care_gaps',
  'anesthesia_flags', 'appeals_and_disputes', 'surgical_planning',
  'insurance', 'vitals', 'cycles', 'todos', 'activities', 'genetic_results',
];

/* ── Helpers ─────────────────────────────────────────────── */

export function highlightMatch(text, query) {
  if (!text || !query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-salve-lav/25 text-salve-text rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const FIELD_LABELS = {
  prescriber: 'prescriber', pharmacy: 'pharmacy', purpose: 'purpose',
  notes: 'notes', provider: 'provider', clinic: 'clinic', address: 'address',
  phone: 'phone', fax: 'fax', portal_url: 'portal', reaction: 'reaction',
  location: 'location', post_notes: 'notes', questions: 'questions',
  content: 'content', tags: 'tags', outcome: 'outcome', implication: 'implication',
  action_required: 'action required', reason: 'reason',
  against: 'against', subject: 'subject', facility: 'facility', surgeon: 'surgeon',
  website: 'website', plan_name: 'plan', provider_name: 'provider',
  policy_number: 'policy #', category: 'category', status: 'status',
};

// Aliases: natural language → stored field values
const SEARCH_ALIASES = {
  'heart': ['hr', 'heart rate'],
  'heart rate': ['hr'],
  'heartrate': ['hr'],
  'blood pressure': ['bp'],
  'bp': ['bp', 'blood pressure'],
  'oxygen': ['spo2', 'oxygen saturation'],
  'blood oxygen': ['spo2'],
  'spo2': ['spo2', 'oxygen'],
  'respiratory': ['resp', 'respiratory rate'],
  'breathing': ['resp'],
  'temperature': ['temp'],
  'temp': ['temp', 'temperature'],
  'weight': ['weight', 'body mass'],
  'steps': ['steps', 'Daily Activity'],
  'step': ['steps', 'Daily Activity'],
  'calories': ['calories', 'kcal', 'active energy'],
  'glucose': ['glucose', 'blood sugar'],
  'blood sugar': ['glucose'],
  'sleep': ['sleep'],
  'pain': ['pain'],
  'mood': ['mood'],
  'energy': ['energy'],
  'running': ['Running', 'run'],
  'run': ['Running', 'run'],
  'walking': ['Walking', 'walk'],
  'walk': ['Walking', 'walk'],
  'yoga': ['Yoga'],
  'cycling': ['Cycling', 'bike'],
  'strength': ['Strength Training', 'strength'],
  'hiking': ['Hiking', 'hike'],
};

function expandQuery(q) {
  const terms = [q];
  // Check exact match first, then prefix match
  for (const [alias, expansions] of Object.entries(SEARCH_ALIASES)) {
    if (q === alias || alias.startsWith(q) || q.startsWith(alias)) {
      for (const e of expansions) {
        if (!terms.includes(e.toLowerCase())) terms.push(e.toLowerCase());
      }
    }
  }
  return terms;
}

export function searchEntities(data, query) {
  if (!query || query.length < 2) return [];

  const q = query.toLowerCase();
  const searchTerms = expandQuery(q);
  const results = [];

  for (const [entityKey, config] of Object.entries(ENTITY_CONFIG)) {
    const items = data[entityKey];
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      let matchedField = null;
      let matchedValue = null;

      for (const field of config.fields) {
        const val = item[field];
        if (!val) continue;
        const valLower = String(val).toLowerCase();
        if (searchTerms.some(t => valLower.includes(t))) {
          matchedField = field;
          matchedValue = String(val);
          break;
        }
      }

      // Search inside journal symptoms array (JSONB)
      if (!matchedField && entityKey === 'journal' && Array.isArray(item.symptoms)) {
        const sym = item.symptoms.find(s => s.name && searchTerms.some(t => s.name.toLowerCase().includes(t)));
        if (sym) {
          matchedField = 'symptoms';
          matchedValue = sym.name + ' (' + sym.severity + '/10)';
        }
      }

      if (matchedField) {
        // Check if the match is already visible in primary/secondary text
        const pri = String(config.primary(item) || '').toLowerCase();
        const sec = String(config.secondary(item) || '').toLowerCase();
        const visibleInDisplay = searchTerms.some(t => pri.includes(t) || sec.includes(t));

        results.push({
          entityKey,
          item,
          config,
          id: item[config.idField] || item._key,
          matchContext: visibleInDisplay ? null : {
            label: FIELD_LABELS[matchedField] || matchedField,
            value: matchedValue,
          },
        });
      }
    }
  }

  return results;
}
