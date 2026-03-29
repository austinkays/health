import { Home, Pill, Heart, Sparkles, BookOpen, Settings as SettingsIcon } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dash', label: 'Home', icon: Home },
  { id: 'meds', label: 'Meds', icon: Pill },
  { id: 'vitals', label: 'Vitals', icon: Heart },
  { id: 'ai', label: 'Insight', icon: Sparkles },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function BottomNav({ tab, onNav }) {
  return (
    <nav aria-label="Main navigation" className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-salve-card border-t border-salve-border flex justify-around py-2 pb-3 z-50">
      {NAV_ITEMS.map(t => {
        const Icon = t.icon;
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onNav(t.id)}
            aria-current={active ? 'page' : undefined}
            aria-label={t.label}
            className={`bg-transparent border-none cursor-pointer flex flex-col items-center gap-0.5 px-2.5 py-1 transition-colors ${active ? 'text-salve-sage' : 'text-salve-textFaint'}`}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.4} />
            <span className={`text-[10px] tracking-wide ${active ? 'font-semibold' : 'font-normal'}`}>{t.label}</span>
            {active && <div className="w-1 h-1 rounded-full bg-salve-sage -mt-0.5" />}
          </button>
        );
      })}
    </nav>
  );
}
