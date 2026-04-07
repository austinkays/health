# CSS Theme System Reference

A portable, framework-agnostic theme system using CSS custom properties (variables) with animated experimental themes. Extracted from Salve for reuse in other projects.

---

## Architecture Overview

```
1. Themes defined as plain JS/JSON objects (16 color keys each)
2. Active theme's colors set as CSS variables on :root (as RGB triplets)
3. All UI references use rgb(var(--color) / opacity) pattern
4. Experimental themes layer animated CSS effects via body::before / body::after
5. Cards get frosted-glass treatment over animated backgrounds
```

**Why RGB triplets?** Tailwind's `<alpha-value>` pattern needs raw RGB channels so you can write `bg-salve-lav/20` for 20% opacity. Hex colors don't support this.

---

## The 16 Color Keys

Every theme must define these 16 colors. They form a complete semantic palette:

| Key | Role | Usage |
|-----|------|-------|
| `bg` | Page background | `<html>` / `<body>` background |
| `card` | Card / surface | Primary card background |
| `card2` | Alternate surface | Secondary cards, nested surfaces |
| `border` | Subtle border | Card borders, dividers |
| `border2` | Strong border | Focus rings, hover borders |
| `text` | Primary text | Headings, body copy |
| `textMid` | Secondary text | Labels, descriptions |
| `textFaint` | Disabled / hint text | Placeholders, timestamps |
| `lav` | Primary accent | Buttons, links, active states |
| `lavDim` | Primary accent (muted) | Hover states, secondary actions |
| `sage` | Success / positive | Confirmations, good indicators |
| `sageDim` | Success (muted) | Success backgrounds |
| `amber` | Warning / attention | Alerts, caution states |
| `amberDim` | Warning (muted) | Warning backgrounds |
| `rose` | Error / danger | Errors, destructive actions |
| `roseDim` | Error (muted) | Error backgrounds |

---

## Theme Object Shape

```js
{
  id: 'aurora',
  label: 'Aurora',
  description: 'Northern lights over dark sky',
  type: 'dark',                    // 'light' or 'dark'
  experimental: true,              // optional flag for premium/animated themes
  colors: {
    bg:        '#141a26',
    card:      '#1e2634',
    card2:     '#2a3342',
    border:    '#3a4456',
    border2:   '#4a566a',
    text:      '#e8eef8',
    textMid:   '#b0c0d8',
    textFaint: '#8e9eb8',
    lav:       '#84dcb4',          // green-mint for Aurora
    lavDim:    '#66bc94',
    sage:      '#70cce8',          // cyan
    sageDim:   '#54acca',
    amber:     '#b4a2ec',          // violet
    amberDim:  '#9484d0',
    rose:      '#ec8898',
    roseDim:   '#cc6c7e',
  },
  gradient: ['lav', 'sage', 'amber'],  // 3 keys for animated text gradients
  ambiance: {                           // time-of-day hover glow colors (RGB)
    morning: '112, 204, 232',
    day:     '132, 220, 180',
    evening: '180, 162, 236',
    night:   '102, 188, 148',
  },
}
```

---

## Applying a Theme (Vanilla JS)

Converts hex colors to RGB triplets and sets them as CSS variables:

```js
function applyTheme(theme) {
  const root = document.documentElement;

  // Convert '#84dcb4' -> '132 220 180'
  function hexToRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ].join(' ');
  }

  // Set all 16 color variables
  for (const [key, hex] of Object.entries(theme.colors)) {
    root.style.setProperty(`--theme-${key}`, hexToRgb(hex));
  }

  // Set gradient stops
  theme.gradient.forEach((key, i) => {
    root.style.setProperty(`--theme-gradient-${i + 1}`, theme.colors[key]);
  });

  // Set ambiance (time-of-day glow)
  for (const [period, rgb] of Object.entries(theme.ambiance)) {
    root.style.setProperty(`--ambiance-${period}`, rgb);
  }

  // Swap theme class for CSS effect layers
  root.className = root.className.replace(/theme-\S+/g, '');
  root.classList.add(`theme-${theme.id}`);
}
```

### Prevent Flash of Wrong Theme (FODT)

Put this inline `<script>` in `<head>` so it runs before any CSS or JS loads:

```html
<script>
(function() {
  var themeId = localStorage.getItem('my-theme') || 'aurora';
  var themes = { /* embed your theme objects here */ };
  var theme = themes[themeId];
  if (!theme) return;
  var root = document.documentElement;
  function h(x) {
    return parseInt(x.slice(1,3),16)+' '+parseInt(x.slice(3,5),16)+' '+parseInt(x.slice(5,7),16);
  }
  var c = theme.colors;
  for (var k in c) root.style.setProperty('--theme-'+k, h(c[k]));
  root.classList.add('theme-'+themeId);
})();
</script>
```

