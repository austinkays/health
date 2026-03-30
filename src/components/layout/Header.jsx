import { ChevronLeft } from 'lucide-react';
import Motif from '../ui/Motif';

const TAB_LABELS = {
  dash: 'Home',
  meds: 'Remedies',
  vitals: 'Vitals',
  appts: 'Visits',
  ai: 'The Familiar',
  conditions: 'Conditions',
  providers: 'Providers',
  allergies: 'Allergies',
  journal: 'Grimoire',
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
};

const TAB_DECOR = {
  ai:       ['🔮', '✦', '·'],
  meds:     ['🌿', '✦', '·'],
  vitals:   ['🕯️', '✧', '·'],
  journal:  ['📜', '✦', '☽'],
  conditions: ['🫀', '·', '✧'],
  allergies:  ['⚗️', '✦', '·'],
  settings: ['⚙️', '·', '✧'],
  labs:     ['🧪', '✦', '·'],
  procedures: ['🩺', '·', '✧'],
  immunizations: ['💉', '✦', '·'],
  care_gaps: ['🛡️', '·', '✧'],
  anesthesia: ['😴', '✦', '·'],
  appeals:  ['📋', '·', '✧'],
  surgical: ['🔪', '✦', '·'],
  insurance: ['🏥', '·', '✧'],
  interactions: ['⚠️', '✦', '·'],
  providers: ['👩‍⚕️', '·', '✧'],
  appts:    ['📅', '✦', '·'],
  dash:     ['☽', '✦', '·'],
};

export default function Header({ tab, name, onBack }) {
  const isDash = tab === 'dash';
  const decor = TAB_DECOR[tab] || ['☽', '✦', '·'];

  return (
    <header className="px-6 pt-7 pb-5 relative overflow-hidden">
      {/* Decorative constellation — per-section glyphs */}
      <div className="absolute top-1 right-4 opacity-[0.14] text-[64px] select-none pointer-events-none leading-none">{decor[0]}</div>
      <div className="absolute top-14 right-16 opacity-[0.08] text-base text-salve-lav select-none pointer-events-none">{decor[1]}</div>
      <div className="absolute top-6 right-10 opacity-[0.06] text-[10px] text-salve-sage select-none pointer-events-none">{decor[2]}</div>

      <div className="flex items-center gap-2.5">
        {!isDash && (
          <button onClick={onBack} aria-label="Go back" className="bg-transparent border-none text-salve-textMid cursor-pointer p-1 flex">
            <ChevronLeft size={20} />
          </button>
        )}
        <div>
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
      </div>
    </header>
  );
}
