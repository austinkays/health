// src/components/ui/DemoBanner.jsx
// Persistent banner shown at the top of every view while the user is in
// demo mode. Gently nudges them to sign up, with a one-click escape back
// to the Auth screen.

import { Sparkles } from 'lucide-react';

export default function DemoBanner({ onExit }) {
  return (
    <div
      role="status"
      className="sticky top-0 z-40 bg-salve-lav/15 border-b border-salve-lav/30 backdrop-blur-md md:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-[480px] mx-auto px-4 py-2 flex items-center gap-2 md:max-w-[720px] lg:max-w-[960px]">
        <Sparkles size={13} className="text-salve-lav flex-shrink-0" aria-hidden="true" />
        <p className="text-ui-sm text-salve-text font-montserrat flex-1 leading-tight m-0 truncate">
          Demo mode · sample data
        </p>
        <button
          onClick={onExit}
          className="text-ui-sm font-medium text-salve-lav hover:text-salve-text bg-transparent border border-salve-lav/40 hover:border-salve-lav cursor-pointer px-2.5 py-1 rounded-full transition-colors font-montserrat flex-shrink-0"
        >
          Sign up →
        </button>
      </div>
    </div>
  );
}
