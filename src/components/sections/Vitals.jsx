import { useState } from 'react';
import { Plus, Check, Heart, Trash2, AlertTriangle, TrendingUp, Loader } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import Motif from '../ui/Motif';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { VITAL_TYPES, EMPTY_VITAL } from '../../constants/defaults';
import { fmtDate } from '../../utils/dates';
import { C } from '../../constants/colors';
import { fetchVitalsTrend } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';

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
  if (flag.level === 'critical') return { color: C.rose, bg: 'rgba(232,138,154,0.15)' };
  if (flag.level === 'high') return { color: C.amber, bg: 'rgba(232,200,138,0.15)' };
  return { color: C.amber, bg: 'rgba(232,200,138,0.15)' };
};

export default function Vitals({ data, addItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_VITAL });
  const [ct, setCt] = useState('pain');
  const [trendAI, setTrendAI] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

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
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Log</Button>}>
        Vitals
      </SectionTitle>

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

      {cd.length > 1 ? (
        <Card className="!p-3.5">
          <div className="font-playfair text-sm font-medium mb-2.5 pl-1.5 text-salve-text">
            {vi?.label} <span className="font-normal text-salve-textFaint text-xs">over time</span>
          </div>
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
            </AreaChart>
          </ResponsiveContainer>
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
            {trendLoading ? <><Loader size={13} className="animate-spin" /> Analyzing trends...</> : <><TrendingUp size={13} /> Analyze Trends with AI</>}
          </Button>
          {trendAI && (
            <Card className="!bg-salve-lav/8 !border-salve-lav/20 mt-2">
              <div className="text-[13px] text-salve-textMid leading-relaxed whitespace-pre-wrap">{trendAI}</div>
            </Card>
          )}
        </div>
      )}

      <SectionTitle>Recent Entries</SectionTitle>
      {data.vitals.length === 0 ? <EmptyState icon={Heart} text="No vitals logged yet" motif="sparkle" /> :
        data.vitals.slice().reverse().slice(0, 15).map(v => {
          const t = VITAL_TYPES.find(x => x.id === v.type);
          const flag = getVitalFlag(v.type, v.value, v.value2);
          const fs = flagStyle(flag);
          return (
            <Card key={v.id} className="!p-3.5" style={flag ? { borderLeft: `3px solid ${fs.color}` } : undefined}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  {flag && <AlertTriangle size={13} color={fs.color} />}
                  <div>
                    <span className="text-[13px] font-medium text-salve-text">{t?.label}: </span>
                    <span className="text-sm font-semibold" style={{ color: flag ? fs.color : C.sage }}>{v.type === 'bp' ? `${v.value}/${v.value2}` : v.value} {t?.unit}</span>
                    {flag && <span className="text-[10px] font-medium ml-1.5" style={{ color: fs.color }}>({flag.label})</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-salve-textFaint">{fmtDate(v.date)}</span>
                  <button onClick={() => del.ask(v.id, t?.label || 'entry')} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={14} /></button>
                </div>
              </div>
              {v.notes && <div className="text-xs text-salve-textMid mt-1">{v.notes}</div>}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('vitals', id))} onCancel={del.cancel} itemId={v.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
