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

  const { action, drug, limit = 10 } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }
  if (!drug) {
    return res.status(400).json({ error: 'drug name is required' });
  }

  const apiKey = process.env.OPENFDA_API_KEY;
  // OpenFDA works without a key (lower rate limits), but key gives 120K/day
  const keyParam = apiKey ? `&api_key=${apiKey}` : '';
  const encodedDrug = encodeURIComponent(drug);
  const clampedLimit = Math.min(Math.max(1, limit), 100);

  try {
    if (action === 'label') {
      // Drug labeling — indications, warnings, dosage, interactions
      const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodedDrug}"+openfda.generic_name:"${encodedDrug}"&limit=${clampedLimit}${keyParam}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        return res.status(404).json({ error: 'No labeling found for this drug.' });
      }

      const results = (data.results || []).map(r => ({
        brandName: r.openfda?.brand_name?.[0] || '',
        genericName: r.openfda?.generic_name?.[0] || '',
        manufacturer: r.openfda?.manufacturer_name?.[0] || '',
        purpose: r.purpose?.[0] || r.indications_and_usage?.[0] || '',
        warnings: r.warnings?.[0] || '',
        dosage: r.dosage_and_administration?.[0] || '',
        interactions: r.drug_interactions?.[0] || '',
        adverseReactions: r.adverse_reactions?.[0] || '',
        contraindications: r.contraindications?.[0] || '',
        route: r.openfda?.route?.[0] || '',
        substanceName: r.openfda?.substance_name?.[0] || '',
      }));

      return res.status(200).json({ results });
    }

    if (action === 'adverse') {
      // Adverse event reports — what side effects have been reported
      const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodedDrug}"&count=patient.reaction.reactionmeddrapt.exact&limit=${clampedLimit}${keyParam}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        return res.status(404).json({ error: 'No adverse event data found for this drug.' });
      }

      const results = (data.results || []).map(r => ({
        reaction: r.term || '',
        count: r.count || 0,
      }));

      return res.status(200).json({ results });
    }

    if (action === 'interactions') {
      // Drug interactions from labeling data
      const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodedDrug}"+openfda.generic_name:"${encodedDrug}"&limit=1${keyParam}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.error || !data.results?.length) {
        return res.status(404).json({ error: 'No interaction data found for this drug.' });
      }

      const label = data.results[0];
      return res.status(200).json({
        drug: label.openfda?.brand_name?.[0] || label.openfda?.generic_name?.[0] || drug,
        interactions: label.drug_interactions?.[0] || 'No interaction information available in labeling.',
        warnings: label.warnings?.[0] || '',
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use "label", "adverse", or "interactions".' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach OpenFDA API' });
  }
}
