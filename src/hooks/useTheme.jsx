import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { themes, DEFAULT_THEME, THEME_STORAGE_KEY, hexToRgbTriplet } from '../constants/themes';

const ThemeContext = createContext();

function applyThemeVariables(themeId) {
  const theme = themes[themeId] || themes[DEFAULT_THEME];
  // Batch all DOM mutations into a single rAF to avoid multiple reflows
  requestAnimationFrame(() => {
    const root = document.documentElement;

    // Set color CSS variables as RGB triplets (for Tailwind <alpha-value>)
    for (const [key, hex] of Object.entries(theme.colors)) {
      root.style.setProperty(`--salve-${key}`, hexToRgbTriplet(hex));
    }

    // Set ambiance RGB values per time period (comma-separated for rgba())
    for (const [period, rgb] of Object.entries(theme.ambiance)) {
      root.style.setProperty(`--ambiance-${period}`, rgb);
    }

    // Set per-theme gradient color stops (used by .text-gradient-magic)
    if (theme.gradient) {
      theme.gradient.forEach((colorKey, i) => {
        const hex = theme.colors[colorKey];
        if (hex) root.style.setProperty(`--salve-gradient-${i + 1}`, hex);
      });
    }

    // Set theme-specific class on <html> for per-theme CSS effects
    // Remove any existing theme-* class first
    for (const cls of Array.from(root.classList)) {
      if (cls.startsWith('theme-')) root.classList.remove(cls);
    }
    root.classList.add(`theme-${theme.id}`);
  });
}

function readCommitted() {
  try { return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}

export function ThemeProvider({ children }) {
  const initial = readCommitted();
  const [committedThemeId, setCommittedThemeId] = useState(initial);
  // Preview/active theme — what's currently displayed. May differ from committed.
  const [themeId, setThemeIdInternal] = useState(initial);

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      applyThemeVariables(themeId);
      return;
    }

    // Fade out → swap variables → fade in
    const root = document.documentElement;
    root.classList.remove('theme-transitioned');
    root.classList.add('theme-transitioning');

    const applyTimer = setTimeout(() => {
      applyThemeVariables(themeId);
      root.classList.remove('theme-transitioning');
      root.classList.add('theme-transitioned');
    }, 250);

    const cleanupTimer = setTimeout(() => {
      root.classList.remove('theme-transitioned');
    }, 650);

    return () => { clearTimeout(applyTimer); clearTimeout(cleanupTimer); };
  }, [themeId]);

  // setTheme only previews (applies to DOM). Use saveTheme to persist.
  const setTheme = useCallback((id) => setThemeIdInternal(id), []);

  const saveTheme = useCallback((id) => {
    const target = id || themeId;
    try { localStorage.setItem(THEME_STORAGE_KEY, target); } catch { /* ignore */ }
    setCommittedThemeId(target);
    if (target !== themeId) setThemeIdInternal(target);
  }, [themeId]);

  const revertTheme = useCallback(() => {
    setThemeIdInternal(committedThemeId);
  }, [committedThemeId]);

  const hasUnsavedChanges = themeId !== committedThemeId;

  const C = useMemo(() => {
    const theme = themes[themeId] || themes[DEFAULT_THEME];
    return { ...theme.colors };
  }, [themeId]);

  const value = useMemo(() => ({
    themeId,
    committedThemeId,
    setTheme,
    saveTheme,
    revertTheme,
    hasUnsavedChanges,
    theme: themes[themeId] || themes[DEFAULT_THEME],
    C,
    themes,
  }), [themeId, committedThemeId, setTheme, saveTheme, revertTheme, hasUnsavedChanges, C]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// Standalone getter for non-React contexts (utility files that import C)
export function getActiveC() {
  try {
    const id = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
    return { ...(themes[id] || themes[DEFAULT_THEME]).colors };
  } catch {
    return { ...themes[DEFAULT_THEME].colors };
  }
}
