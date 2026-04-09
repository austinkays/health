import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Check, Edit, Trash2, Heart, Calendar, ChevronLeft, ChevronRight, Upload, Loader } from 'lucide-react';
import { OuraIcon } from '../ui/OuraIcon';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import DropZone from '../ui/DropZone';
import FormWrap from '../ui/FormWrap';
import { fmtDate, todayISO, localISODate } from '../../utils/dates';
import { C } from '../../constants/colors';
import { EMPTY_CYCLE, FLOW_LEVELS, CYCLE_SYMPTOMS, CERVICAL_MUCUS_LEVELS, FERTILITY_MARKERS } from '../../constants/defaults';
import { detectFloFormat, parseFloExport } from '../../services/flo';
import { computeCycleStats, getCyclePhase, predictNextPeriod, getDayOfCycle, estimateFertility, getCycleAlerts, getSymptothermalStatus, detectBBTShift } from '../../utils/cycles';
import { isOuraConnected, syncAllOuraData } from '../../services/oura';

/* ── Calendar helpers ────────────────────────────────────── */

function getMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { startDay, daysInMonth };
}

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

/* ── Component ───────────────────────────────────────────── */

const OVERLAY_KEY = 'salve:cycle-overlays';
const DEFAULT_OVERLAYS = { predicted: true, fertile: true, ovulation: true, symptoms: true, fertilityPct: false };
function loadOverlays() {
  try { return { ...DEFAULT_OVERLAYS, ...JSON.parse(localStorage.getItem(OVERLAY_KEY)) }; }
  catch { return { ...DEFAULT_OVERLAYS }; }
}

