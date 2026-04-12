export default function Badge({ label, color, bg }) {
  return (
    <span
      style={{ background: bg, color }}
      className="text-[13px] font-semibold px-2.5 py-0.5 rounded-full inline-block tracking-wide badge-glow"
    >
      {label}
    </span>
  );
}

const sevMap = {
  danger: { bg: 'rgba(232,138,154,0.15)', color: '#e88a9a', label: '✦ Critical' },
  caution: { bg: 'rgba(232,200,138,0.15)', color: '#e8c88a', label: '✧ Caution' },
  info: { bg: 'rgba(143,191,160,0.15)', color: '#8fbfa0', label: '· Info' },
};

export function SevBadge({ severity }) {
  const s = sevMap[severity] || sevMap.info;
  return <Badge label={s.label} color={s.color} bg={s.bg} />;
}
