// ── Shared wearable helpers ──────────────────────────────────────────
// Supabase service-role REST helpers for wearable_connections + vitals
// /activities bulk inserts + dedup checks + admin gate. Used by the
// Oura and Fitbit webhook handlers (which run without a user session)
// and by the provider `action=token`/`status`/`disconnect` paths that
// need to read the canonical server-side connection row.
//
// Writes use service-role to bypass RLS — wearable_connections has no
// INSERT/UPDATE policies for anon/authed roles, so this path is the
// only way rows get written.

export function supabaseConfig() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export async function upsertWearableConnection(row) {
  const { url, key } = supabaseConfig();
  if (!url || !key) throw new Error('Supabase service role not configured');
  const res = await fetch(`${url}/rest/v1/wearable_connections?on_conflict=user_id,provider`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`wearable_connections upsert failed (${res.status}): ${err}`);
  }
  const rows = await res.json();
  return rows[0];
}

export async function getWearableConnection(userId, provider) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  const res = await fetch(
    `${url}/rest/v1/wearable_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

export async function deleteWearableConnection(userId, provider) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  await fetch(
    `${url}/rest/v1/wearable_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
    }
  );
}

export async function getConnectionByProviderUserId(provider, providerUserId) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  const res = await fetch(
    `${url}/rest/v1/wearable_connections?provider=eq.${encodeURIComponent(provider)}&provider_user_id=eq.${encodeURIComponent(providerUserId)}&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

export async function patchConnectionTokens(userId, provider, patch) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  await fetch(
    `${url}/rest/v1/wearable_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  ).catch(() => { /* best-effort */ });
}

export async function touchConnectionWebhook(userId, provider) {
  const now = new Date().toISOString();
  await patchConnectionTokens(userId, provider, {
    last_webhook_at: now,
    last_sync_at: now,
  });
}

// Bulk vitals/activities upserts via service-role REST. Mirrors Terra's
// bulkInsertVitals/bulkInsertActivities pattern (api/terra.js:207). Each
// row should include user_id; we don't add it here so the caller can
// batch rows for different users in theory (today, only one user per
// webhook notification). Best-effort dedup uses pre-fetch + filter
// (per-row check) rather than DB UPSERT since the vitals table doesn't
// have a unique constraint on (user_id, date, type, source).

export async function bulkInsertVitals(rows) {
  if (!rows.length) return;
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  await fetch(`${url}/rest/v1/vitals`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  }).catch(e => console.warn('[bulkInsertVitals] failed', e));
}

export async function bulkInsertActivities(rows) {
  if (!rows.length) return;
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  await fetch(`${url}/rest/v1/activities`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  }).catch(e => console.warn('[bulkInsertActivities] failed', e));
}

// Per-row dedup: returns true if a vital with matching (user_id, date,
// type, source) already exists. Used to skip webhook-driven inserts
// when the user has already pulled the same day's data via legacy
// manual sync. Cheap because the vitals index covers (user_id, date).
export async function vitalAlreadyExists(userId, date, type, source) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return false;
  const res = await fetch(
    `${url}/rest/v1/vitals?user_id=eq.${encodeURIComponent(userId)}&date=eq.${encodeURIComponent(date)}&type=eq.${encodeURIComponent(type)}&source=eq.${encodeURIComponent(source)}&limit=1&select=id`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

export async function activityAlreadyExists(userId, date, type, source, durationMinutes) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return false;
  // Workouts dedup on (user_id, date, type, source, duration). Different
  // workouts on the same day have different durations.
  const res = await fetch(
    `${url}/rest/v1/activities?user_id=eq.${encodeURIComponent(userId)}&date=eq.${encodeURIComponent(date)}&type=eq.${encodeURIComponent(type)}&source=eq.${encodeURIComponent(source)}&duration_minutes=eq.${durationMinutes}&limit=1&select=id`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

// Server-side admin gate. Used by bootstrap endpoints that should only
// be callable by us (e.g. one-time Oura subscription setup). Mirrors
// the client-side isAdminActive() check but verified against Supabase
// with the service role — client-side localStorage tier overrides
// can't bypass this.
export async function isAdminUser(userId) {
  const { url, key } = supabaseConfig();
  if (!url || !key || !userId) return false;
  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=tier&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows[0]?.tier === 'admin';
}
