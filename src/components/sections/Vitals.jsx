import { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Check, Heart, Trash2, AlertTriangle, TrendingUp, Loader, Apple, ChevronDown } from 'lucide-react';
import { OuraIcon } from '../ui/OuraIcon';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import Motif from '../ui/Motif';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { VITAL_TYPES, EMPTY_VITAL } from '../../constants/defaults';
import { fmtDate, fmtDateRelative, todayISO, localISODate } from '../../utils/dates';
import { validateVital } from '../../utils/validate';
import { getCyclePhaseForDate } from '../../utils/cycles';
import { C } from '../../constants/colors';
import { fetchVitalsTrend } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import BarometricCard from '../ui/BarometricCard';
import AIMarkdown from '../ui/AIMarkdown';
import { PRESSURE_SENSITIVE } from '../../services/barometric';

function getVitalFlag(type, value, value2) {
  const t = VITAL_TYPES.find(x => x.id === type);
  if (!t) return null;
  const v = Number(value);
  if (isNaN(v)) return null;
  if (type === 'bp') {
    const sys = v, dia = Number(value2);
    if (isNaN(dia)) return null;
    if (sys >= 180 || dia >= 120) return { level: 'critical', label: 'Critical' };
    if (sys >= 140 || dia >= 90) return { level: 'high', label: 'High' };
    if (sys < 90 || dia < 60) return { level: 'low', label: 'Low' };
    return null;
  }
  if (t.warnHigh && v >= t.warnHigh) return { level: 'high', label: 'High' };
  if (t.warnLow && v <= t.warnLow) return { level: 'low', label: 'Low' };
  if (t.normalHigh && v > t.normalHigh) return { level: 'high', label: 'High' };
  if (t.normalLow && v < t.normalLow) return { level: 'low', label: 'Low' };
  return null;
}

const flagStyle = (flag) => {
  if (!flag) return {};
  if (flag.level === 'critical') return { color: 'rgb(var(--salve-rose))', bg: 'rgb(var(--salve-rose) / 0.15)' };
  return { color: 'rgb(var(--salve-amber))', bg: 'rgb(var(--salve-amber) / 0.15)' };
};

const SOURCE_ICON = { oura: OuraIcon, apple_health: Apple };
const SOURCE_LABEL = { oura: 'Oura', apple_health: 'Apple Health', manual: 'Manual' };
const SOURCE_COLOR = { oura: C.sage, apple_health: C.lav, manual: C.textFaint };

