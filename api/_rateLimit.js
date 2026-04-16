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
 * On 5xx or network error, returns false (fail-closed). On 4xx (e.g., RPC missing), returns true (fail-open with in-memory backstop).
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
 * Compute "now in PT" → a UTC Date at midnight PT of today's PT wall-clock.
 * DST-safe via Intl.DateTimeFormat parts. Falls back to a rolling 24h window
 * if parsing fails (should never happen in supported runtimes).
 */
export function midnightPTAsUTC() {
  const now = Date.now();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(now));
  const get = (t) => parts.find(p => p.type === t)?.value;
  let h = Number(get('hour'));
  const mi = Number(get('minute'));
  const s = Number(get('second'));
  if (h === 24) h = 0;
  if ([h, mi, s].some(v => Number.isNaN(v))) {
    return new Date(now - 24 * 60 * 60 * 1000);
  }
  const msSinceMidnightPT = ((h * 60 + mi) * 60 + s) * 1000;
  return new Date(now - msSinceMidnightPT);
}

/**
 * Check a per-user daily call limit against the api_usage table.
 * Returns true if under the limit (allowed), false to deny.
 *
 * Fails CLOSED (denies) on any ambiguity — non-2xx responses, missing or
 * malformed content-range headers, network errors. This prevents a transient
 * Supabase issue or a PostgREST response-format change from silently letting
 * users bypass the daily cap. The per-minute in-memory + persistent limits
 * above this check are the appropriate backstop during outages.
 *
 * @param {string} userId
 * @param {string} endpoint - 'chat' | 'gemini' | ...
 * @param {number} dailyLimit - max calls per user per day
 */
export async function checkDailyLimit(userId, endpoint, dailyLimit) {
  const config = getSupabaseConfig();
  if (!config) {
    console.warn(`[rateLimit] checkDailyLimit(${endpoint}): Supabase not configured; denying to be safe`);
    return false;
  }

  try {
    const utcMidnightPT = midnightPTAsUTC().toISOString();
    const res = await fetch(
      `${config.url}/rest/v1/api_usage?select=id&user_id=eq.${userId}&endpoint=eq.${endpoint}&created_at=gte.${encodeURIComponent(utcMidnightPT)}`,
      {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          Prefer: 'count=exact',
          'Range-Unit': 'items',
          Range: '0-0',
        },
      }
    );

    if (!res.ok) {
      console.warn(`[rateLimit] checkDailyLimit(${endpoint}): Supabase returned ${res.status}; denying to be safe`);
      return false;
    }

    // Parse "0-0/42" or "*/42" → total = 42. PostgREST may emit "*/*" when
    // count is unknown — treat as unverifiable.
    const range = res.headers.get('content-range') || '';
    const slashIdx = range.indexOf('/');
    if (slashIdx === -1) {
      console.warn(`[rateLimit] checkDailyLimit(${endpoint}): missing content-range header; denying to be safe`);
      return false;
    }
    const total = parseInt(range.slice(slashIdx + 1).trim(), 10);
    if (!Number.isFinite(total) || total < 0) {
      console.warn(`[rateLimit] checkDailyLimit(${endpoint}): unparseable content-range "${range}"; denying to be safe`);
      return false;
    }

    return total < dailyLimit;
  } catch (err) {
    console.warn(`[rateLimit] checkDailyLimit(${endpoint}) network error; denying to be safe:`, err?.message || err);
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
