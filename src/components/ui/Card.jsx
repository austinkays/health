export default function Card({ children, className = '', onClick, style, id, ...rest }) {
  return (
    <div
      id={id}
      onClick={onClick}
      style={style}
      className={`bg-salve-card border border-salve-border rounded-xl p-4 md:p-6 mb-2.5 md:mb-4 shadow-sm card-hover ${onClick ? 'cursor-pointer' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
