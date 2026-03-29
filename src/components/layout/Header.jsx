import { ChevronLeft } from 'lucide-react';
import Motif from '../ui/Motif';

const TAB_LABELS = {
  dash: 'Home',
  meds: 'Meds',
  vitals: 'Vitals',
  appts: 'Visits',
  ai: 'AI Companion',
  conditions: 'Conditions',
  providers: 'Providers',
  allergies: 'Allergies',
  journal: 'Journal',
  settings: 'Settings',
};

export default function Header({ tab, name, onBack }) {
  const isDash = tab === 'dash';

  return (
    <div className="px-6 pt-7 pb-5 relative overflow-hidden">
      {/* Decorative */}
      <div className="absolute top-2 right-5 opacity-10 text-[72px] text-salve-sage select-none pointer-events-none">☕</div>
      <div className="absolute top-12 right-14 opacity-[0.07] text-lg text-salve-lav select-none pointer-events-none">✦</div>

      <div className="flex items-center gap-2.5">
        {!isDash && (
          <button onClick={onBack} className="bg-transparent border-none text-salve-textMid cursor-pointer p-1 flex">
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
    </div>
  );
}
