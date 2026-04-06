import { Home, Pill, Heart, Leaf, BookOpen, Settings as SettingsIcon, Search } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dash', label: 'Home', icon: Home },
  { id: 'meds', label: 'Medications', icon: Pill },
  { id: 'vitals', label: 'Vitals', icon: Heart },
  { id: 'ai', label: 'Sage', icon: Leaf },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function SideNav({ tab, onNav, onSearch, name }) {
  return (
    <nav
      aria-label="Main navigation"
      className="hidden md:flex fixed left-0 top-0 h-full w-[220px] bg-salve-card border-r border-salve-border flex-col z-40"
    >
      {/* App name / branding */}
      <div className="px-5 pt-7 pb-5">
        <h2 className="font-playfair text-xl font-semibold text-gradient-magic m-0">Salve</h2>
        {name && (
          <p className="text-salve-textFaint text-xs mt-1 truncate">{name}</p>
        )}
      </div>

      {/* Search button */}
      <button
        onClick={onSearch}
        className="mx-3 mb-2 px-3 py-2 flex items-center gap-2.5 rounded-lg text-salve-textMid hover:bg-salve-bg hover:text-salve-lav transition-colors cursor-pointer bg-transparent border border-salve-border text-sm"
      >
        <Search size={16} />
        <span className="flex-1 text-left">Search</span>
        <kbd className="text-[10px] text-salve-textFaint bg-salve-bg px-1.5 py-0.5 rounded border border-salve-border font-montserrat">⌘K</kbd>
      </button>

      {/* Nav items */}
      <div className="flex-1 flex flex-col gap-0.5 px-2 mt-2">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer bg-transparent border-none text-left transition-all duration-150 ${
                active
                  ? 'bg-salve-lav/10 text-salve-lav border-l-[3px] border-l-salve-lav pl-[9px]'
                  : 'text-salve-textMid hover:bg-salve-bg hover:text-salve-text'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.5} />
              <span className={`text-sm ${active ? 'font-semibold' : 'font-normal'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer tagline */}
      <div className="px-5 pb-5 pt-3">
        <p className="text-salve-textFaint text-[9px] tracking-wider leading-relaxed text-center font-montserrat">
          made with love for my<br />best friend & soulmate
        </p>
      </div>
    </nav>
  );
}
