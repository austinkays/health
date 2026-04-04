import { ChevronLeft, Search } from 'lucide-react';
import Motif from '../ui/Motif';

const TAB_LABELS = {
  dash: 'Home',
  meds: 'Medications',
  vitals: 'Vitals',
  appts: 'Visits',
  ai: 'Sage',
  conditions: 'Conditions',
  providers: 'Providers',
  allergies: 'Allergies',
  journal: 'Journal',
  settings: 'Settings',
  labs: 'Labs',
  procedures: 'Procedures',
  immunizations: 'Vaccines',
  care_gaps: 'Care Gaps',
  anesthesia: 'Anesthesia Flags',
  appeals: 'Appeals',
  surgical: 'Surgery Plan',
  insurance: 'Insurance',
  interactions: 'Interactions',
  search: 'Search',
  cycles: 'Cycle Tracker',
  pharmacies: 'Pharmacies',
  todos: "To-Do's",
  genetics: 'Genetics',
  activities: 'Activities',
  sleep: 'Sleep',
  hub_records: 'Records',
  hub_care: 'Care Team',
  hub_tracking: 'Tracking',
  hub_safety: 'Safety',
  hub_plans: 'Plans',
  hub_devices: 'Devices',
  oura: 'Oura Ring',
  apple_health: 'Apple Health',
  summary: 'Health Summary',
  legal: 'Legal',
};

const TAB_DECOR = {
  dash:          ['☽', '✧', '·'],
  ai:            ['✦', '☽', '·'],
  meds:          ['✿', '✧', '·'],
  vitals:        ['✧', '·', '☽'],
  journal:       ['☽', '✦', '✿'],
  conditions:    ['✿', '·', '✧'],
  allergies:     ['✦', '✧', '·'],
  settings:      ['✧', '·', '☽'],
  labs:          ['✿', '✦', '·'],
  procedures:    ['☽', '·', '✧'],
  immunizations: ['✦', '✧', '·'],
  care_gaps:     ['✿', '·', '✧'],
  anesthesia:    ['☽', '✦', '·'],
  appeals:       ['✧', '·', '✿'],
  surgical:      ['✦', '☽', '·'],
  insurance:     ['✿', '·', '☽'],
  interactions:  ['✧', '✦', '·'],
  providers:     ['☽', '·', '✧'],
  cycles:        ['♀', '☽', '·'],
  appts:         ['✿', '✦', '·'],
  search:        ['✦', '·', '✧'],
  pharmacies:    ['✿', '·', '☽'],
  todos:         ['✓', '·', '✧'],
  genetics:      ['✧', '✦', '·'],
  activities:    ['♡', '·', '✧'],
  sleep:         ['☽', '✧', '·'],
  hub_records:   ['✦', '·', '✧'],
  hub_care:      ['✿', '·', '✧'],
  hub_tracking:  ['♡', '·', '✧'],
  hub_safety:    ['✧', '·', '✦'],
  hub_plans:     ['✓', '·', '✧'],
  hub_devices:   ['◉', '·', '✧'],
  oura:          ['◉', '·', '✧'],
  apple_health:  ['✿', '·', '✧'],
  summary:       ['☽', '✧', '✿'],
  legal:         ['✧', '·', '☽'],
};

export default function Header({ tab, name, onBack, onSearch, action }) {
  const isDash = tab === 'dash';
  const isSearch = tab === 'search';
  const decor = TAB_DECOR[tab] || ['☽', '✧', '·'];

  return (
    <header className="px-6 pt-[calc(env(safe-area-inset-top,0px)+1.75rem)] pb-5 relative overflow-hidden">
      {/* Decorative constellation — per-section glyphs */}
      <div className="absolute top-2 right-16 opacity-[0.10] text-[52px] select-none pointer-events-none leading-none text-salve-lav">{decor[0]}</div>
      <div className="absolute top-14 right-24 opacity-[0.08] text-base text-salve-lav select-none pointer-events-none">{decor[1]}</div>
      <div className="absolute top-6 right-20 opacity-[0.06] text-[10px] text-salve-sage select-none pointer-events-none">{decor[2]}</div>

      <div className="flex items-center gap-2.5">
        {!isDash && (
          <button onClick={onBack} aria-label="Go back" className="bg-transparent border-none text-salve-textMid cursor-pointer p-1 flex">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="flex-1">
          <h1 className={`font-playfair font-semibold m-0 text-salve-text ${isDash ? 'text-2xl' : 'text-xl'}`}>
            {isDash ? (
              <>Hello, {name || 'there'} <Motif type="sparkle" size={16} color="#8fbfa0" style={{ marginLeft: 4 }} /></>
            ) : (
              TAB_LABELS[tab] || tab
            )}
          </h1>
          {isDash && (
            <p className="m-0 mt-1 text-[13px] text-salve-textFaint font-light italic">
              Your health, your story, your power.
            </p>
          )}
        </div>
        {action}
        {!isSearch && (
          <button onClick={onSearch} aria-label="Search" className="bg-transparent border-none text-salve-textMid hover:text-salve-lav cursor-pointer p-1.5 flex transition-colors">
            <Search size={18} />
          </button>
        )}
      </div>
    </header>
  );
}
