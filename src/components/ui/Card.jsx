export default function Card({ children, className = '', onClick, style, id }) {
  return (
    <div
      id={id}
      onClick={onClick}
      style={style}
      className={`bg-salve-card border border-salve-border rounded-xl p-4 mb-2.5 shadow-sm card-hover ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
