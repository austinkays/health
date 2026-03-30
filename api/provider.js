// ── Provider lookup API — proxies NPPES NPI Registry ──
// No API key required — free CMS API.
//
// Actions via ?action= query param:
//   search — find providers by name (+ optional state)
//   lookup — get full details by NPI number

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();

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

const cache = new Map();
const CACHE_TTL = 60 * 60_000; // 1 hour (provider data rarely changes)

function cached(key, fetcher) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return Promise.resolve(entry.data);
  return fetcher().then(data => {
    cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
    if (cache.size > 300) {
      const now = Date.now();
      for (const [k, v] of cache) {
        if (now > v.expiry) cache.delete(k);
      }
    }
    return data;
  });
}

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

const NPI_BASE = 'https://npiregistry.cms.hhs.gov/api';

function parseAddress(addrObj) {
  if (!addrObj) return '';
  const parts = [
    addrObj.address_1,
    addrObj.address_2,
    addrObj.city,
    addrObj.state,
    addrObj.postal_code?.slice(0, 5),
  ].filter(Boolean);
  return parts.join(', ');
}

function parseTaxonomy(taxonomies) {
  if (!Array.isArray(taxonomies) || taxonomies.length === 0) return '';
  // Prefer the primary taxonomy
  const primary = taxonomies.find(t => t.primary) || taxonomies[0];
  return primary.desc || '';
}

function formatProvider(result) {
  const basic = result.basic || {};
  const isOrg = result.enumeration_type === 'NPI-2';
  return {
    npi: result.number,
    name: isOrg
      ? (basic.organization_name || '')
      : [basic.name_prefix, basic.first_name, basic.middle_name, basic.last_name, basic.credential].filter(Boolean).join(' '),
    first_name: basic.first_name || '',
    last_name: basic.last_name || '',
    credential: basic.credential || '',
    specialty: parseTaxonomy(result.taxonomies),
    address: parseAddress(result.addresses?.find(a => a.address_purpose === 'LOCATION') || result.addresses?.[0]),
    phone: (result.addresses?.find(a => a.address_purpose === 'LOCATION') || result.addresses?.[0])?.telephone_number || '',
    fax: (result.addresses?.find(a => a.address_purpose === 'LOCATION') || result.addresses?.[0])?.fax_number || '',
    organization: isOrg ? basic.organization_name : (basic.organization_name || ''),
    enumeration_type: result.enumeration_type,
  };
}

async function npiSearch(name, state) {
  const params = new URLSearchParams({ version: '2.1', limit: '10' });
  // Split name to try first/last
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    // Remove common prefixes
    const first = parts[0].replace(/^(dr\.?|md|do)$/i, '').trim();
    const last = parts[parts.length - 1].replace(/,?\s*(md|do|phd|np|pa|rn)$/i, '').trim();
    if (first) params.set('first_name', first);
    if (last) params.set('last_name', last);
  } else {
    // Single word — search as last name and also try organization
    params.set('last_name', parts[0]);
  }
  if (state) params.set('state', state);

  const url = `${NPI_BASE}/?${params}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.results || data.result_count === 0) return [];
  return data.results.map(formatProvider);
}

async function npiLookup(npiNumber) {
  const url = `${NPI_BASE}/?version=2.1&number=${encodeURIComponent(npiNumber)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.results || data.result_count === 0) return null;
  return formatProvider(data.results[0]);
}

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

  const userId = await verifyAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!checkRateLimit(userId)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const { action, q, npi, state } = req.query;

  try {
    switch (action) {
      case 'search': {
        if (!q || q.length < 2) return res.json([]);
        const key = `npi:${q.toLowerCase()}:${(state || '').toLowerCase()}`;
        const results = await cached(key, () => npiSearch(q, state));
        return res.json(results);
      }
      case 'lookup': {
        if (!npi || !/^\d{10}$/.test(npi)) return res.status(400).json({ error: 'Valid 10-digit NPI required' });
        const result = await cached(`npi:${npi}`, () => npiLookup(npi));
        return res.json(result || { error: 'NPI not found' });
      }
      default:
        return res.status(400).json({ error: 'Invalid action. Use: search, lookup' });
    }
  } catch (err) {
    console.error('Provider API error:', err);
    return res.status(500).json({ error: 'External API request failed' });
  }
}
