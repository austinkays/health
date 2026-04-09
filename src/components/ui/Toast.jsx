import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Check, Sparkles, Star } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, { duration = 3500 } = {}) => {
    const id = Date.now();
    const celebrate = message.includes('✓');
    setToasts(prev => [...prev, { id, message, leaving: false, celebrate }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-full bg-salve-card2/95 border shadow-lg backdrop-blur-sm transition-all duration-300 ${
              t.celebrate ? 'border-salve-sage/30' : 'border-salve-lav/20'
            } ${t.leaving ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0 toast-enter'} ${t.celebrate && !t.leaving ? 'celebrate-pop' : ''}`}
          >
            {t.celebrate && <CelebrationBurst />}
            <Check size={13} className="text-salve-sage" />
            <span className="text-xs text-salve-text font-montserrat">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const BURST_COLORS = ['text-salve-sage', 'text-salve-lav', 'text-salve-amber', 'text-salve-rose'];

function CelebrationBurst() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible" aria-hidden="true">
      {/* Inner ring, small fast sparkles */}
      {[...Array(8)].map((_, i) => (
        <Sparkles
          key={`s-${i}`}
          size={7 + (i % 3) * 2}
          className={`absolute ${BURST_COLORS[i % BURST_COLORS.length]} celebration-particle-inner`}
          style={{
            left: '50%',
            top: '50%',
            '--angle': `${i * 45}deg`,
            animationDelay: `${i * 0.03}s`,
          }}
        />
      ))}
      {/* Outer ring, bigger stars that travel further */}
      {[...Array(6)].map((_, i) => (
        <Star
          key={`b-${i}`}
          size={5 + (i % 2) * 3}
          className={`absolute ${BURST_COLORS[(i + 1) % BURST_COLORS.length]} celebration-particle-outer`}
          style={{
            left: '50%',
            top: '50%',
            '--angle': `${i * 60 + 30}deg`,
            animationDelay: `${0.05 + i * 0.04}s`,
          }}
        />
      ))}
      {/* Center flash */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full rounded-full celebration-flash" />
    </div>
  );
}
