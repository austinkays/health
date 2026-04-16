// ── Discover API — fetches medical articles from trusted RSS feeds ──
// Sources: NIH News in Health, FDA Drug Safety, MedlinePlus
// No API keys required — all are free US government feeds.
// Server-side cache: 24 hours (shared across all users per instance).
// Client-side cache: 14 days (per user in localStorage).

import { logUsage } from './_rateLimit.js';

const EXTERNAL_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── Server-side cache (24hr, shared per serverless instance) ──
let feedCache = { articles: null, expiry: 0 };
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ── RSS feed sources ──
const FEEDS = [
  {
    url: 'https://newsinhealth.nih.gov/rss',
    source: 'NIH News in Health',
    sourceShort: 'NIH',
  },
  {
    url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/disco/rss.xml',
    source: 'FDA Drug Safety',
    sourceShort: 'FDA',
  },
];

// ── Simple XML tag extractor (no dependency needed for RSS) ──
function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  // Strip CDATA wrappers
  return m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function extractAllItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = re.exec(xml)) !== null) {
    items.push(match[1]);
  }
  return items;
}

function parseDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

async function fetchFeed(feed) {
  try {
    const res = await fetchWithTimeout(feed.url);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = extractAllItems(xml);

    return items.slice(0, 15).map(item => {
      const title = extractTag(item, 'title');
      const link = extractTag(item, 'link');
      const description = extractTag(item, 'description')
        .replace(/<[^>]+>/g, '') // strip HTML
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .slice(0, 300);
      const pubDate = parseDate(extractTag(item, 'pubDate'));

      if (!title || !link) return null;

      return {
        id: `rss-${feed.sourceShort.toLowerCase()}-${Buffer.from(link).toString('base64').slice(0, 20)}`,
        title,
        url: link,
        blurb: description,
        source: feed.source,
        sourceShort: feed.sourceShort,
        date: pubDate,
        type: 'rss',
      };
    }).filter(Boolean);
  } catch (err) {
    console.error(`[Discover] Failed to fetch ${feed.source}:`, err.message);
    return [];
  }
}

async function fetchAllFeeds() {
  const now = Date.now();
  if (feedCache.articles && now < feedCache.expiry) {
    return feedCache.articles;
  }

  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const articles = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  feedCache = { articles, expiry: now + CACHE_TTL };
  return articles;
}

// ── Auth verification ──
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

// ── In-memory rate limiter ──
const rateBuckets = new Map();
function checkRateLimit(userId) {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= 10) return false; // 10 req/min — very light endpoint
  bucket.count++;
  return true;
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  const allowed = process.env.ALLOWED_ORIGIN || 'https://salve.today';
  if (origin === allowed || origin === 'http://localhost:5173') {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await verifyAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!checkRateLimit(userId)) return res.status(429).json({ error: 'Rate limited' });

  try {
    const articles = await fetchAllFeeds();

    // Optional condition matching: ?conditions=adhd,depression,diabetes
    const conditionsParam = req.query.conditions;
    let matched = articles;
    if (conditionsParam) {
      const terms = conditionsParam.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (terms.length > 0) {
        matched = articles.filter(a => {
          const text = `${a.title} ${a.blurb}`.toLowerCase();
          return terms.some(t => text.includes(t));
        });
        // If no condition matches, return general articles
        if (matched.length === 0) matched = articles.slice(0, 10);
      }
    }

    const payload = matched.slice(0, 20);
    // Only set long browser cache when we actually have articles — otherwise
    // a single failed fetch would get cached for 24h and the News page would
    // stay empty even after the upstream feed recovered.
    if (payload.length > 0) {
      res.setHeader('Cache-Control', 'private, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    logUsage(userId, 'discover');
    return res.status(200).json({ articles: payload, feedCount: articles.length });
  } catch (err) {
    console.error('[Discover] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch articles', message: err.message });
  }
}
