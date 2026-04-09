import useScrollReveal from '../../hooks/useScrollReveal';

// Wraps children in a ref'd element that fades + slides up when scrolled
// into view. `as` picks the tag; `delay` stagger siblings (seconds).
export default function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const ref = useScrollReveal();
  const style = delay ? { transitionDelay: `${delay}s`, ...(rest.style || {}) } : rest.style;
  return (
    <Tag ref={ref} className={`reveal ${className}`} {...rest} style={style}>
      {children}
    </Tag>
  );
}
