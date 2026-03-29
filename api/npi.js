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

  if (supabaseUrl && serviceKey) {
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
  }

  const {
    name, first_name, last_name, npi,
    specialty, city, state, zip,
    limit = 20,
  } = req.body;

  // Build query params for NPPES API
  const params = new URLSearchParams({ version: '2.1', limit: Math.min(limit, 200) });

  if (npi) {
    params.set('number', npi);
  } else {
    // Search by name — supports both combined "name" or separate first/last
    if (last_name) {
      params.set('last_name', last_name);
      if (first_name) params.set('first_name', first_name);
    } else if (name) {
      // Try organization name first, fall back to last name
      params.set('organization_name', name);
    }

    if (specialty) params.set('taxonomy_description', specialty);
    if (city) params.set('city', city);
    if (state) params.set('state', state);
    if (zip) params.set('postal_code', zip);
  }

  try {
    const url = `https://npiregistry.cms.hhs.gov/api/?${params.toString()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Errors) {
      return res.status(400).json({ error: data.Errors[0]?.description || 'NPI lookup error' });
    }

    const results = (data.results || []).map(r => {
      const basic = r.basic || {};
      const addresses = r.addresses || [];
      const taxonomies = r.taxonomies || [];

      // Find primary practice location
      const practice = addresses.find(a => a.address_purpose === 'LOCATION') || addresses[0] || {};
      const primaryTaxonomy = taxonomies.find(t => t.primary) || taxonomies[0] || {};

      const isOrg = r.enumeration_type === 'NPI-2';

      return {
        npi: r.number || '',
        type: isOrg ? 'organization' : 'individual',
        name: isOrg
          ? (basic.organization_name || '')
          : `${basic.first_name || ''} ${basic.last_name || ''}`.trim(),
        credential: basic.credential || '',
        specialty: primaryTaxonomy.desc || '',
        taxonomyCode: primaryTaxonomy.code || '',
        licenseNumber: primaryTaxonomy.license || '',
        licenseState: primaryTaxonomy.state || '',
        address: {
          line1: practice.address_1 || '',
          line2: practice.address_2 || '',
          city: practice.city || '',
          state: practice.state || '',
          zip: practice.postal_code || '',
          phone: practice.telephone_number || '',
          fax: practice.fax_number || '',
        },
      };
    });

    return res.status(200).json({
      count: data.result_count || 0,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach NPI Registry' });
  }
}
