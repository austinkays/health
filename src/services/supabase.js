import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

// ── Intercept device-OAuth callbacks before Supabase auto-detects ?code= ──
// Supabase's createClient auto-parses ?code= as a PKCE auth code, so we
// need to stash any third-party OAuth codes onto the window first and
// clean the URL. Each integration uses a unique state value:
//   salve-oura      → Oura Ring
//   salve-dexcom    → Dexcom CGM
//   salve-withings  → Withings (scales, BP cuffs, sleep mats)
//   salve-fitbit    → Fitbit (sleep, HR, steps, weight)
//   salve-whoop     → Whoop (HRV, recovery, sleep)
const _params = new URLSearchParams(window.location.search);
const _oauthState = _params.get('state');
const _oauthCode = _params.get('code');
if (_oauthCode && _oauthState && _oauthState.startsWith('salve-')) {
  if (_oauthState === 'salve-oura') window.__ouraCode = _oauthCode;
  else if (_oauthState === 'salve-dexcom') window.__dexcomCode = _oauthCode;
  else if (_oauthState === 'salve-withings') window.__withingsCode = _oauthCode;
  else if (_oauthState === 'salve-fitbit') window.__fitbitCode = _oauthCode;
  else if (_oauthState === 'salve-whoop') window.__whoopCode = _oauthCode;
  _params.delete('code');
  _params.delete('state');
  const clean = _params.toString();
  window.history.replaceState({}, '', window.location.pathname + (clean ? '?' + clean : ''));
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    // Disable navigator.locks to prevent lock contention.
    // db.loadAll() fires 24 parallel queries, each internally calls getSession()
    // which acquires an exclusive lock. With 24 concurrent requests, the 5-second
    // lock timeout cascades and stalls initial page load for 60+ seconds.
    // Salve is a single-tab PWA; cross-tab session coordination is unnecessary.
    lock: (_name, _acquireTimeout, fn) => fn(),
  },
});
