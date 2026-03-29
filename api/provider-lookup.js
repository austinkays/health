export default async function handler(req, res) {
  // CORS headers
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

  // Verify Supabase auth token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    try {
      const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
      });
      if (!verifyRes.ok) return res.status(401).json({ error: 'Invalid session' });
    } catch {
      return res.status(500).json({ error: 'Auth verification failed' });
    }
  }

  const { action, name, state, city } = req.query;

  try {
    if (action === 'search' && name) {
      // Search NPI registry for individual providers
      const params = new URLSearchParams({
        version: '2.1',
        limit: '10',
        enumeration_type: 'NPI-1', // Individual providers
      });

      // Split name into first/last if possible
      const parts = name.replace(/^(dr\.?\s+)/i, '').trim().split(/\s+/);
      if (parts.length >= 2) {
        params.set('first_name', parts[0] + '*');
        params.set('last_name', parts[parts.length - 1] + '*');
      } else {
        params.set('last_name', parts[0] + '*');
      }

      if (state) params.set('state', state.toUpperCase());

      const npiRes = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params}`);
      const npiData = await npiRes.json();

      const providers = (npiData.results || []).map(formatProvider);
      return res.status(200).json({ providers });
    }

    if (action === 'pharmacy' && name) {
      // Search NPI registry for pharmacies (organization type)
      const params = new URLSearchParams({
        version: '2.1',
        limit: '10',
        enumeration_type: 'NPI-2', // Organizations
        organization_name: name + '*',
        taxonomy_description: 'Pharmacy',
      });

      if (city) params.set('city', city);
      if (state) params.set('state', state.toUpperCase());

      const npiRes = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params}`);
      const npiData = await npiRes.json();

      const pharmacies = (npiData.results || []).map(formatPharmacy);
      return res.status(200).json({ pharmacies });
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=search&name=... or ?action=pharmacy&name=...' });
  } catch (err) {
    return res.status(500).json({ error: 'Provider lookup failed' });
  }
}

function formatProvider(r) {
  const basic = r.basic || {};
  const addr = r.addresses?.find(a => a.address_purpose === 'LOCATION') || r.addresses?.[0] || {};
  const taxonomy = r.taxonomies?.find(t => t.primary) || r.taxonomies?.[0] || {};

  return {
    npi: r.number,
    name: [basic.name_prefix, basic.first_name, basic.last_name, basic.credential].filter(Boolean).join(' '),
    specialty: taxonomy.desc || null,
    phone: addr.telephone_number || null,
    fax: addr.fax_number || null,
    address: [addr.address_1, addr.address_2].filter(Boolean).join(', '),
    city: addr.city,
    state: addr.state,
    zip: addr.postal_code?.slice(0, 5),
  };
}

function formatPharmacy(r) {
  const basic = r.basic || {};
  const addr = r.addresses?.find(a => a.address_purpose === 'LOCATION') || r.addresses?.[0] || {};

  return {
    npi: r.number,
    name: basic.organization_name || basic.name || '',
    phone: addr.telephone_number || null,
    fax: addr.fax_number || null,
    address: [addr.address_1, addr.address_2].filter(Boolean).join(', '),
    city: addr.city,
    state: addr.state,
    zip: addr.postal_code?.slice(0, 5),
  };
}
