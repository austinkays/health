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

  const { action, q, name } = req.query;

  try {
    if (action === 'suggest' && q) {
      // RxNorm approximate term search for autocomplete
      const rxRes = await fetch(
        `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=8`
      );
      const rxData = await rxRes.json();
      const candidates = rxData?.approximateGroup?.candidate || [];

      // Deduplicate and extract unique drug names
      const seen = new Set();
      const suggestions = [];
      for (const c of candidates) {
        if (!c.name) continue;
        // Take the first word or the part before common separators
        const cleanName = c.name.split(/\s+\d/)[0].trim();
        const lower = cleanName.toLowerCase();
        if (!seen.has(lower) && suggestions.length < 10) {
          seen.add(lower);
          suggestions.push({ name: cleanName, rxcui: c.rxcui, score: c.score });
        }
      }

      return res.status(200).json({ suggestions });
    }

    if (action === 'info' && name) {
      // OpenFDA drug label search
      const fdaRes = await fetch(
        `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(name)}"+openfda.generic_name:"${encodeURIComponent(name)}"&limit=1`
      );

      if (!fdaRes.ok) {
        // Try generic name only
        const fdaRes2 = await fetch(
          `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(name)}"&limit=1`
        );
        if (!fdaRes2.ok) {
          return res.status(200).json({ info: null, message: 'No FDA label data found' });
        }
        const fdaData2 = await fdaRes2.json();
        return res.status(200).json({ info: extractLabelInfo(fdaData2) });
      }

      const fdaData = await fdaRes.json();
      return res.status(200).json({ info: extractLabelInfo(fdaData) });
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=suggest&q=... or ?action=info&name=...' });
  } catch (err) {
    return res.status(500).json({ error: 'Drug lookup failed' });
  }
}

function extractLabelInfo(fdaData) {
  const result = fdaData?.results?.[0];
  if (!result) return null;

  const openfda = result.openfda || {};

  // Truncate long fields to keep response manageable
  const truncate = (arr, maxLen = 500) => {
    if (!arr || !arr.length) return null;
    const text = arr[0];
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  };

  return {
    brand_name: openfda.brand_name?.[0] || null,
    generic_name: openfda.generic_name?.[0] || null,
    drug_class: openfda.pharm_class_epc || null,
    manufacturer: openfda.manufacturer_name?.[0] || null,
    route: openfda.route || null,
    purpose: truncate(result.purpose) || truncate(result.indications_and_usage),
    warnings: truncate(result.warnings),
    dosage: truncate(result.dosage_and_administration),
    adverse_reactions: truncate(result.adverse_reactions),
  };
}
