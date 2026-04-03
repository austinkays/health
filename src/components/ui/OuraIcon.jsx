/**
 * Oura Ring logo icon — an "O" with a macron (line over it).
 * Accepts same props as lucide-react icons: size, color, className, style.
 */
export function OuraIcon({ size = 24, color = 'currentColor', className = '', style, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
      {...rest}
    >
      {/* Macron bar */}
      <rect x="6" y="3" width="12" height="2" rx="1" fill={color} />
      {/* O ring */}
      <circle cx="12" cy="14" r="7" stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
}
