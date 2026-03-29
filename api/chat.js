export default async function handler(req, res) {
  // CORS headers — restrict to own origin
  const allowedOrigins = [
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.ALLOWED_ORIGIN,
    // Only allow localhost in non-production environments
    process.env.VERCEL_ENV === 'production' ? null : 'http://localhost:5173',
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify Supabase auth token — mandatory, fail if server is misconfigured
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    return res.status(500).json({ error: 'Server authentication not configured' });
  }

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
  } catch {
    return res.status(500).json({ error: 'Auth verification failed' });
  }

  // Validate and sanitize inputs
  const { messages, system, max_tokens: rawMaxTokens = 2000, use_web_search } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  if (messages.length > 50) {
    return res.status(400).json({ error: 'Too many messages (max 50)' });
  }
  for (const msg of messages) {
    if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
      return res.status(400).json({ error: 'Each message must have role "user" or "assistant"' });
    }
    if (typeof msg.content !== 'string' || msg.content.length > 50000) {
      return res.status(400).json({ error: 'Each message content must be a string (max 50,000 chars)' });
    }
  }

  const max_tokens = Math.min(Math.max(parseInt(rawMaxTokens, 10) || 2000, 1), 4096);

  if (system !== undefined && (typeof system !== 'string' || system.length > 20000)) {
    return res.status(400).json({ error: 'system must be a string (max 20,000 chars)' });
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
    if (use_web_search) {
      body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, JSON.stringify(data));
      return res.status(502).json({ error: 'AI service returned an error' });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('Chat proxy error:', err);
    return res.status(500).json({ error: 'Failed to reach AI service' });
  }
}
