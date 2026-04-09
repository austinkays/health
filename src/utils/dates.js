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

// Returns today's LOCAL calendar date as YYYY-MM-DD. Do not use
// .toISOString().slice(0,10), that returns UTC and can be off by one
// day for users west of UTC in the evening (e.g., Apr 4 evening PT
// would be recorded as Apr 5). Every form default + "today" comparison
// in the app should use this helper.
export function todayISO() {
  return localISODate(new Date());
}

export function localISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
