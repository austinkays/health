import { useEffect, useRef } from 'react';

// Renders a fixed confirmation bar anchored just above where the user tapped.
// Uses a portal-style fixed overlay so it always appears near the thumb,
// regardless of scroll position or card nesting depth.
// Pass itemId to each instance, it only activates when pending.id matches.
export default function ConfirmBar({ pending, onConfirm, onCancel, itemId }) {
  if (!pending || pending.id !== itemId) return null;

  return (
    <>
      {/* Invisible backdrop to catch outside taps → cancel */}
      <div
        className="fixed inset-0 z-40"
        onClick={onCancel}
      />
      {/* Confirmation bar, fixed near bottom of screen where thumb is */}
      <div
        role="alertdialog"
        aria-label={`Confirm delete ${pending.label || 'item'}`}
        className="fixed bottom-20 left-1/2 z-[60] w-full max-w-[440px] px-4"
        style={{ transform: 'translateX(-50%)' }}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onConfirm(); }}
      >
        <div className="bg-salve-card border border-salve-rose/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-lg"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}>
          <span className="text-[13px] text-salve-rose flex-1 font-medium">
            Delete {pending.label ? `"${pending.label}"` : 'this item'}?
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="bg-transparent text-salve-textMid border border-salve-border rounded-full px-3.5 py-1.5 text-xs cursor-pointer font-montserrat"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="bg-salve-rose text-white border-none rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer font-montserrat"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
