// Inline confirmation row — renders inside the specific card that triggered delete.
// Pass `itemId` to each instance; it only shows when pending.id matches.
export default function ConfirmBar({ pending, onConfirm, onCancel, itemId }) {
  // If no pending, or this instance is for a different item, render nothing
  if (!pending || pending.id !== itemId) return null;

  return (
    <div className="mt-2.5 flex items-center justify-between gap-2 bg-salve-rose/10 border border-salve-rose/25 rounded-lg px-3 py-2">
      <span className="text-[12px] text-salve-rose flex-1">Delete {pending.label || 'this item'}?</span>
      <div className="flex gap-1.5">
        <button
          onClick={onConfirm}
          className="bg-salve-rose text-white border-none rounded-full px-3 py-1 text-xs font-medium cursor-pointer font-montserrat"
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          className="bg-transparent text-salve-textMid border border-salve-border rounded-full px-3 py-1 text-xs cursor-pointer font-montserrat"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
