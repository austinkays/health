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

  const { action, drug, rxcui, drugs } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }

  const BASE = 'https://rxnav.nlm.nih.gov/REST';

  try {
    if (action === 'lookup') {
      // Look up RxCUI by drug name
      if (!drug) {
        return res.status(400).json({ error: 'drug name is required for lookup' });
      }

      const url = `${BASE}/rxcui.json?name=${encodeURIComponent(drug)}&search=2`;
      const response = await fetch(url);
      const data = await response.json();

      const ids = data.idGroup?.rxnormId || [];
      if (ids.length === 0) {
        // Try approximate match
        const approxUrl = `${BASE}/approximateTerm.json?term=${encodeURIComponent(drug)}&maxEntries=5`;
        const approxRes = await fetch(approxUrl);
        const approxData = await approxRes.json();

        const candidates = (approxData.approximateGroup?.candidate || []).map(c => ({
          rxcui: c.rxcui,
          name: c.name || '',
          score: c.score || 0,
        }));

        return res.status(200).json({ exact: false, candidates });
      }

      return res.status(200).json({ exact: true, rxcui: ids[0], allIds: ids });
    }

    if (action === 'info') {
      // Get drug properties by RxCUI
      if (!rxcui) {
        return res.status(400).json({ error: 'rxcui is required for info' });
      }

      const url = `${BASE}/rxcui/${rxcui}/allProperties.json?prop=all`;
      const response = await fetch(url);
      const data = await response.json();

      const props = {};
      (data.propConceptGroup?.propConcept || []).forEach(p => {
        props[p.propName] = p.propValue;
      });

      return res.status(200).json({ rxcui, properties: props });
    }

    if (action === 'interactions') {
      // Drug-drug interaction check (single drug)
      if (!rxcui) {
        return res.status(400).json({ error: 'rxcui is required for interactions' });
      }

      const url = `${BASE}/interaction/interaction.json?rxcui=${rxcui}&sources=DrugBank`;
      const response = await fetch(url);
      const data = await response.json();

      const pairs = [];
      (data.interactionTypeGroup || []).forEach(group => {
        (group.interactionType || []).forEach(type => {
          (type.interactionPair || []).forEach(pair => {
            pairs.push({
              severity: pair.severity || '',
              description: pair.description || '',
              drugs: (pair.interactionConcept || []).map(c => ({
                rxcui: c.minConceptItem?.rxcui || '',
                name: c.minConceptItem?.name || '',
              })),
            });
          });
        });
      });

      return res.status(200).json({ rxcui, interactions: pairs });
    }

    if (action === 'multi-interactions') {
      // Multi-drug interaction check
      if (!drugs || !Array.isArray(drugs) || drugs.length < 2) {
        return res.status(400).json({ error: 'drugs array with at least 2 RxCUIs is required' });
      }

      const rxcuis = drugs.join('+');
      const url = `${BASE}/interaction/list.json?rxcuis=${rxcuis}&sources=DrugBank`;
      const response = await fetch(url);
      const data = await response.json();

      const pairs = [];
      (data.fullInteractionTypeGroup || []).forEach(group => {
        (group.fullInteractionType || []).forEach(type => {
          (type.interactionPair || []).forEach(pair => {
            pairs.push({
              severity: pair.severity || '',
              description: pair.description || '',
              drugs: (pair.interactionConcept || []).map(c => ({
                rxcui: c.minConceptItem?.rxcui || '',
                name: c.minConceptItem?.name || '',
              })),
            });
          });
        });
      });

      return res.status(200).json({ interactions: pairs });
    }

    return res.status(400).json({ error: 'Invalid action. Use "lookup", "info", "interactions", or "multi-interactions".' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach RxNorm API' });
  }
}
