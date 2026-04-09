import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

// ── Intercept Oura OAuth callback before Supabase auto-detects ?code= ──
// Supabase's createClient auto-parses ?code= as a PKCE auth code.
// If this is an Oura callback (state=salve-oura), stash the code and
// clean the URL so Supabase doesn't try to exchange it.
const _params = new URLSearchParams(window.location.search);
if (_params.get('state') === 'salve-oura' && _params.get('code')) {
  window.__ouraCode = _params.get('code');
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
