import { useState, useEffect } from 'react';
import { ChevronLeft, Search, Leaf } from 'lucide-react';

function SplitGreeting({ name }) {
  const words = ['Hello,', name || 'there'];
  return (
    <>
      {words.map((w, i) => (
        <span
          key={i}
          className="split-word text-gradient-magic"
          style={{ animationDelay: `${i * 0.14}s` }}
        >
          {w}{i < words.length - 1 && '\u00A0'}
        </span>
      ))}
    </>
  );
}

const AFFIRMATIONS = [
  'Your health, your story, your power.',
  'Small steps, steady progress.',
  'Showing up today is enough.',
  'Your body is keeping track.',
  'Progress, not perfection.',
  'One breath at a time.',
  "You're the expert on you.",
  'Rest is productive, too.',
  'Listen gently, respond kindly.',
  'Every data point is a clue.',
  'You know your body best.',
  'Slow is smooth, smooth is steady.',
  'Today, whatever you can is plenty.',
  'Curious, not critical.',
  "You've carried more than anyone sees.",
  'Patterns take time to appear.',
  'Softness is a strategy.',
  'Pacing is power.',
  'Notice without judgment.',
  'The quiet days count, too.',
  'Tend to yourself like a garden.',
  'Your baseline is allowed to move.',
  'Healing is not a straight line.',
  'Presence over performance.',
];

function CyclingTagline() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * AFFIRMATIONS.length));
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce) return;
    const id = setInterval(() => setIdx(i => (i + 1) % AFFIRMATIONS.length), 120000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="tagline-slot mt-1.5 text-display-sub text-salve-textFaint font-light italic">
      <span key={idx} className="tagline-slot-item">{AFFIRMATIONS[idx]}</span>
    </div>
  );
}

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
  insights: 'Insights',
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
  feedback: 'Feedback',
  formhelper: 'Scribe',
  news: 'News',
  aboutme: 'About Me',
};

export default function Header({ tab, name, onBack, onSearch, onSage, action }) {
  const isDash = tab === 'dash';
  const isSearch = tab === 'search';
  const isSage = tab === 'ai';

  return (
    <header className="px-6 pt-[calc(env(safe-area-inset-top,0px)+1.75rem)] pb-5 relative md:pt-8 md:pb-6">
      <div className="flex items-center gap-2.5">
        {/* Back button: visible on mobile, hidden on md+ (sidebar provides nav context) */}
        {!isDash && (
          <button onClick={onBack} aria-label="Go back" className="bg-transparent border-none text-salve-textMid cursor-pointer p-1 flex md:hidden">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="flex-1">
          <h1 className={`font-playfair m-0 text-salve-text ${isDash ? 'text-display-xl font-semibold md:font-normal' : 'text-display-lg font-semibold'}`}>
            {isDash ? (
              <SplitGreeting name={name} />
            ) : (
              TAB_LABELS[tab] || tab
            )}
          </h1>
          {isDash && <CyclingTagline />}
        </div>
        {action}
        {!isSage && onSage && (
          <button onClick={onSage} aria-label="Open Sage" className="bg-transparent border-none text-salve-textMid hover:text-salve-sage cursor-pointer p-1.5 flex transition-colors md:hidden">
            <Leaf size={18} />
          </button>
        )}
        {/* Search: icon on mobile, hidden on md+ (sidebar has search) */}
        {!isSearch && (
          <button onClick={onSearch} aria-label="Search" className="bg-transparent border-none text-salve-textMid hover:text-salve-lav cursor-pointer p-1.5 flex transition-colors md:hidden">
            <Search size={18} />
          </button>
        )}
      </div>
    </header>
  );
}
