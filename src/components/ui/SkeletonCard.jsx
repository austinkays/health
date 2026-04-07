export function SkeletonCard() {
  return (
    <div className="bg-salve-card border border-salve-border rounded-xl p-4 md:p-6 mb-2.5 md:mb-4 shadow-sm animate-pulse">
      <div className="h-4 bg-salve-border rounded w-2/3 mb-3" />
      <div className="h-3 bg-salve-border rounded w-1/2 mb-2" />
      <div className="h-3 bg-salve-border rounded w-1/3" />
    </div>
  );
}

export default function SkeletonList({ count = 3 }) {
  return (
    <div className="px-4 pt-4 max-w-lg mx-auto" role="status" aria-label="Loading content">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
