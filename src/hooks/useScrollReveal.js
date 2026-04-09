import { useEffect, useRef } from 'react';

// One shared IntersectionObserver for the whole app — far cheaper than
// creating one per element. Adds `.reveal-in` when an element scrolls into
// view, then unobserves (one-shot).
let sharedObserver = null;

function getObserver() {
  if (sharedObserver) return sharedObserver;
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return null;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-in');
          sharedObserver.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
  );
  return sharedObserver;
}

export default function useScrollReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce) { el.classList.add('reveal-in'); return; }
    const obs = getObserver();
    if (!obs) { el.classList.add('reveal-in'); return; }
    obs.observe(el);
    return () => obs.unobserve(el);
  }, []);
  return ref;
}
