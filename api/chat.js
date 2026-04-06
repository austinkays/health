import { checkPersistentRateLimit, logUsage } from './_rateLimit.js';

// ── In-memory rate limiter (fast first-pass, per serverless instance) ──
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // max requests per window per user
const rateBuckets = new Map(); // userId → { count, resetAt }

function checkMemoryRateLimit(userId) {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count++;
  return true;
}

// Periodically clean up stale buckets (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 5 * 60_000);

export default async function handler(req, res) {
  // CORS headers — restrict to own origin
  const allowedOrigins = [
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.ALLOWED_ORIGIN,
    'http://localhost:5173', // local dev
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify Supabase auth token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  let userId;
  try {
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: serviceKey,
      },
    });
    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    // Extract user ID for rate limiting
    const userData = await verifyRes.json();
    userId = userData.id;
    // Fast in-memory check first, then persistent check
    if (userId && !checkMemoryRateLimit(userId)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute and try again.' });
    }
    if (userId && !(await checkPersistentRateLimit(userId, 'chat', RATE_LIMIT_MAX, 60))) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute and try again.' });
    }
  } catch {
    return res.status(500).json({ error: 'Auth verification failed' });
  }

  // ── Premium tier check (respects trial_expires_at) ──
  let profile = null;
  try {
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=tier,trial_expires_at`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (profileRes.ok) {
      const profiles = await profileRes.json();
      profile = profiles[0] || null;
      const isPremium = profile?.tier === 'premium' || profile?.tier === 'admin';
      let trialActive = profile?.trial_expires_at == null;
      if (!trialActive && profile?.trial_expires_at) {
        const expiresTs = new Date(profile.trial_expires_at).getTime();
        trialActive = !isNaN(expiresTs) && expiresTs > Date.now();
      }
      if (!isPremium || !trialActive) {
        const reason = isPremium ? 'trial_expired' : 'not_premium';
        return res.status(403).json({
          error: 'Premium feature. Upgrade to use Claude.',
          reason,
          trial_expires_at: profile?.trial_expires_at ?? null,
        });
      }
    }
  } catch {
    // Fail-open on tier check error — allow the request
  }

  // ── Per-user Claude daily call limit (50/day) ──
  // Protects against runaway spend on the $50 Anthropic monthly cap.
  // Uses the same api_usage table pattern as api/gemini.js's daily limit.
  const CLAUDE_DAILY_LIMIT = 50;
  try {
    // Count calls made today (midnight PT = 08:00 UTC approximation)
    const todayStartUtc = new Date();
    todayStartUtc.setUTCHours(8, 0, 0, 0);
    if (todayStartUtc.getTime() > Date.now()) {
      // We haven't hit today's 08:00 UTC yet — use yesterday's 08:00 UTC
      todayStartUtc.setUTCDate(todayStartUtc.getUTCDate() - 1);
    }
    const countRes = await fetch(
      `${supabaseUrl}/rest/v1/api_usage?user_id=eq.${userId}&endpoint=eq.chat&created_at=gte.${todayStartUtc.toISOString()}&select=id`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: 'count=exact',
        },
      }
    );
    if (countRes.ok) {
      const range = countRes.headers.get('content-range') || '';
      const parts = range.split('/');
      const total = parts.length >= 2 ? parseInt(parts[1], 10) : NaN;
      if (!isNaN(total) && total >= CLAUDE_DAILY_LIMIT) {
        return res.status(429).json({
          error: `Daily AI limit reached (${CLAUDE_DAILY_LIMIT}/day). Resets at midnight PT.`,
          daily_limit: true,
        });
      }
    }
  } catch {
    // Fail-open on daily-limit check error
  }

  // Proxy to Anthropic
  const { messages, system, max_tokens: rawMaxTokens = 2000, use_web_search = false, tools: clientTools, model: requestedModel } = req.body;
  const max_tokens = Math.min(Number(rawMaxTokens) || 2000, 4096);

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Validate client-provided tools if present
  const MAX_TOOLS = 30;
  const MAX_TOOL_SCHEMA_BYTES = 10_000;
  const MAX_TOOL_NAME_LEN = 64;
  if (clientTools != null) {
    if (!Array.isArray(clientTools) || clientTools.length > MAX_TOOLS) {
      return res.status(400).json({ error: 'Invalid tools parameter' });
    }
    for (const t of clientTools) {
      if (!t || typeof t.name !== 'string' || t.name.length > MAX_TOOL_NAME_LEN) {
        return res.status(400).json({ error: 'Invalid tools parameter' });
      }
      if (t.input_schema == null || typeof t.input_schema !== 'object') {
        return res.status(400).json({ error: 'Invalid tools parameter' });
      }
      let schemaSize;
      try {
        schemaSize = JSON.stringify(t.input_schema).length;
      } catch {
        return res.status(400).json({ error: 'Invalid tools parameter' });
      }
      if (schemaSize > MAX_TOOL_SCHEMA_BYTES) {
        return res.status(400).json({ error: 'Tool schema too large' });
      }
    }
  }

  // Validate model against allowlist
  const ALLOWED_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'];
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : 'claude-sonnet-4-6';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const body = {
      model,
      max_tokens,
      messages,
    };
    if (system) body.system = system;

    // Merge client tools with web search tool if needed.
    // Avoid duplicating web_search if the client already sent it.
    const baseTools = Array.isArray(clientTools) ? clientTools : [];
    const clientHasWebSearch = baseTools.some(
      t => t?.name === 'web_search' || t?.type === 'web_search_20250305'
    );
    const allTools = [
      ...baseTools,
      ...(use_web_search && !clientHasWebSearch
        ? [{ type: 'web_search_20250305', name: 'web_search' }]
        : []),
    ];
    if (allTools.length > 0) body.tools = allTools;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 115_000); // 115s (under Vercel's 120s limit)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const data = await response.json();

    // Log usage with token counts (fire-and-forget)
    if (userId && response.status === 200) {
      logUsage(userId, 'chat', {
        tokens_in: data?.usage?.input_tokens ?? null,
        tokens_out: data?.usage?.output_tokens ?? null,
      });
    }

    return res.status(response.status).json(data);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI service timed out' });
    }
    return res.status(500).json({ error: 'Failed to reach AI service' });
  }
}