function SourceMenu({ sources, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const currentLabel = value === 'all' ? 'All' : (SOURCE_LABEL[value] || value);
  const CurrentIcon = SOURCE_ICON[value];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Source filter: ${currentLabel}`}
        className={`flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-medium border font-montserrat transition-colors cursor-pointer ${
          value !== 'all' ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
        }`}
      >
        {CurrentIcon && <CurrentIcon size={9} />}
        {currentLabel}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 top-full mt-1 z-10 bg-salve-card border border-salve-border rounded-xl shadow-md py-1 min-w-[140px]">
          {['all', ...sources].map(s => {
            const I = SOURCE_ICON[s];
            const label = s === 'all' ? 'All sources' : (SOURCE_LABEL[s] || s);
            const selected = value === s;
            return (
              <button
                key={s}
                role="option"
                aria-selected={selected}
                onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-montserrat bg-transparent border-0 cursor-pointer ${
                  selected ? 'text-salve-lav bg-salve-lav/10' : 'text-salve-textMid hover:bg-salve-card2/50'
                }`}
              >
                {I && <I size={10} />}
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Vitals({ data, addItem, removeItem, onNav }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_VITAL });
  const [ct, setCt] = useState(() => {
    if (!data?.vitals?.length) return 'pain';
    const counts = {};
    data.vitals.forEach(v => { counts[v.type] = (counts[v.type] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'pain';
  });
  const [sourceFilter, setSourceFilter] = useState('all');
  const [trendAI, setTrendAI] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [cycleOverlay, setCycleOverlay] = useState(() => localStorage.getItem('salve:vitals-cycle-overlay') === 'true');
  const [timeRange, setTimeRange] = useState('30d');
  const [expandedDays, setExpandedDays] = useState(() => new Set([todayISO()]));
  const del = useConfirmDelete();
  const [errors, setErrors] = useState({});
  const sf = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(e => { const n = { ...e }; delete n[k]; return n; }); };

  // Auto-select the most-populated type when data loads after initial render
  const ctAutoSet = useRef(false);
  useEffect(() => {
    if (!ctAutoSet.current && data.vitals.length > 0 && !data.vitals.some(v => v.type === ct)) {
      ctAutoSet.current = true;
      const counts = {};
      data.vitals.forEach(v => { counts[v.type] = (counts[v.type] || 0) + 1; });
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (best) setCt(best);
    }
  }, [data.vitals, ct]);

  // Detect which sources exist in the data
  const getSource = (v) => {
    if (v.source && v.source !== '') return v.source;
    if (v.notes?.includes('Oura')) return 'oura';
    if (v.notes?.includes('Apple Health')) return 'apple_health';
    if (v.notes?.includes('readings. Min:')) return 'apple_health'; // HR aggregation pattern from healthkit.js
    return 'manual';
  };
  const sources = useMemo(() => {
    const s = new Set();
    (data.vitals || []).forEach(v => s.add(getSource(v)));
    return [...s].sort();
  }, [data.vitals]);

  // Condition-aware default for the barometric card: compact strip for
  // pressure-sensitive users, hidden for everyone else. User's explicit
  // preference in localStorage wins — pass undefined in that case so
  // BarometricCard keeps its own default fallback.
  const baroDefault = useMemo(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('salve:baro-view')) return undefined;
    const match = (data.conditions || []).some(c =>
      PRESSURE_SENSITIVE.some(ps => c.name?.toLowerCase().includes(ps))
    );
    return match ? 'compact' : 'hidden';
  }, [data.conditions]);

  const saveV = async () => {
    const { valid, errors: e } = validateVital(form);
    if (!valid) { setErrors(e); return; }
    await addItem('vitals', form);
    setForm({ ...EMPTY_VITAL, date: todayISO() });
    setErrors({});
    setSubView(null);
  };

  // Pre-fill the log form with auto-fetched pressure data from BarometricCard
  const handleLogPressure = (prefill) => {
    setForm({ ...EMPTY_VITAL, date: todayISO(), ...prefill });
    setSubView('form');
  };

  // Directly save pressure vital (called by BarometricCard auto-log)
  const handleAutoLogPressure = async (vital) => {
    await addItem('vitals', { ...EMPTY_VITAL, date: todayISO(), ...vital });
  };

  const vi = VITAL_TYPES.find(t => t.id === ct);

  const cutoffDate = useMemo(() => {
    if (timeRange === 'all') return null;
    const days = { '7d': 7, '30d': 30, '90d': 90 }[timeRange] || 30;
    return localISODate(new Date(Date.now() - days * 86400000));
  }, [timeRange]);

  const integerTypes = new Set(['hr', 'bp', 'glucose', 'spo2', 'resp']);

  // Determine if the selected type has hourly data (time field set on any record)
  const hasHourlyData = useMemo(() =>
    data.vitals.some(v => v.type === ct && v.time),
  [data.vitals, ct]);

  // Build chart data:
  // - Hourly types (HR, SpO2, resp from Apple Health): one point per record, sorted by date+time
  //   x-axis key is "Jan 15 08:00" so intraday shape is preserved
  // - Everything else: collapse to daily averages (one point per day)
  const cd = useMemo(() => {
    const filtered = data.vitals.filter(
      v => v.type === ct && (sourceFilter === 'all' || getSource(v) === sourceFilter) && (!cutoffDate || v.date >= cutoffDate)
    );
    const round = (n) => integerTypes.has(ct) ? Math.round(n) : Math.round(n * 10) / 10;
    const avg = arr => arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    if (hasHourlyData) {
      // Hourly path: one chart point per record, sorted chronologically
      return filtered
        .filter(v => v.time) // only records with time resolution
        .sort((a, b) => {
          const ka = `${a.date}${a.time}`;
          const kb = `${b.date}${b.time}`;
          return ka.localeCompare(kb);
        })
        .map(v => {
          const n = Number(v.value);
          return {
            date: `${fmtDate(v.date)} ${v.time}`,
            rawDate: v.date,
            time: v.time,
            value: isNaN(n) ? null : round(n),
            notes: v.notes || '',
          };
        })
        .filter(d => d.value !== null);
    }

    // Daily average path (manual entries, BP, weight, etc.)
    const byDate = new Map();
    for (const v of filtered) {
      if (!byDate.has(v.date)) byDate.set(v.date, { vals: [], vals2: [] });
      const e = byDate.get(v.date);
      const n = Number(v.value);
      if (!isNaN(n)) e.vals.push(n);
      if (v.value2) { const n2 = Number(v.value2); if (!isNaN(n2)) e.vals2.push(n2); }
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, { vals, vals2 }]) => ({
        date: fmtDate(date),
        value: avg(vals),
        ...(vals2.length > 0 ? { value2: avg(vals2) } : {}),
      }))
      .filter(d => d.value !== null);
  }, [data.vitals, ct, sourceFilter, cutoffDate, hasHourlyData]);

  const cdStats = useMemo(() => {
    if (!cd.length) return null;
    const vals = cd.map(p => p.value).filter(Number.isFinite);
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { min: Math.min(...vals), max: Math.max(...vals), avg, count: vals.length };
  }, [cd]);

  const phaseBands = useMemo(() => {
    if (!cycleOverlay || !data.cycles?.length || cd.length < 2) return [];
    const bands = [];
    const vitalsForType = data.vitals.filter(v => v.type === ct);

    let currentPhase = null;

    for (const point of cd) {
      const origVital = vitalsForType.find(v => fmtDate(v.date) === point.date);
      if (!origVital) continue;

      const cp = getCyclePhaseForDate(origVital.date, data.cycles);
      const phaseName = cp?.phase || null;

      if (phaseName !== currentPhase) {
        currentPhase = phaseName;
        if (cp) {
          bands.push({ phase: cp.phase, color: cp.color, x1: point.date, x2: point.date });
        }
      } else if (cp && bands.length > 0) {
        bands[bands.length - 1].x2 = point.date;
      }
    }
    return bands;
  }, [cycleOverlay, data.cycles, cd, ct, data.vitals]);

  if (subView === 'form') return (
    <FormWrap title="Log Vital" onBack={() => setSubView(null)}>
      <Card>
        <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" />
        <Field label="Type" value={form.type} onChange={v => { sf('type', v); sf('value', ''); sf('value2', ''); }} options={VITAL_TYPES.map(t => ({ value: t.id, label: `${t.label} (${t.unit})` }))} />
        {form.type === 'bp' ? (
          <div className="flex gap-2.5">
            <div className="flex-1"><Field label="Systolic" value={form.value} onChange={v => sf('value', v)} type="number" placeholder="120" error={errors.value} /></div>
            <div className="flex-1"><Field label="Diastolic" value={form.value2} onChange={v => sf('value2', v)} type="number" placeholder="80" error={errors.value2} /></div>
          </div>
        ) : (
          <Field label="Value" value={form.value} onChange={v => sf('value', v)} type="number" placeholder={vi?.unit || ''} error={errors.value} />
        )}
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Context, how you feel..." maxLength={2000} error={errors.notes} />
        <Button onClick={saveV} disabled={!form.value}><Check size={15} /> Save</Button>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      {/* Barometric pressure auto-fetch card — slim by default, condition-aware */}
      <BarometricCard
        locationStr={data?.settings?.location || ''}
        onLogPressure={handleLogPressure}
        onAutoLogPressure={handleAutoLogPressure}
        onNav={onNav}
        defaultMode={baroDefault}
      />

      {/* Unified toolbar: scrollable vital-type pills + fixed "+ Log" button */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-0.5 flex-1 min-w-0">
          <button
            onClick={() => setCt('all')}
            className={`flex-shrink-0 py-1 px-3.5 rounded-full text-[13px] font-medium border cursor-pointer font-montserrat transition-colors ${
              ct === 'all' ? 'border-salve-lav bg-salve-lav/15 text-salve-lav' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >
            All
          </button>
          {VITAL_TYPES.filter(t => data.vitals.some(v => v.type === t.id)).map(t => (
            <button
              key={t.id}
              onClick={() => setCt(t.id)}
              className={`flex-shrink-0 py-1 px-3.5 rounded-full text-[13px] font-medium border cursor-pointer font-montserrat transition-colors ${
                ct === t.id ? 'border-salve-lav bg-salve-lav/15 text-salve-lav' : 'border-salve-border bg-transparent text-salve-textFaint'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSubView('form')}
          aria-label="Log a vital"
          className="flex-shrink-0 flex items-center gap-1 py-1 px-3 rounded-full text-[13px] font-medium border border-salve-sage text-salve-sage bg-salve-sage/10 font-montserrat transition-colors cursor-pointer"
        >
          <Plus size={13} /> Log
        </button>
      </div>

      {ct !== 'all' && <>
      {cd.length > 1 ? (
        <Card className="!p-3.5">
          {/* Chart header: title on the left, contextual controls on the right */}
          <div className="flex items-center justify-between gap-2 mb-2 pl-1.5 flex-wrap">
            <div className="font-playfair text-sm font-medium text-salve-text flex items-baseline gap-1.5 min-w-0">
              <span className="truncate">{vi?.label}</span>
              <span className="font-normal text-salve-textFaint text-xs flex-shrink-0">
                {hasHourlyData ? 'hourly' : 'daily avg'}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
              {['7d', '30d', '90d', 'all'].map(r => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`py-0.5 px-2 rounded-full text-[11px] font-medium border cursor-pointer font-montserrat transition-colors ${
                    timeRange === r ? 'border-salve-lav bg-salve-lav/15 text-salve-lav' : 'border-transparent text-salve-textFaint'
                  }`}
                >
                  {r === 'all' ? 'All' : r}
                </button>
              ))}
              {sources.length > 1 && (
                <SourceMenu sources={sources} value={sourceFilter} onChange={setSourceFilter} />
              )}
              {data.cycles?.length > 0 && cd.length > 1 && (
                <button
                  onClick={() => {
                    const next = !cycleOverlay;
                    setCycleOverlay(next);
                    localStorage.setItem('salve:vitals-cycle-overlay', String(next));
                  }}
                  aria-pressed={cycleOverlay}
                  aria-label="Toggle cycle phase overlay"
                  className={`p-1 rounded-full border font-montserrat transition-colors cursor-pointer ${
                    cycleOverlay ? 'border-salve-rose bg-salve-rose/15 text-salve-rose' : 'border-transparent text-salve-textFaint hover:text-salve-textMid'
                  }`}
                >
                  <Heart size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <div role="img" aria-label={`${vi?.label} chart showing ${cd.length} ${hasHourlyData ? 'hourly readings' : 'daily averages'} from ${cd[0]?.date} to ${cd[cd.length - 1]?.date}`} className="h-[180px] md:h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cd}>
              <defs>
                <linearGradient id="sf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.sage} stopOpacity={0.25} /><stop offset="95%" stopColor={C.sage} stopOpacity={0} /></linearGradient>
                <linearGradient id="lf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.lav} stopOpacity={0.25} /><stop offset="95%" stopColor={C.lav} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: C.textFaint, fontFamily: 'Montserrat' }}
                interval={hasHourlyData ? Math.floor(cd.length / 6) : 'preserveStartEnd'}
                tickFormatter={hasHourlyData ? (v) => v.split(' ')[1] || v : undefined}
              />
              <YAxis tick={{ fontSize: 10, fill: C.textFaint, fontFamily: 'Montserrat' }} width={32} />
              <Tooltip
                contentStyle={{ fontFamily: 'Montserrat', fontSize: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card }}
                formatter={(val, name) => {
                  if (name === 'value2') return [`${val} ${vi?.unit || ''}`, 'Diastolic'];
                  return [`${val} ${vi?.unit || ''}`, ct === 'bp' ? 'Systolic' : vi?.label || ''];
                }}
                labelFormatter={(label) => {
                  // For hourly data, label is "Jan 15 08:00", show it as-is
                  // For daily data, label is already a formatted date
                  return label;
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={C.sage}
                fill="url(#sf)"
                strokeWidth={2}
                dot={cd.length > 48 ? false : { r: cd.length > 24 ? 2 : 3, fill: C.sage, strokeWidth: 0 }}
                label={cd.length <= 8 ? {
                  position: 'top', fontSize: 10, fill: C.textFaint, fontFamily: 'Montserrat',
                  formatter: (v) => `${v}`,
                } : false}
              />
              {ct === 'bp' && <Area type="monotone" dataKey="value2" stroke={C.lav} fill="url(#lf)" strokeWidth={2} dot={cd.length > 30 ? false : { r: 3, fill: C.lav, strokeWidth: 0 }} />}
              {vi?.normalHigh && <ReferenceLine y={vi.normalHigh} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: String(vi.normalHigh), position: 'insideTopRight', fontSize: 9, fill: C.amber, fontFamily: 'Montserrat' }} />}
              {vi?.normalLow && <ReferenceLine y={vi.normalLow} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: String(vi.normalLow), position: 'insideBottomRight', fontSize: 9, fill: C.amber, fontFamily: 'Montserrat' }} />}
              {phaseBands.map((band, i) => (
                <ReferenceArea
                  key={`phase-${i}`}
                  x1={band.x1}
                  x2={band.x2}
                  fill={band.color}
                  fillOpacity={0.1}
                  stroke="none"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>{vi?.label} readings</caption>
            <thead><tr><th>Date</th><th>Value</th>{ct === 'bp' && <th>Diastolic</th>}</tr></thead>
            <tbody>{cd.map((d, i) => <tr key={i}><td>{d.date}</td><td>{d.value} {vi?.unit}</td>{ct === 'bp' && <td>{d.value2} {vi?.unit}</td>}</tr>)}</tbody>
          </table>
          {/* Stats footer */}
          {cdStats && (
            <div className="flex gap-3 text-[12px] text-salve-textFaint font-montserrat mt-2 pl-1.5">
              <span>Avg <span className="text-salve-text font-medium">{cdStats.avg % 1 === 0 ? cdStats.avg : cdStats.avg.toFixed(1)}</span></span>
              <span>Low <span className="text-salve-text font-medium">{cdStats.min % 1 === 0 ? cdStats.min : cdStats.min.toFixed(1)}</span></span>
              <span>High <span className="text-salve-text font-medium">{cdStats.max % 1 === 0 ? cdStats.max : cdStats.max.toFixed(1)}</span></span>
            </div>
          )}
          {vi && (vi.normalLow || vi.normalHigh) && (
            <div className="text-[12px] text-salve-textFaint text-center mt-1.5">
              Normal range: {vi.normalLow ?? ', '}–{vi.normalHigh ?? ', '} {vi.unit}
              {vi.id === 'bp' && vi.normalLow2 ? ` / ${vi.normalLow2}–${vi.normalHigh2} ${vi.unit}` : ''}
            </div>
          )}
          {/* Inline AI trigger — demoted from a full-width button to a subtle right-aligned link */}
          {data.vitals.length >= 3 && hasAIConsent() && (
            <div className="mt-2 text-right">
              <button
                onClick={async () => {
                  setTrendLoading(true);
                  setTrendAI(null);
                  try {
                    const recent = data.vitals.slice().reverse().slice(0, 20).map(v => {
                      const t = VITAL_TYPES.find(x => x.id === v.type);
                      return { type: t?.label || v.type, value: v.value, value2: v.value2, unit: t?.unit || '', date: v.date, notes: v.notes };
                    });
                    const result = await fetchVitalsTrend(recent, buildProfile(data));
                    setTrendAI(result);
                  } catch (e) {
                    setTrendAI('Unable to analyze trends right now. ' + e.message);
                  } finally {
                    setTrendLoading(false);
                  }
                }}
                disabled={trendLoading}
                className="inline-flex items-center gap-1 text-[11px] text-salve-lav font-montserrat bg-transparent border-0 p-0 cursor-pointer hover:underline disabled:opacity-50"
              >
                {trendLoading ? <><Loader size={10} className="animate-spin" /> Analyzing…</> : <><TrendingUp size={10} /> Analyze trends with Sage</>}
              </button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="text-center !py-6">
          <Motif type="sparkle" size={20} className="block mb-2 mx-auto" />
          <span className="text-[15px] text-salve-textFaint">{cd.length === 0 ? 'No entries yet' : 'Log one more to see the trend'}</span>
        </Card>
      )}

      {/* AI trend analysis result — sibling of chart card so tall content doesn't push the chart off-screen */}
      {trendAI && (
        <Card className="!bg-salve-lav/8 !border-salve-lav/20 mt-2 mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[13px] font-semibold text-salve-lav flex items-center gap-1"><TrendingUp size={11} /> Trend Analysis</div>
            <button onClick={() => setTrendAI(null)} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss trend analysis">×</button>
          </div>
          <AIMarkdown>{trendAI}</AIMarkdown>
        </Card>
      )}
      </>}

      <SectionTitle>Recent Entries</SectionTitle>
      {data.vitals.length === 0 ? (
        <EmptyState
          icon={Heart}
          text="No vitals logged yet"
          hint="Log sleep, heart rate, pain, mood, or any vital you want to track. Sage spots trends and correlations over time."
          motif="sparkle"
          actionLabel="Log your first vital"
          onAction={() => setSubView('form')}
        />
      ) :
        (() => {
          // Group filtered entries by date, newest first
          const filtered = data.vitals.slice().reverse()
            .filter(v => (ct === 'all' || v.type === ct) && (sourceFilter === 'all' || getSource(v) === sourceFilter))
            .slice(0, 40);
          const byDate = [];
          const dateMap = new Map();
          for (const v of filtered) {
            if (!dateMap.has(v.date)) {
              const group = { date: v.date, entries: [] };
              dateMap.set(v.date, group);
              byDate.push(group);
            }
            dateMap.get(v.date).entries.push(v);
          }
          // ── "All" view: clean daily summary rows ──
          if (ct === 'all') {
            return <div className="space-y-2">{byDate.map(({ date, entries }) => {
              // Deduplicate: pick one representative value per type (latest, or avg for hourly)
              const typeMap = new Map();
              for (const v of entries) {
                if (!typeMap.has(v.type)) typeMap.set(v.type, []);
                typeMap.get(v.type).push(v);
              }
              const flagCount = entries.filter(v => getVitalFlag(v.type, v.value, v.value2)).length;
              return (
                <Card key={date} className="!p-3 !mb-0">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[13px] font-semibold uppercase tracking-wider text-salve-textMid font-montserrat">{fmtDateRelative(date)}</span>
                    <span className="text-[12px] text-salve-textFaint font-montserrat">{fmtDate(date)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {[...typeMap.entries()].map(([vtype, typeEntries]) => {
                      const t = VITAL_TYPES.find(x => x.id === vtype);
                      const flag = typeEntries.some(v => getVitalFlag(v.type, v.value, v.value2));
                      let displayVal;
                      if (typeEntries.length >= 3 && typeEntries[0].time) {
                        const vals = typeEntries.map(v => Number(v.value)).filter(Number.isFinite);
                        displayVal = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
                      } else if (vtype === 'bp') {
                        displayVal = `${typeEntries[0].value}/${typeEntries[0].value2}`;
                      } else {
                        displayVal = typeEntries[0].value;
                      }
                      return (
                        <button
                          key={vtype}
                          onClick={() => setCt(vtype)}
                          className="flex items-baseline gap-1 bg-transparent border-none p-0 cursor-pointer group"
                          aria-label={`View ${t?.label} details`}
                        >
                          <span className="text-[12px] text-salve-textFaint font-montserrat group-hover:text-salve-textMid transition-colors">{t?.label}:</span>
                          <span className={`text-[15px] font-semibold font-montserrat ${flag ? 'text-salve-amber' : 'text-salve-sage'}`}>
                            {displayVal}
                          </span>
                          <span className="text-[9px] text-salve-textFaint font-montserrat">{t?.unit}</span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              );
            })}</div>;
          }

          // ── Single-type view: expandable day cards ──
          return <div className="md:grid md:grid-cols-2 md:gap-3">{byDate.map(({ date, entries }) => {
            const cp = data.cycles?.length > 0 ? getCyclePhaseForDate(date, data.cycles) : null;
            const isOpen = expandedDays.has(date);
            const toggleDay = () => setExpandedDays(prev => {
              const next = new Set(prev);
              if (next.has(date)) next.delete(date); else next.add(date);
              return next;
            });
            const flagCount = entries.filter(v => getVitalFlag(v.type, v.value, v.value2)).length;
            const typeSet = new Set(entries.map(v => v.type));
            const summaryChips = [...typeSet].slice(0, 4).map(vtype => {
              const t = VITAL_TYPES.find(x => x.id === vtype);
              const latest = entries.find(v => v.type === vtype);
              const val = vtype === 'bp' ? `${latest.value}/${latest.value2}` : latest.value;
              return `${t?.label || vtype} ${val}`;
            });
            return (
              <Card key={date} className="!p-0 !mb-2.5 overflow-hidden">
                <button
                  onClick={toggleDay}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-salve-card2/40 border-none cursor-pointer text-left transition-colors hover:bg-salve-card2/70"
                  aria-expanded={isOpen}
                  aria-label={`${fmtDateRelative(date)}, ${entries.length} entries`}
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[13px] font-semibold uppercase tracking-wider text-salve-textMid font-montserrat">{fmtDateRelative(date)}</span>
                    {!isOpen && (
                      <span className="text-[12px] text-salve-textFaint font-montserrat truncate">
                        {summaryChips.join(' · ')}{typeSet.size > 4 ? ` +${typeSet.size - 4}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {flagCount > 0 && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full font-montserrat" style={{ color: C.amber, background: `${C.amber}18` }}>
                        {flagCount} flag{flagCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {cp && (
                      <span className="text-[12px] font-montserrat" style={{ color: cp.color }}>
                        {cp.phase}
                      </span>
                    )}
                    <span className="text-[12px] text-salve-textFaint font-montserrat hidden md:inline">{fmtDate(date)}</span>
                    <ChevronDown size={13} className={`text-salve-textFaint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {/* Entries for this date */}
                {isOpen && (
                <div className="divide-y divide-salve-border/40 border-t border-salve-border/50">
                  {(() => {
                    // Sub-group by type within this date
                    const typeMap = new Map();
                    for (const v of entries) {
                      if (!typeMap.has(v.type)) typeMap.set(v.type, []);
                      typeMap.get(v.type).push(v);
                    }
                    return [...typeMap.entries()].map(([vtype, typeEntries]) => {
                      const t = VITAL_TYPES.find(x => x.id === vtype);
                      const src = getSource(typeEntries[0]);
                      const SrcIcon = SOURCE_ICON[src];

                      // Collapsed summary for 3+ same-type entries on same day (hourly Apple Health data)
                      if (typeEntries.length >= 3 && typeEntries[0].time) {
                        const vals = typeEntries.map(v => Number(v.value)).filter(Number.isFinite);
                        const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
                        const min = Math.min(...vals);
                        const max = Math.max(...vals);
                        const anyFlag = typeEntries.some(v => getVitalFlag(vtype, v.value));
                        const peakEntry = typeEntries.reduce((a, b) => Number(a.value) > Number(b.value) ? a : b);
                        const lowEntry = typeEntries.reduce((a, b) => Number(a.value) < Number(b.value) ? a : b);
                        return (
                          <div key={vtype} className="flex items-center gap-2 px-3.5 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                {anyFlag && <AlertTriangle size={12} color={C.amber} className="flex-shrink-0" aria-hidden="true" />}
                                <span className="text-[15px] text-salve-textMid font-montserrat">{t?.label}</span>
                                <span className="text-[14px] font-semibold font-montserrat" style={{ color: C.sage }}>
                                  {avg}<span className="text-[13px] font-normal text-salve-textFaint ml-0.5">{t?.unit} avg</span>
                                </span>
                              </div>
                              <div className="flex gap-3 mt-0.5 text-[12px] text-salve-textFaint font-montserrat">
                                <span>↓ {min} at {lowEntry.time}</span>
                                <span>↑ {max} at {peakEntry.time}</span>
                                <span>{typeEntries.length} readings</span>
                              </div>
                            </div>
                            {SrcIcon && <SrcIcon size={11} style={{ color: SOURCE_COLOR[src] }} className="flex-shrink-0" aria-hidden="true" />}
                          </div>
                        );
                      }

                      // Individual rows for manual entries or small groups
                      return typeEntries.map(v => {
                        const flag = getVitalFlag(v.type, v.value, v.value2);
                        const fs = flagStyle(flag);
                        const displayVal = v.type === 'bp' ? `${v.value}/${v.value2}` : v.value;
                        return (
                          <div key={v.id} className="relative">
                            {flag && (
                              <div
                                className="absolute left-0 top-0 bottom-0 w-[3px]"
                                style={{ backgroundColor: fs.color }}
                                aria-hidden="true"
                              />
                            )}
                            <div className="flex items-center gap-2 px-3.5 py-2">
                              <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                                {flag && <AlertTriangle size={12} color={fs.color} className="flex-shrink-0" aria-hidden="true" />}
                                <span className="text-[15px] text-salve-textMid font-montserrat">{t?.label}</span>
                                {v.time && <span className="text-[12px] text-salve-textFaint font-montserrat">{v.time}</span>}
                                <span className="text-[14px] font-semibold font-montserrat" style={{ color: flag ? fs.color : C.sage }}>
                                  {displayVal}<span className="text-[13px] font-normal text-salve-textFaint ml-0.5">{t?.unit}</span>
                                </span>
                                {flag && <span className="text-[12px] font-medium" style={{ color: fs.color }}>({flag.label})</span>}
                                {v.notes && <span className="text-[13px] text-salve-textFaint italic">,  {v.notes}</span>}
                              </div>
                              {SrcIcon && <SrcIcon size={11} style={{ color: SOURCE_COLOR[src] }} className="flex-shrink-0" aria-hidden="true" />}
                              <button
                                onClick={() => del.ask(v.id, t?.label || 'entry')}
                                aria-label={`Delete ${t?.label || 'entry'}`}
                                className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-rose p-1 flex flex-shrink-0 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                            <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('vitals', id))} onCancel={del.cancel} itemId={v.id} />
                          </div>
                        );
                      });
                    });
                  })()}
                </div>
                )}
              </Card>
            );
          })}</div>;
        })()
      }
    </div>
  );
}
