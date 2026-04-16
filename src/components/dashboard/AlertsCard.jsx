import { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import Card from '../ui/Card';

export default function AlertsCard({ alerts, onDismiss, onNav }) {
  const [showDismissMenu, setShowDismissMenu] = useState(false);
  if (alerts.length === 0) return null;

  const dismiss = (duration) => {
    onDismiss(duration);
    setShowDismissMenu(false);
  };

  return (
    <section aria-label="Needs attention" className="dash-stagger dash-stagger-3 mb-4 md:mb-6">
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 md:px-5 py-2.5 border-b border-salve-border/50">
          <span className="text-ui-sm text-salve-textFaint font-montserrat tracking-widest uppercase">Needs attention</span>
          <button
            onClick={() => setShowDismissMenu(!showDismissMenu)}
            className="p-1 -mr-1 rounded-md hover:bg-salve-card2 text-salve-textFaint transition-colors"
            aria-label="Dismiss alerts"
          >
            <X size={13} />
          </button>
        </div>
        {showDismissMenu && (
          <div className="flex items-center gap-1.5 px-4 py-2 bg-salve-card2/50 border-b border-salve-border/50">
            <span className="text-[10.5px] text-salve-textFaint mr-auto">Hide for:</span>
            <button onClick={() => dismiss(86400000)} className="text-[10.5px] px-2 py-1 rounded-md bg-salve-card text-salve-textMid border border-salve-border hover:border-salve-lav/30 transition-colors">1 day</button>
            <button onClick={() => dismiss(604800000)} className="text-[10.5px] px-2 py-1 rounded-md bg-salve-card text-salve-textMid border border-salve-border hover:border-salve-lav/30 transition-colors">1 week</button>
            <button onClick={() => dismiss('forever')} className="text-[10.5px] px-2 py-1 rounded-md bg-salve-card text-salve-textMid border border-salve-border hover:border-salve-lav/30 transition-colors">Always</button>
          </div>
        )}
        {alerts.map((a, i) => (
          <button
            key={a.id}
            onClick={() => onNav(a.nav, a.highlightId ? { highlightId: a.highlightId } : undefined)}
            className={`w-full flex items-center gap-fluid-sm px-4 md:px-5 py-3 md:py-3.5 bg-transparent border-0 cursor-pointer alert-row transition-colors ${i < alerts.length - 1 ? 'border-b border-salve-border' : ''}`}
          >
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
            <a.icon size={14} color={a.color} className="flex-shrink-0" />
            <span className="text-ui-md text-salve-textMid text-left flex-1">{a.text}</span>
            <ChevronRight size={13} className="text-salve-textFaint flex-shrink-0" />
          </button>
        ))}
      </Card>
    </section>
  );
}