### Theme Transition (Overlay Fade)

Smooth transitions between themes without flash:

```js
function switchTheme(newTheme) {
  const root = document.documentElement;
  const oldBg = getComputedStyle(root).getPropertyValue('--theme-bg').trim();
  const [r, g, b] = oldBg.split(' ');

  // Apply new theme immediately
  applyTheme(newTheme);

  // Overlay old background color, fade it out
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '99999',
    backgroundColor: `rgb(${r}, ${g}, ${b})`,
    opacity: '1', transition: 'opacity 0.5s ease-in',
    pointerEvents: 'none', willChange: 'opacity',
  });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '0'; });
  overlay.addEventListener('transitionend', () => overlay.remove());
}
```

---

## CSS Variable Usage

```css
/* Reference colors with opacity support */
.card {
  background: rgb(var(--theme-card));
  border: 1px solid rgb(var(--theme-border) / 0.5);
  color: rgb(var(--theme-text));
}

.button-primary {
  background: rgb(var(--theme-lav));
  color: rgb(var(--theme-bg));
}

.button-primary:hover {
  background: rgb(var(--theme-lavDim));
}

.badge-success { background: rgb(var(--theme-sage) / 0.15); color: rgb(var(--theme-sage)); }
.badge-warning { background: rgb(var(--theme-amber) / 0.15); color: rgb(var(--theme-amber)); }
.badge-error   { background: rgb(var(--theme-rose) / 0.15); color: rgb(var(--theme-rose)); }

.text-secondary { color: rgb(var(--theme-textMid)); }
.text-hint      { color: rgb(var(--theme-textFaint)); }
```

### Tailwind Config (if using Tailwind)

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        theme: {
          bg:        'rgb(var(--theme-bg) / <alpha-value>)',
          card:      'rgb(var(--theme-card) / <alpha-value>)',
          card2:     'rgb(var(--theme-card2) / <alpha-value>)',
          border:    'rgb(var(--theme-border) / <alpha-value>)',
          border2:   'rgb(var(--theme-border2) / <alpha-value>)',
          text:      'rgb(var(--theme-text) / <alpha-value>)',
          textMid:   'rgb(var(--theme-textMid) / <alpha-value>)',
          textFaint: 'rgb(var(--theme-textFaint) / <alpha-value>)',
          lav:       'rgb(var(--theme-lav) / <alpha-value>)',
          lavDim:    'rgb(var(--theme-lavDim) / <alpha-value>)',
          sage:      'rgb(var(--theme-sage) / <alpha-value>)',
          sageDim:   'rgb(var(--theme-sageDim) / <alpha-value>)',
          amber:     'rgb(var(--theme-amber) / <alpha-value>)',
          amberDim:  'rgb(var(--theme-amberDim) / <alpha-value>)',
          rose:      'rgb(var(--theme-rose) / <alpha-value>)',
          roseDim:   'rgb(var(--theme-roseDim) / <alpha-value>)',
        },
      },
    },
  },
};
```

Then use: `bg-theme-card`, `text-theme-lav/50`, `border-theme-border`, etc.

---

## Aurora Theme (Complete)

### Color Palette

```
Background:    #141a26  (deep blue-gray night sky)
Card:          #1e2634  (slightly lighter surface)
Card2:         #2a3342  (tertiary surface)
Border:        #3a4456  (subtle steel blue)
Border2:       #4a566a  (stronger steel blue)
Text:          #e8eef8  (cool white)
TextMid:       #b0c0d8  (soft blue-gray)
TextFaint:     #8e9eb8  (muted blue-gray)
Primary (lav): #84dcb4  (northern-lights green-mint)
PrimaryDim:    #66bc94  (darker green)
Secondary:     #70cce8  (aurora cyan)
SecondaryDim:  #54acca  (deeper cyan)
Tertiary:      #b4a2ec  (soft violet)
TertiaryDim:   #9484d0  (deeper violet)
Alert:         #ec8898  (warm pink)
AlertDim:      #cc6c7e  (deeper pink)
```

### Animated Effect Layers

The Aurora theme uses three CSS pseudo-element layers:

```
body::before  — Aurora curtains (blurred gradient sheets that drift)
body::after   — 22 twinkling stars (radial-gradient dots that pulse)
html::before  — Shooting meteor (thin gradient bar that streaks across)
```

### CSS Implementation

```css
/* ── Base layer for all animated themes ── */
html[class*="theme-"] body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0;
  transition: opacity 0.6s ease;
}

