export default function ConfirmBar({ pending, onConfirm, onCancel }) {
  if (!pending) return null;
  return (
    <div className="bg-salve-rose/10 border border-salve-rose/30 rounded-xl px-3.5 py-2.5 mb-2.5 flex items-center justify-between gap-2">
      <span className="text-[13px] text-salve-rose flex-1">Delete {pending.label || 'this item'}?</span>
      <div className="flex gap-1.5">
        <button
          onClick={onConfirm}
          className="bg-salve-rose text-white border-none rounded-full px-3.5 py-1 text-xs font-medium cursor-pointer font-montserrat"
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          className="bg-transparent text-salve-textMid border border-salve-border rounded-full px-3.5 py-1 text-xs cursor-pointer font-montserrat"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
