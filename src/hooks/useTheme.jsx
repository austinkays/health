import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { themes, DEFAULT_THEME, THEME_STORAGE_KEY, hexToRgbTriplet } from '../constants/themes';

const ThemeContext = createContext();

function applyThemeVariables(themeId) {
  const theme = themes[themeId] || themes[DEFAULT_THEME];
  const root = document.documentElement;

  // Set color CSS variables as RGB triplets (for Tailwind <alpha-value>)
  for (const [key, hex] of Object.entries(theme.colors)) {
    root.style.setProperty(`--salve-${key}`, hexToRgbTriplet(hex));
  }

  // Set ambiance RGB values per time period (comma-separated for rgba())
  for (const [period, rgb] of Object.entries(theme.ambiance)) {
    root.style.setProperty(`--ambiance-${period}`, rgb);
  }
}

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => {
    try { return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME; } catch { return DEFAULT_THEME; }
  });

  useEffect(() => {
    applyThemeVariables(themeId);
    try { localStorage.setItem(THEME_STORAGE_KEY, themeId); } catch { /* ignore */ }
  }, [themeId]);

  const C = useMemo(() => {
    const theme = themes[themeId] || themes[DEFAULT_THEME];
    return { ...theme.colors };
  }, [themeId]);

  const value = useMemo(() => ({
    themeId,
    setTheme: setThemeId,
    theme: themes[themeId] || themes[DEFAULT_THEME],
    C,
    themes,
  }), [themeId, C]);

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
