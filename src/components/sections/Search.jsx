import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search as SearchIcon, Pill, Stethoscope, User, Shield, Calendar,
  BookOpen, FlaskConical, Building2, Syringe, ShieldCheck, AlertTriangle,
  AlertOctagon, Scale, PlaneTakeoff, BadgeDollarSign, Activity, ChevronRight,
} from 'lucide-react';
import Card from '../ui/Card';
import { C } from '../../constants/colors';

/* ── Entity search config ────────────────────────────────── */

const ENTITY_CONFIG = {
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
    fields: ['title', 'content', 'tags'],
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
    fields: ['item', 'category', 'notes', 'recommendation'],
    primary: g => g.item || g.name,
    secondary: g => g.urgency || '',
    idField: 'id',
  },
  anesthesia_flags: {
    label: 'Anesthesia',
    icon: AlertOctagon,
    color: C.rose,
    tab: 'anesthesia',
    fields: ['condition', 'implication', 'notes', 'precaution'],
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
    secondary: s => [s.surgeon, s.date].filter(Boolean).join(' · '),
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
    fields: ['type', 'notes'],
    primary: v => `${v.type || 'Vital'}: ${v.value || ''}${v.unit ? ' ' + v.unit : ''}`,
    secondary: v => v.date || '',
    idField: 'id',
  },
};

/* ── Filter pill categories ──────────────────────────────── */

const FILTER_TABS = [
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

const MORE_CATEGORIES = [
  'allergies', 'procedures', 'immunizations', 'care_gaps',
  'anesthesia_flags', 'appeals_and_disputes', 'surgical_planning',
  'insurance', 'vitals',
];

/* ── Helpers ─────────────────────────────────────────────── */

function highlightMatch(text, query) {
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

function searchEntities(data, query) {
  if (!query || query.length < 2) return [];

  const q = query.toLowerCase();
  const results = [];

  for (const [entityKey, config] of Object.entries(ENTITY_CONFIG)) {
    const items = data[entityKey];
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const matched = config.fields.some(field => {
        const val = item[field];
        if (!val) return false;
        return String(val).toLowerCase().includes(q);
      });

      if (matched) {
        results.push({
          entityKey,
          item,
          config,
          id: item[config.idField] || item._key,
        });
      }
    }
  }

  return results;
}

/* ── Component ───────────────────────────────────────────── */

export default function Search({ data, onNav }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce search input
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Search across all entities
  const allResults = useMemo(
    () => searchEntities(data, debouncedQuery),
    [data, debouncedQuery]
  );

  // Filter results by selected category
  const filteredResults = useMemo(() => {
    if (filter === 'all') return allResults;
    if (filter === 'more') return allResults.filter(r => MORE_CATEGORIES.includes(r.entityKey));
    return allResults.filter(r => r.entityKey === filter);
  }, [allResults, filter]);

  // Count per category for pills
  const counts = useMemo(() => {
    const c = {};
    for (const r of allResults) {
      c[r.entityKey] = (c[r.entityKey] || 0) + 1;
    }
    // Aggregate "more" count
    c.more = MORE_CATEGORIES.reduce((sum, key) => sum + (c[key] || 0), 0);
    c.all = allResults.length;
    return c;
  }, [allResults]);

  const handleResultClick = (result) => {
    onNav(result.config.tab, { highlightId: result.id });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (query) {
        setQuery('');
      } else {
        onNav('dash');
      }
    }
  };

  return (
    <div className="mt-1">
      {/* ── Search Input ─────────────────────────── */}
      <div className="relative mb-4">
        <SearchIcon
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-salve-textFaint pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search medications, providers, labs..."
          aria-label="Search your health data"
          className="w-full bg-salve-card2 border border-salve-border rounded-xl py-3 pl-10 pr-4 text-sm text-salve-text placeholder:text-salve-textFaint font-montserrat field-magic outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-salve-textFaint hover:text-salve-textMid bg-transparent border-none cursor-pointer p-1 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Filter Pills ─────────────────────────── */}
      {allResults.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar">
          {FILTER_TABS.map(t => {
            const count = counts[t.key] || 0;
            if (t.key !== 'all' && count === 0) return null;
            const isActive = filter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`flex-shrink-0 py-1.5 px-3 rounded-full text-[11px] font-medium border transition-colors ${
                  isActive
                    ? 'border-salve-sage bg-salve-sage/15 text-salve-sage'
                    : 'border-salve-border text-salve-textFaint hover:text-salve-textMid'
                }`}
              >
                {t.label}{count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Results ──────────────────────────────── */}
      {debouncedQuery.length >= 2 ? (
        filteredResults.length > 0 ? (
          <div>
            {filteredResults.map((r, i) => {
              const Icon = r.config.icon;
              return (
                <Card
                  key={`${r.entityKey}-${r.id}-${i}`}
                  onClick={() => handleResultClick(r)}
                  className="!p-3 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${r.config.color}15` }}
                    >
                      <Icon size={15} color={r.config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-salve-text font-medium truncate">
                        {highlightMatch(r.config.primary(r.item), debouncedQuery)}
                      </div>
                      {r.config.secondary(r.item) && (
                        <div className="text-[11px] text-salve-textFaint truncate mt-0.5">
                          {highlightMatch(r.config.secondary(r.item), debouncedQuery)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="text-[9px] font-semibold px-2 py-0.5 rounded-full tracking-wide"
                        style={{ background: `${r.config.color}15`, color: r.config.color }}
                      >
                        {r.config.label}
                      </span>
                      <ChevronRight size={13} className="text-salve-textFaint" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 px-6 text-salve-textFaint">
            <SearchIcon size={32} strokeWidth={1} className="mx-auto mb-3 opacity-35" />
            <div className="text-sm font-light">No matches for &ldquo;{debouncedQuery}&rdquo;</div>
            <div className="text-xs mt-1 text-salve-textFaint/60">Try a different spelling or keyword</div>
          </div>
        )
      ) : (
        <div className="text-center py-16 px-6 text-salve-textFaint">
          <SearchIcon size={32} strokeWidth={1} className="mx-auto mb-3 opacity-35" />
          <div className="text-sm font-light">Search across all your health data</div>
          <div className="text-xs mt-2 text-salve-textFaint/60 leading-relaxed">
            Medications, providers, pharmacies, conditions,<br />
            labs, journal entries, and more
          </div>
        </div>
      )}
    </div>
  );
}
