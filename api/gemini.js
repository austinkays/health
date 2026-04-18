import { checkPersistentRateLimit, checkDailyLimit, logUsage } from './_rateLimit.js';
import { buildSystemPrompt, isValidPromptKey } from './_prompts.js';

// ── In-memory rate limiter ──
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 15; // 15 req/min (accommodates Flash-Lite's 15 RPM)
const rateBuckets = new Map();

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

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 5 * 60_000);

// ── Daily call limit (free tier) ──
const DAILY_LIMIT = 15;

// ── Allowed Gemini models ──
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-pro-preview-06-05',
]);
const DEFAULT_MODEL = 'gemini-2.5-flash';

// ── Safety settings ──
// Relax safety thresholds so legitimate medical content (medications, symptoms,
// conditions, dosage details) isn't blocked.  BLOCK_ONLY_HIGH still catches
// genuinely harmful content while letting clinical discussions through.
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT',         threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',         threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',   threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',   threshold: 'BLOCK_ONLY_HIGH' },
];

// ── Translation: Anthropic → Gemini ──

/**
 * Build a map of tool_use_id → tool_name by scanning messages for tool_use blocks.
 */
function buildToolIdMap(messages) {
  const map = {};
  for (const msg of messages) {
    if (msg.role !== 'assistant' || typeof msg.content === 'string') continue;
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === 'tool_use' && block.id && block.name) {
        map[block.id] = block.name;
      }
    }
  }
  return map;
}

/**
 * Convert Anthropic messages → Gemini contents array.
 */
function translateMessages(messages) {
  const toolIdMap = buildToolIdMap(messages);
  const contents = [];

  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          parts.push({ text: block.text });
        } else if (block.type === 'image' && block.source?.type === 'base64') {
          parts.push({
            inlineData: {
              mimeType: block.source.media_type,
              data: block.source.data,
            },
          });
        } else if (block.type === 'tool_use') {
          parts.push({
            functionCall: {
              name: block.name,
              args: block.input || {},
            },
          });
          // Store for future tool_result lookups
          if (block.id && block.name) toolIdMap[block.id] = block.name;
        } else if (block.type === 'tool_result') {
          const name = toolIdMap[block.tool_use_id] || 'unknown_tool';
          const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
          parts.push({
            functionResponse: {
              name,
              response: { content },
            },
          });
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return contents;
}

/**
 * Convert Anthropic tool definitions → Gemini tools array.
 * Returns { functionTools, useGoogleSearch }.
 */
function translateTools(clientTools, useWebSearch) {
  const functionDeclarations = [];
  let useGoogleSearch = useWebSearch;

  if (Array.isArray(clientTools)) {
    for (const tool of clientTools) {
      // Skip web search tool type — handled separately
      if (tool.type === 'web_search_20250305' || tool.name === 'web_search') {
        useGoogleSearch = true;
        continue;
      }
      functionDeclarations.push({
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema || {},
      });
    }
  }

  const tools = [];
  if (functionDeclarations.length > 0) {
    tools.push({ functionDeclarations });
  }
  if (useGoogleSearch) {
    tools.push({ googleSearch: {} });
  }

  return tools;
}

/**
 * Convert Gemini response → Anthropic-shaped response.
 */
