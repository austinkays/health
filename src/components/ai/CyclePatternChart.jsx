import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../ui/Card';
import { C } from '../../constants/colors';
import { getCyclePhaseForDate } from '../../utils/cycles';

export default function CyclePatternChart({ data }) {
  const PHASE_ORDER = ['Menstrual', 'Follicular', 'Ovulatory', 'Luteal'];
  const PHASE_COLORS = { Menstrual: C.rose, Follicular: C.sage, Ovulatory: C.amber, Luteal: C.lav };
  const VITAL_TYPES_FOR_CHART = ['pain', 'mood', 'energy', 'sleep'];
  const VITAL_LABELS = { pain: 'Pain', mood: 'Mood', energy: 'Energy', sleep: 'Sleep' };

  const chartData = useMemo(() => {
    const phaseData = {};
    for (const phase of PHASE_ORDER) phaseData[phase] = {};

    for (const v of (data.vitals || [])) {
      if (!VITAL_TYPES_FOR_CHART.includes(v.type)) continue;
      const cp = getCyclePhaseForDate(v.date, data.cycles);
      if (!cp) continue;
      if (!phaseData[cp.phase][v.type]) phaseData[cp.phase][v.type] = [];
      phaseData[cp.phase][v.type].push(Number(v.value));
    }

    return PHASE_ORDER.map(phase => {
      const row = { phase };
      let hasData = false;
      for (const type of VITAL_TYPES_FOR_CHART) {
        const vals = phaseData[phase][type] || [];
        if (vals.length >= 3) {
          row[type] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
          hasData = true;
        }
      }
      row._hasData = hasData;
      row._color = PHASE_COLORS[phase];
      return row;
    }).filter(r => r._hasData);
  }, [data.vitals, data.cycles]);

  const vitalKeys = VITAL_TYPES_FOR_CHART.filter(type =>
    chartData.some(row => row[type] !== undefined)
  );

  if (chartData.length < 2 || vitalKeys.length === 0) {
    return (
      <div className="text-xs text-salve-textFaint font-montserrat text-center py-3">
        Not enough data for chart visualization yet. Keep tracking vitals across your cycle.
      </div>
    );
  }

  const barColors = { pain: C.rose, mood: C.lav, energy: C.amber, sleep: C.sage };

  return (
    <Card className="mb-3">
      <div className="text-xs font-medium font-montserrat text-salve-textFaint uppercase tracking-wider mb-2">Average by Cycle Phase</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey="phase" tick={{ fontSize: 10, fill: C.textFaint }} />
          <YAxis tick={{ fontSize: 10, fill: C.textFaint }} domain={[0, 10]} />
          <Tooltip contentStyle={{ fontFamily: 'Montserrat', fontSize: 11, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card }} />
          {vitalKeys.map(type => (
            <Bar key={type} dataKey={type} name={VITAL_LABELS[type]} fill={barColors[type]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-3 mt-1.5">
        {vitalKeys.map(type => (
          <div key={type} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: barColors[type] }} />
            <span className="text-[9px] text-salve-textFaint font-montserrat">{VITAL_LABELS[type]}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
