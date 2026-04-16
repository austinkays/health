export default function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-salve-border bg-salve-card2/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-1">
        {label}
      </div>
      <div className="text-xl font-semibold text-salve-text font-montserrat tabular-nums leading-none">
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-salve-textFaint font-montserrat mt-1.5">
          {hint}
        </div>
      )}
    </div>
  );
}
