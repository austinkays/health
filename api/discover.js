// ── Discover API — fetches medical articles from trusted RSS feeds ──
// Sources: NIH News in Health, FDA Drug Safety, MedlinePlus
// No API keys required — all are free US government feeds.
// Server-side cache: 24 hours (shared across all users per instance).
// Client-side cache: 14 days (per user in localStorage).

import { logUsage } from './_rateLimit.js';
import { verifyAuth } from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';

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
  {
    url: 'https://medlineplus.gov/groupfeeds/new.xml',
    source: 'MedlinePlus',
    sourceShort: 'MedlinePlus',
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

function extractAllEntries(xml) {
  const entries = [];
  const re = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = re.exec(xml)) !== null) {
    entries.push(match[1]);
  }
  return entries;
}

function decodeEntities(text = '') {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&#8230;/g, '...')
    .replace(/&#(\d+);/g, (_, code) => {
      const num = Number(code);
      return Number.isFinite(num) ? String.fromCharCode(num) : _;
    })
    .trim();
}

function stripHtml(text = '') {
  let decoded = String(text || '');
  for (let i = 0; i < 3; i++) {
    const next = decodeEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractLink(xml) {
  const atomHref = xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
  if (atomHref?.[1]) return atomHref[1].trim();
  return decodeEntities(extractTag(xml, 'link'));
}

function parseDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// Government .gov sites commonly block requests without a User-Agent header.
// Send a recognizable UA so WAFs don't treat us as a headless bot.
const RSS_FETCH_HEADERS = {
  'User-Agent': 'SalveHealthApp/1.0 (+https://salve.today)',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
};

async function fetchFeed(feed) {
  try {
    const res = await fetchWithTimeout(feed.url, { headers: RSS_FETCH_HEADERS });
    if (!res.ok) {
      console.warn(`[Discover] ${feed.sourceShort} returned ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const items = extractAllItems(xml);
    const entries = items.length === 0 ? extractAllEntries(xml) : [];
    const records = items.length > 0 ? items : entries;

    if (records.length === 0) {
      console.warn(`[Discover] ${feed.sourceShort} returned no parseable entries`);
      return [];
    }

    return records.slice(0, 15).map(item => {
      const title = decodeEntities(extractTag(item, 'title'));
      const link = extractLink(item);
      const description = stripHtml(
        extractTag(item, 'description') ||
        extractTag(item, 'summary') ||
        extractTag(item, 'content:encoded') ||
        extractTag(item, 'content')
      ).slice(0, 300);
      const pubDate = parseDate(
        extractTag(item, 'pubDate') ||
        extractTag(item, 'updated') ||
        extractTag(item, 'published')
      );

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

  // Only cache non-empty results — caching [] for 24h poisons the cache
  // and prevents retries after a transient upstream failure.
  if (articles.length > 0) {
    feedCache = { articles, expiry: now + CACHE_TTL };
  }
  return articles;
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
