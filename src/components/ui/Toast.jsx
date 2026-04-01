import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Check, Sparkles } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, { duration = 2000 } = {}) => {
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
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-full bg-salve-card2/95 border shadow-lg backdrop-blur-sm transition-all duration-300 ${
              t.celebrate ? 'border-salve-sage/30' : 'border-salve-lav/20'
            } ${t.leaving ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0 toast-enter'}`}
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

function CelebrationBurst() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible" aria-hidden="true">
      {[...Array(6)].map((_, i) => (
        <Sparkles
          key={i}
          size={8}
          className="absolute text-salve-sage celebration-particle"
          style={{
            left: '50%',
            top: '50%',
            '--angle': `${i * 60}deg`,
            animationDelay: `${i * 0.04}s`,
          }}
        />
      ))}
    </div>
  );
}
