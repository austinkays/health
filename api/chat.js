import { checkPersistentRateLimit, checkDailyLimit, logUsage } from './_rateLimit.js';
import { buildSystemPrompt, isValidPromptKey } from './_prompts.js';

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
    if (!userId || typeof userId !== 'string') {
      return res.status(401).json({ error: 'Invalid user session' });
    }
    // Fast in-memory check first, then persistent check
    if (!checkMemoryRateLimit(userId)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute and try again.' });
    }
    if (!(await checkPersistentRateLimit(userId, 'chat', RATE_LIMIT_MAX, 60))) {
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
        // Log the blocked attempt so the admin dashboard can see tier-gate
        // pressure. Uses a separate endpoint name so it doesn't pollute the
        // real 'chat' token totals (no tokens_in/out attached).
        logUsage(userId, 'chat_blocked');
        return res.status(403).json({
          error: 'Premium feature. Upgrade to use Claude.',
          reason,
          trial_expires_at: profile?.trial_expires_at ?? null,
        });
      }
    }
  } catch {
    // Fail-closed on tier check error — require verified profile for premium features
    return res.status(500).json({ error: 'Unable to verify account tier. Please try again.' });
  }

  // ── Per-user Claude daily call limit ──
  // Protects against runaway spend on the Anthropic monthly cap. Tuned for
  // the closed beta: with chat routed to Haiku (~$0.01/call) via the
  // BETA_LITE_FEATURES override in services/ai.js, plus pro-tier features
  // staying on Opus for quality, 20/day per user across 10 invited beta
  // testers stays well under the $50/mo Anthropic budget in realistic use.
  // Worst-case theoretical: 10 × 20 × $0.05 = $10/day, but realistic average
  // is $0.05–0.10/user/day = $15–30/month total.
  // Bump back up once billing is live and the budget is larger.
  const CLAUDE_DAILY_LIMIT = 30;
  // Uses shared checkDailyLimit which fails-CLOSED on Supabase errors or
  // unparseable responses. Previously this inline check was fail-open, which
  // meant a transient Supabase 5xx or a PostgREST format change could silently
  // let users bypass the daily cap.
  if (!(await checkDailyLimit(userId, 'chat', CLAUDE_DAILY_LIMIT))) {
    return res.status(429).json({
      error: `Daily Sage limit reached (${CLAUDE_DAILY_LIMIT}/day). During the beta we cap usage to keep Sage free for everyone — resets at midnight PT.`,
      daily_limit: true,
      limit: CLAUDE_DAILY_LIMIT,
    });
  }

  // Proxy to Anthropic
  const { messages, prompt_key, profile_text, prompt_opts, system: rawSystem, max_tokens: rawMaxTokens = 2000, use_web_search = false, tools: clientTools, model: requestedModel, skip_usage_log = false } = req.body;
  const max_tokens = Math.min(Number(rawMaxTokens) || 2000, 4096);

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  if (messages.length > 500) {
    return res.status(400).json({ error: 'Too many messages (max 500)' });
  }
  const totalBytes = JSON.stringify(messages).length;
  if (totalBytes > 5_000_000) {
    return res.status(400).json({ error: 'Message payload too large (max 5MB)' });
  }

  // Build system prompt server-side from allowlisted key + profile text.
  // Raw `system` is only accepted for admin tier (House Consultation escape hatch).
  let system = null;
  if (prompt_key) {
    if (!isValidPromptKey(prompt_key)) {
      return res.status(400).json({ error: 'Invalid prompt_key' });
    }
    system = buildSystemPrompt(prompt_key, profile_text || '', {
      ...(prompt_opts || {}),
      userTier: profile?.tier || 'free',
    });
  } else if (rawSystem && profile?.tier === 'admin') {
    // Admin escape hatch: allow raw system prompt for House Consultation
    system = typeof rawSystem === 'string' ? rawSystem.slice(0, 15000) : null;
  }
  // If neither prompt_key nor admin rawSystem, system stays null (allowed for simple messages)

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

    // Log usage with token counts (fire-and-forget) — skip for onboarding intro
    if (userId && response.status === 200 && !skip_usage_log) {
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
