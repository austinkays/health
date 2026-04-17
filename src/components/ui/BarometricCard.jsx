import { useState, useEffect } from 'react';
import {
  Wind, ChevronDown, Plus, Loader, MapPin,
  TrendingUp, TrendingDown, Minus, Zap,
  Minimize2, Maximize2, EyeOff,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import Card from './Card';
import { fmtDate, todayISO } from '../../utils/dates';
import { fetchBarometricData, BARO_SCIENCE } from '../../services/barometric';
import { C } from '../../constants/colors';

/* ── Trend config ──────────────────────────────────────────── */

const TREND = {
  rising: {
    Icon: TrendingUp,
    label: 'Rising',
    color: () => C.amber,
    tip: 'Pressure is rising, usually signaling improving weather. Many people feel better on rising-pressure days.',
  },
  falling: {
    Icon: TrendingDown,
    label: 'Falling',
    color: () => C.rose,
    tip: 'Pressure is dropping. This is commonly linked to increased joint pain, migraines, and autonomic symptoms. Today may be a good day to rest.',
  },
  stable: {
    Icon: Minus,
    label: 'Stable',
    color: () => C.sage,
    tip: 'Pressure is stable, typically a more predictable day for pressure-sensitive conditions.',
  },
};

/* ── Scientific explanations come from services/barometric.js as BARO_SCIENCE ── */

/* ── Component ─────────────────────────────────────────────── */

/**
 * @param {Object} props
 * @param {string}   props.locationStr      - User profile location (e.g. "Chicago, IL")
 * @param {Function} props.onLogPressure    - Called with a partial vital object to pre-fill the log form
 * @param {Function} props.onAutoLogPressure - Called with a complete vital object to save directly (auto-log)
 */
export default function BarometricCard({ locationStr, onLogPressure, onAutoLogPressure, onNav, defaultMode = 'full' }) {
  const [baro, setBaro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sciOpen, setSciOpen] = useState(false);
  const [logged, setLogged] = useState(false);
  const [autoLog, setAutoLog] = useState(() => localStorage.getItem('salve:baro-autolog') === 'true');
  const [autoLogged, setAutoLogged] = useState(false);
  const [displayMode, setDisplayMode] = useState(
    () => localStorage.getItem('salve:baro-view') || defaultMode
  );

  const setMode = (mode) => {
    setDisplayMode(mode);
    localStorage.setItem('salve:baro-view', mode);
  };

  const deltaColor =
    baro?.change24h < -1 ? C.rose : baro?.change24h > 1 ? C.amber : C.sage;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBaro(null);

    fetchBarometricData(locationStr)
      .then(d => {
        if (!cancelled) {
          setBaro(d);
          setLoading(false);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e.message || 'Unknown error');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [locationStr]);

  // Auto-log: fires when baro arrives or autoLog is toggled
  useEffect(() => {
    if (!autoLog || !baro?.current || !onAutoLogPressure) return;
    const today = todayISO();
    if (localStorage.getItem('salve:baro-autolog-date') === today) return;
    const t = TREND[baro.trend] ?? TREND.stable;
    onAutoLogPressure({
      type: 'pressure',
      value: String(baro.current),
      unit: 'hPa',
      notes: `Auto-logged: ${t.label}${baro.change24h != null ? ` (${baro.change24h > 0 ? '+' : ''}${baro.change24h} hPa vs 24h ago)` : ''}`,
    });
    localStorage.setItem('salve:baro-autolog-date', today);
    setAutoLogged(true);
  }, [autoLog, baro, onAutoLogPressure]);

  const toggleAutoLog = () => {
    const next = !autoLog;
    setAutoLog(next);
    localStorage.setItem('salve:baro-autolog', String(next));
    if (!next) setAutoLogged(false);
  };

  /* ── Hidden mode — auto-log still runs via useEffect above ── */
  if (displayMode === 'hidden') {
    return (
      <div className="flex items-center gap-1.5 px-0.5 -mt-1 mb-1" style={{ height: 0, overflow: 'visible', position: 'relative', top: '-6px' }}>
        <Wind size={11} aria-hidden="true" style={{ color: C.textFaint, opacity: 0.35 }} />
        <span className="text-ui-sm font-montserrat" style={{ color: C.textFaint, opacity: 0.45 }}>
          Barometric hidden
        </span>
        <button
          onClick={() => setMode('compact')}
          aria-label="Restore barometric pressure card"
          className="text-ui-sm font-montserrat bg-transparent border-0 p-0 cursor-pointer underline"
          style={{ color: C.lav, opacity: 0.65 }}
        >
          Show
        </button>
      </div>
    );
  }

  /* ── Loading skeleton ──────────────────────────────────────── */
  if (loading) {
    return (
      <Card className="mb-4 !bg-transparent !border-salve-border/40">
        <div className="flex items-center gap-2.5 py-1">
          <Loader size={14} className="animate-spin flex-shrink-0" style={{ color: C.textFaint }} />
          <span className="text-ui-base font-montserrat" style={{ color: C.textFaint }}>
            Fetching local barometric pressure…
          </span>
        </div>
      </Card>
    );
  }

  /* ── Error / no location ───────────────────────────────────── */
  if (error || !baro) {
    return (
      <Card className="mb-4 !bg-transparent !border-salve-border/40">
        <div className="flex items-start gap-2.5">
          <Wind size={14} className="flex-shrink-0 mt-0.5" style={{ color: C.textFaint }} />
          <div className="min-w-0">
            <p className="text-ui-base font-montserrat leading-relaxed" style={{ color: C.textFaint }}>
              {error
                ? 'Could not load barometric pressure data.'
                : <>
                    Enable location access or{' '}
                    <button
                      onClick={() => onNav?.('aboutme')}
                      className="underline bg-transparent border-none p-0 font-montserrat text-ui-base cursor-pointer"
                      style={{ color: C.textFaint }}
                    >add your zip code in About Me</button>
                    {' '}to see local barometric pressure.
                  </>}
            </p>
            {error && (
              <p className="text-ui-sm font-montserrat mt-0.5 break-words" style={{ color: C.textFaint, opacity: 0.6 }}>
                {error}
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  /* ── Derived display values ────────────────────────────────── */
  const t = TREND[baro.trend] ?? TREND.stable;
  const TrendIcon = t.Icon;
  const color = t.color();

  // Last 7 days for the sparkline, formatted for display
  const chartData = baro.history.slice(-7).map(d => ({
    label: fmtDate(d.date).replace(/\d{4}/, '').trim().replace(/,$/, ''),
    value: d.value,
  }));

  /* ── Compact mode ─────────────────────────────────────────── */
  if (displayMode === 'compact') {
    return (
      <Card className="mb-4">
        <div className="flex items-start justify-between gap-2.5 sm:items-center">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: `${color}18` }}
            >
              <Wind size={13} style={{ color }} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-x-1 gap-y-1 flex-wrap min-w-0">
                <span className="text-display-md font-semibold font-montserrat leading-none" style={{ color }}>
                  {baro.current ?? '—'}
                </span>
                <span className="text-ui-sm font-montserrat flex-shrink-0" style={{ color: C.textFaint }}>hPa</span>
                <span className="flex items-center gap-0.5 text-ui-base font-medium font-montserrat min-w-0" style={{ color }}>
                  <TrendIcon size={12} aria-hidden="true" />
                  <span className="truncate">{t.label}</span>
                </span>
              </div>
              {baro.change24h != null && (
                <div
                  className="text-ui-sm font-montserrat mt-0.5 truncate"
                  style={{ color: deltaColor }}
                >
                  {baro.change24h > 0 ? '+' : ''}{baro.change24h} hPa 24h
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() => setMode('full')}
              aria-label="Expand barometric pressure card"
              className="p-1.5 rounded-lg bg-transparent border-0 cursor-pointer hover:opacity-70 transition-opacity"
              style={{ color: C.textFaint }}
            >
              <Maximize2 size={13} aria-hidden="true" />
            </button>
            <button
              onClick={() => setMode('hidden')}
              aria-label="Hide barometric pressure card"
              className="p-1.5 rounded-lg bg-transparent border-0 cursor-pointer hover:opacity-70 transition-opacity"
              style={{ color: C.textFaint }}
            >
              <EyeOff size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      </Card>
    );
  }

  const handleLog = () => {
    if (!baro.current || logged) return;
    onLogPressure({
      type: 'pressure',
      value: String(baro.current),
      unit: 'hPa',
      notes: `Logged from weather data: ${t.label}${baro.change24h != null ? ` (${baro.change24h > 0 ? '+' : ''}${baro.change24h} hPa vs 24h ago)` : ''}`,

    });
    setLogged(true);
  };

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <Card className="mb-4">
      {/* ── Header: reading + trend ── */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {/* Icon orb */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}18` }}
          >
            <Wind size={15} style={{ color }} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 min-w-0">
              <div
                className="text-ui-xs uppercase tracking-[0.22em] font-montserrat font-semibold"
                style={{ color: C.textFaint }}
              >
                Barometric Pressure
              </div>
              {baro.locationName && (
                <div className="flex items-center gap-1 min-w-0" style={{ color: C.textFaint }}>
                  <MapPin size={11} className="flex-shrink-0" aria-hidden="true" />
                  <span className="text-ui-sm font-montserrat truncate">
                    {baro.locationName}
                  </span>
                </div>
              )}
            </div>
            <div className="mt-1.5 flex items-baseline gap-x-1.5 gap-y-1.5 flex-wrap min-w-0">
              <span
                className="text-display-lg font-semibold font-montserrat leading-none"
                style={{ color }}
              >
                {baro.current ?? '—'}
              </span>
              <span className="text-ui-base font-montserrat flex-shrink-0" style={{ color: C.textFaint }}>hPa</span>
              <span
                className="flex items-center gap-0.5 text-ui-base font-medium font-montserrat min-w-0"
                style={{ color }}
              >
                <TrendIcon size={13} aria-hidden="true" />
                <span className="truncate">{t.label}</span>
              </span>
            </div>
          </div>
        </div>

        {/* 24h delta badge + minimize control */}
        <div className="flex items-start justify-between gap-3 sm:flex-col sm:items-end sm:justify-start flex-shrink-0">
          {baro.change24h != null ? (
            <div className="text-left sm:text-right min-w-0">
              <div
                className="text-ui-xs font-montserrat mb-0.5 uppercase tracking-[0.18em]"
                style={{ color: C.textFaint }}
              >
                24 h change
              </div>
              <div
                className="text-ui-xl font-semibold font-montserrat"
                style={{ color: deltaColor }}
              >
                {baro.change24h > 0 ? '+' : ''}{baro.change24h} hPa
              </div>
            </div>
          ) : <div className="hidden sm:block" />}
          <button
            onClick={() => setMode('compact')}
            aria-label="Collapse barometric pressure card"
            className="p-1 rounded-lg bg-transparent border-0 cursor-pointer hover:opacity-70 transition-opacity -mt-0.5 -mr-0.5"
            style={{ color: C.textFaint }}
          >
            <Minimize2 size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── 7-day sparkline ── */}
      {chartData.length > 1 && (
        <div className="h-[84px] sm:h-[90px] mb-3 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: C.textFaint, fontFamily: 'Montserrat' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 9, fill: C.textFaint, fontFamily: 'Montserrat' }}
                width={28}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  fontFamily: 'Montserrat',
                  fontSize: 11,
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: C.card,
                }}
                formatter={v => [`${v} hPa`, 'Pressure']}
              />
              {/* Normal range band markers */}
              <ReferenceLine y={1013} stroke={C.border} strokeDasharray="4 2" strokeOpacity={0.5} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Trend tip ── */}
      <p
        className="text-ui-base font-montserrat leading-relaxed mb-3 px-0.5 line-clamp-3 sm:line-clamp-none"
        style={{ color: C.textFaint }}
      >
        {t.tip}
      </p>

      {/* ── Actions ── */}
      <div className="flex items-stretch gap-2 flex-wrap">
        <button
          onClick={handleLog}
          disabled={logged || baro.current == null}
          aria-label={logged ? 'Pressure logged to vitals' : 'Log today\'s pressure to vitals'}
          className="flex w-full sm:w-auto items-center justify-center gap-1.5 py-1.5 px-4 rounded-full text-ui-base font-medium font-montserrat border transition-colors"
          style={
            logged
              ? { borderColor: C.sage, color: C.sage, background: `${C.sage}10` }
              : { borderColor: color, color, background: `${color}10`, cursor: 'pointer' }
          }
        >
          <Plus size={12} aria-hidden="true" />
          {logged ? 'Logged ✓' : 'Log to Vitals'}
        </button>

        <button
          onClick={toggleAutoLog}
          aria-pressed={autoLog}
          aria-label={autoLog ? 'Disable daily auto-log' : 'Enable daily auto-log to vitals'}
          className="flex w-full sm:w-auto items-center justify-center gap-1.5 py-1.5 px-3.5 rounded-full text-ui-base font-medium font-montserrat border transition-colors cursor-pointer"
          style={
            autoLog
              ? { borderColor: C.sage, color: C.sage, background: `${C.sage}15` }
              : { borderColor: C.border, color: C.textFaint, background: 'transparent' }
          }
        >
          <Zap size={12} aria-hidden="true" />
          {autoLogged ? 'Auto-logged ✓' : autoLog ? 'Auto-log on' : 'Auto-log daily'}
        </button>

        <button
          onClick={() => setSciOpen(o => !o)}
          aria-expanded={sciOpen}
          aria-label={sciOpen ? 'Hide why this matters' : 'Show why this matters'}
          className="flex w-full sm:w-auto items-center justify-center gap-1 py-1.5 px-3.5 rounded-full text-ui-base font-medium font-montserrat border border-salve-border bg-transparent hover:text-salve-textMid transition-colors cursor-pointer"
          style={{ color: C.textFaint }}
        >
          Why this matters
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={`transition-transform ${sciOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* ── Scientific explanation accordion ── */}
      {sciOpen && (
        <div className="mt-4 border-t border-salve-border/40 pt-4 space-y-3">
          <p
            className="text-ui-base font-montserrat leading-relaxed"
            style={{ color: C.textFaint }}
          >
            Barometric (atmospheric) pressure is the weight of the air column above us, measured in hPa.
            Normal sea-level pressure is around 1013 hPa. Rapid drops, especially{' '}
            <strong style={{ color: C.textMid }}>5+ hPa over 24 hours</strong>, are most
            commonly linked to symptom flares in pressure-sensitive conditions:
          </p>

          {BARO_SCIENCE.map(({ condition, detail }) => (
            <div
              key={condition}
              className="rounded-xl p-fluid-sm"
              style={{
                background: `${color}08`,
                borderLeft: `3px solid ${color}50`,
              }}
            >
              <div
                className="text-ui-base font-semibold font-montserrat mb-0.5"
                style={{ color: C.textMid }}
              >
                {condition}
              </div>
              <div
                className="text-ui-base font-montserrat leading-relaxed"
                style={{ color: C.textFaint }}
              >
                {detail}
              </div>
            </div>
          ))}

          <p
            className="text-ui-base font-montserrat italic leading-relaxed"
            style={{ color: C.textFaint, opacity: 0.7 }}
          >
            Tracking pressure alongside your pain and mood vitals can reveal personal patterns.
            Most people experience effects within 12 to 48 hours of a significant pressure change.
            This data is for personal awareness only. Always discuss symptom patterns with your
            healthcare provider.
          </p>
        </div>
      )}
    </Card>
  );
}
