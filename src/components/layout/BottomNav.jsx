import { useState, useEffect } from 'react';
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
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    let ticking = false;
    const check = () => {
      const scrollY = window.scrollY || window.pageYOffset;
      const nearBottom = window.innerHeight + scrollY >= document.body.scrollHeight - 50;
      setAtBottom(nearBottom);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(check);
      }
    };
    // Check immediately on mount (handles short pages already at bottom)
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Re-check when tab changes (content height changes)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const scrollY = window.scrollY || window.pageYOffset;
      setAtBottom(window.innerHeight + scrollY >= document.body.scrollHeight - 50);
    });
    return () => cancelAnimationFrame(id);
  }, [tab]);

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50">
      <p className={`text-center text-salve-textFaint text-[9px] tracking-wider py-1 font-montserrat transition-all duration-500 ease-out ${atBottom ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        made with love for my best friend & soulmate
      </p>
    <nav aria-label="Main navigation" className="w-full bg-salve-card border-t border-salve-border flex justify-around py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {NAV_ITEMS.map(t => {
        const Icon = t.icon;
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onNav(t.id)}
            aria-current={active ? 'page' : undefined}
            aria-label={t.label}
            className={`bg-transparent border-none cursor-pointer flex flex-col items-center gap-0.5 px-2.5 py-1 nav-item-magic ${active ? 'text-salve-sage' : 'text-salve-textFaint'}`}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.4} />
            <span className={`text-[10px] tracking-wide ${active ? 'font-semibold' : 'font-normal'}`}>{t.label}</span>
            {active && <div className="w-1 h-1 rounded-full bg-salve-sage -mt-0.5 shadow-[0_0_6px_rgba(143,191,160,0.5)]" />}
          </button>
        );
      })}
    </nav>
    </div>
  );
}
