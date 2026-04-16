import { C } from '../../constants/colors';

// Tiny inline SVG bar chart for the 14-day DAU series. No Recharts
// dependency — keeps this panel cheap.
export default function DauSparkline({ series }) {
  if (!Array.isArray(series) || series.length === 0) {
    return <div className="text-[11px] text-salve-textFaint font-montserrat">No activity yet.</div>;
  }
  const max = Math.max(1, ...series.map(d => d.users || 0));
  const W = 280;
  const H = 48;
  const gap = 3;
  const barW = Math.max(1, (W - gap * (series.length - 1)) / series.length);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`Daily active users, last ${series.length} days`}
      className="block"
    >
      {series.map((d, i) => {
        const h = Math.max(2, ((d.users || 0) / max) * (H - 4));
        const x = i * (barW + gap);
        const y = H - h;
        return (
          <rect
            key={d.date || i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1.5}
            fill={C.lav}
            opacity={d.users > 0 ? 0.85 : 0.2}
          >
            <title>{`${d.date}: ${d.users} ${d.users === 1 ? 'user' : 'users'}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
