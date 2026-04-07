import { Home, Pill, Heart, Leaf, BookOpen, Settings as SettingsIcon, Search, Sparkles, ClipboardPaste } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dash', label: 'Home', icon: Home, key: '1' },
  { id: 'meds', label: 'Medications', icon: Pill, key: '2' },
  { id: 'vitals', label: 'Vitals', icon: Heart, key: '3' },
  { id: 'ai', label: 'Sage', icon: Leaf, key: '4' },
  { id: 'formhelper', label: 'Form Helper', icon: ClipboardPaste, key: '5' },
  { id: 'journal', label: 'Journal', icon: BookOpen, key: '6' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, key: '7' },
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const MOD_KEY = isMac ? '⌘' : 'Ctrl+';

export default function SideNav({ tab, onNav, onSearch, onSage, name, demoMode, onExitDemo }) {
  return (
    <nav
      aria-label="Main navigation"
      className="hidden md:flex fixed left-0 top-0 h-full w-[260px] bg-salve-card border-r border-salve-border flex-col z-40"
    >
      {/* App name / branding */}
      <div className="px-6 pt-8 pb-4">
        <h2 className="font-playfair text-2xl font-semibold text-gradient-magic m-0">Salve</h2>
        {name && (
          <p className="text-salve-textFaint text-sm mt-1.5 truncate">{name}</p>
        )}
      </div>

      {/* Search */}
      <div className="mx-4 mb-2">
        <button
          onClick={onSearch}
          className="w-full px-3.5 py-2.5 flex items-center gap-2.5 rounded-lg text-salve-textMid hover:bg-salve-bg hover:text-salve-lav transition-colors cursor-pointer bg-transparent border border-salve-border text-sm"
        >
          <Search size={16} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[10px] text-salve-textFaint bg-salve-bg px-1.5 py-0.5 rounded border border-salve-border font-montserrat">{MOD_KEY}K</kbd>
        </button>
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-0.5 px-3 mt-1">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg cursor-pointer bg-transparent border-none text-left transition-all duration-150 ${
                active
                  ? 'bg-salve-lav/10 text-salve-lav border-l-[3px] border-l-salve-lav pl-[11px]'
                  : 'text-salve-textMid hover:bg-salve-bg hover:text-salve-text'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.5} />
              <span className={`text-[14px] flex-1 ${active ? 'font-semibold' : 'font-normal'}`}>
                {item.label}
              </span>
              {!active && (
                <kbd className="text-[10px] text-salve-textFaint/40 font-montserrat leading-none">{item.key}</kbd>
              )}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Demo mode card */}
      {demoMode && (
        <div className="mx-3 mb-3 px-3 py-2.5 bg-salve-lav/10 border border-salve-lav/25 rounded-xl">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-salve-lav flex-shrink-0" aria-hidden="true" />
            <span className="text-[13px] font-semibold text-salve-text flex-1">Demo mode</span>
            <button
              onClick={onExitDemo}
              className="bg-salve-lav text-white rounded-lg text-[11px] font-semibold px-3 py-1 border-none cursor-pointer hover:opacity-90 transition-opacity font-montserrat flex-shrink-0"
            >
              Sign up →
            </button>
          </div>
          <p className="text-[11px] text-salve-textFaint leading-snug m-0 mt-1 pl-5">
            Exploring with sample data.
          </p>
        </div>
      )}
    </nav>
  );
}
