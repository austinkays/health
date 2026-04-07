import { useState, useEffect } from 'react';

/**
 * useIsDesktop — returns true when viewport is ≥ 768px.
 * Exported for sections that need responsive behavior without SplitView.
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

/**
 * SplitView — list/detail layout for desktop.
 *
 * Mobile: just renders `list` (sections handle their own inline expand).
 * Desktop (md+): side-by-side with list on left and detail on right.
 *
 * @param {React.ReactNode} list - the list column content
 * @param {React.ReactNode|null} detail - the detail pane content (null = nothing selected)
 * @param {string} emptyMessage - shown in desktop detail pane when nothing is selected
 * @param {string|number|null} detailKey - changing this value re-triggers the entry animation
 */
export default function SplitView({ list, detail, emptyMessage = 'Select an item to view details', detailKey }) {
  const isDesktop = useIsDesktop();

  // Mobile: just render the list (section handles inline expand)
  if (!isDesktop) {
    return <>{list}</>;
  }

  // Desktop: side-by-side
  return (
    <div className="flex gap-6 min-h-[60vh]">
      {/* List column */}
      <div className="w-[360px] lg:w-[420px] flex-shrink-0 overflow-y-auto max-h-[calc(100vh-140px)] pr-1 no-scrollbar min-h-[300px]">
        {list}
      </div>
      {/* Detail pane */}
      <div className="flex-1 overflow-y-auto max-h-[calc(100vh-140px)] no-scrollbar">
        {detail ? (
          <div key={detailKey} className="sticky top-0 splitview-detail-enter">
            {detail}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-9 h-9 rounded-xl bg-salve-lav/8 border border-salve-lav/15 flex items-center justify-center">
              <span className="text-salve-lav/40 text-base leading-none select-none" aria-hidden="true">←</span>
            </div>
            <p className="text-salve-textFaint text-sm font-montserrat">{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