export default function CycleTracker({ data, addItem, addItemSilent, updateItem, removeItem, highlightId, quickLog }) {
  const [subView, setSubView] = useState(null);      // null | 'form' | 'import'
  const [form, setForm] = useState({ ...EMPTY_CYCLE });
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [overlays, setOverlays] = useState(loadOverlays);
  const toggleOverlay = (key) => setOverlays(prev => {
    const next = { ...prev, [key]: !prev[key] };
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(next));
    return next;
  });
  const [ouraSyncing, setOuraSyncing] = useState(false);
  const [ouraSyncMsg, setOuraSyncMsg] = useState(null);
  const fileRef = useRef(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const cycles = data.cycles || [];

  /* Deep-link support */
  useEffect(() => {
    if (highlightId && cycles.some(c => c.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Quick-log: auto-open period form when navigated with quickLog flag */
  useEffect(() => {
    if (quickLog && !subView) {
      const today = todayISO();
      setForm({ ...EMPTY_CYCLE, date: today, type: 'period', value: 'Medium' });
      setSubView('form');
    }
  }, [quickLog]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Data source badges */
  const cycleSources = useMemo(() => {
    const sources = [];
    const hasOura = cycles.some(c => c.notes?.includes('Oura'));
    const hasFlo = cycles.some(c => c.notes?.includes('Flo')) || localStorage.getItem('salve:flo-imported') === '1';
    const hasManual = cycles.some(c => !c.notes?.includes('Oura') && !c.notes?.includes('Flo'));
    if (hasFlo) sources.push('Flo');
    if (hasOura) sources.push('Oura');
    if (hasManual) sources.push('Manual');
    return sources;
  }, [cycles]);

  /* Cycle statistics */
  const stats = useMemo(() => computeCycleStats(cycles), [cycles]);
  const dayOfCycle = useMemo(() => getDayOfCycle(stats), [stats]);
  const nextPeriod = useMemo(() => predictNextPeriod(stats), [stats]);
  const phase = useMemo(() => getCyclePhase(dayOfCycle, stats.avgLength), [dayOfCycle, stats.avgLength]);
  const cycleAlerts = useMemo(() => getCycleAlerts(stats, cycles), [stats, cycles]);
  const stStatus = useMemo(() => getSymptothermalStatus(cycles, stats), [cycles, stats]);
  const bbtData = useMemo(() => {
    return cycles
      .filter(c => c.type === 'bbt' && c.value)
      .map(c => ({ date: c.date, temp: parseFloat(c.value) }))
      .filter(c => !isNaN(c.temp))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-20); // last 20 readings
  }, [cycles]);
  const bbtShift = useMemo(() => detectBBTShift(cycles), [cycles]);

  /* Date → records lookup for calendar */
  const dateMap = useMemo(() => {
    const m = {};
    for (const c of cycles) {
      if (!m[c.date]) m[c.date] = [];
      m[c.date].push(c);
    }
    return m;
  }, [cycles]);

  /* Calendar navigation */
  const prevMonth = () => setCalMonth(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 });
  const nextMonth = () => setCalMonth(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 });
  const monthLabel = new Date(calMonth.year, calMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const { startDay, daysInMonth } = getMonthDays(calMonth.year, calMonth.month);

  /* Predicted period days for calendar overlay */
  const predictedDays = useMemo(() => {
    if (!nextPeriod) return new Set();
    const s = new Set();
    const d = new Date(nextPeriod + 'T00:00:00');
    for (let i = 0; i < 5; i++) {
      s.add(localISODate(d));
      d.setDate(d.getDate() + 1);
    }
    return s;
  }, [nextPeriod]);

  /* Fertile window overlay */
  const fertileDays = useMemo(() => {
    if (!nextPeriod) return new Set();
    const s = new Set();
    // Fertile window: ovulation day - 5 to ovulation day + 1 from NEXT cycle start
    const nextStart = new Date(nextPeriod + 'T00:00:00');
    const ov = new Date(nextStart);
    ov.setDate(ov.getDate() - 14);
    for (let i = -5; i <= 1; i++) {
      const fd = new Date(ov);
      fd.setDate(fd.getDate() + i);
      s.add(localISODate(fd));
    }
    return s;
  }, [nextPeriod, stats.avgLength]);

  /* Fertility % for each day of the displayed month */
  const fertilityMap = useMemo(() => {
    if (!stats.periodStarts.length) return {};
    const map = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dk = dateKey(calMonth.year, calMonth.month, day);
      const target = new Date(dk + 'T00:00:00');
      // Find the most recent period start on or before this date
      let cycleStart = null;
      for (let i = stats.periodStarts.length - 1; i >= 0; i--) {
        const s = new Date(stats.periodStarts[i] + 'T00:00:00');
        if (s <= target) { cycleStart = s; break; }
      }
      // For future dates past the last period, use projected cycle starts
      if (!cycleStart && stats.lastPeriod && stats.avgLength > 0) {
        const last = new Date(stats.lastPeriod + 'T00:00:00');
        while (last <= target) {
          cycleStart = new Date(last);
          last.setDate(last.getDate() + stats.avgLength);
        }
      }
      if (cycleStart) {
        const dayOfCyc = Math.floor((target - cycleStart) / 86400000) + 1;
        if (dayOfCyc > 0 && dayOfCyc <= stats.avgLength * 2) {
          map[dk] = estimateFertility(dayOfCyc, stats.avgLength);
        }
      }
    }
    return map;
  }, [calMonth.year, calMonth.month, daysInMonth, stats]);

  /* Save handler */
  const [saveError, setSaveError] = useState(null);
  const save = async () => {
    if (!form.date) return;
    setSaveError(null);
    try {
      if (editId) await updateItem('cycles', editId, form);
      else await addItem('cycles', form);
      setForm({ ...EMPTY_CYCLE }); setEditId(null); setSubView(null);
    } catch (err) {
      console.error('[CycleTracker] Save failed:', err);
      setSaveError(err.message || 'Save failed. The cycles table may need to be created in your database.');
    }
  };

  /* Quick-log: tap a calendar day to log period */
  const calendarQuickLog = useCallback((dateStr) => {
    setForm({ ...EMPTY_CYCLE, date: dateStr, type: 'period', value: 'Medium' });
    setSubView('form');
  }, []);

  /* Flo import handler */
  const processFloFile = async (file) => {
    if (!file) return;
    setImporting(true); setImportResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!detectFloFormat(json)) {
        setImportResult({ error: 'This file does not appear to be a Flo export.' });
        return;
      }
      const records = parseFloExport(json);
      if (records.length === 0) {
        setImportResult({ error: 'No cycle data found in this file.' });
        return;
      }
      // Dedupe against existing
      const existingKeys = new Set(cycles.map(c => `${c.date}|${c.type}|${c.value}|${c.symptom}`));
      const newRecords = records.filter(r => !existingKeys.has(`${r.date}|${r.type}|${r.value}|${r.symptom}`));
      const silentAdd = addItemSilent || addItem;
      let added = 0;
      for (const r of newRecords) {
        await silentAdd('cycles', { ...r, notes: r.notes || 'Imported from Flo' });
        added++;
      }
      if (added > 0) localStorage.setItem('salve:flo-imported', '1');
      setImportResult({ success: true, total: records.length, added, skipped: records.length - added });
    } catch {
      setImportResult({ error: 'Could not parse file. Please upload a valid Flo JSON export.' });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /* ── Form view ─────────────────────────────────────────── */
  if (subView === 'form') {
    const typeOptions = [
      { value: 'period', label: 'Period' },
      { value: 'cervical_mucus', label: 'Cervical Mucus' },
      { value: 'bbt', label: 'BBT (Temperature)' },
      { value: 'symptom', label: 'Symptom' },
      { value: 'ovulation', label: 'Ovulation' },
      { value: 'fertility_marker', label: 'Other Marker' },
    ];

    return (
      <FormWrap title={`${editId ? 'Edit' : 'Log'} Cycle Entry`} onBack={() => { setSubView(null); setForm({ ...EMPTY_CYCLE }); setEditId(null); }}>
        <Card>
          <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" required />
          <Field label="Type" value={form.type} onChange={v => sf('type', v)} options={typeOptions.map(o => o.value)} optionLabels={typeOptions} />

          {form.type === 'period' && (
            <Field label="Flow" value={form.value} onChange={v => sf('value', v)} options={['', ...FLOW_LEVELS]} />
          )}

          {form.type === 'cervical_mucus' && (
            <>
              <Field label="Mucus Type" value={form.value} onChange={v => sf('value', v)}
                options={['', ...CERVICAL_MUCUS_LEVELS.map(l => l.value)]}
                optionLabels={[{ value: '', label: 'Select...' }, ...CERVICAL_MUCUS_LEVELS]}
              />
              {form.value && (
                <div className="text-[11px] font-montserrat px-1 -mt-1 mb-2" style={{
                  color: form.value === 'eggwhite' ? C.amber : form.value === 'creamy' ? C.lav : form.value === 'sticky' ? C.textMid : C.sage
                }}>
                  {form.value === 'dry' && '→ Infertile, dense mucus blocks sperm'}
                  {form.value === 'sticky' && '→ Low fertility, minimal sperm survival'}
                  {form.value === 'creamy' && '→ Medium fertility, approaching ovulation'}
                  {form.value === 'eggwhite' && '→ Peak fertility, ovulation likely within 1–2 days'}
                </div>
              )}
            </>
          )}

          {form.type === 'bbt' && (
            <>
              <Field label="Temperature (°F)" value={form.value} onChange={v => sf('value', v)}
                type="number" placeholder="e.g. 97.45"
              />
              <p className="text-[10px] text-salve-textFaint font-montserrat italic -mt-1 mb-2 px-1">
                Same time each morning, before getting up.
              </p>
            </>
          )}

          {form.type === 'symptom' && (
            <>
              <Field label="Symptom" value={form.symptom} onChange={v => sf('symptom', v)} options={['', ...CYCLE_SYMPTOMS]} />
              <Field label="Severity" value={form.value} onChange={v => sf('value', v)} options={['', 'Mild', 'Moderate', 'Severe']} />
            </>
          )}

          {form.type === 'fertility_marker' && (
            <Field label="Marker" value={form.value} onChange={v => sf('value', v)} options={['', ...FERTILITY_MARKERS]} />
          )}

          <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Any additional details..." />
          {saveError && (
            <div className="text-xs text-salve-rose font-montserrat bg-salve-rose/10 border border-salve-rose/20 rounded-lg p-2.5 mb-2">
              {saveError}
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={save} disabled={!form.date}><Check size={15} /> Save</Button>
            <Button variant="ghost" onClick={() => { setSubView(null); setForm({ ...EMPTY_CYCLE }); setEditId(null); }}>Cancel</Button>
          </div>
        </Card>
      </FormWrap>
    );
  }

  /* ── Import view ───────────────────────────────────────── */
  if (subView === 'import') {
    return (
      <FormWrap title="Import from Flo" onBack={() => { setSubView(null); setImportResult(null); }}>
        <Card>
          <p className="text-sm text-salve-textMid mb-3 font-montserrat leading-relaxed">
            Upload your Flo GDPR data export (JSON). Go to Flo → Profile → Settings → Request My Data, then upload the file here.
          </p>
          <DropZone
            onFile={processFloFile}
            accept=".json"
            label="Drop Flo export here"
            hint="Or click to browse, accepts .json"
            className="mb-3"
          />
          <input ref={fileRef} type="file" accept=".json" onChange={(e) => processFloFile(e.target.files?.[0])} className="block w-full text-sm text-salve-textMid md:hidden file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-salve-rose/15 file:text-salve-rose file:cursor-pointer cursor-pointer font-montserrat" />
          {importing && <p className="text-xs text-salve-lav mt-2 font-montserrat animate-pulse">Importing…</p>}
          {importResult?.error && <p className="text-xs text-salve-rose mt-2 font-montserrat">{importResult.error}</p>}
          {importResult?.success && (
            <div className="mt-3 p-3 rounded-xl border border-salve-sage/30 bg-salve-sage/10">
              <p className="text-sm text-salve-sage font-medium font-montserrat">
                ✓ Imported {importResult.added} record{importResult.added !== 1 ? 's' : ''}
                {importResult.skipped > 0 && <span className="text-salve-textFaint"> ({importResult.skipped} duplicates skipped)</span>}
              </p>
            </div>
          )}
          <Button variant="ghost" onClick={() => { setSubView(null); setImportResult(null); }} className="mt-3">Back</Button>
        </Card>
      </FormWrap>
    );
  }

  /* ── Filter ────────────────────────────────────────────── */
  const filtered = filter === 'all' ? cycles
    : filter === 'fertility' ? cycles.filter(c => ['cervical_mucus', 'bbt', 'fertility_marker', 'ovulation'].includes(c.type))
    : cycles.filter(c => c.type === filter);

  const today = todayISO();

  /* ── Main view ─────────────────────────────────────────── */
  return (
    <div className="mt-2">
      <div className="flex justify-end gap-1.5 mb-3">
        {isOuraConnected() && (
          <button
            onClick={async () => {
              setOuraSyncing(true);
              setOuraSyncMsg(null);
              try {
                const baseline = parseFloat(localStorage.getItem('salve:oura-baseline')) || 97.7;
                const results = await syncAllOuraData({ cycles, vitals: [], activities: [] }, addItemSilent || addItem, 30, baseline);
                const tempResult = results.temperature || {};
                setOuraSyncMsg(tempResult.added > 0 ? `+${tempResult.added} reading${tempResult.added !== 1 ? 's' : ''}` : 'Up to date');
                setTimeout(() => setOuraSyncMsg(null), 3000);
              } catch { setOuraSyncMsg('Sync failed'); setTimeout(() => setOuraSyncMsg(null), 3000); }
              finally { setOuraSyncing(false); }
            }}
            disabled={ouraSyncing}
            className="bg-salve-card2 border border-salve-border rounded-lg px-3 py-1.5 text-[11px] text-salve-sage font-montserrat
              flex items-center gap-1.5 hover:border-salve-sage/40 transition-colors cursor-pointer disabled:opacity-50"
          >
            {ouraSyncing ? <Loader size={11} className="animate-spin" /> : <OuraIcon size={11} />}
            {ouraSyncMsg || (ouraSyncing ? 'Syncing...' : 'Oura Sync')}
          </button>
        )}
        <Button variant="secondary" onClick={() => setSubView('import')} className="!py-1.5 !px-3 !text-xs"><Upload size={13} /> Import</Button>
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Log</Button>
      </div>

      {/* ── Stats card ───────────────────────────────────── */}
      {stats.lastPeriod && (
        <Card className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">Cycle Overview</span>
              {cycleSources.length > 0 && (
                <div className="flex items-center gap-1">
                  {cycleSources.map(s => (
                    <span key={s} className={`text-[8px] px-1.5 py-0.5 rounded-full font-montserrat ${
                      s === 'Flo' ? 'bg-salve-rose/15 text-salve-rose' :
                      s === 'Oura' ? 'bg-salve-sage/15 text-salve-sage' :
                      'bg-salve-card2 text-salve-textFaint'
                    }`}>{s}</span>
                  ))}
                </div>
              )}
            </div>
            {phase && (
              <Badge style={{ color: phase.color, backgroundColor: `${phase.color}22` }}>{phase.name} phase</Badge>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-playfair font-semibold" style={{ color: C.rose }}>{dayOfCycle > 0 ? dayOfCycle : ', '}</div>
              <div className="text-[10px] text-salve-textFaint font-montserrat uppercase">Day</div>
            </div>
            <div>
              <div className="text-2xl font-playfair font-semibold" style={{ color: C.lav }}>{stats.avgLength}</div>
              <div className="text-[10px] text-salve-textFaint font-montserrat uppercase">Avg length</div>
            </div>
            <div>
              <div className="text-2xl font-playfair font-semibold" style={{ color: C.amber }}>
                {nextPeriod ? Math.max(0, Math.ceil((new Date(nextPeriod + 'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000)) : ', '}
              </div>
              <div className="text-[10px] text-salve-textFaint font-montserrat uppercase">Days until</div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Alerts (short cycle, BBT shift, peak mucus) ─── */}
      {cycleAlerts.length > 0 && (
        <div className="space-y-2 mb-3">
          {cycleAlerts.map((a, i) => (
            <Card key={i} className="!p-3" style={{
              borderLeft: `3px solid ${a.severity === 'warning' ? C.amber : a.severity === 'success' ? C.sage : C.lav}`
            }}>
              <p className="text-xs text-salve-textMid font-montserrat leading-relaxed m-0">{a.message}</p>
            </Card>
          ))}
        </div>
      )}

      {/* ── Fertility Status ─────────────────────────────── */}
      {stats.lastPeriod && (() => {
        const stColor = stStatus.status.includes('infertile') ? C.sage : stStatus.status === 'peak' ? C.rose : stStatus.status === 'fertile' ? C.amber : C.lav;
        const stLabel = stStatus.status === 'infertile-post' ? 'Infertile' : stStatus.status === 'infertile-pre' ? 'Likely Infertile' : stStatus.status === 'peak' ? 'Peak Fertile' : stStatus.status === 'fertile' ? 'Fertile' : stStatus.status === 'possibly-fertile' ? 'Possibly Fertile' : 'Tracking';
        const checks = [
          { key: 'BBT', ok: stStatus.rules.bbtShiftConfirmed, has: stStatus.rules.hasBBTData },
          { key: 'Mucus', ok: stStatus.rules.peakPlus3 && stStatus.rules.mucusDrying, has: stStatus.rules.hasMucusData },
          { key: 'Calendar', ok: stStatus.rules.calendarZone === 'absolute', has: true },
        ];
        return (
          <Card className="mb-3 !p-3" style={{ borderLeft: `3px solid ${stColor}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base font-playfair font-semibold" style={{ color: stColor }}>{stLabel}</span>
                <span className="text-[9px] text-salve-textFaint font-montserrat">· {stStatus.confidence} confidence</span>
              </div>
              <div className="flex gap-1">
                {checks.map(c => (
                  <span key={c.key} className={`text-[8px] font-montserrat px-1.5 py-0.5 rounded-full ${c.ok ? 'bg-salve-sage/15 text-salve-sage' : c.has ? 'bg-salve-card2 text-salve-textFaint' : 'text-salve-textFaint opacity-40'}`}>
                    {c.ok ? '✓' : '○'} {c.key}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-salve-textMid font-montserrat mt-1">{stStatus.details}</p>
          </Card>
        );
      })()}

      {/* ── BBT Chart ────────────────────────────────────── */}
      {bbtData.length >= 3 && (
        <Card className="mb-3 !p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium font-montserrat text-salve-textFaint uppercase tracking-wider">BBT</span>
            {bbtShift.confirmed
              ? <span className="text-[9px] font-montserrat text-salve-sage">✓ Shift on {new Date(bbtShift.shiftDay + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              : <span className="text-[9px] font-montserrat text-salve-textFaint">{bbtData.length} readings</span>
            }
          </div>
          <div className="relative h-20">
            {(() => {
              const temps = bbtData.map(d => d.temp);
              const min = Math.floor(Math.min(...temps) * 10) / 10 - 0.1;
              const max = Math.ceil(Math.max(...temps) * 10) / 10 + 0.1;
              const range = max - min || 1;
              const coverLine = bbtShift.confirmed ? bbtShift.baselineAvg + 0.3 : null;
              return (
                <>
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    <span className="text-[7px] text-salve-textFaint font-montserrat">{max.toFixed(1)}°</span>
                    <span className="text-[7px] text-salve-textFaint font-montserrat">{min.toFixed(1)}°</span>
                  </div>
                  {coverLine && coverLine >= min && coverLine <= max && (
                    <div className="absolute left-5 right-0 border-t border-dashed pointer-events-none" style={{ borderColor: `${C.sage}55`, top: `${(1 - (coverLine - min) / range) * 100}%` }} />
                  )}
                  <svg className="absolute left-5 right-0 top-0 bottom-0 overflow-visible" viewBox={`0 0 ${bbtData.length - 1} 1`} preserveAspectRatio="none">
                    <polyline fill="none" stroke={C.lav} strokeWidth="0.03" points={bbtData.map((d, i) => `${i},${1 - (d.temp - min) / range}`).join(' ')} />
                    {bbtData.map((d, i) => (
                      <circle key={d.date} cx={i} cy={1 - (d.temp - min) / range} r="0.04"
                        fill={coverLine && d.temp >= coverLine ? C.sage : C.lav}
                        stroke={coverLine && d.temp >= coverLine ? C.sage : C.lav} strokeWidth="0.01" />
                    ))}
                  </svg>
                  <div className="absolute left-5 right-0 bottom-0 flex justify-between translate-y-3">
                    <span className="text-[7px] text-salve-textFaint font-montserrat">{new Date(bbtData[0].date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    <span className="text-[7px] text-salve-textFaint font-montserrat">{new Date(bbtData[bbtData.length - 1].date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </Card>
      )}

      {/* ── Calendar ─────────────────────────────────────── */}
      <Card className="mb-3 md:max-w-[540px]">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-salve-card2 cursor-pointer transition-colors" aria-label="Previous month"><ChevronLeft size={18} className="text-salve-textMid" /></button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium font-montserrat text-salve-text">{monthLabel}</span>
            {/* Show "Today" button only when the current month isn't visible */}
            {(calMonth.year !== new Date().getFullYear() || calMonth.month !== new Date().getMonth()) && (
              <button
                onClick={() => { const n = new Date(); setCalMonth({ year: n.getFullYear(), month: n.getMonth() }); }}
                className="text-[10px] text-salve-lav font-montserrat px-2 py-0.5 rounded-full border border-salve-lav/30 bg-salve-lav/10 hover:bg-salve-lav/20 cursor-pointer transition-colors"
                aria-label="Go to today"
              >
                Today
              </button>
            )}
          </div>
          <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-salve-card2 cursor-pointer transition-colors" aria-label="Next month"><ChevronRight size={18} className="text-salve-textMid" /></button>
        </div>

        {/* Overlay toggles, tap to show/hide calendar layers */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {[
            { key: 'predicted', label: 'Predicted Period', color: C.rose, swatch: <span className="w-2.5 h-2.5 rounded-sm shrink-0 border border-dashed" style={{ borderColor: `${C.rose}88`, backgroundColor: `${C.rose}18` }} /> },
            { key: 'fertile',   label: 'Fertile Window',   color: C.amber, swatch: <span className="w-2.5 h-2.5 rounded-sm shrink-0 border" style={{ backgroundColor: `${C.amber}30`, borderColor: `${C.amber}40` }} /> },
            { key: 'ovulation', label: 'Ovulation',        color: C.amber, swatch: <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: `${C.amber}55` }} /> },
            { key: 'symptoms',  label: 'Symptoms',         color: C.lav,   swatch: <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: C.lav }} /> },
            { key: 'fertilityPct', label: 'Fertility %',   color: C.sage,  swatch: <span className="w-2.5 h-2.5 rounded-sm shrink-0 flex items-center justify-center text-[6px] font-bold" style={{ backgroundColor: `${C.sage}30`, color: C.sage }}>%</span> },
          ].map(t => (
            <button key={t.key} onClick={() => toggleOverlay(t.key)}
              className={`flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[11px] font-medium font-montserrat cursor-pointer transition-all border ${
                overlays[t.key]
                  ? 'border-salve-border2 bg-salve-card2 text-salve-text'
                  : 'border-transparent bg-transparent text-salve-textFaint line-through opacity-50'
              }`}
              aria-label={`${overlays[t.key] ? 'Hide' : 'Show'} ${t.label}`}
              aria-pressed={overlays[t.key]}
            >
              {t.swatch}
              {t.label}
            </button>
          ))}
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-center text-[10px] font-montserrat text-salve-textFaint font-medium">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dk = dateKey(calMonth.year, calMonth.month, day);
            const entries = dateMap[dk] || [];
            const hasPeriod = entries.some(e => e.type === 'period');
            const hasSymptom = entries.some(e => e.type === 'symptom');
            const hasOvulation = entries.some(e => e.type === 'ovulation');
            const hasFertility = entries.some(e => e.type === 'fertility_marker');
            const hasMucus = entries.some(e => e.type === 'cervical_mucus');
            const hasBBT = entries.some(e => e.type === 'bbt');
            const peakMucus = entries.some(e => e.type === 'cervical_mucus' && e.value === 'eggwhite');
            const isPredicted = overlays.predicted && !hasPeriod && predictedDays.has(dk);
            const isFertile = overlays.fertile && !hasOvulation && fertileDays.has(dk);
            const showOvulation = overlays.ovulation && hasOvulation;
            const showSymptom = overlays.symptoms && hasSymptom;
            const isToday = dk === today;
            const fertData = overlays.fertilityPct ? (fertilityMap[dk] ?? null) : null;
            const fertPct = fertData?.pct ?? null;
            const fertZone = fertData?.zone ?? null;

            let bg = 'transparent';
            let border = 'transparent';
            if (hasPeriod) bg = `${C.rose}55`;
            else if (isPredicted) { bg = `${C.rose}18`; border = `${C.rose}88`; }
            else if (showOvulation) bg = `${C.amber}55`;
            else if (isFertile) { bg = `${C.amber}30`; border = `${C.amber}40`; }

            // Fertility % tints the cell based on zone and level
            if (fertPct !== null && bg === 'transparent') {
              if (fertZone === 'peak' || fertZone === 'fertile') {
                const op = Math.round(fertPct * 0.35).toString(16).padStart(2, '0');
                bg = `${C.amber}${op}`;
              } else if (fertZone === 'buffer') {
                bg = `${C.amber}10`;
              } else if (fertZone === 'absolute') {
                bg = `${C.sage}25`;
              } else if (fertZone === 'relative') {
                bg = `${C.sage}10`;
              }
            }

            // Color for the % label
            const fertLabelColor = fertZone === 'peak' ? C.amber
              : fertZone === 'fertile' ? C.amber
              : fertZone === 'buffer' ? C.amber
              : fertZone === 'absolute' ? C.sage
              : C.textFaint;

            return (
              <button key={day} onClick={() => calendarQuickLog(dk)}
                className="relative aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-montserrat cursor-pointer transition-all hover:bg-salve-card2"
                style={{ backgroundColor: bg, borderWidth: (isPredicted || isToday || isFertile) ? 1 : 0, borderColor: isToday ? C.lav : border, borderStyle: isPredicted ? 'dashed' : 'solid', boxShadow: isToday ? `0 0 0 2px ${C.lav}55` : undefined }}
                aria-label={`${dk}${hasPeriod ? ', period logged' : ''}${showSymptom ? ', symptom logged' : ''}${showOvulation ? ', ovulation' : ''}${isPredicted ? ', predicted period' : ''}${isFertile ? ', fertile window' : ''}${fertPct !== null ? `, ~${fertPct}% fertility (${fertZone})` : ''}`}
              >
                <span className={`leading-none ${isToday ? 'font-bold text-salve-lav' : hasPeriod ? 'font-semibold text-salve-rose' : 'text-salve-textMid'}`}>{day}</span>
                {fertData !== null ? (
                  <span className="text-[7px] leading-none mt-0.5 font-medium" style={{ color: fertLabelColor }}>
                    {fertZone === 'absolute' ? '0%' : `${fertPct}%`}
                  </span>
                ) : (
                  <div className="flex gap-0.5 mt-0.5 h-1">
                    {hasPeriod && <span className="w-1 h-1 rounded-full" style={{ backgroundColor: C.rose }} />}
                    {showSymptom && <span className="w-1 h-1 rounded-full" style={{ backgroundColor: C.lav }} />}
                    {peakMucus && <span className="w-1 h-1 rounded-full" style={{ backgroundColor: C.amber }} />}
                    {!peakMucus && hasMucus && <span className="w-1 h-1 rounded-full" style={{ backgroundColor: C.sage }} />}
                    {hasBBT && <span className="w-1 h-1 rounded-full" style={{ backgroundColor: C.textMid }} />}
                    {(showOvulation || (overlays.fertile && hasFertility)) && <span className="w-1 h-1 rounded-full" style={{ backgroundColor: C.amber }} />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Compact legend */}
        <div className="flex items-center justify-between mt-2.5 text-[8px] font-montserrat text-salve-textFaint">
          <span>Avg {stats.avgLength}d · Tap to log</span>
          {overlays.fertilityPct && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: `${C.amber}55` }} /> Fertile</span>
              <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: `${C.sage}25` }} /> Infertile</span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Filter pills ────────────────────────────────── */}
      <div className="flex gap-1.5 mb-3.5 flex-wrap">
        {[
          { key: 'all', label: 'All' },
          { key: 'period', label: 'Period' },
          { key: 'cervical_mucus', label: 'Mucus' },
          { key: 'bbt', label: 'BBT' },
          { key: 'symptom', label: 'Symptoms' },
          { key: 'fertility', label: 'Fertility' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat ${
              filter === f.key ? 'border-salve-rose bg-salve-rose/15 text-salve-rose' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >{f.label}</button>
        ))}
      </div>

      {/* ── Records list ─────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState icon={Heart} text="No cycle data logged yet" motif="moon" />
      ) : (
        <div className="md:grid md:grid-cols-2 md:gap-3">
        {filtered.map(c => {
          const isExpanded = expandedId === c.id;
          const isHighlighted = highlightId === c.id;

          return (
            <div key={c.id} id={`record-${c.id}`} className={isHighlighted ? 'highlight-pulse rounded-2xl' : ''}>
              <Card className="mb-2 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm font-montserrat text-salve-text">
                        {c.type === 'fertility_marker' ? 'Marker' : c.type === 'cervical_mucus' ? 'Cervical Mucus' : c.type === 'bbt' ? 'BBT' : c.type.charAt(0).toUpperCase() + c.type.slice(1)}
                      </span>
                      {c.type === 'period' && c.value && (
                        <Badge style={{ color: C.rose, backgroundColor: `${C.rose}22` }}>{c.value}</Badge>
                      )}
                      {c.type === 'cervical_mucus' && c.value && (
                        <Badge style={{ color: c.value === 'eggwhite' ? C.amber : c.value === 'creamy' ? C.lav : C.sage, backgroundColor: `${c.value === 'eggwhite' ? C.amber : c.value === 'creamy' ? C.lav : C.sage}22` }}>
                          {CERVICAL_MUCUS_LEVELS.find(l => l.value === c.value)?.label || c.value}
                        </Badge>
                      )}
                      {c.type === 'bbt' && c.value && (
                        <Badge style={{ color: C.lav, backgroundColor: `${C.lav}22` }}>{c.value}°F</Badge>
                      )}
                      {c.type === 'symptom' && c.symptom && (
                        <Badge style={{ color: C.lav, backgroundColor: `${C.lav}22` }}>{c.symptom}</Badge>
                      )}
                      {c.type === 'ovulation' && (
                        <Badge style={{ color: C.amber, backgroundColor: `${C.amber}22` }}>Ovulation</Badge>
                      )}
                      {c.type === 'fertility_marker' && c.value && (
                        <Badge style={{ color: C.sage, backgroundColor: `${C.sage}22` }}>{c.value}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-salve-textFaint font-montserrat mt-0.5">{fmtDate(c.date)}</div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-salve-border space-y-2">
                    {c.type === 'symptom' && c.value && (
                      <div className="text-xs text-salve-textMid font-montserrat">Severity: {c.value}</div>
                    )}
                    {c.notes && <p className="text-xs text-salve-textMid font-montserrat">{c.notes}</p>}

                    <div className="flex gap-2 pt-1">
                      <button aria-label="Edit cycle entry" onClick={(e) => { e.stopPropagation(); setForm({ date: c.date, type: c.type, value: c.value || '', symptom: c.symptom || '', notes: c.notes || '' }); setEditId(c.id); setSubView('form'); }}
                        className="p-1.5 rounded-lg hover:bg-salve-card2 transition-colors cursor-pointer"><Edit size={14} className="text-salve-textFaint" /></button>
                      {del.id === c.id ? <ConfirmBar onConfirm={async () => { await removeItem('cycles', c.id); del.clear(); }} onCancel={del.clear} label="Delete?" />
                        : <button aria-label="Delete cycle entry" onClick={(e) => { e.stopPropagation(); del.set(c.id); }}
                            className="p-1.5 rounded-lg hover:bg-salve-card2 transition-colors cursor-pointer"><Trash2 size={14} className="text-salve-textFaint" /></button>}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}
