import { useState, useEffect, useMemo } from 'react';
import { Newspaper, ExternalLink, Bookmark, BookmarkCheck, Filter, Leaf, Globe, Shield, Heart } from 'lucide-react';
import Card from '../ui/Card';
import { C } from '../../constants/colors';
import { fetchDiscoverArticles } from '../../services/discover';
import { buildNewsFeed, getSavedNews } from '../../services/newsCache';

const SOURCE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'saved', label: 'Saved' },
  { id: 'sage', label: 'Sage' },
  { id: 'rss', label: 'RSS' },
];

const SOURCE_ICONS = {
  'NIH News in Health': Globe,
  'FDA Drug Safety': Shield,
  'Sage': Leaf,
};

const SOURCE_COLORS = {
  'NIH News in Health': C.lav,
  'FDA Drug Safety': C.amber,
  'Sage': C.sage,
};

const NEWS_SAVE_KEY = 'salve:saved-news';

export default function News({ data }) {
  const [rssArticles, setRssArticles] = useState([]);
  const [filter, setFilter] = useState('all');
  const [savedUrls, setSavedUrls] = useState(() => new Set(getSavedNews().map(s => s.sourceUrl)));

  // Fetch RSS articles on mount
  useEffect(() => {
    const conditions = (data.conditions || []).map(c => c.name).filter(Boolean);
    fetchDiscoverArticles(conditions).then(articles => {
      if (articles?.length) setRssArticles(articles);
    });
  }, []);

  const feed = useMemo(() => buildNewsFeed({
    rssArticles,
    conditions: data.conditions || [],
    medications: data.meds || [],
  }), [rssArticles, data.conditions, data.meds]);

  const filtered = useMemo(() => {
    if (filter === 'all') return feed;
    if (filter === 'saved') return feed.filter(a => a.type === 'saved' || savedUrls.has(a.url));
    if (filter === 'sage') return feed.filter(a => a.type === 'sage' || a.type === 'saved');
    if (filter === 'rss') return feed.filter(a => a.type === 'rss');
    return feed;
  }, [feed, filter, savedUrls]);

  const toggleSave = (article) => {
    try {
      const saved = JSON.parse(localStorage.getItem(NEWS_SAVE_KEY) || '[]');
      const idx = saved.findIndex(s => s.sourceUrl === article.url);
      if (idx >= 0) {
        saved.splice(idx, 1);
        setSavedUrls(prev => { const next = new Set(prev); next.delete(article.url); return next; });
      } else {
        saved.push({
          headline: article.title,
          body: article.blurb,
          sourceName: article.source,
          sourceUrl: article.url,
          savedAt: new Date().toISOString(),
        });
        setSavedUrls(prev => new Set([...prev, article.url]));
      }
      localStorage.setItem(NEWS_SAVE_KEY, JSON.stringify(saved));
    } catch { /* quota */ }
  };

  const savedCount = feed.filter(a => a.type === 'saved' || savedUrls.has(a.url)).length;

  return (
    <div>
      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar">
        {SOURCE_FILTERS.map(f => {
          const isActive = filter === f.id;
          const count = f.id === 'saved' ? savedCount : null;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] md:text-xs font-montserrat whitespace-nowrap border transition-colors cursor-pointer ${
                isActive
                  ? 'bg-salve-lav/15 border-salve-lav/30 text-salve-lav'
                  : 'bg-salve-card border-salve-border text-salve-textMid hover:border-salve-lav/20'
              }`}
            >
              {f.label}
              {count > 0 && <span className="text-[10px] opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <Card className="text-center py-8">
          <Newspaper size={24} className="text-salve-textFaint/30 mx-auto mb-2" />
          <p className="text-sm text-salve-textFaint font-montserrat">
            {filter === 'saved' ? 'No saved articles yet' :
             filter === 'sage' ? 'Run Health News in Sage to see AI-curated articles' :
             'No articles found'}
          </p>
          {filter === 'sage' && (
            <p className="text-xs text-salve-textFaint/60 font-montserrat mt-1">
              Sage searches for news matched to your conditions
            </p>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map(article => {
            const isSaved = article.type === 'saved' || savedUrls.has(article.url);
            const SourceIcon = SOURCE_ICONS[article.source] || Globe;
            const accentColor = SOURCE_COLORS[article.source] || C.lav;

            return (
              <Card key={article.id || article.url} className="!p-0 overflow-hidden">
                <div className="flex items-start gap-3 p-4 md:p-5">
                  <div
                    className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5"
                    style={{ background: accentColor }}
                  />
                  <div className="flex-1 min-w-0">
                    {/* Source + date row */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <SourceIcon size={10} style={{ color: accentColor }} />
                      <span
                        className="text-[9px] md:text-[10px] font-montserrat tracking-wider uppercase"
                        style={{ color: accentColor }}
                      >
                        {article.source}
                      </span>
                      {article.date && (
                        <span className="text-[9px] text-salve-textFaint/50 font-montserrat">
                          {article.date}
                        </span>
                      )}
                      {article.relevance > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-salve-lav/10 text-salve-lav font-montserrat ml-auto">
                          Relevant
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] md:text-sm text-salve-text font-medium hover:text-salve-lav transition-colors inline-flex items-center gap-1 leading-snug"
                    >
                      {article.title}
                      <ExternalLink size={10} className="text-salve-textFaint/40 flex-shrink-0" />
                    </a>

                    {/* Blurb */}
                    {article.blurb && (
                      <p className="text-[11px] md:text-[12px] text-salve-textFaint leading-relaxed mt-1 mb-0 line-clamp-3">
                        {article.blurb}
                      </p>
                    )}
                  </div>

                  {/* Save button */}
                  <button
                    onClick={() => toggleSave(article)}
                    className="p-1.5 rounded-md bg-transparent border-none cursor-pointer transition-colors flex-shrink-0"
                    style={{ color: isSaved ? C.amber : C.textFaint }}
                    aria-label={isSaved ? 'Unsave article' : 'Save article'}
                  >
                    {isSaved
                      ? <BookmarkCheck size={14} fill={C.amber} />
                      : <Bookmark size={14} />
                    }
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Footer hint */}
      {filtered.length > 0 && (
        <p className="text-center text-[10px] text-salve-textFaint/50 font-montserrat mt-4">
          Articles from trusted sources — matched to your health profile
        </p>
      )}
    </div>
  );
}
