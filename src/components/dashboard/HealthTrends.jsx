import { ChevronRight } from 'lucide-react';
import Reveal from '../ui/Reveal';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { fmtDate } from '../../utils/dates';

export default function HealthTrends({ sleepTrend, hrTrend, spo2Trend, labHighlights, chartsReady, chartsRef, onNav }) {
  if (!sleepTrend && !hrTrend && !spo2Trend && labHighlights.length === 0) return null;
  return (
    <Reveal as="section" aria-label="Health trends" className="mb-5 md:mb-6">
      <SectionTitle>Health Trends</SectionTitle>
      <div className="bg-salve-card/50 border border-salve-border/60 rounded-2xl p-2.5 md:p-3">
      <div className="grid grid-cols-2 gap-2.5 md:gap-3">

        {/* Sleep 14-night bar chart */}
        {sleepTrend && (
          <button
            onClick={() => onNav('vitals')}
            className="col-span-2 bg-salve-card border border-salve-border/40 rounded-xl p-4 text-left cursor-pointer hover:border-salve-lav/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <div>
                <span className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">Sleep</span>
                <span className="text-[9px] text-salve-textFaint/60 font-montserrat ml-1.5">7 nights</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-[22px] font-medium text-salve-text font-montserrat leading-none">{sleepTrend.avg}</span>
                <span className="text-[13px] text-salve-textFaint font-montserrat">hrs avg</span>
              </div>
            </div>
            <div className="relative flex items-end gap-[3px] h-12 mt-2">
              {(() => {
                const maxVal = Math.max(...sleepTrend.days.filter(x => x.value).map(x => x.value), 1);
                // Goal line at 7h, positioned proportionally within the 36px bar area (10px label offset)
                const goalBottom = Math.round((7 / maxVal) * 36) + 10;
                return (<>
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-10 flex items-center"
                    style={{ bottom: `${goalBottom}px` }}
                    aria-hidden="true"
                  >
                    <div className="flex-1 border-t border-dashed" style={{ borderColor: `${C.sage}70` }} />
                    <span className="text-[7px] font-montserrat pl-1 leading-none" style={{ color: `${C.sage}90` }}>7h</span>
                  </div>
                  {sleepTrend.days.map((d, i) => {
                    const barColor = !d.value ? `${C.border}` : d.value >= 7 ? C.sage : d.value >= 5 ? C.amber : C.rose;
                    const pct = d.value ? Math.max(d.value / maxVal, 0.1) : 0;
                    const isLast = i === sleepTrend.days.length - 1;
                    return (
                      <div key={d.dateStr} className="flex-1 flex flex-col items-center justify-end gap-[2px]">
                        <div className="w-full rounded-sm transition-all" style={{ height: d.value ? `${Math.round(pct * 36)}px` : '2px', background: barColor, opacity: isLast ? 1 : 0.7 }} />
                        {(i % 2 === 0) && <span className="text-[7px] font-montserrat" style={{ color: isLast ? C.sage : C.textFaint }}>{d.label}</span>}
                      </div>
                    );
                  })}
                </>);
              })()}
            </div>
            <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-salve-border/50">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: C.sage }} /><span className="text-[9px] text-salve-textFaint font-montserrat">≥7h goal</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: C.amber }} /><span className="text-[9px] text-salve-textFaint font-montserrat">5–7h</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: C.rose }} /><span className="text-[9px] text-salve-textFaint font-montserrat">&lt;5h</span></div>
              {sleepTrend.last && (
                <div className="ml-auto text-[12px] font-montserrat" style={{ color: sleepTrend.last.value >= 7 ? C.sage : sleepTrend.last.value >= 5 ? C.amber : C.rose }}>
                  Last night: {sleepTrend.last.value}h
                </div>
              )}
            </div>
          </button>
        )}

        {/* Heart Rate 7-day band chart */}
        {hrTrend && chartsReady && (() => {
          const { ComposedChart, Area, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } = chartsRef.current;
          return (
          <button
            onClick={() => onNav('vitals')}
            className="bg-salve-card border border-salve-border/40 rounded-xl p-3.5 text-left cursor-pointer hover:border-salve-lav/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">Heart Rate</div>
              <div className="text-[9px] text-salve-textFaint font-montserrat">7 days</div>
            </div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-[24px] font-medium text-salve-text font-montserrat leading-none">{hrTrend.avg}</span>
              <span className="text-[13px] text-salve-textFaint font-montserrat">bpm avg</span>
              <span className="text-[12px] font-montserrat ml-auto" style={{ color: hrTrend.avg >= 60 && hrTrend.avg <= 100 ? C.sage : C.amber }}>
                {hrTrend.avg >= 60 && hrTrend.avg <= 100 ? 'Normal' : 'Attention'}
              </span>
            </div>
            <div className="h-[80px] -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hrTrend.days} margin={{ top: 4, right: 8, bottom: 16, left: 24 }}>
                  <defs>
                    <linearGradient id="hr-band-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.rose} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={C.rose} stopOpacity={0.06} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.textFaint, fontFamily: 'Montserrat' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis domain={[Math.max(40, hrTrend.min - 8), hrTrend.max + 8]} tick={{ fontSize: 9, fill: C.textFaint, fontFamily: 'Montserrat' }} tickLine={false} axisLine={false} tickCount={3} width={20} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div style={{ fontFamily: 'Montserrat', fontSize: 11, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, padding: '4px 8px' }}>
                          <p style={{ margin: 0, color: C.text }}>{d.label}</p>
                          <p style={{ margin: 0, color: C.rose }}>{d.avg} bpm avg</p>
                          {d.band > 0 && <p style={{ margin: '2px 0 0', color: C.textFaint, fontSize: 10 }}>{d.min}–{d.min + d.band} range</p>}
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={60} stroke={C.amber} strokeDasharray="3 3" strokeOpacity={0.4} />
                  <ReferenceLine y={100} stroke={C.amber} strokeDasharray="3 3" strokeOpacity={0.4} />
                  <Area type="monotone" dataKey="min" stackId="hr" fill="transparent" stroke="none" isAnimationActive={false} legendType="none" />
                  <Area type="monotone" dataKey="band" stackId="hr" fill="url(#hr-band-grad)" stroke="none" isAnimationActive={false} legendType="none" />
                  <Line type="monotone" dataKey="avg" stroke={C.rose} strokeWidth={1.5} dot={{ r: 2, fill: C.rose, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[9px] text-salve-textFaint font-montserrat">Range: {hrTrend.min}–{hrTrend.max} bpm</span>
              <span className="text-[9px] text-salve-textFaint font-montserrat opacity-60">Normal: 60–100</span>
            </div>
          </button>
          );
        })()}

        {/* Blood Oxygen 7-day band chart */}
        {spo2Trend && chartsReady && (() => {
          const { ComposedChart, Area, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } = chartsRef.current;
          return (
          <button
            onClick={() => onNav('vitals')}
            className="bg-salve-card border border-salve-border/40 rounded-xl p-3.5 text-left cursor-pointer hover:border-salve-lav/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">Blood Oxygen</div>
              <div className="text-[9px] text-salve-textFaint font-montserrat">7 days</div>
            </div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-[24px] font-medium text-salve-text font-montserrat leading-none">{spo2Trend.avg}</span>
              <span className="text-[13px] text-salve-textFaint font-montserrat">% avg</span>
              <span className="text-[12px] font-montserrat ml-auto" style={{ color: spo2Trend.lowNights === 0 ? C.sage : C.amber }}>
                {spo2Trend.lowNights === 0 ? 'Normal' : `${spo2Trend.lowNights} low`}
              </span>
            </div>
            <div className="h-[80px] -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={spo2Trend.days} margin={{ top: 4, right: 8, bottom: 16, left: 24 }}>
                  <defs>
                    <linearGradient id="spo2-band-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.lav} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={C.lav} stopOpacity={0.06} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tickFormatter={(d) => new Date(d + 'T12:00:00').toLocaleDateString('en', { month: 'numeric', day: 'numeric' })} tick={{ fontSize: 9, fill: C.textFaint, fontFamily: 'Montserrat' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis domain={[Math.min(90, spo2Trend.minVal - 2), 100]} tick={{ fontSize: 9, fill: C.textFaint, fontFamily: 'Montserrat' }} tickLine={false} axisLine={false} tickCount={3} width={20} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div style={{ fontFamily: 'Montserrat', fontSize: 11, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, padding: '4px 8px' }}>
                          <p style={{ margin: 0, color: C.text }}>{d.date ? new Date(d.date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) : ''}</p>
                          <p style={{ margin: 0, color: C.lav }}>{d.avg}% avg</p>
                          {d.band > 0 && <p style={{ margin: '2px 0 0', color: C.textFaint, fontSize: 10 }}>{d.min}–{Math.round((d.min + d.band) * 10) / 10}% range</p>}
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={95} stroke={C.amber} strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: '95%', position: 'right', fontSize: 8, fill: C.amber, fontFamily: 'Montserrat' }} />
                  <Area type="monotone" dataKey="min" stackId="spo2" fill="transparent" stroke="none" isAnimationActive={false} legendType="none" />
                  <Area type="monotone" dataKey="band" stackId="spo2" fill="url(#spo2-band-grad)" stroke="none" isAnimationActive={false} legendType="none" />
                  <Line type="monotone" dataKey="avg" stroke={C.lav} strokeWidth={1.5} dot={{ r: 2, fill: C.lav, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[9px] font-montserrat" style={{ color: spo2Trend.lowNights > 0 ? C.amber : C.textFaint }}>
                {spo2Trend.lowNights > 0 ? `${spo2Trend.lowNights} night${spo2Trend.lowNights > 1 ? 's' : ''} below 95%` : 'All readings ≥95%'}
              </span>
              <span className="text-[9px] text-salve-textFaint font-montserrat opacity-60">Normal: ≥95%</span>
            </div>
          </button>
          );
        })()}

        {/* Lab highlights */}
        {labHighlights.length > 0 && (
          <button
            onClick={() => onNav('labs')}
            className="col-span-2 bg-salve-card border border-salve-border/40 rounded-xl p-3.5 text-left cursor-pointer hover:border-salve-lav/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[9px] text-salve-textFaint font-montserrat uppercase tracking-wider">Recent Labs</span>
              <ChevronRight size={11} className="text-salve-textFaint/50" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 [&>*]:min-w-0">
              {labHighlights.map(lab => {
                const flag = lab.flag;
                const hasFlag = ['abnormal', 'high', 'low', 'critical'].includes(flag);
                const flagColor = hasFlag ? C.rose : flag === 'normal' || flag === 'completed' ? C.sage : C.textFaint;
                const flagLabel = flag === 'high' ? '↑ High' : flag === 'low' ? '↓ Low' : flag === 'critical' ? '‼ Critical' : flag === 'abnormal' ? '! Abnormal' : '✓ Normal';
                return (
                  <div key={lab.id} className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-salve-textMid font-montserrat font-medium truncate">{lab.test_name || 'Lab result'}</div>
                      <div className="text-[12px] text-salve-textFaint font-montserrat">{lab.date ? fmtDate(lab.date) : ''}</div>
                    </div>
                    <div className="flex-shrink-0 text-right min-w-0 max-w-[45%]">
                      {lab.result && <div className="text-[13px] font-semibold font-montserrat truncate" style={{ color: hasFlag ? flagColor : C.textMid }}>{lab.result}{lab.unit ? ` ${lab.unit}` : ''}</div>}
                      <div className="text-[9px] font-montserrat" style={{ color: flagColor }}>{flagLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2.5 pt-2 border-t border-salve-border/50 text-[9px] text-salve-textFaint font-montserrat">
              {labHighlights.length} recent result{labHighlights.length !== 1 ? 's' : ''} · Last: {fmtDate(labHighlights[0].date)}
            </div>
          </button>
        )}
      </div>
      </div>
    </Reveal>
  );
}
