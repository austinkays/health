// ── Shared Supabase auth verification for API routes ──
// Verifies a Bearer token against Supabase Auth and returns the user's id,
// or null on any failure (missing header, malformed token, bad creds, network
// error, missing env). All API routes that accept a user Bearer token should
// use this helper rather than inlining their own check.
//
// NOTE: chat.js and gemini.js have auth tangled with tier checks and rate
// limiting and are not migrated — see their inline verifier.

export async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user.id || null;
  } catch {
    return null;
  }
}
