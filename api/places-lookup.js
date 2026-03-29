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

  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) {
    return res.status(500).json({ error: 'Google Places API key not configured' });
  }

  const { action, q, place_id } = req.query;

  try {
    if (action === 'search' && q) {
      // Text Search for doctors, clinics, pharmacies
      const searchRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&type=doctor|health|pharmacy&key=${placesKey}`
      );
      const searchData = await searchRes.json();

      if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
        return res.status(200).json({ results: [], error: searchData.status });
      }

      const results = (searchData.results || []).slice(0, 10).map(p => ({
        place_id: p.place_id,
        name: p.name,
        address: p.formatted_address,
        rating: p.rating || null,
        rating_count: p.user_ratings_total || null,
        open_now: p.opening_hours?.open_now ?? null,
        types: p.types || [],
      }));

      return res.status(200).json({ results });
    }

    if (action === 'details' && place_id) {
      // Place Details for full info
      const fields = 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,types,url';
      const detailRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&fields=${fields}&key=${placesKey}`
      );
      const detailData = await detailRes.json();

      if (detailData.status !== 'OK') {
        return res.status(200).json({ details: null, error: detailData.status });
      }

      const r = detailData.result;
      return res.status(200).json({
        details: {
          name: r.name,
          address: r.formatted_address,
          phone: r.formatted_phone_number || null,
          website: r.website || null,
          rating: r.rating || null,
          rating_count: r.user_ratings_total || null,
          hours: r.opening_hours?.weekday_text || null,
          open_now: r.opening_hours?.open_now ?? null,
          maps_url: r.url || null,
          types: r.types || [],
        },
      });
    }

    if (action === 'autocomplete' && q) {
      // Place Autocomplete for clinic/address fields
      const acRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&types=establishment&key=${placesKey}`
      );
      const acData = await acRes.json();

      if (acData.status !== 'OK' && acData.status !== 'ZERO_RESULTS') {
        return res.status(200).json({ predictions: [], error: acData.status });
      }

      const predictions = (acData.predictions || []).slice(0, 5).map(p => ({
        place_id: p.place_id,
        description: p.description,
        main_text: p.structured_formatting?.main_text,
        secondary_text: p.structured_formatting?.secondary_text,
      }));

      return res.status(200).json({ predictions });
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=search&q=..., ?action=details&place_id=..., or ?action=autocomplete&q=...' });
  } catch (err) {
    return res.status(500).json({ error: 'Places lookup failed' });
  }
}
