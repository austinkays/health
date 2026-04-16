// ── Lightweight URL routing for SPA ──
// Syncs the tab state with browser URL paths so each section has a
// proper URL (e.g. salve.today/medications). Enables browser
// back/forward, deep linking, bookmarking, and proper analytics.
//
// No react-router dependency — just History API + a bidirectional map.

const TAB_TO_PATH = {
  dash: '/',
  meds: '/medications',
  vitals: '/vitals',
  ai: '/sage',
  journal: '/journal',
  settings: '/settings',
  conditions: '/conditions',
  providers: '/providers',
  allergies: '/allergies',
  appts: '/appointments',
  labs: '/labs',
  procedures: '/procedures',
  immunizations: '/immunizations',
  care_gaps: '/care-gaps',
  anesthesia_flags: '/anesthesia',
  appeals: '/appeals',
  surgical_planning: '/surgical',
  insurance: '/insurance',
  insurance_claims: '/claims',
  interactions: '/interactions',
  pharmacies: '/pharmacies',
  cycle: '/cycle',
  activities: '/activities',
  oura: '/oura',
  genetics: '/genetics',
  todos: '/todos',
  summary: '/summary',
  aboutme: '/about-me',
  hub_records: '/hub/records',
  hub_care: '/hub/care',
  hub_tracking: '/hub/tracking',
  hub_safety: '/hub/safety',
  hub_plans: '/hub/plans',
  hub_devices: '/hub/devices',
  apple_health: '/apple-health',
  search: '/search',
  news: '/news',
  formhelper: '/scribe',
  feedback: '/feedback',
  admin: '/admin',
  legal: '/legal',
  insights: '/insights',
  sleep: '/sleep',
  import: '/import',
};

// Reverse map: path → tab
const PATH_TO_TAB = Object.fromEntries(
  Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab])
);

/**
 * Read the current URL path and return the matching tab name.
 * Returns 'dash' for the root path, or null for unrecognized paths (404).
 */
export function tabFromPath(pathname = window.location.pathname) {
  // Exact match first
  if (PATH_TO_TAB[pathname]) return PATH_TO_TAB[pathname];

  // Try without trailing slash
  const clean = pathname.replace(/\/$/, '') || '/';
  if (PATH_TO_TAB[clean]) return PATH_TO_TAB[clean];

  // Root path always goes home
  if (clean === '' || clean === '/') return 'dash';

  // Unknown path — signal 404
  return null;
}

/**
 * Check whether a pathname is a known route.
 */
export function isKnownRoute(pathname = window.location.pathname) {
  return tabFromPath(pathname) !== null;
}

/**
 * Get the URL path for a given tab name.
 */
export function pathFromTab(tab) {
  return TAB_TO_PATH[tab] || '/';
}

/**
 * Read highlightId from URL query params.
 */
export function highlightFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || null;
}

/**
 * Push a new URL state for the given tab + optional highlight ID.
 * Uses replaceState for the initial load, pushState for navigation.
 */
export function pushTabUrl(tab, highlightId = null, replace = false) {
  const path = pathFromTab(tab);
  const search = highlightId ? `?id=${encodeURIComponent(highlightId)}` : '';
  const url = path + search;

  // Don't push if we're already there (avoids duplicate history entries)
  if (window.location.pathname + window.location.search === url) return;

  if (replace) {
    window.history.replaceState({ tab, highlightId }, '', url);
  } else {
    window.history.pushState({ tab, highlightId }, '', url);
  }
}
