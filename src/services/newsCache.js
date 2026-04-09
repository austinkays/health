// Unified news article cache, merges RSS, Sage AI news, and saved articles.
// All articles share a common shape for the News section feed.
//
// Article shape:
// { id, title, blurb, url, source, sourceShort, date, type ('rss'|'sage'|'saved'), savedAt? }

const SAGE_CACHE_KEY = 'salve:news-sage-cache';
const SAVED_KEY = 'salve:saved-news';

// ── Parse Sage news result (markdown with ## headings) into articles ──

export function cacheSageNewsFromResult(result) {
  const text = typeof result === 'string' ? result : result?.text;
  if (!text) return;

  // Split by ## headings (same logic as AIPanel's splitSections)
  const sections = text
    .replace(/\n---\n\*(?:AI|Sage'?s?) suggestions[^*]*\*\s*$/i, '') // strip disclaimer
    .split(/(?=^## )/m)
    .filter(s => s.trim() && s.trimStart().startsWith('## '));

  const articles = sections.map(section => {
    const headMatch = section.match(/^##\s+(.+)/m);
    const headline = headMatch ? headMatch[1].trim() : null;
    if (!headline) return null;

    let body = headMatch ? section.replace(/^##\s+.+\n?/m, '') : section;

    // Extract source link: "Source: [Name](url)" or plain "Source: Name"
    const srcMatch = body.match(/\*?\**Source:?\**\s*\[([^\]]+)\]\(([^)]+)\)\*?/);
    const srcPlain = !srcMatch ? body.match(/\*?\**Source:?\**\s*([^*\n]+?)\*?\s*$/m) : null;
    const sourceName = srcMatch ? srcMatch[1] : srcPlain ? srcPlain[1].trim() : 'Sage';
    const sourceUrl = srcMatch ? srcMatch[2] : null;

    // Clean body
    body = body.replace(/\n*\*?\**Source:?\**\s*(?:\[[^\]]+\]\([^)]+\)|[^*\n]+?)\*?\s*$/m, '').trim();
    body = body.replace(/\n---\s*$/, '').replace(/^\s*\.\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

    return {
      id: `sage-${btoa(unescape(encodeURIComponent(sourceUrl || headline))).slice(0, 20)}`,
      title: headline,
      blurb: body.slice(0, 300),
      url: sourceUrl,
      source: 'Sage',
      sourceShort: 'Sage',
      date: new Date().toISOString().slice(0, 10),
      type: 'sage',
      originalSource: sourceName,
    };
  }).filter(Boolean);

  if (articles.length > 0) cacheSageNews(articles);
}

// ── Sage news cache (from AIPanel Health News results) ──

export function cacheSageNews(articles) {
  try {
    const existing = getSageCachedNews();
    // Merge by URL dedup
    const urlSet = new Set(existing.map(a => a.url));
    const merged = [...existing];
    for (const a of articles) {
      if (a.url && !urlSet.has(a.url)) {
        urlSet.add(a.url);
        merged.push(a);
      }
    }
    // Cap at 50 articles
    const capped = merged.slice(-50);
    localStorage.setItem(SAGE_CACHE_KEY, JSON.stringify(capped));
  } catch { /* quota */ }
}

export function getSageCachedNews() {
  try {
    return JSON.parse(localStorage.getItem(SAGE_CACHE_KEY) || '[]');
  } catch { return []; }
}

// ── Saved news (user-bookmarked from AIPanel) ──

export function getSavedNews() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
  } catch { return []; }
}

// ── Unified feed: merge all sources, dedup by URL, score by relevance ──

export function buildNewsFeed({ rssArticles = [], conditions = [], medications = [] }) {
  const sageArticles = getSageCachedNews();
  const savedArticles = getSavedNews().map(s => ({
    id: `saved-${btoa(unescape(encodeURIComponent(s.sourceUrl || s.headline || ''))).slice(0, 16)}`,
    title: s.headline,
    blurb: s.body?.slice(0, 300) || '',
    url: s.sourceUrl,
    source: s.sourceName || 'Sage',
    sourceShort: 'Sage',
    date: s.savedAt?.slice(0, 10) || null,
    type: 'saved',
    savedAt: s.savedAt,
  }));

  // Merge all sources
  const all = [...rssArticles, ...sageArticles, ...savedArticles];

  // Dedup by URL (prefer saved > sage > rss)
  const byUrl = new Map();
  for (const a of all) {
    const key = a.url || a.id;
    const existing = byUrl.get(key);
    if (!existing || typePriority(a.type) > typePriority(existing.type)) {
      byUrl.set(key, a);
    }
  }

  let articles = [...byUrl.values()];

  // Score by condition/medication relevance
  const terms = [
    ...conditions.map(c => c.name?.toLowerCase()).filter(Boolean),
    ...medications.map(m => (m.display_name || m.name)?.toLowerCase()).filter(Boolean),
  ];

  articles = articles.map(a => {
    const text = `${a.title} ${a.blurb}`.toLowerCase();
    let relevance = 0;
    for (const t of terms) {
      if (text.includes(t)) relevance += 2;
      // Partial word matches (e.g., "depress" matches "depression")
      const stem = t.length > 4 ? t.slice(0, -2) : t;
      if (!text.includes(t) && text.includes(stem)) relevance += 1;
    }
    return { ...a, relevance };
  });

  // Sort: saved first, then by relevance, then by date
  articles.sort((a, b) => {
    if (a.type === 'saved' && b.type !== 'saved') return -1;
    if (b.type === 'saved' && a.type !== 'saved') return 1;
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return (b.date || '').localeCompare(a.date || '');
  });

  return articles;
}

function typePriority(type) {
  return type === 'saved' ? 3 : type === 'sage' ? 2 : 1;
}
