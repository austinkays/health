import { supabase } from './supabase';
import { clearTokenCache } from './token';

// Always redirect to the production app after magic link auth.
// Using window.location.origin would send localhost links in local dev,
// which breaks when the user opens the link on a phone or another device.
const SITE_URL = import.meta.env.PROD
  ? 'https://salve-three.vercel.app'
  : window.location.origin;

// When shouldCreateUser is false, Supabase will refuse to send an OTP to an
// email that isn't already in auth.users — used by the beta gate so a
// would-be attacker can't sign up without a valid invite code just by
// leaving the invite field blank.
export async function signIn(email, shouldCreateUser = true) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: SITE_URL,
      shouldCreateUser,
    },
  });
  if (error) throw error;
}

export async function verifyOtp(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: SITE_URL },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  // Clear the token cache first so no subsequent call can reuse the old token
  clearTokenCache();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Permanently deletes the user's auth account + all associated data
// (cascades via ON DELETE CASCADE on every user-owned table).
// Requires the user's session token and an explicit 'DELETE' confirmation string.
export async function deleteAccount() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');
  const res = await fetch('/api/delete-account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ confirm: 'DELETE' }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || 'Account deletion failed');
  }
  // Local session is dead now, sign out client-side to clear it cleanly
  await supabase.auth.signOut().catch(() => {});
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => callback(event, session)
  );
  return subscription;
}
