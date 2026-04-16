import { ChevronRight } from 'lucide-react';
import Reveal from '../ui/Reveal';
import Card from '../ui/Card';
import { C } from '../../constants/colors';
import { VITAL_TYPES } from '../../constants/defaults';

export default function VitalsSnapshot({ snapshot, chartsReady, chartsRef, onNav }) {
  if (!snapshot || !snapshot.featured) return null;
  const f = snapshot.featured;
  const fType = VITAL_TYPES.find(t => t.id === f.type);
  const fLabel = fType?.label || f.type;
  const fUnit = fType?.unit || f.unit || '';
  const fDisplay = f.type === 'bp' && f.value2 ? `${f.value}/${f.value2}` : f.value;
  const fHasChart = f.series && f.series.length >= 2;
  const fmtNum = (n) => {
    if (n === null || n === undefined) return ', ';
    return Math.abs(n) >= 10 ? Math.round(n).toString() : n.toFixed(1);
  };
  const captionText = (() => {
    if (f.delta === null || f.recentAvg === null) return null;
    if (f.direction === 'flat') return 'In line with your 7-day average';
    const absDelta = Math.abs(f.delta);
    const dir = f.direction === 'up' ? 'above' : 'below';
    return `${fmtNum(absDelta)}${fUnit ? ` ${fUnit}` : ''} ${dir} your 7-day average`;
  })();
  const fSignalColor = f.signal === 'good' ? C.sage : f.signal === 'watch' ? C.amber : C.textMid;
  const fArrow = f.direction === 'up' ? '↑' : f.direction === 'down' ? '↓' : '→';
  return (
    <Reveal as="section" aria-label="Recent vitals" className="mb-2">
      <Card className="!p-4 md:!p-6 cursor-pointer" onClick={() => onNav('vitals')}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-ui-sm text-salve-textMid font-montserrat tracking-wider uppercase">Recent Vitals</span>
            <span className="text-ui-xs text-salve-textFaint font-montserrat">last 14 days</span>
          </div>
          <ChevronRight size={12} className="text-salve-textFaint" />
        </div>
        <div className="mb-3">
          <div className="text-ui-xs text-salve-textFaint font-montserrat uppercase tracking-wider mb-1">{fLabel}</div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="text-display-hero font-medium text-salve-text font-montserrat">{fDisplay}</div>
            <div className="text-ui-md text-salve-textMid font-montserrat">{fUnit}</div>
          </div>
          {fHasChart && chartsReady && (() => {
            const { AreaChart, Area, ResponsiveContainer, Tooltip } = chartsRef.current;
            return (
            <div className="w-full h-[64px] -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={f.series} margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
                  <defs>
                    <linearGradient id="vitals-hero-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.lav} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={C.lav} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    content={({ active, payload }) => active && payload?.[0] ? (
                      <div className="bg-salve-card border border-salve-border/60 rounded-lg px-2 py-1 text-[13px] font-montserrat text-salve-text shadow-sm">
                        {payload[0].value}{fUnit}
                      </div>
                    ) : null}
                    cursor={{ stroke: C.lav, strokeWidth: 1, strokeOpacity: 0.4 }}
                  />
                  <Area type="monotone" dataKey="value" stroke={C.lav} strokeWidth={2} strokeOpacity={0.7} fill="url(#vitals-hero-grad)" dot={{ r: 3, fill: C.lav, strokeWidth: 0, fillOpacity: 0.8 }} activeDot={{ r: 4, fill: C.lav }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            );
          })()}
          {captionText && (
            <div className="flex items-center gap-1.5 text-[13px] md:text-xs font-montserrat mt-1" style={{ color: fSignalColor }}>
              <span className="text-[14px]" aria-hidden="true">{fArrow}</span>
              <span>{captionText}</span>
            </div>
          )}
        </div>
        {snapshot.chips.length > 0 && (
          <div className={`pt-3 border-t border-salve-border ${snapshot.chips.length >= 2 ? 'grid grid-cols-2 gap-x-3 gap-y-2.5' : 'flex items-center gap-3'}`}>
            {snapshot.chips.map(c => {
              const cType = VITAL_TYPES.find(t => t.id === c.type);
              const cLabel = cType?.label || c.type;
              const cUnit = cType?.unit || c.unit || '';
              const cDisplay = c.type === 'bp' && c.value2 ? `${c.value}/${c.value2}` : c.value;
              const cSignalColor = c.signal === 'good' ? C.sage : c.signal === 'watch' ? C.amber : C.textFaint;
              const cArrow = c.direction === 'up' ? '↑' : c.direction === 'down' ? '↓' : '→';
              const hasSparkline = c.series && c.series.length >= 2;
              return (
                <div key={c.type} className="flex items-center justify-between gap-1.5 min-w-0">
                  <div className="min-w-0">
                    <div className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider leading-none mb-0.5">{cLabel}</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[14px] font-medium text-salve-text font-montserrat leading-none">{cDisplay}</span>
                      <span className="text-[9px] text-salve-textFaint font-montserrat">{cUnit}</span>
                      {c.delta !== null && (
                        <span className="text-[13px] font-montserrat" style={{ color: cSignalColor }} aria-hidden="true">{cArrow}</span>
                      )}
                    </div>
                  </div>
                  {hasSparkline && chartsReady && (() => {
                    const { AreaChart, Area } = chartsRef.current;
                    return (
                    <AreaChart width={52} height={24} data={c.series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                      <defs>
                        <linearGradient id={`chip-grad-${c.type}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={cSignalColor} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={cSignalColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke={cSignalColor} strokeWidth={1.5} strokeOpacity={0.65} fill={`url(#chip-grad-${c.type})`} dot={false} isAnimationActive={false} />
                    </AreaChart>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </Reveal>
  );
}
