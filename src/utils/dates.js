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
