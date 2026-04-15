import { useEffect, useState } from 'react';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { CHANGELOG, CURRENT_WHATS_NEW, CURRENT_WHATS_NEW_ID } from '../../constants/changelog';

const STORAGE_KEY = 'salve:last-seen-whats-new';
const LEGACY_STORAGE_KEY = 'salve:last-seen-version';

function getSeenMarker() {
  try {
    return localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function hasUnseenChanges() {
  return getSeenMarker() !== CURRENT_WHATS_NEW_ID;
}

export function markChangesSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, CURRENT_WHATS_NEW_ID);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

const ACCENT_DOT = {
  lav: 'bg-salve-lav',
  sage: 'bg-salve-sage',
  amber: 'bg-salve-amber',
  rose: 'bg-salve-rose',
};

export default function WhatsNewModal({ onClose }) {
  const [visible, setVisible] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const latestEntry = CURRENT_WHATS_NEW;
  const historyEntries = CHANGELOG.filter(entry => entry.id !== latestEntry.id);

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
      <div className="absolute inset-0 bg-black/45" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className={`relative w-full max-w-[520px] max-h-[84vh] overflow-y-auto rounded-[28px] border border-salve-border bg-salve-card shadow-xl transition-transform duration-200 ${visible ? 'scale-100' : 'scale-95'}`}
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-salve-border/70 bg-salve-card/95 px-5 py-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-salve-lav/12 text-salve-lav">
              <Sparkles size={14} />
            </div>
            <h2 id="whats-new-title" className="font-playfair text-[22px] text-salve-text leading-tight m-0">What&apos;s New</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close What's New"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-salve-border bg-salve-card2 text-salve-textFaint transition-colors hover:border-salve-lav/25 hover:text-salve-lav"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 md:px-6 md:py-6">
          {/* Current version hero */}
          <div className="rounded-[20px] border border-salve-lav/18 bg-salve-lav/6 p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-salve-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-salve-textFaint font-montserrat">
                v{latestEntry.version}
              </span>
              <span className="text-[12px] text-salve-textFaint font-montserrat">{latestEntry.date}</span>
            </div>
            <h3 className="mt-3 text-[22px] leading-tight text-salve-text font-playfair m-0">{latestEntry.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-salve-textMid font-montserrat m-0">
              {latestEntry.summary}
            </p>
          </div>

          {/* Highlights */}
          <div className="mt-4 grid gap-2">
            {latestEntry.highlights.map((item, index) => (
              <div key={index} className="flex gap-3 rounded-2xl border border-salve-border/70 bg-salve-card2/50 px-3.5 py-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-salve-sage" aria-hidden="true" />
                <p className="m-0 text-[14px] leading-relaxed text-salve-textMid font-montserrat">{item}</p>
              </div>
            ))}
          </div>

          {/* Category sections — all open by default, no accordion nesting */}
          <div className="mt-5 space-y-2.5">
            {latestEntry.sections.map(section => {
              const dot = ACCENT_DOT[section.accent] || ACCENT_DOT.lav;
              return (
                <div key={section.id} className="rounded-[18px] border border-salve-border/70 bg-salve-card2/40 p-3.5">
                  <p className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-salve-textFaint font-montserrat">{section.label}</p>
                  <div className="space-y-2">
                    {section.items.map((item, index) => (
                      <div key={index} className="flex gap-3">
                        <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                        <p className="m-0 text-[14px] leading-relaxed text-salve-textMid font-montserrat">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Earlier updates */}
          {historyEntries.length > 0 && (
            <div className="mt-5 rounded-[18px] border border-salve-border/80 bg-salve-card2/30 p-3 md:p-4">
              <button
                type="button"
                onClick={() => setShowHistory(open => !open)}
                aria-expanded={showHistory}
                className="flex w-full items-center justify-between gap-3 bg-transparent px-1 py-1 text-left border-none cursor-pointer"
              >
                <h4 className="text-[15px] font-semibold text-salve-text font-montserrat m-0">Earlier updates</h4>
                <ChevronDown size={16} className={`text-salve-textFaint transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`} />
              </button>
              <div className={`expand-section ${showHistory ? 'open' : ''}`}><div>
                <div className="mt-3 space-y-2.5">
                  {historyEntries.map(entry => (
                    <HistoryCard key={entry.id} entry={entry} />
                  ))}
                </div>
              </div></div>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-2xl border border-salve-border bg-salve-card2 px-5 py-2.5 text-[14px] font-semibold text-salve-text font-montserrat transition-colors hover:border-salve-lav/25 hover:text-salve-lav"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ entry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-[14px] border border-salve-border bg-salve-card2/40">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-transparent px-3.5 py-3 text-left border-none cursor-pointer"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-salve-textFaint font-montserrat">v{entry.version}</span>
            <span className="text-[12px] text-salve-textFaint font-montserrat">· {entry.date}</span>
          </div>
          <p className="mt-0.5 text-[14px] font-semibold text-salve-text font-montserrat m-0">{entry.title}</p>
        </div>
        <ChevronDown size={14} className={`text-salve-textFaint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`expand-section ${open ? 'open' : ''}`}><div>
        <div className="border-t border-salve-border/70 px-3.5 py-3">
          {entry.highlights?.length > 0 && (
            <div className="space-y-1.5">
              {entry.highlights.map((item, index) => (
                <div key={index} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-salve-sage" aria-hidden="true" />
                  <p className="m-0 text-[13px] leading-relaxed text-salve-textMid font-montserrat">{item}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div></div>
    </div>
  );
}
