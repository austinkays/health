import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { themes, DEFAULT_THEME, THEME_STORAGE_KEY, hexToRgbTriplet } from '../constants/themes';

const ThemeContext = createContext();

function applyThemeVariables(themeId, animate = false) {
  const theme = themes[themeId] || themes[DEFAULT_THEME];
  function apply() {
    const root = document.documentElement;
    for (const [key, hex] of Object.entries(theme.colors)) {
      root.style.setProperty(`--salve-${key}`, hexToRgbTriplet(hex));
    }
    for (const [period, rgb] of Object.entries(theme.ambiance)) {
      root.style.setProperty(`--ambiance-${period}`, rgb);
    }
    if (theme.gradient) {
      theme.gradient.forEach((colorKey, i) => {
        const hex = theme.colors[colorKey];
        if (hex) root.style.setProperty(`--salve-gradient-${i + 1}`, hex);
      });
    }
    for (const cls of Array.from(root.classList)) {
      if (cls.startsWith('theme-')) root.classList.remove(cls);
    }
    root.classList.add(`theme-${theme.id}`);
  }
  // Only defer via rAF when animating a theme switch — first render applies synchronously
  // (the inline script in index.html already set the vars; sync call just keeps React in sync)
  if (animate) requestAnimationFrame(apply);
  else apply();
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
  const rafRef = useRef(null);
  const cleanupTimerRef = useRef(null);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // inline script in index.html already set all vars — sync call keeps
      // React's DOM state in sync without adding an animation frame delay
      applyThemeVariables(themeId, false);
      return;
    }

    // Cancel any in-flight transition (handles rapid theme changes)
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    clearTimeout(cleanupTimerRef.current);
    // Remove any leftover overlay from a previous rapid switch
    document.getElementById('salve-theme-overlay')?.remove();

    // Capture the current background before applying new vars
    const oldBgRgb = getComputedStyle(document.documentElement)
      .getPropertyValue('--salve-bg').trim();
    const oldBg = oldBgRgb ? `rgb(${oldBgRgb})` : 'transparent';

    // Apply new theme vars immediately — content updates to new colors beneath the overlay
    applyThemeVariables(themeId, false);

    // Create a fixed overlay covering the viewport with the OLD background colour.
    // Only this one div needs to animate (GPU-composited opacity) — the rest of the
    // DOM is already in its final state underneath.
    const overlay = document.createElement('div');
    overlay.id = 'salve-theme-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;pointer-events:none;' +
      'will-change:opacity;opacity:1;background:' + oldBg + ';transition:none;';
    document.body.appendChild(overlay);
    // Commit opacity:1 before scheduling the fade so the browser doesn't batch it
    // eslint-disable-next-line no-unused-expressions
    void overlay.offsetHeight;

    // Fade overlay out on the next frame, revealing the already-updated theme
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      overlay.style.transition = 'opacity 0.5s ease-in';
      overlay.style.opacity = '0';
      cleanupTimerRef.current = setTimeout(() => overlay.remove(), 510);
    });

    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      clearTimeout(cleanupTimerRef.current);
      document.getElementById('salve-theme-overlay')?.remove();
    };
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
