// Per-user opt-out for connection / import sources users don't want to see.
// Storage: localStorage `salve:hidden-sources` → JSON array of source IDs.
// Used by Settings (Connected Sources cards) and CycleTracker (Flo import).
//
// Why localStorage instead of profiles: this is purely a UI preference, not
// PHI, and we want it to take effect instantly without waiting for a Supabase
// round trip. It's per-browser by design (a power user with two devices may
// reasonably want different things shown on each).

const KEY = 'salve:hidden-sources';

export function getHiddenSources() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isSourceHidden(id) {
  return getHiddenSources().includes(id);
}

export function hideSource(id) {
  try {
    const current = getHiddenSources();
    if (current.includes(id)) return current;
    const next = [...current, id];
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return getHiddenSources();
  }
}

export function unhideAllSources() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
}
