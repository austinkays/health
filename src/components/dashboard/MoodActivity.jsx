import { ChevronRight, Zap } from 'lucide-react';
import Reveal from '../ui/Reveal';
import Card from '../ui/Card';
import { C } from '../../constants/colors';

export function MoodSnapshot({ snapshot, onNav }) {
  if (!snapshot) return null;
  return (
    <Reveal as="section" aria-label="Mood this week" className="mb-2">
      <Card className="!p-4 md:!p-5 cursor-pointer" onClick={() => onNav('journal')}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-ui-sm text-salve-textMid font-montserrat tracking-wider uppercase">Mood</span>
            <span className="text-ui-xs text-salve-textFaint font-montserrat">last 7 days</span>
          </div>
          <ChevronRight size={12} className="text-salve-textFaint" />
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-[22px] leading-none">{snapshot.latest.emoji}</span>
          <span className="text-[15px] text-salve-textMid font-montserrat">{snapshot.latest.mood.split(' ').slice(1).join(' ')}</span>
          <span className="text-[13px] text-salve-textFaint font-montserrat ml-auto">{snapshot.avgLabel} avg</span>
        </div>
        <div className="flex items-end gap-1 h-10 mb-1">
          {snapshot.days.map((d, i) => {
            const isToday = i === 6;
            const barH = d.score ? Math.round((d.score / 5) * 32) : 2;
            const barColor = d.color === 'sage' ? C.sage : d.color === 'amber' ? C.amber : d.color === 'rose' ? C.rose : C.textFaint;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${barH}px`,
                    background: d.score ? (isToday ? barColor : `${barColor}55`) : C.border,
                  }}
                />
                <span className="text-[8px] font-montserrat" style={{ color: isToday ? barColor : C.textFaint }}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
        {snapshot.count >= 3 && (
          <div className="mt-2 pt-2 border-t border-salve-border">
            <span className="text-[13px] text-salve-textFaint font-montserrat">{snapshot.count} entries this week</span>
          </div>
        )}
      </Card>
    </Reveal>
  );
}

export function ActivitySnapshot({ snapshot, onNav }) {
  if (!snapshot) return null;
  return (
    <Reveal as="section" aria-label="Recent activity" className="mb-2">
      <Card className="!p-4 md:!p-5 cursor-pointer" onClick={() => onNav('activities')}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-ui-sm text-salve-textMid font-montserrat tracking-wider uppercase">Activity</span>
            <span className="text-ui-xs text-salve-textFaint font-montserrat">last 7 days</span>
          </div>
          <ChevronRight size={12} className="text-salve-textFaint" />
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-display-hero font-medium text-salve-text font-montserrat">{snapshot.count}</span>
          <span className="text-[15px] text-salve-textMid font-montserrat">session{snapshot.count !== 1 ? 's' : ''}</span>
          {snapshot.totalMinutes > 0 && (
            <>
              <span className="text-salve-textFaint/40 text-[15px]">·</span>
              <span className="text-[15px] text-salve-textMid font-montserrat">
                {snapshot.totalMinutes >= 60
                  ? `${Math.floor(snapshot.totalMinutes / 60)}h ${snapshot.totalMinutes % 60}m`
                  : `${snapshot.totalMinutes}m`}
              </span>
            </>
          )}
        </div>
        {/* 7-day bar chart */}
        <div className="flex items-end gap-1 h-10 mb-1">
          {snapshot.dayBars.map((bar, i) => {
            const maxMins = Math.max(...snapshot.dayBars.map(b => b.mins), 1);
            const pct = bar.mins > 0 ? Math.max(bar.mins / maxMins, 0.12) : 0;
            const isToday = i === 6;
            return (
              <div key={bar.date} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: bar.mins > 0 ? `${Math.round(pct * 32)}px` : '2px',
                    background: bar.mins > 0 ? (isToday ? C.sage : `${C.sage}55`) : `${C.border}`,
                  }}
                />
                <span className="text-[8px] font-montserrat" style={{ color: isToday ? C.sage : C.textFaint }}>
                  {bar.label}
                </span>
              </div>
            );
          })}
        </div>
        {snapshot.totalCalories > 0 && (
          <div className="mt-2 pt-2 border-t border-salve-border flex items-center gap-1.5">
            <Zap size={11} className="text-salve-amber" />
            <span className="text-[13px] text-salve-textFaint font-montserrat">{Math.round(snapshot.totalCalories).toLocaleString()} cal active</span>
          </div>
        )}
      </Card>
    </Reveal>
  );
}