/* ── Aurora: Northern-lights curtains ── */
html.theme-aurora body::before {
  will-change: transform, opacity;
  background-image:
    /* Curtain 1: green sheet, upper left */
    radial-gradient(ellipse 90% 28% at 20% 22%, rgba(132, 220, 180, 0.28), transparent 65%),
    /* Curtain 2: cyan sheet, upper right */
    radial-gradient(ellipse 80% 24% at 75% 30%, rgba(112, 204, 232, 0.24), transparent 65%),
    /* Curtain 3: violet tail, mid */
    radial-gradient(ellipse 70% 22% at 45% 48%, rgba(180, 162, 236, 0.20), transparent 65%),
    /* Ambient low glow along horizon */
    radial-gradient(ellipse 120% 18% at 50% 70%, rgba(132, 220, 180, 0.14), transparent 70%);
  opacity: 1;
  filter: blur(36px);
  animation: aurora-shimmer 22s ease-in-out infinite alternate;
}

/* ── Aurora: Twinkling star field ── */
html.theme-aurora body::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image:
    radial-gradient(circle 2px at  8% 12%, rgba(255, 255, 255, 0.85), transparent 70%),
    radial-gradient(circle 2px at 22% 38%, rgba(112, 204, 232, 0.80), transparent 70%),
    radial-gradient(circle 2px at 38%  8%, rgba(255, 255, 255, 0.80), transparent 70%),
    radial-gradient(circle 3px at 55% 22%, rgba(132, 220, 180, 0.70), transparent 70%),
    radial-gradient(circle 2px at 68% 52%, rgba(255, 255, 255, 0.85), transparent 70%),
    radial-gradient(circle 2px at 82% 18%, rgba(112, 204, 232, 0.75), transparent 70%),
    radial-gradient(circle 3px at 92% 62%, rgba(255, 255, 255, 0.70), transparent 70%),
    radial-gradient(circle 2px at 14% 72%, rgba(180, 162, 236, 0.80), transparent 70%),
    radial-gradient(circle 2px at 45% 88%, rgba(255, 255, 255, 0.75), transparent 70%),
    radial-gradient(circle 2px at 72% 80%, rgba(132, 220, 180, 0.70), transparent 70%),
    radial-gradient(circle 2px at  4% 48%, rgba(255, 255, 255, 0.80), transparent 70%),
    radial-gradient(circle 2px at 18% 94%, rgba(112, 204, 232, 0.75), transparent 70%),
    radial-gradient(circle 3px at 30% 58%, rgba(255, 255, 255, 0.85), transparent 70%),
    radial-gradient(circle 2px at 42% 30%, rgba(180, 162, 236, 0.70), transparent 70%),
    radial-gradient(circle 2px at 52% 68%, rgba(112, 204, 232, 0.80), transparent 70%),
    radial-gradient(circle 2px at 62%  4%, rgba(255, 255, 255, 0.75), transparent 70%),
    radial-gradient(circle 3px at 74% 34%, rgba(132, 220, 180, 0.80), transparent 70%),
    radial-gradient(circle 2px at 86% 84%, rgba(255, 255, 255, 0.85), transparent 70%),
    radial-gradient(circle 2px at 96% 32%, rgba(112, 204, 232, 0.75), transparent 70%),
    radial-gradient(circle 2px at 28% 20%, rgba(255, 255, 255, 0.80), transparent 70%),
    radial-gradient(circle 2px at 58% 94%, rgba(180, 162, 236, 0.75), transparent 70%),
    radial-gradient(circle 2px at 78%  6%, rgba(255, 255, 255, 0.85), transparent 70%);
  animation: aurora-stars 6s ease-in-out infinite;
}

/* ── Aurora: Shooting meteor ── */
html.theme-aurora::before {
  content: '';
  position: fixed;
  top: -6vw;
  left: -32vw;
  width: 32vw;
  height: 2px;
  pointer-events: none;
  z-index: 0;
  background: linear-gradient(90deg,
    rgba(112, 204, 232, 0) 0%,
    rgba(112, 204, 232, 0) 55%,
    rgba(132, 220, 180, 0.5) 80%,
    rgba(230, 255, 245, 0.9) 98%,
    rgba(255, 255, 255, 1) 100%
  );
  border-radius: 2px;
  filter: blur(0.5px);
  transform: rotate(18deg) translate(0, 0);
  animation: aurora-meteor 26s linear infinite;
}

/* ── Aurora: Heading text glow ── */
html.theme-aurora h1,
html.theme-aurora h2,
html.theme-aurora .heading {
  text-shadow:
    0 0 12px rgba(132, 220, 180, 0.35),
    0 0 24px rgba(112, 204, 232, 0.22);
}

/* ── Keyframes ── */
@keyframes aurora-shimmer {
  0%   { transform: translate(0, 0) scaleY(1);       opacity: 0.9;  }
  33%  { transform: translate(18px, -8px) scaleY(1.08); opacity: 1;  }
  66%  { transform: translate(-14px, 6px) scaleY(0.94); opacity: 0.85; }
  100% { transform: translate(8px, -4px) scaleY(1.04);  opacity: 0.95; }
}

