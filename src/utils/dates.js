// Date formatting helpers

export function fmtDate(d) {
  if (!d) return '';
  // If input is date-only (YYYY-MM-DD), append noon to avoid timezone shift
  const dateStr = String(d);
  const parsed = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00');
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function daysUntil(d) {
  if (!d) return '';
  const diff = Math.ceil(
    (new Date(d) - new Date(new Date().toDateString())) / 86400000
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0) return Math.abs(diff) + 'd ago';
  return 'In ' + diff + 'd';
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Returns a friendly relative date label: "Today", "Yesterday",
// "3 days ago", or falls back to the full formatted date for anything
// more than 6 days old. Use for grouping entries by day in activity feeds.
export function fmtDateRelative(d) {
  if (!d) return '';
  const todayStart = new Date(new Date().toDateString());
  const dateStr = String(d);
  const parsed = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00');
  const entryDay = new Date(parsed.toDateString());
  const diffDays = Math.round((todayStart - entryDay) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 6) return `${diffDays} days ago`;
  if (diffDays < 0) return fmtDate(d); // future dates fall back to explicit date
  return fmtDate(d);
}
