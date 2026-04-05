// ── Persistent rate limiting via Supabase api_usage table ──
// Shared by all API endpoints. Uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
//
// Usage:
//   const allowed = await checkPersistentRateLimit(userId, 'chat', 20, 60);
//   // ... after response ...
//   logUsage(userId, 'chat', { tokens_in: 100, tokens_out: 200 }); // fire-and-forget

function getSupabaseConfig() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/**
 * Check persistent rate limit by calling the check_rate_limit() SQL function.
 * Returns true if allowed, false if rate limited.
 * On error (Supabase down, etc.), returns true (fail-open — the in-memory check is the backstop).
 */
export async function checkPersistentRateLimit(userId, endpoint, maxRequests, windowSeconds) {
  const config = getSupabaseConfig();
  if (!config) return true; // fail-open if not configured

  try {
    const res = await fetch(`${config.url}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_endpoint: endpoint,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      }),
    });

    if (!res.ok) {
      // Fail CLOSED on upstream server errors (5xx) so attackers can't bypass
      // rate limits by exhausting Supabase. Fail-open only for 4xx (e.g., RPC
      // not found during migration) where the in-memory limit is the backstop.
      if (res.status >= 500) return false;
      return true;
    }
    const allowed = await res.json();
    return allowed === true;
  } catch {
    // Network error reaching Supabase — treat same as upstream 5xx, fail closed.
    return false;
  }
}

/**
 * Log a request to api_usage table. Fire-and-forget (no await needed).
 * @param {string} userId
 * @param {string} endpoint - 'chat', 'drug', 'provider', 'oura'
 * @param {object} [opts] - { tokens_in, tokens_out }
 */
export function logUsage(userId, endpoint, opts = {}) {
  const config = getSupabaseConfig();
  if (!config) return;

  const row = {
    user_id: userId,
    endpoint,
  };
  if (opts.tokens_in != null) row.tokens_in = opts.tokens_in;
  if (opts.tokens_out != null) row.tokens_out = opts.tokens_out;

  // Fire-and-forget — don't block the response
  fetch(`${config.url}/rest/v1/api_usage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  }).catch(() => {
    // Swallow errors — usage logging should never break the API
  });
}
