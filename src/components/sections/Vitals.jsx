import { useState, useMemo } from 'react';
import { Plus, Check, Heart, Trash2, AlertTriangle, TrendingUp, Loader, Apple } from 'lucide-react';
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
import { fmtDate, fmtDateRelative } from '../../utils/dates';
import { getCyclePhaseForDate } from '../../utils/cycles';
import { C } from '../../constants/colors';
import { fetchVitalsTrend } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';

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

export default function Vitals({ data, addItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_VITAL });
  const [ct, setCt] = useState('pain');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [trendAI, setTrendAI] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [cycleOverlay, setCycleOverlay] = useState(() => localStorage.getItem('salve:vitals-cycle-overlay') === 'true');
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

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

  const saveV = async () => {
    if (!form.value || isNaN(Number(form.value))) return;
    if (form.type === 'bp' && (!form.value2 || isNaN(Number(form.value2)))) return;
    await addItem('vitals', form);
    setForm({ ...EMPTY_VITAL, date: new Date().toISOString().slice(0, 10) });
    setSubView(null);
  };

  const cd = data.vitals.filter(v => v.type === ct).map(v => ({
    date: fmtDate(v.date),
    value: Number(v.value),
    ...(v.value2 ? { value2: Number(v.value2) } : {}),
  }));
  const vi = VITAL_TYPES.find(t => t.id === ct);

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
            <div className="flex-1"><Field label="Systolic" value={form.value} onChange={v => sf('value', v)} type="number" placeholder="120" /></div>
            <div className="flex-1"><Field label="Diastolic" value={form.value2} onChange={v => sf('value2', v)} type="number" placeholder="80" /></div>
          </div>
        ) : (
          <Field label="Value" value={form.value} onChange={v => sf('value', v)} type="number" placeholder={vi?.unit || ''} />
        )}
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Context, how you feel..." />
        <Button onClick={saveV} disabled={!form.value}><Check size={15} /> Save</Button>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      <div className="flex justify-end mb-3">
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Log</Button>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3.5">
        {VITAL_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setCt(t.id)}
            className={`py-1 px-3.5 rounded-full text-[11px] font-medium border cursor-pointer font-montserrat ${
              ct === t.id ? 'border-salve-lav bg-salve-lav/15 text-salve-lav' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Source filter pills — only show when multiple sources */}
      {sources.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          <button
            onClick={() => setSourceFilter('all')}
            className={`py-1 px-3 rounded-full text-[10px] font-medium border cursor-pointer font-montserrat transition-colors ${
              sourceFilter === 'all' ? 'border-salve-lav bg-salve-lav/15 text-salve-lav' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >All sources</button>
          {sources.map(s => {
            const Icon = SOURCE_ICON[s];
            return (
              <button key={s} onClick={() => setSourceFilter(s)}
                className={`py-1 px-3 rounded-full text-[10px] font-medium border cursor-pointer font-montserrat transition-colors flex items-center gap-1 ${
                  sourceFilter === s ? `border-salve-sage bg-salve-sage/15 text-salve-sage` : 'border-salve-border bg-transparent text-salve-textFaint'
                }`}
              >
                {Icon && <Icon size={9} />}
                {SOURCE_LABEL[s] || s}
              </button>
            );
          })}
        </div>
      )}

      {data.cycles?.length > 0 && cd.length > 1 && (
        <div className="flex justify-end mb-1.5">
          <button
            onClick={() => {
              const next = !cycleOverlay;
              setCycleOverlay(next);
              localStorage.setItem('salve:vitals-cycle-overlay', String(next));
            }}
            className={`py-1 px-3 rounded-full text-[10px] font-medium border cursor-pointer font-montserrat transition-colors ${
              cycleOverlay ? 'border-salve-rose bg-salve-rose/15 text-salve-rose' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >
            Color by cycle phase
          </button>
        </div>
      )}

      {cd.length > 1 ? (
        <Card className="!p-3.5">
          <div className="font-playfair text-sm font-medium mb-2.5 pl-1.5 text-salve-text">
            {vi?.label} <span className="font-normal text-salve-textFaint text-xs">over time</span>
          </div>
          <div role="img" aria-label={`${vi?.label} chart showing ${cd.length} readings from ${cd[0]?.date} to ${cd[cd.length - 1]?.date}`}>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={cd}>
              <defs>
                <linearGradient id="sf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.sage} stopOpacity={0.25} /><stop offset="95%" stopColor={C.sage} stopOpacity={0} /></linearGradient>
                <linearGradient id="lf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.lav} stopOpacity={0.25} /><stop offset="95%" stopColor={C.lav} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.textFaint }} />
              <YAxis tick={{ fontSize: 10, fill: C.textFaint }} />
              <Tooltip contentStyle={{ fontFamily: 'Montserrat', fontSize: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card }} />
              <Area type="monotone" dataKey="value" stroke={C.sage} fill="url(#sf)" strokeWidth={2.5} dot={{ r: 3, fill: C.sage }} />
              {ct === 'bp' && <Area type="monotone" dataKey="value2" stroke={C.lav} fill="url(#lf)" strokeWidth={2} dot={{ r: 3, fill: C.lav }} />}
              {vi?.normalHigh && <ReferenceLine y={vi.normalHigh} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.5} />}
              {vi?.normalLow && <ReferenceLine y={vi.normalLow} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.5} />}
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
          {vi && (vi.normalLow || vi.normalHigh) && (
            <div className="text-[10px] text-salve-textFaint text-center mt-1.5">
              Normal range: {vi.normalLow ?? '—'}–{vi.normalHigh ?? '—'} {vi.unit}
              {vi.id === 'bp' && vi.normalLow2 ? ` / ${vi.normalLow2}–${vi.normalHigh2} ${vi.unit}` : ''}
            </div>
          )}
        </Card>
      ) : (
        <Card className="text-center !py-6">
          <Motif type="sparkle" size={20} className="block mb-2 mx-auto" />
          <span className="text-[13px] text-salve-textFaint">{cd.length === 0 ? 'No entries yet' : 'Log one more to see the trend'}</span>
        </Card>
      )}

      {data.vitals.length >= 3 && hasAIConsent() && (
        <div className="mb-3">
          <Button
            variant="ghost"
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
            className="!text-xs w-full !justify-center"
          >
            {trendLoading ? <><Loader size={13} className="animate-spin" /> Analyzing trends...</> : <><TrendingUp size={13} /> Analyze Trends with Sage</>}
          </Button>
          {trendAI && (
            <Card className="!bg-salve-lav/8 !border-salve-lav/20 mt-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-semibold text-salve-lav flex items-center gap-1"><TrendingUp size={11} /> Trend Analysis</div>
                <button onClick={() => setTrendAI(null)} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss trend analysis">×</button>
              </div>
              <AIMarkdown>{trendAI}</AIMarkdown>
            </Card>
          )}
        </div>
      )}

      <SectionTitle>Recent Entries</SectionTitle>
      {data.vitals.length === 0 ? <EmptyState icon={Heart} text="No vitals logged yet" motif="sparkle" /> :
        (() => {
          // Group filtered entries by date — newest first
          const filtered = data.vitals.slice().reverse()
            .filter(v => sourceFilter === 'all' || getSource(v) === sourceFilter)
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
          return byDate.map(({ date, entries }) => {
            const cp = data.cycles?.length > 0 ? getCyclePhaseForDate(date, data.cycles) : null;
            return (
              <Card key={date} className="!p-0 !mb-2.5 overflow-hidden">
                {/* Date header */}
                <div className="flex items-baseline justify-between px-3.5 py-2 bg-salve-card2/40 border-b border-salve-border/50">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-salve-textMid font-montserrat">{fmtDateRelative(date)}</span>
                  <div className="flex items-baseline gap-2">
                    {cp && (
                      <span className="text-[10px] font-montserrat" style={{ color: cp.color }}>
                        {cp.phase} day {cp.dayOfCycle}
                      </span>
                    )}
                    <span className="text-[10px] text-salve-textFaint font-montserrat">{fmtDate(date)}</span>
                  </div>
                </div>
                {/* Entries for this date */}
                <div className="divide-y divide-salve-border/40">
                  {entries.map(v => {
                    const t = VITAL_TYPES.find(x => x.id === v.type);
                    const flag = getVitalFlag(v.type, v.value, v.value2);
                    const fs = flagStyle(flag);
                    const src = getSource(v);
                    const SrcIcon = SOURCE_ICON[src];
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
                            <span className="text-[13px] text-salve-textMid font-montserrat">{t?.label}</span>
                            <span className="text-[14px] font-semibold font-montserrat" style={{ color: flag ? fs.color : C.sage }}>
                              {displayVal}<span className="text-[11px] font-normal text-salve-textFaint ml-0.5">{t?.unit}</span>
                            </span>
                            {flag && <span className="text-[10px] font-medium" style={{ color: fs.color }}>({flag.label})</span>}
                            {v.notes && <span className="text-[11px] text-salve-textFaint italic">— {v.notes}</span>}
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
                  })}
                </div>
              </Card>
            );
          });
        })()
      }
    </div>
  );
}