function translateResponse(geminiData) {
  if (geminiData.error) {
    return {
      _blocked: true,
      content: [{ type: 'text', text: `Gemini API error: ${geminiData.error.message || 'Unknown error'}` }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  // ── Prompt-level safety block (no candidates generated at all) ──
  const promptBlock = geminiData.promptFeedback?.blockReason;
  if (promptBlock) {
    console.warn('[Gemini] Prompt blocked:', promptBlock, geminiData.promptFeedback);
    return {
      _blocked: true,
      content: [{ type: 'text', text: 'Your request was blocked by safety filters. Try rephrasing or simplifying your question.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  const candidate = geminiData.candidates?.[0];
  if (!candidate?.content?.parts) {
    console.warn('[Gemini] Empty candidates. finishReason:', candidate?.finishReason, 'promptFeedback:', geminiData.promptFeedback);
    return {
      _blocked: true,
      content: [{ type: 'text', text: 'No response from Gemini. The request may have been blocked by content filters.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  // ── Candidate-level finish reason blocks ──
  const fr = candidate.finishReason;
  if (fr === 'SAFETY' || fr === 'BLOCKLIST' || fr === 'RECITATION') {
    console.warn('[Gemini] Candidate blocked. finishReason:', fr);
    const msgs = {
      SAFETY: 'Response blocked by safety filters. Please try rephrasing your question.',
      BLOCKLIST: 'Response blocked due to restricted content. Please rephrase.',
      RECITATION: 'Response blocked to avoid reproducing copyrighted content. Please rephrase.',
    };
    return {
      _blocked: true,
      content: [{ type: 'text', text: msgs[fr] }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
        output_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  const content = [];
  let hasToolUse = false;
  let toolCounter = 0;

  // Translate grounding metadata (Google Search results) → web_search_tool_result block
  const grounding = candidate.groundingMetadata;
  if (grounding?.groundingChunks?.length > 0) {
    const searchResults = grounding.groundingChunks
      .filter(c => c.web?.uri)
      .map(c => ({
        type: 'web_search_result',
        url: c.web.uri,
        title: c.web.title || new URL(c.web.uri).hostname,
      }));
    if (searchResults.length > 0) {
      content.push({
        type: 'web_search_tool_result',
        content: searchResults,
      });
    }
  }

  for (const part of candidate.content.parts) {
    if (part.text) {
      content.push({ type: 'text', text: part.text });
    } else if (part.functionCall) {
      hasToolUse = true;
      content.push({
        type: 'tool_use',
        id: `toolu_g_${toolCounter++}`,
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      });
    }
  }

  const stopReason = hasToolUse ? 'tool_use' : 'end_turn';

  return {
    content,
    stop_reason: stopReason,
    usage: {
      input_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
      output_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

// ── Handler ──

export default async function handler(req, res) {
  // CORS
  const allowedOrigins = [
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.ALLOWED_ORIGIN,
    'http://localhost:5173',
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
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
  let userTier = 'free';
  try {
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    });
    if (!verifyRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const userData = await verifyRes.json();
    userId = userData.id;

    if (userId && !checkMemoryRateLimit(userId)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute and try again.' });
    }
    if (userId && !(await checkPersistentRateLimit(userId, 'gemini', RATE_LIMIT_MAX, 60))) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute and try again.' });
    }

    // Check user tier — premium/admin users bypass daily limit
    if (userId) {
      try {
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=tier`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        if (profileRes.ok) {
          const profiles = await profileRes.json();
          userTier = profiles[0]?.tier || 'free';
        }
      } catch { /* fail-open: treat as free */ }
    }

    // Daily call limit for free tier only (10 calls/day, resets midnight PT)
    // Premium and admin users bypass the daily limit.
    if (userId && userTier === 'free') {
      const dailyAllowed = await checkDailyLimit(userId, 'gemini', DAILY_LIMIT);
      if (!dailyAllowed) {
        return res.status(429).json({ error: `Daily AI limit reached (${DAILY_LIMIT}/day on free tier). Resets at midnight PT.`, daily_limit: true });
      }
    }
  } catch {
    return res.status(500).json({ error: 'Auth verification failed' });
  }

  // Parse request (Anthropic-shaped body)
  const { messages, prompt_key, profile_text, prompt_opts, system: rawSystem, max_tokens: rawMaxTokens = 2000, use_web_search = false, tools: clientTools, model: requestedModel, skip_usage_log = false } = req.body;
  const maxTokens = Math.min(Number(rawMaxTokens) || 2000, 4096);

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
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
      userTier,
    });
  } else if (rawSystem && userTier === 'admin') {
    system = typeof rawSystem === 'string' ? rawSystem.slice(0, 15000) : null;
  }

  const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  try {
    // Translate to Gemini format
    const contents = translateMessages(messages);
    const tools = translateTools(clientTools, use_web_search);

    const body = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
      safetySettings: SAFETY_SETTINGS,
    };
    if (system) {
      body.system_instruction = { parts: [{ text: system }] };
    }
    if (tools.length > 0) {
      body.tools = tools;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 115_000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    clearTimeout(timer);
    const geminiData = await response.json().catch(() => ({}));

    // If upstream returned an error status OR the body carries an error object,
    // surface that to the client rather than returning a 200 with a translated
    // "no response" message.
    if (!response.ok || geminiData.error) {
      const status = response.ok ? 502 : response.status;
      const message = geminiData.error?.message || `Gemini API returned ${response.status}`;
      return res.status(status).json({ error: message });
    }

    // Translate Gemini response → Anthropic format
    const translated = translateResponse(geminiData);

    // If the response was blocked (safety, empty candidates, etc.), surface as
    // an HTTP error so the client's callAPI() throws and the user sees a
    // friendly error in the catch handler, not raw error text as "the result".
    if (translated._blocked) {
      const errorText = translated.content?.[0]?.text || 'AI response blocked';
      return res.status(502).json({ error: errorText });
    }

    // Log usage (fire-and-forget) — skip for onboarding intro
    if (userId && !skip_usage_log) {
      logUsage(userId, 'gemini', {
        tokens_in: translated.usage?.input_tokens ?? null,
        tokens_out: translated.usage?.output_tokens ?? null,
      });
    }

    return res.status(200).json(translated);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI service timed out' });
    }
    return res.status(500).json({ error: 'Failed to reach AI service' });
  }
}
