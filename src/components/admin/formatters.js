export function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatNum(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 10_000) return (num / 1000).toFixed(0) + 'k';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toLocaleString();
}

// USD formatter with auto precision — shows 4 decimals under $0.01,
// 2 decimals for everything else so we don't lose fractions of a cent during
// the beta when total spend is tiny.
export function formatUSD(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  if (num === 0) return '$0.00';
  if (num < 0.01) return '$' + num.toFixed(4);
  if (num < 100) return '$' + num.toFixed(2);
  return '$' + num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Short section/feature/endpoint labels for the top-N lists
export function prettyLabel(raw) {
  if (!raw) return '(unknown)';
  // /api/gemini → gemini, section keys → title-case
  return String(raw)
    .replace(/^\/?api\//, '')
    .replace(/\.js$/, '')
    .replace(/_/g, ' ');
}

// Compute trial days remaining from an ISO timestamp.
// Returns { days, urgency: 'expired' | 'soon' | 'watch' | 'ok' | null }
// null urgency means the user has no trial (paid premium / admin / free).
export function trialStatus(trialExpiresAt) {
  if (!trialExpiresAt) return { days: null, urgency: null };
  const ms = new Date(trialExpiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return { days: null, urgency: null };
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (ms <= 0)                  return { days, urgency: 'expired' };
  if (ms < 3 * 24 * 3600 * 1000) return { days, urgency: 'soon' };   // < 3 days
  if (ms < 7 * 24 * 3600 * 1000) return { days, urgency: 'watch' };  // < 7 days
  return                          { days, urgency: 'ok' };
}
