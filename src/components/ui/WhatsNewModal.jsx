import { useState, useEffect } from 'react';
import { CURRENT_VERSION, CHANGELOG } from '../../constants/changelog';

const STORAGE_KEY = 'salve:last-seen-version';

export function hasUnseenChanges() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== CURRENT_VERSION;
  } catch { return false; }
}

export function markChangesSeen() {
  try { localStorage.setItem(STORAGE_KEY, CURRENT_VERSION); } catch { /* */ }
}

export default function WhatsNewModal({ onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  function handleClose() {
    markChangesSeen();
    setVisible(false);
    setTimeout(onClose, 200);
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-4 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className={`relative bg-salve-card border border-salve-border rounded-2xl w-full max-w-[440px] max-h-[80vh] overflow-y-auto px-7 py-6 shadow-xl transition-transform duration-200 ${visible ? 'scale-100' : 'scale-95'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="text-2xl mb-1.5" aria-hidden="true">&#10024;</div>
          <h2 className="font-playfair text-xl font-semibold text-salve-text tracking-tight">What&#8217;s New</h2>
          <p className="text-salve-textFaint text-[13px] font-montserrat mt-1 tracking-wide">v{CURRENT_VERSION}</p>
        </div>

        {CHANGELOG.map(entry => (
          <div key={entry.version} className="mb-5">
            <h3 className="text-[15px] font-semibold text-salve-lav mb-3 tracking-wide">{entry.title}</h3>
            <ul className="space-y-2">
              {entry.items.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-[15px] text-salve-textMid leading-snug">
                  <span className="text-salve-sage/70 shrink-0 text-[13px] mt-px" aria-hidden="true">&#10003;</span>
                  <span className="text-pretty">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <button
          onClick={handleClose}
          className="w-full bg-salve-lav text-salve-bg font-semibold rounded-xl py-3 text-[15px] hover:bg-salve-lavDim transition-colors mt-3 tracking-wide"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
