# Theme Effects — Menu of Possibilities

Reference for adding signature visual effects to themes (especially experimental/premium ones). The app already has a `theme-{id}` class applied to `<html>` when a theme is active, so CSS can target specific themes.

## What's Currently Implemented

Each experimental theme has one signature effect:

| Theme | Effect |
|-------|--------|
| **Neon** | Pulsing cyberpunk grid backdrop + text glow on headings |
| **Monarch** | Floating gold/purple particles that drift slowly |
| **Ocean** | Bubbles rising from the bottom of the screen |
| **Ember** | Warm glow flickering at the bottom like a fire |
| **Frost** | Twinkling crystal particles (4-point sparkle shimmer) |

All run continuously, sit behind content via `body::before`, and don't interfere with interaction.

---

## Catalog of Possibilities

### Ambient backdrop effects (continuous, low-motion)

1. **Gradient drift** — animated background gradient that slowly shifts through theme colors
2. **Star field** — tiny twinkling dots at random positions
3. **Floating particles** — specks that drift upward/sideways (like current Monarch)
4. **Bubble column** — rising circles from bottom (like current Ocean)
5. **Falling snow** — tiny flakes descending from top
6. **Grid lines** — subtle animated grid (like current Neon)
7. **Noise texture** — subtle film grain overlay
8. **Radial pulse** — slow breathing glow from center
9. **Scan lines** — horizontal lines drifting down (CRT monitor aesthetic)
10. **Waveform** — animated sine wave at bottom of screen
11. **Firefly swarm** — small glowing dots moving in a random walk
12. **Aurora sweep** — wavy colored bands moving across the screen
13. **Confetti** — colorful shapes falling from top (sparingly!)

### Per-element effects (on cards/buttons/text)

14. **Glow pulse** — accent color shadow that fades in/out on active elements
15. **Border shimmer** — light sweeping around card borders
16. **Text glow** — text-shadow in accent color (like current Neon on headings)
17. **Gradient text** — headings use animated color gradient
18. **Ember outline** — subtle pulsing border on focused elements
19. **Hologram shimmer** — diagonal shimmer sweep across surfaces
20. **Iridescence** — color shifts based on mouse position
21. **Frosted glass** — backdrop-blur on cards with translucent background
22. **Underline sweep** — animated line under headings
23. **Ripple on click** — material-design-style ripple expanding from click point

### Motion-based effects (triggered by interaction)

24. **Parallax tilt** — cards tilt based on mouse hover position
25. **Card float** — cards drift vertically slightly on hover
26. **Scroll-triggered entrances** — elements fade/slide in as they scroll into view (already partially done via dash-stagger)
27. **Magnetic buttons** — buttons subtly attract toward cursor
28. **Glitch on hover** — Neon-style RGB offset glitch on interactive elements

### Decorative overlays

29. **Corner ornaments** — decorative SVG glyphs in corners of cards
30. **Moon phase indicator** — small moon icon that changes with time of day
31. **Seasonal accents** — snowflakes in winter, petals in spring, leaves in fall (based on date)
32. **Custom cursors** — theme-specific cursor (sparkle, leaf, moon trail)

### Typography effects

33. **Theme-specific fonts** — different heading fonts per theme (e.g. Neon uses something monospace/futuristic)
34. **Weight animation** — headings' font-weight breathes between 400-600
35. **Letter spacing wave** — tracking animates subtly across long headings

### Sound (opt-in)

36. **Hover/click sound effects** — subtle audio feedback (requires user permission)
37. **Ambient soundscape** — loops when app is open (VERY optional, often annoying)

---

## Theme Idea Prompts

Want to create new themes? Here are some concept pitches:

- **Forest at Twilight** — deep green background, glowing fireflies, soft cricket-like pulse
- **Lunar** — pure grayscale with moon-phase cycling, meteor streaks occasionally
- **Retrowave** — purple/pink sunset gradient, palm tree silhouette, scan lines
- **Cherry Blossom** — soft pink with falling petal particles
- **Galaxy** — deep space purple/blue with twinkling stars + occasional shooting star
- **Rose Gold** — metallic pinks with soft shimmer, gold accents
- **Underwater Cave** — dark teal with bioluminescent particles drifting
- **Vintage Paper** — cream background, handwritten-feeling fonts, ink splotches
- **Thunderstorm** — dark gray with occasional lightning flash effect
- **Desert Dusk** — warm sand colors with slow dust drift
- **Sakura Night** — dark blue + pink with falling petals
- **Crystal Cave** — deep purple with geometric sparkle patterns
- **Matrix** — green-on-black with digital rain effect

---

## Adding a New Effect

1. Add theme definition in `src/constants/themes.js`
2. (If the theme needs an effect) Add CSS block in `src/index.css` targeting `html.theme-{id} body::before` with a keyframe animation
3. (If the theme has an experimental flag) Free users will see it locked behind the Save (Premium) button
4. Test: clicking the theme tile in Settings previews the effect live

### Minimal effect CSS template

```css
html.theme-myname body::before {
  background: /* your particles/gradient/pattern */;
  opacity: 1;
  animation: myname-motion 10s linear infinite;
}
@keyframes myname-motion {
  from { transform: translateY(0); }
  to { transform: translateY(-100vh); }
}
```

---

## Performance Notes

- All current effects are pure CSS (GPU-accelerated via `transform` and `opacity`)
- No JavaScript animation loops → no battery drain
- Particle effects use `background-image` with multiple radial gradients rather than DOM elements → very cheap
- If an effect feels too active, reduce opacity (e.g. `0.5` → `0.2`) or slow the animation (e.g. `12s` → `24s`)
- Keep effects behind content (`body::before` with `z-index: 0`, content has `z-index: 1`)
- Effects respect `prefers-reduced-motion` via adding a media query (TODO — not yet implemented)

---

## What's NOT Recommended

- **Actual DOM-based particles** — more flexible but much more expensive to render
- **Canvas-based animations** — overkill for ambient backdrop effects
- **Video backgrounds** — huge bandwidth cost, unnecessary
- **Heavy blur effects** on mobile — blur is expensive in browsers and drains battery
