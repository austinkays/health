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

  const { names } = req.query;

  if (!names) {
    return res.status(400).json({ error: 'Provide ?names=drug1,drug2,...' });
  }

  const drugNames = names.split(',').map(n => n.trim()).filter(Boolean);
  if (drugNames.length < 2) {
    return res.status(200).json({ interactions: [], rxcuis: {} });
  }

  try {
    // Step 1: Resolve drug names to RxCUIs in parallel
    const rxcuiMap = {};
    const rxcuiResults = await Promise.all(
      drugNames.map(async (name) => {
        try {
          const res = await fetch(
            `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}&search=2`
          );
          const data = await res.json();
          const rxcui = data?.idGroup?.rxnormId?.[0] || null;
          return { name, rxcui };
        } catch {
          return { name, rxcui: null };
        }
      })
    );

    for (const { name, rxcui } of rxcuiResults) {
      if (rxcui) rxcuiMap[name.toLowerCase()] = rxcui;
    }

    const rxcuis = Object.values(rxcuiMap);
    if (rxcuis.length < 2) {
      return res.status(200).json({ interactions: [], rxcuis: rxcuiMap });
    }

    // Step 2: Check interactions via RxNorm interaction API
    const interRes = await fetch(
      `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuis.join('+')}`
    );
    const interData = await interRes.json();

    const interactions = [];
    const seen = new Set();

    const groups = interData?.fullInteractionTypeGroup || [];
    for (const group of groups) {
      for (const type of group.fullInteractionType || []) {
        for (const pair of type.interactionPair || []) {
          const concepts = pair.interactionConcept || [];
          if (concepts.length < 2) continue;

          const nameA = concepts[0].minConceptItem?.name || '';
          const nameB = concepts[1].minConceptItem?.name || '';
          const key = [nameA, nameB].sort().join('|');

          if (seen.has(key)) continue;
          seen.add(key);

          interactions.push({
            drugA: nameA,
            drugB: nameB,
            severity: pair.severity || 'N/A',
            description: pair.description || '',
            source: group.sourceName || 'NLM',
          });
        }
      }
    }

    return res.status(200).json({ interactions, rxcuis: rxcuiMap });
  } catch (err) {
    return res.status(500).json({ error: 'Interaction check failed' });
  }
}
