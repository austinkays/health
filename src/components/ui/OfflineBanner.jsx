import { useState, useEffect } from 'react';
import { cache } from '../../services/cache';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Poll pending count while offline
  useEffect(() => {
    if (!offline) { setPendingCount(0); return; }
    const update = () => setPendingCount(cache.getPending().length);
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [offline]);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 bg-salve-amber/15 border-b border-salve-amber/30 px-4 py-2 text-center text-sm text-salve-amber"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
    >
      <span className="font-medium">You're offline</span>
      {pendingCount > 0 && (
        <span className="text-salve-textMid ml-1">
          · {pendingCount} change{pendingCount !== 1 ? 's' : ''} queued
        </span>
      )}
    </div>
  );
}
