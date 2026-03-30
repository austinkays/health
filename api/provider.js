// ── Provider lookup API — proxies NPPES NPI Registry ──
// No API key required — free CMS API.
//
// Actions via ?action= query param:
//   search — find providers by name (+ optional state)
//   lookup — get full details by NPI number

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();
const EXTERNAL_TIMEOUT_MS = 15_000;

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
  ].filter(p => p && p.trim());
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
  // Clean and parse name into first/last for NPPES API
  let cleaned = name.trim();
  // Strip leading titles (Dr., Prof., etc.)
  cleaned = cleaned.replace(/^(dr\.?|prof\.?|mr\.?|ms\.?|mrs\.?)\s+/i, '');
  // Strip trailing credentials — common US healthcare suffixes, with optional commas/periods
  // Iteratively strip from the end to handle chains like ", MD, FACP"
  const credentialPattern = /[,\s]+(md|do|phd|np|pa|pa-c|rn|dpm|od|dds|dmd|aprn|lcsw|facp|facs|facep|dnp|fnp|msn|bsn|mph|mba|dc|pt|dpt|ot|pharmd|cns|cnp|acnp|agacnp|crna|crnp|lmft|lpcc|psyd|edd|jr\.?|sr\.?|ii|iii|iv)\.?\s*$/i;
  let prev;
  do { prev = cleaned; cleaned = cleaned.replace(credentialPattern, ''); } while (cleaned !== prev);
  // Strip any trailing commas/periods left over
  cleaned = cleaned.replace(/[,.\s]+$/, '').trim();

  // Detect "Last, First" format (comma inside the remaining name)
  const commaParts = cleaned.split(/,\s*/);
  let firstName = '', lastName = '';
  if (commaParts.length === 2 && commaParts[0] && commaParts[1]) {
    // "Smith, John" → first=John, last=Smith
    lastName = commaParts[0].trim();
    firstName = commaParts[1].trim();
  } else {
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts[parts.length - 1];
    } else if (parts.length === 1 && parts[0]) {
      lastName = parts[0];
    }
  }

  // Use wildcard suffix for partial/short names (NPPES supports trailing *)
  if (firstName) params.set('first_name', firstName.length <= 2 ? firstName + '*' : firstName);
  if (lastName) params.set('last_name', lastName);
  // Enable nickname matching (Bob→Robert, etc.)
  if (firstName) params.set('use_first_name_alias', 'True');
  if (state) {
    const upper = state.toUpperCase();
    if (!/^[A-Z]{2}$/.test(upper)) return [];
    params.set('state', upper);
  }

  const url = `${NPI_BASE}/?${params}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.results || data.result_count === 0) return [];
  return data.results.map(formatProvider);
}

async function npiLookup(npiNumber) {
  const url = `${NPI_BASE}/?version=2.1&number=${encodeURIComponent(npiNumber)}`;
  const res = await fetchWithTimeout(url);
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
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'External API timeout' });
    }
    return res.status(500).json({ error: 'External API request failed' });
  }
}
