import { useState, useEffect, useMemo, useRef } from 'react';
import { Search as SearchIcon, ChevronRight } from 'lucide-react';
import Card from '../ui/Card';
import {
  ENTITY_CONFIG, FILTER_TABS, MORE_CATEGORIES,
  highlightMatch, searchEntities,
} from '../../utils/search.jsx';

/* ── Component ───────────────────────────────────────────── */

export default function Search({ data, onNav }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce search input
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Search across all entities
  const allResults = useMemo(
    () => searchEntities(data, debouncedQuery),
    [data, debouncedQuery]
  );

  // Filter results by selected category
  const filteredResults = useMemo(() => {
    if (filter === 'all') return allResults;
    if (filter === 'more') return allResults.filter(r => MORE_CATEGORIES.includes(r.entityKey));
    return allResults.filter(r => r.entityKey === filter);
  }, [allResults, filter]);

  // Count per category for pills
  const counts = useMemo(() => {
    const c = {};
    for (const r of allResults) {
      c[r.entityKey] = (c[r.entityKey] || 0) + 1;
    }
    // Aggregate "more" count
    c.more = MORE_CATEGORIES.reduce((sum, key) => sum + (c[key] || 0), 0);
    c.all = allResults.length;
    return c;
  }, [allResults]);

  const handleResultClick = (result) => {
    onNav(result.config.tab, { highlightId: result.id });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (query) {
        setQuery('');
      } else {
        onNav('dash');
      }
    }
  };

  return (
    <div className="mt-1">
      {/* ── Search Input ─────────────────────────── */}
      <div className="relative mb-4">
        <SearchIcon
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-salve-textFaint pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search medications, providers, labs..."
          aria-label="Search your health data"
          className="w-full bg-salve-card2 border border-salve-border rounded-xl py-3 pl-10 pr-4 text-sm text-salve-text placeholder:text-salve-textFaint font-montserrat field-magic outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-salve-textFaint hover:text-salve-textMid bg-transparent border-none cursor-pointer p-1 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Filter Pills ─────────────────────────── */}
      {allResults.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar md:flex-wrap md:overflow-visible">
          {FILTER_TABS.map(t => {
            const count = counts[t.key] || 0;
            if (t.key !== 'all' && count === 0) return null;
            const isActive = filter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`flex-shrink-0 py-1.5 px-3 rounded-full text-[11px] font-medium border transition-colors ${
                  isActive
                    ? 'border-salve-sage bg-salve-sage/15 text-salve-sage'
                    : 'border-salve-border text-salve-textFaint hover:text-salve-textMid'
                }`}
              >
                {t.label}{count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Results ──────────────────────────────── */}
      {debouncedQuery.length >= 2 ? (
        filteredResults.length > 0 ? (
          <div className="md:grid md:grid-cols-2 md:gap-3">
            {filteredResults.map((r, i) => {
              const Icon = r.config.icon;
              return (
                <Card
                  key={`${r.entityKey}-${r.id}-${i}`}
                  onClick={() => handleResultClick(r)}
                  className="!p-3 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${r.config.color}15` }}
                    >
                      <Icon size={15} color={r.config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-salve-text font-medium truncate">
                        {highlightMatch(r.config.primary(r.item), debouncedQuery)}
                      </div>
                      {r.config.secondary(r.item) && (
                        <div className="text-[11px] text-salve-textFaint truncate mt-0.5">
                          {highlightMatch(r.config.secondary(r.item), debouncedQuery)}
                        </div>
                      )}
                      {r.matchContext && (
                        <div className="text-[10px] text-salve-textFaint/70 truncate mt-0.5 italic">
                          {r.matchContext.label}: {highlightMatch(r.matchContext.value, debouncedQuery)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="text-[9px] font-semibold px-2 py-0.5 rounded-full tracking-wide"
                        style={{ background: `${r.config.color}15`, color: r.config.color }}
                      >
                        {r.config.label}
                      </span>
                      <ChevronRight size={13} className="text-salve-textFaint" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 px-6 text-salve-textFaint">
            <SearchIcon size={32} strokeWidth={1} className="mx-auto mb-3 opacity-35" />
            <div className="text-sm font-light">No matches for &ldquo;{debouncedQuery}&rdquo;</div>
            <div className="text-xs mt-1 text-salve-textFaint/60">Try a different spelling or keyword</div>
          </div>
        )
      ) : (
        <div className="text-center py-16 px-6 text-salve-textFaint">
          <SearchIcon size={32} strokeWidth={1} className="mx-auto mb-3 opacity-35" />
          <div className="text-sm font-light">Search across all your health data</div>
          <div className="text-xs mt-2 text-salve-textFaint/60 leading-relaxed">
            Medications, providers, pharmacies, conditions,<br />
            labs, journal entries, and more
          </div>
        </div>
      )}
    </div>
  );
}
