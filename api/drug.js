// ── Drug information API — proxies RxNorm (NLM) + OpenFDA + NADAC (CMS) ──
// No API keys required — all are free US government APIs.
//
// Actions via ?action= query param:
//   autocomplete — drug name typeahead via RxNorm
//   details      — drug label info via OpenFDA (by rxcui or name)
//   interactions — multi-drug interaction check via RxNorm
//   price        — NADAC wholesale price via RxCUI → NDC → CMS DKAN

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

// Extract brand name from RxNorm bracket notation: "famotidine Oral Tablet [Pepcid]" → "Pepcid"
function extractBrandName(name) {
  const match = name?.match(/\[([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

// Extract the active ingredient(s) from RxNorm-style clinical drug names.
// "amphetamine / dextroamphetamine Extended Release Oral Capsule [Adderall]" → "amphetamine / dextroamphetamine"
// "Sertraline 50 MG Oral Tablet" → "Sertraline"
// "fluticasone propionate Metered Dose Nasal Spray [Flonase]" → "fluticasone propionate"
// "Vitamin D3" → "Vitamin D3" (unchanged)
const DOSAGE_FORMS = /\s+(?:Extended Release |Delayed Release |Metered Dose )?(?:Oral (?:Tablet|Capsule|Solution|Suspension)|Nasal (?:Spray|Solution)|Topical (?:Cream|Ointment|Gel|Solution|Lotion)|Injectable Solution|Injection|Intravenous Solution|Ophthalmic (?:Solution|Drops)|Otic Solution|Rectal Suppository|Transdermal (?:Patch|System)|Inhalation (?:Powder|Solution|Aerosol)|Sublingual Tablet|Chewable Tablet|Disintegrating Tablet|Vaginal (?:Cream|Tablet|Ring)).*$/i;

function extractIngredient(name) {
  if (!name) return name;
  // Strip [BrandName] brackets
  let cleaned = name.replace(/\s*\[[^\]]*\]\s*/g, '').trim();
  // Strip trailing dosage + form info (e.g. "50 MG Oral Tablet", "0.5 MG/ML Injectable Solution")
  cleaned = cleaned.replace(/\s+\d+(\.\d+)?\s*(mg|ml|mcg|%|units?|grams?|meq|mmol|mg\/ml|mcg\/ml)\b.*$/i, '').trim();
  // Strip dosage form words even without numeric dosage (e.g. "Oral Tablet", "Nasal Spray")
  cleaned = cleaned.replace(DOSAGE_FORMS, '').trim();
  return cleaned || name;
}

// Run a single OpenFDA search and return the first result label, or null
async function fdaQuery(searchExpr) {
  const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(searchExpr)}&limit=1`;
  try {
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const data = await res.json();
      if (data?.results?.[0]) return data.results[0];
    }
  } catch { /* fall through */ }
  return null;
}

async function fdaSearchByName(name) {
  const brand = extractBrandName(name);
  const ingredient = extractIngredient(name);

  // Tier 0: If we have a brand name from brackets, search by brand name first (most precise)
  if (brand) {
    const label = await fdaQuery(`openfda.brand_name:"${brand}"`);
    if (label) return label;
  }

  // Tier 1: Exact-quoted search on brand_name + generic_name with cleaned ingredient
  const label1 = await fdaQuery(`(openfda.brand_name:"${ingredient}"+openfda.generic_name:"${ingredient}")`);
  if (label1) return label1;

  // Tier 2: Unquoted search (more flexible — handles partial matches, salt forms, etc.)
  const label2 = await fdaQuery(`(openfda.brand_name:${ingredient}+openfda.generic_name:${ingredient})`);
  if (label2) return label2;

  // Tier 3: General substance name search (catches active ingredients listed differently)
  const label3 = await fdaQuery(`openfda.substance_name:${ingredient}`);
  if (label3) return label3;

  // Tier 4: For combo drugs (ingredient contains " / "), try the first ingredient alone
  if (ingredient.includes(' / ')) {
    const first = ingredient.split(' / ')[0].trim();
    if (first) {
      const label4 = await fdaQuery(`(openfda.brand_name:${first}+openfda.generic_name:${first}+openfda.substance_name:${first})`);
      if (label4) return label4;
    }
  }

  console.log(`[FDA] No results for name="${name}" (brand="${brand || '(none)'}", ingredient="${ingredient}")`);
  return null;
}

// ── NADAC price lookup (CMS DKAN API) ──
// Dataset ID changes yearly — update this constant when CMS publishes new dataset
const NADAC_DATASET_ID = 'fbb83258-11c7-47f5-8b18-5f8e79f7e704';
const NADAC_BASE = `https://data.medicaid.gov/api/1/datastore/query/${NADAC_DATASET_ID}/0`;

/** Normalize NDC to 11-digit format (strip hyphens, zero-pad) */
function normalizeNDC(ndc) {
  const digits = ndc.replace(/[^0-9]/g, '');
  return digits.padStart(11, '0');
}

/** Fetch NDCs for an RxCUI from RxNorm */
async function rxcuiToNDCs(rxcui) {
  const url = `${RXNORM_BASE}/rxcui/${encodeURIComponent(rxcui)}/ndcs.json`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.ndcGroup?.ndcList?.ndc || []).map(normalizeNDC);
}

/** Query NADAC for a single NDC — returns price record or null */
async function nadacLookup(ndc) {
  const params = new URLSearchParams({
    'conditions[0][property]': 'ndc',
    'conditions[0][value]': ndc,
    'conditions[0][operator]': '=',
    limit: '1',
    'sort[0][property]': 'as_of_date',
    'sort[0][order]': 'desc',
  });
  const url = `${NADAC_BASE}?${params}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const data = await res.json();
  const row = data?.results?.[0];
  if (!row) return null;
  return {
    ndc,
    ndc_description: row.ndc_description || '',
    nadac_per_unit: parseFloat(row.nadac_per_unit) || 0,
    pricing_unit: row.pricing_unit || 'EA',
    effective_date: row.effective_date || '',
    as_of_date: row.as_of_date || '',
    classification: row.classification_for_rate_setting || '',
  };
}

/** Full price pipeline: RxCUI → NDCs → NADAC prices for cheapest option */
async function lookupPrice(rxcui) {
  const ndcs = await rxcuiToNDCs(rxcui);
  if (!ndcs.length) return { error: 'No NDCs found for this medication' };

  // Query up to 5 NDCs in parallel
  const subset = ndcs.slice(0, 5);
  const results = await Promise.all(subset.map(ndc => nadacLookup(ndc).catch(() => null)));
  const prices = results.filter(Boolean);
  if (!prices.length) return { error: 'No NADAC pricing available for this medication' };

  // Sort by price ascending — cheapest first
  prices.sort((a, b) => a.nadac_per_unit - b.nadac_per_unit);
  const best = prices[0];

  return {
    rxcui,
    ndc: best.ndc,
    nadac_per_unit: best.nadac_per_unit,
    pricing_unit: best.pricing_unit,
    effective_date: best.effective_date,
    as_of_date: best.as_of_date,
    drug_name: best.ndc_description,
    classification: best.classification,
    all_prices: prices,
  };
}

async function fdaDrugLabel(query, fallbackName) {
  // If query is an rxcui (numeric), try RxCUI lookup first
  if (/^\d+$/.test(query)) {
    const url = `https://api.fda.gov/drug/label.json?search=openfda.rxcui:"${query}"&limit=1`;
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const data = await res.json();
        if (data?.results?.[0]) return formatLabel(data.results[0]);
      }
    } catch { /* continue to name fallback */ }

    // RxCUI not in OpenFDA — fall back to name-based search
    if (fallbackName) {
      const label = await fdaSearchByName(fallbackName);
      if (label) return formatLabel(label);
    }
    console.log(`[FDA] No results for rxcui="${query}" fallbackName="${fallbackName || '(none)'}"`);
    return null;
  }

  // Query is a name string — use multi-tier name search
  const label = await fdaSearchByName(query);
  if (label) return formatLabel(label);
  return null;
}

