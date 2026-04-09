// Starred sections, user-chosen shortcuts that appear on the Dashboard.
// Stored as an array of section IDs in localStorage.

const KEY = 'salve:starred';
const MAX = 6;

export function getStarred() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(id => typeof id === 'string');
  } catch {
    return [];
  }
}

export function setStarred(ids) {
  try {
    const capped = ids.slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(capped));
    window.dispatchEvent(new CustomEvent('salve:starred-change'));
  } catch { /* ignore */ }
}

export function toggleStar(id) {
  const current = getStarred();
  const next = current.includes(id)
    ? current.filter(x => x !== id)
    : [...current, id].slice(0, MAX);
  setStarred(next);
  return next;
}

export function isStarred(id) {
  return getStarred().includes(id);
}

export const STAR_MAX = MAX;
