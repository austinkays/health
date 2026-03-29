import { useState, useRef, useEffect, useCallback } from 'react';

export default function SearchDropdown({ label, placeholder, onSearch, onSelect, renderItem, minChars = 2, debounceMs = 300 }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  const inputCls = 'w-full py-2.5 px-3.5 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 box-border focus:outline-none focus:border-salve-lav transition-colors';

  const doSearch = useCallback(async (term) => {
    if (!term || term.length < minChars) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const r = await onSearch(term);
      setResults(r || []);
      setOpen((r || []).length > 0);
      setHighlighted(-1);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [onSearch, minChars]);

  const handleChange = (val) => {
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), debounceMs);
  };

  const handleSelect = (item) => {
    onSelect(item);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      handleSelect(results[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="mb-4 relative" ref={wrapRef}>
      <label className="block text-[11px] font-semibold text-salve-textMid mb-1.5 uppercase tracking-widest">
        {label}
      </label>
      <input
        type="text"
        value={query}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={inputCls}
      />
      {loading && (
        <div className="text-[11px] text-salve-textFaint animate-pulse mt-1">Searching...</div>
      )}
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-salve-card border border-salve-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {results.map((item, i) => (
            <div
              key={i}
              onClick={() => handleSelect(item)}
              className={`px-3.5 py-2.5 cursor-pointer border-b border-salve-border/50 last:border-0 transition-colors ${
                i === highlighted ? 'bg-salve-card2' : 'hover:bg-salve-card2'
              }`}
            >
              {renderItem ? renderItem(item) : <span className="text-sm text-salve-text">{item.name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
