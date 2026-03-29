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

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Google Places API key not configured' });
  }

  const { action, query, latitude, longitude, radius = 5000, type } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }

  try {
    if (action === 'nearby') {
      // Nearby Search — find pharmacies, doctors, hospitals near a location
      if (!latitude || !longitude) {
        return res.status(400).json({ error: 'latitude and longitude are required for nearby search' });
      }

      const body = {
        includedTypes: type ? [type] : ['pharmacy'],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius,
          },
        },
      };

      const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.currentOpeningHours,places.websiteUri,places.googleMapsUri,places.location',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: data.error?.message || 'Places API error' });
      }

      return res.status(200).json({
        results: (data.places || []).map(p => ({
          name: p.displayName?.text || '',
          address: p.formattedAddress || '',
          phone: p.nationalPhoneNumber || '',
          rating: p.rating || null,
          ratingCount: p.userRatingCount || 0,
          openNow: p.currentOpeningHours?.openNow ?? null,
          website: p.websiteUri || '',
          mapsUrl: p.googleMapsUri || '',
          lat: p.location?.latitude,
          lng: p.location?.longitude,
        })),
      });
    }

    if (action === 'search') {
      // Text Search — search for specific places by query
      if (!query) {
        return res.status(400).json({ error: 'query is required for text search' });
      }

      const body = { textQuery: query, maxResultCount: 20 };

      if (latitude && longitude) {
        body.locationBias = {
          circle: {
            center: { latitude, longitude },
            radius,
          },
        };
      }

      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.currentOpeningHours,places.websiteUri,places.googleMapsUri,places.location',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: data.error?.message || 'Places API error' });
      }

      return res.status(200).json({
        results: (data.places || []).map(p => ({
          name: p.displayName?.text || '',
          address: p.formattedAddress || '',
          phone: p.nationalPhoneNumber || '',
          rating: p.rating || null,
          ratingCount: p.userRatingCount || 0,
          openNow: p.currentOpeningHours?.openNow ?? null,
          website: p.websiteUri || '',
          mapsUrl: p.googleMapsUri || '',
          lat: p.location?.latitude,
          lng: p.location?.longitude,
        })),
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use "nearby" or "search".' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Google Places API' });
  }
}
