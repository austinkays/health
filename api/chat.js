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

  // Proxy to Anthropic
  const { messages, system, max_tokens: rawMaxTokens = 2000, use_web_search = false, tools: clientTools } = req.body;
  const max_tokens = Math.min(Number(rawMaxTokens) || 2000, 4096);

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Validate client-provided tools if present
  if (clientTools != null && (!Array.isArray(clientTools) || clientTools.length > 30 ||
      clientTools.some(t => typeof t.name !== 'string' || typeof t.input_schema !== 'object'))) {
    return res.status(400).json({ error: 'Invalid tools parameter' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      messages,
    };
    if (system) body.system = system;

    // Merge client tools with web search tool if needed
    const allTools = [
      ...(Array.isArray(clientTools) ? clientTools : []),
      ...(use_web_search ? [{ type: 'web_search_20250305', name: 'web_search' }] : []),
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
