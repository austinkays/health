// Daily quote service via ZenQuotes API.
// Caches in localStorage for 24 hours.

const CACHE_KEY = 'salve:daily-quote';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const FALLBACK_QUOTES = [
  { q: 'Taking care of yourself is productive.', a: 'Unknown' },
  { q: 'Small steps still move you forward.', a: 'Unknown' },
  { q: 'You are more than your symptoms.', a: 'Unknown' },
  { q: 'Progress, not perfection.', a: 'Unknown' },
  { q: 'Be patient with yourself, healing is not linear.', a: 'Unknown' },
];

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { quote, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) return null;
    return quote;
  } catch {
    return null;
  }
}

function writeCache(quote) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      quote,
      expiry: Date.now() + CACHE_TTL,
    }));
  } catch { /* quota */ }
}

export async function fetchDailyQuote() {
  const cached = readCache();
  if (cached) return cached;

  try {
    const res = await fetch('https://zenquotes.io/api/random');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    if (data?.[0]?.q) {
      const quote = { q: data[0].q, a: data[0].a };
      writeCache(quote);
      return quote;
    }
  } catch { /* fall through to fallback */ }

  // Fallback: pick one based on day of year
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return FALLBACK_QUOTES[dayOfYear % FALLBACK_QUOTES.length];
}