@keyframes aurora-stars {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 0.4;  }
}

@keyframes aurora-meteor {
  /* y = x * tan(18deg) keeps motion aligned with bar rotation */
  0%, 94%  { transform: rotate(18deg) translate(0, 0);          opacity: 0;    }
  94.8%    { transform: rotate(18deg) translate(6vw, 2vw);      opacity: 0.3;  }
  95.6%    { transform: rotate(18deg) translate(20vw, 6.5vw);   opacity: 0.85; }
  98.8%    { transform: rotate(18deg) translate(140vw, 45.5vw); opacity: 0.85; }
  99.4%    { transform: rotate(18deg) translate(158vw, 51.4vw); opacity: 0.55; }
  99.8%    { transform: rotate(18deg) translate(168vw, 54.6vw); opacity: 0.15; }
  100%     { transform: rotate(18deg) translate(170vw, 55.3vw); opacity: 0;    }
}
```

### Glassmorphism (Frosted Glass Cards)

Cards become translucent with blur over the animated background:

```css
html.theme-aurora .card {
  background-color: rgb(var(--theme-card) / 0.72);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
}

/* Accent-tinted cards get heavier frosting */
html.theme-aurora .card-accent {
  background-color: rgb(var(--theme-lav) / 0.28);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
}

/* Strengthen borders for definition against glass */
html.theme-aurora .card-border {
  border-color: rgb(var(--theme-border2) / 0.8);
}
```

---

## All 15 Theme Palettes (Quick Reference)

### Core Themes

| Theme | Type | Background | Primary | Secondary | Tertiary |
|-------|------|-----------|---------|-----------|----------|
| **Lilac** | Light | `#f5f0f8` | `#8866b8` lavender | `#5a9078` sage | `#c48850` amber |
| **Noir** | Dark | `#18181a` | `#b4b4ba` silver | `#9eb09e` sage | `#d0c0a8` sand |
| **Midnight** | Dark | `#1d1a2a` | `#b49cde` violet | `#8fc29a` mint | `#dcc088` gold |
| **Forest** | Dark | `#1a2016` | `#8fb870` leaf | `#b4c894` moss | `#b88748` bark |
| **Dawnlight** | Light | `#faf7f2` | `#7c6aaa` plum | `#3d8a5c` forest | `#b8860b` honey |
| **Sunrise** | Light | `#fdf4ec` | `#c4648c` coral | `#589080` teal | `#d06820` tangerine |

### Experimental Themes (Animated)

| Theme | Type | Background | Primary | Effect |
|-------|------|-----------|---------|--------|
| **Aurora** | Dark | `#141a26` | `#84dcb4` mint | Northern-lights curtains + stars + meteor |
| **Neon** | Dark | `#0d0b1a` | `#ff4db8` pink | Cyberpunk grid + pulse |
| **Cherry Blossom** | Light | `#fdf5f6` | `#d4648c` pink | Falling petals with sway |
| **Sunny Day** | Light | `#fffcf0` | `#4a90d4` sky | Sun + rays + dust motes |
| **Blaze** | Dark | `#0d0808` | `#ff3d00` fire | Multi-layer fire + ember sparks |
| **Ember** | Dark | `#141313` | `#ff6a1a` orange | Flickering firelight + sparks |
| **Galactic** | Dark | `#050818` | `#6aa4ff` blue | 30-star drift + nebula + shooting star |
| **Prismatic** | Light | `#fdfbff` | `#7c30cc` purple | Rainbow shimmer + clip headings |
| **Crystal Cave** | Dark | `#12082a` | `#4ae0ff` cyan | Amethyst glows + hologram sweep |

---

## Performance Notes

- Effect layers use `will-change: transform, opacity` for GPU compositing
- All animations use `transform` and `opacity` only (no `filter`, `background-position`, or `box-shadow` animations)
- Stars/sparks use `radial-gradient` dots, not DOM elements (zero layout cost)
- Glassmorphism `backdrop-filter: blur()` can be expensive on low-end devices; consider a `prefers-reduced-motion` fallback
- Meteor/shooting-star `translate()` uses `y = x * tan(angle)` so the motion path stays aligned with the bar rotation across all viewport aspect ratios

```css
@media (prefers-reduced-motion: reduce) {
  html[class*="theme-"] body::before,
  html[class*="theme-"] body::after,
  html[class*="theme-"]::before {
    animation: none !important;
  }
}
```

---

## Adding a New Theme

1. Define the theme object with all 16 colors + gradient + ambiance
2. Add the CSS effect layers (optional, for animated themes)
3. Add glassmorphism rules if the theme has backdrop effects
4. That's it. No component changes needed.
