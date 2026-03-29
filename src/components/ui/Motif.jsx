const glyphs = {
  star: '✦',
  sparkle: '✧',
  moon: '☽',
  leaf: '🌿',
  dot: '·',
};

export default function Motif({ type = 'star', size = 14, color, className = '', style = {} }) {
  return (
    <span
      aria-hidden="true"
      style={{ fontSize: size, color: color || '#b8a9e8', ...style }}
      className={`opacity-70 select-none ${className}`}
    >
      {glyphs[type] || glyphs.star}
    </span>
  );
}

export function Divider() {
  return (
    <div className="flex items-center justify-center gap-3 my-5 text-salve-textFaint">
      <Motif type="sparkle" size={10} color="#6e6a80" />
      <div className="h-px w-10 bg-salve-border" />
      <Motif type="moon" size={12} />
      <div className="h-px w-10 bg-salve-border" />
      <Motif type="sparkle" size={10} color="#6e6a80" />
    </div>
  );
}
