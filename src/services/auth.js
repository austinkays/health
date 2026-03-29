import { supabase } from './supabase';

// Always redirect to the production app after magic link auth.
// Using window.location.origin would send localhost links in local dev,
// which breaks when Amber clicks the link on her phone or another device.
const SITE_URL = import.meta.env.PROD
  ? 'https://salve-three.vercel.app'
  : window.location.origin;

export async function signIn(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: SITE_URL,
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

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
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
