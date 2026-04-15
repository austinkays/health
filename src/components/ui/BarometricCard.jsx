import { useState, useEffect } from 'react';
import {
  Wind, ChevronDown, Plus, Loader, MapPin,
  TrendingUp, TrendingDown, Minus, Zap,
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
export default function BarometricCard({ locationStr, onLogPressure, onAutoLogPressure, onNav }) {
  const [baro, setBaro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sciOpen, setSciOpen] = useState(false);
  const [logged, setLogged] = useState(false);
  const [autoLog, setAutoLog] = useState(() => localStorage.getItem('salve:baro-autolog') === 'true');
  const [autoLogged, setAutoLogged] = useState(false);

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

  /* ── Loading skeleton ──────────────────────────────────────── */
  if (loading) {
    return (
      <Card className="mb-4 !bg-transparent !border-salve-border/40">
        <div className="flex items-center gap-2.5 py-1">
          <Loader size={14} className="animate-spin flex-shrink-0" style={{ color: C.textFaint }} />
          <span className="text-[13px] font-montserrat" style={{ color: C.textFaint }}>
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
          <div>
            <p className="text-[13px] font-montserrat" style={{ color: C.textFaint }}>
              {error
                ? 'Could not load barometric pressure data.'
                : <>
                    Enable location access or{' '}
                    <button
                      onClick={() => onNav?.('aboutme')}
                      className="underline bg-transparent border-none p-0 font-montserrat text-[13px] cursor-pointer"
                      style={{ color: C.textFaint }}
                    >add your zip code in About Me</button>
                    {' '}to see local barometric pressure.
                  </>}
            </p>
            {error && (
              <p className="text-[11px] font-montserrat mt-0.5" style={{ color: C.textFaint, opacity: 0.6 }}>
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
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {/* Icon orb */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}18` }}
          >
            <Wind size={15} style={{ color }} />
          </div>

          <div>
            <div
              className="text-[10px] uppercase tracking-widest font-montserrat font-semibold mb-0.5"
              style={{ color: C.textFaint }}
            >
              Barometric Pressure
              {baro.locationName && (
                <span className="ml-1.5 font-normal normal-case tracking-normal">
                  <MapPin size={8} className="inline -mt-px mr-0.5" />
                  {baro.locationName}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[28px] font-semibold font-montserrat leading-none"
                style={{ color }}
              >
                {baro.current ?? '—'}
              </span>
              <span className="text-[12px] font-montserrat" style={{ color: C.textFaint }}>hPa</span>
              <span
                className="flex items-center gap-0.5 text-[12px] font-medium font-montserrat ml-0.5"
                style={{ color }}
              >
                <TrendIcon size={13} aria-hidden="true" />
                {t.label}
              </span>
            </div>
          </div>
        </div>

        {/* 24h delta badge */}
        {baro.change24h != null && (
          <div className="text-right flex-shrink-0">
            <div
              className="text-[10px] font-montserrat mb-0.5"
              style={{ color: C.textFaint }}
            >
              24 h change
            </div>
            <div
              className="text-[15px] font-semibold font-montserrat"
              style={{
                color:
                  baro.change24h < -1 ? C.rose
                  : baro.change24h > 1 ? C.amber
                  : C.sage,
              }}
            >
              {baro.change24h > 0 ? '+' : ''}{baro.change24h} hPa
            </div>
          </div>
        )}
      </div>

      {/* ── 7-day sparkline ── */}
      {chartData.length > 1 && (
        <div className="h-[90px] mb-3 -mx-1">
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
                width={32}
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
        className="text-[12px] font-montserrat leading-relaxed mb-3 px-0.5"
        style={{ color: C.textFaint }}
      >
        {t.tip}
      </p>

      {/* ── Actions ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleLog}
          disabled={logged || baro.current == null}
          aria-label={logged ? 'Pressure logged to vitals' : 'Log today\'s pressure to vitals'}
          className="flex items-center gap-1.5 py-1.5 px-4 rounded-full text-[12px] font-medium font-montserrat border transition-colors"
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
          className="flex items-center gap-1.5 py-1.5 px-3.5 rounded-full text-[12px] font-medium font-montserrat border transition-colors cursor-pointer"
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
          className="flex items-center gap-1 py-1.5 px-3.5 rounded-full text-[12px] font-medium font-montserrat border border-salve-border bg-transparent hover:text-salve-textMid transition-colors cursor-pointer"
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
            className="text-[13px] font-montserrat leading-relaxed"
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
              className="rounded-xl p-3"
              style={{
                background: `${color}08`,
                borderLeft: `3px solid ${color}50`,
              }}
            >
              <div
                className="text-[13px] font-semibold font-montserrat mb-0.5"
                style={{ color: C.textMid }}
              >
                {condition}
              </div>
              <div
                className="text-[13px] font-montserrat leading-relaxed"
                style={{ color: C.textFaint }}
              >
                {detail}
              </div>
            </div>
          ))}

          <p
            className="text-[12px] font-montserrat italic"
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
