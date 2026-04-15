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

const ACCENT_STYLES = {
  lav: {
    badge: 'bg-salve-lav/12 text-salve-lav border-salve-lav/20',
    dot: 'bg-salve-lav',
    ring: 'border-salve-lav/20',
    soft: 'bg-salve-lav/6',
  },
  sage: {
    badge: 'bg-salve-sage/12 text-salve-sage border-salve-sage/20',
    dot: 'bg-salve-sage',
    ring: 'border-salve-sage/20',
    soft: 'bg-salve-sage/6',
  },
  amber: {
    badge: 'bg-salve-amber/12 text-salve-amber border-salve-amber/20',
    dot: 'bg-salve-amber',
    ring: 'border-salve-amber/20',
    soft: 'bg-salve-amber/6',
  },
  rose: {
    badge: 'bg-salve-rose/12 text-salve-rose border-salve-rose/20',
    dot: 'bg-salve-rose',
    ring: 'border-salve-rose/20',
    soft: 'bg-salve-rose/6',
  },
};

const DEFAULT_THANK_YOU = 'Thanks for using Salve and helping shape what it becomes.';

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
        className={`relative w-full max-w-[640px] max-h-[84vh] overflow-y-auto rounded-[28px] border border-salve-border bg-salve-card shadow-xl transition-transform duration-200 ${visible ? 'scale-100' : 'scale-95'}`}
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-salve-border/70 bg-salve-card/95 px-5 py-4 backdrop-blur md:px-6">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-salve-lav/20 bg-salve-lav/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-salve-lav font-montserrat">
              <Sparkles size={12} />
              {latestEntry.tag}
            </div>
            <h2 id="whats-new-title" className="font-playfair text-[24px] text-salve-text leading-tight m-0">What&apos;s New</h2>
            <p className="mt-1 text-[13px] text-salve-textFaint font-montserrat">
              Auto-opens only when you change the current update notice.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close What's New"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-salve-border bg-salve-card2 text-salve-textFaint transition-colors hover:border-salve-lav/25 hover:text-salve-lav"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 md:px-6 md:py-6">
          <div className="rounded-[24px] border border-salve-lav/18 bg-salve-lav/6 p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-salve-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-salve-textFaint font-montserrat">
                v{latestEntry.version}
              </span>
              <span className="text-[12px] text-salve-textFaint font-montserrat">{latestEntry.date}</span>
            </div>
            <h3 className="mt-3 text-[24px] leading-tight text-salve-text font-playfair m-0">{latestEntry.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-salve-text font-montserrat m-0">
              {latestEntry.thankYou || DEFAULT_THANK_YOU}
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-salve-textMid font-montserrat m-0">
              {latestEntry.summary}
            </p>
          </div>

          <section className="mt-5 rounded-[22px] border border-salve-border/80 bg-salve-card2/70 p-4 md:p-5" aria-labelledby="whats-new-highlights">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-salve-textFaint font-semibold font-montserrat m-0">Start here</p>
                <h4 id="whats-new-highlights" className="mt-1 text-[17px] font-semibold text-salve-text font-montserrat m-0">Top highlights</h4>
              </div>
              <span className="rounded-full border border-salve-sage/20 bg-salve-sage/10 px-2.5 py-1 text-[11px] font-semibold text-salve-sage font-montserrat">
                {latestEntry.highlights.length} worth knowing
              </span>
            </div>
            <div className="mt-4 grid gap-2.5">
              {latestEntry.highlights.map((item, index) => (
                <div key={index} className="flex gap-3 rounded-2xl border border-salve-border/70 bg-salve-card px-3.5 py-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-salve-sage" aria-hidden="true" />
                  <p className="m-0 text-[14px] leading-relaxed text-salve-textMid font-montserrat">{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5" aria-labelledby="whats-new-details">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-salve-textFaint font-semibold font-montserrat m-0">Details</p>
                <h4 id="whats-new-details" className="mt-1 text-[17px] font-semibold text-salve-text font-montserrat m-0">This update by category</h4>
              </div>
              <p className="text-[12px] text-salve-textFaint font-montserrat m-0">Open only what you want.</p>
            </div>
            <div className="space-y-2.5">
              {latestEntry.sections.map((section, index) => (
                <ReleaseSection key={section.id} section={section} defaultOpen={index < 2} />
              ))}
            </div>
          </section>

          {historyEntries.length > 0 && (
            <section className="mt-5 rounded-[22px] border border-salve-border/80 bg-salve-card p-3 md:p-4" aria-labelledby="whats-new-history">
              <button
                type="button"
                onClick={() => setShowHistory(open => !open)}
                aria-expanded={showHistory}
                className="flex w-full items-center justify-between gap-3 rounded-[18px] bg-transparent px-1 py-1 text-left border-none cursor-pointer"
              >
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-salve-textFaint font-semibold font-montserrat m-0">Archive</p>
                  <h4 id="whats-new-history" className="mt-1 text-[16px] font-semibold text-salve-text font-montserrat m-0">Earlier updates</h4>
                </div>
                <ChevronDown size={16} className={`text-salve-textFaint transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`} />
              </button>
              <div className={`expand-section ${showHistory ? 'open' : ''}`}><div>
                <div className="mt-3 space-y-2.5">
                  {historyEntries.map(entry => (
                    <HistoryReleaseCard key={entry.id} entry={entry} />
                  ))}
                </div>
              </div></div>
            </section>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-2xl border border-salve-border bg-salve-card2 px-4 py-3 text-[14px] font-semibold text-salve-text font-montserrat transition-colors hover:border-salve-lav/25 hover:text-salve-lav sm:w-auto"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReleaseSection({ section, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const accent = ACCENT_STYLES[section.accent] || ACCENT_STYLES.lav;

  return (
    <div className={`overflow-hidden rounded-[22px] border bg-salve-card ${accent.ring}`}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 bg-transparent px-4 py-3.5 text-left border-none cursor-pointer ${accent.soft}`}
      >
        <div className="flex items-center gap-3">
          <span className={`inline-flex min-w-[44px] justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] font-montserrat ${accent.badge}`}>
            {section.label}
          </span>
          <span className="text-[13px] text-salve-textFaint font-montserrat">{section.items.length} items</span>
        </div>
        <ChevronDown size={16} className={`text-salve-textFaint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`expand-section ${open ? 'open' : ''}`}><div>
        <div className="px-4 pb-4 pt-1">
          <div className="space-y-2.5 rounded-[18px] border border-salve-border/70 bg-salve-card2/40 p-3.5">
            {section.items.map((item, index) => (
              <div key={index} className="flex gap-3">
                <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} aria-hidden="true" />
                <p className="m-0 text-[14px] leading-relaxed text-salve-textMid font-montserrat">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div></div>
    </div>
  );
}

function HistoryReleaseCard({ entry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-[18px] border border-salve-border bg-salve-card2/40">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-transparent px-4 py-3 text-left border-none cursor-pointer"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-salve-card px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-salve-textFaint font-montserrat">
              v{entry.version}
            </span>
            <span className="text-[12px] text-salve-textFaint font-montserrat">{entry.date}</span>
          </div>
          <p className="mt-1 text-[15px] font-semibold text-salve-text font-montserrat m-0">{entry.title}</p>
          <p className="mt-1 text-[13px] text-salve-textFaint font-montserrat m-0">{entry.summary}</p>
        </div>
        <ChevronDown size={16} className={`text-salve-textFaint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`expand-section ${open ? 'open' : ''}`}><div>
        <div className="border-t border-salve-border/70 px-4 py-3">
          {entry.highlights?.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {entry.highlights.map((item, index) => (
                <div key={index} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-salve-sage" aria-hidden="true" />
                  <p className="m-0 text-[13px] leading-relaxed text-salve-textMid font-montserrat">{item}</p>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {entry.sections.map(section => (
              <div key={section.id} className="rounded-2xl border border-salve-border/70 bg-salve-card px-3 py-2.5">
                <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-salve-textFaint font-montserrat">{section.label}</p>
                <div className="mt-2 space-y-1.5">
                  {section.items.map((item, index) => (
                    <div key={index} className="flex gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-salve-lav" aria-hidden="true" />
                      <p className="m-0 text-[13px] leading-relaxed text-salve-textMid font-montserrat">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div></div>
    </div>
  );
}
