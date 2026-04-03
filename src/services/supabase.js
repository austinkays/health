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

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
