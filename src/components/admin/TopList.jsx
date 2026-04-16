import { C } from '../../constants/colors';
import { formatNum, formatUSD, prettyLabel } from './formatters';

export default function TopList({ items, labelKey, valueKey = 'count', formatValue = formatNum, secondary, emptyText, accent = C.lav, max = 8 }) {
  if (!items || items.length === 0) {
    return <div className="text-[11px] text-salve-textFaint font-montserrat">{emptyText}</div>;
  }
  const top = items.slice(0, max);
  const peak = Math.max(1, ...top.map(i => i[valueKey] || 0));
  return (
    <div className="space-y-1.5">
      {top.map((item, i) => {
        const val = item[valueKey] || 0;
        const pct = (val / peak) * 100;
        // Optional secondary metric (e.g. cost under call count for API breakdown)
        const secondaryText = secondary ? secondary(item) : null;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[11px] text-salve-textMid font-montserrat truncate">
                  {prettyLabel(item[labelKey])}
                </span>
                <span className="text-[11px] text-salve-textFaint font-montserrat tabular-nums shrink-0">
                  {formatValue(val)}
                  {secondaryText && (
                    <span className="ml-1.5 opacity-70">{secondaryText}</span>
                  )}
                </span>
              </div>
              <div className="h-1 rounded-full bg-salve-border/50 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: accent, opacity: 0.7 }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Module-level helper so `secondary` is a stable reference across
// re-renders — otherwise TopList children would see a new function
// identity every render.
export function renderEndpointCost(item) {
  if (item.cost_usd == null || Number(item.cost_usd) === 0) return null;
  return formatUSD(item.cost_usd);
}
