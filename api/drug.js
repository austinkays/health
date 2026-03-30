// ── Drug information API — proxies RxNorm (NLM) + OpenFDA ──
// No API keys required — both are free US government APIs.
//
// Actions via ?action= query param:
//   autocomplete — drug name typeahead via RxNorm
//   details      — drug label info via OpenFDA (by rxcui or name)
//   interactions — multi-drug interaction check via RxNorm

// ── In-memory rate limiter (shared pattern with chat.js) ──
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 40; // higher than chat — these are lightweight lookups
const rateBuckets = new Map();
const EXTERNAL_TIMEOUT_MS = 15_000; // 15s timeout for external API calls

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function checkRateLimit(userId) {
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

// ── Simple in-memory cache (survives within a single serverless instance) ──
const cache = new Map();
const CACHE_TTL = 30 * 60_000; // 30 minutes

function cached(key, fetcher) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return Promise.resolve(entry.data);
  return fetcher().then(data => {
    cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
    // Prune if cache grows too large
    if (cache.size > 500) {
      const now = Date.now();
      for (const [k, v] of cache) {
        if (now > v.expiry) cache.delete(k);
      }
    }
    return data;
  });
}

// ── Auth verification (same as chat.js) ──
async function verifyAuth(req) {
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
    return user.id;
  } catch {
    return null;
  }
}

// ── RxNorm helpers ──
const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';

async function rxAutocomplete(term) {
  const url = `${RXNORM_BASE}/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=8`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await res.json();
  const candidates = data?.approximateGroup?.candidate || [];
  // Deduplicate by name, keep first rxcui per name
  const seen = new Map();
  for (const c of candidates) {
    const name = (c.name || '').trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.set(name.toLowerCase(), { name, rxcui: c.rxcui });
    }
  }
  return Array.from(seen.values());
}

async function rxInteractions(rxcuis) {
  if (!rxcuis || rxcuis.length < 2) return [];
  const url = `${RXNORM_BASE}/interaction/list.json?rxcuis=${rxcuis.join('+')}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await res.json();
  const results = [];
  const pairs = data?.fullInteractionTypeGroup || [];
  for (const group of pairs) {
    for (const type of (group.fullInteractionType || [])) {
      for (const pair of (type.interactionPair || [])) {
        const concepts = pair.interactionConcept || [];
        const drugA = concepts[0]?.minConceptItem?.name || '';
        const drugB = concepts[1]?.minConceptItem?.name || '';
        results.push({
          drugA,
          drugB,
          severity: pair.severity || 'N/A',
          description: pair.description || '',
          source: group.sourceName || '',
        });
      }
    }
  }
  return results;
}

// ── OpenFDA helper ──
async function fdaDrugLabel(query) {
  // Try by rxcui first, fall back to brand/generic name search
  let url;
  if (/^\d+$/.test(query)) {
    url = `https://api.fda.gov/drug/label.json?search=openfda.rxcui:"${query}"&limit=1`;
  } else {
    const encoded = encodeURIComponent(query);
    url = `https://api.fda.gov/drug/label.json?search=(openfda.brand_name:"${encoded}"+openfda.generic_name:"${encoded}")&limit=1`;
  }
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const data = await res.json();
  const label = data?.results?.[0];
  if (!label) return null;

  return {
    brand_name: label.openfda?.brand_name?.[0] || '',
    generic_name: label.openfda?.generic_name?.[0] || '',
    manufacturer: label.openfda?.manufacturer_name?.[0] || '',
    substance: label.openfda?.substance_name || [],
    route: label.openfda?.route || [],
    pharm_class: label.openfda?.pharm_class_epc || [],
    warnings: truncateArray(label.warnings, 500),
    boxed_warning: truncateArray(label.boxed_warning, 500),
    adverse_reactions: truncateArray(label.adverse_reactions, 800),
    indications: truncateArray(label.indications_and_usage, 500),
    dosage: truncateArray(label.dosage_and_administration, 500),
    drug_interactions: truncateArray(label.drug_interactions, 500),
    contraindications: truncateArray(label.contraindications, 500),
    pregnancy: truncateArray(label.pregnancy, 300),
  };
}

function truncateArray(arr, maxLen) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return [];
  return arr.map(s => typeof s === 'string' && s.length > maxLen ? s.slice(0, maxLen) + '…' : s);
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const userId = await verifyAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!checkRateLimit(userId)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const { action, q, rxcuis } = req.query;

  try {
    switch (action) {
      case 'autocomplete': {
        if (!q || q.length < 2) return res.json([]);
        const results = await cached(`ac:${q.toLowerCase()}`, () => rxAutocomplete(q));
        return res.json(results);
      }
      case 'details': {
        if (!q) return res.status(400).json({ error: 'q parameter required' });
        const label = await cached(`det:${q.toLowerCase()}`, () => fdaDrugLabel(q));
        return res.json(label || { error: 'No label data found' });
      }
      case 'interactions': {
        if (!rxcuis) return res.status(400).json({ error: 'rxcuis parameter required' });
        const ids = rxcuis.split(',').filter(Boolean);
        if (ids.length < 2) return res.json([]);
        const results = await cached(`ix:${ids.sort().join(',')}`, () => rxInteractions(ids));
        return res.json(results);
      }
      default:
        return res.status(400).json({ error: 'Invalid action. Use: autocomplete, details, interactions' });
    }
  } catch (err) {
    console.error('Drug API error:', err);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'External API timeout' });
    }
    return res.status(500).json({ error: 'External API request failed' });
  }
}