function formatLabel(label) {
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

  const { action, q, rxcuis, name } = req.query;

  try {
    switch (action) {
      case 'autocomplete': {
        if (!q || q.length < 2) return res.json([]);
        const results = await cached(`ac:${q.toLowerCase()}`, () => rxAutocomplete(q));
        return res.json(results);
      }
      case 'details': {
        if (!q) return res.status(400).json({ error: 'q parameter required' });
        const cacheKey = `det:${q.toLowerCase()}:${(name || '').toLowerCase()}`;
        const label = await cached(cacheKey, () => fdaDrugLabel(q, name));
        return res.json(label || { error: 'No label data found' });
      }
      case 'interactions': {
        if (!rxcuis) return res.status(400).json({ error: 'rxcuis parameter required' });
        const ids = rxcuis.split(',').filter(Boolean);
        if (ids.length < 2) return res.json([]);
        const results = await cached(`ix:${ids.sort().join(',')}`, () => rxInteractions(ids));
        return res.json(results);
      }
      case 'price': {
        const rxcui = req.query.rxcui;
        if (!rxcui) return res.status(400).json({ error: 'rxcui parameter required' });
        const priceData = await cached(`price:${rxcui}`, () => lookupPrice(rxcui));
        return res.json(priceData);
      }
      default:
        return res.status(400).json({ error: 'Invalid action. Use: autocomplete, details, interactions, price' });
    }
  } catch (err) {
    console.error('Drug API error:', err);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'External API timeout' });
    }
    return res.status(500).json({ error: 'External API request failed' });
  }
}
