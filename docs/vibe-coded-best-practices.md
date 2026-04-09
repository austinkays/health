# Vibe Coded Website Best Practices
> Techniques extracted from: vibecarats.com, awesomeosai.com, ultramock.io, gitvital.com, sitevett.com

---

## Tech Stack (What They All Use)

All five sites share a remarkably similar, lightweight stack:

- **Framework**: Next.js or Astro — no custom servers, no complexity
- **Styling**: Tailwind CSS v4 (identifiable by `oklch()` color values and `@layer utilities`)
- **Animation**: Zero heavy libraries — no GSAP, no Framer Motion, no Three.js
- **Everything visual is pure CSS keyframes + transitions**

> The takeaway: you don't need heavy tooling to ship a beautiful site. Master CSS first.

---

## 1. Spring Easing — The Single Biggest Upgrade

Replace `ease` and `ease-in-out` with spring-approximating cubic bezier curves everywhere.

```css
/* Standard (boring) */
transition: transform 0.3s ease;

/* Spring feel (what these sites use) */
transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
```

The key difference: these curves start fast and decelerate with a slight overshoot feel. Used by Ultramock and SiteVett on virtually every animated element. It's the primary reason their UI feels "alive."

**Cheat sheet of spring curves:**
```css
/* Gentle spring */
cubic-bezier(0.16, 1, 0.3, 1)

/* Snappy spring */
cubic-bezier(0.22, 1, 0.36, 1)

/* Bouncy spring */
cubic-bezier(0.34, 1.56, 0.64, 1)
```

---

## 2. Radial Glow Hero Background

The most common hero effect across all dark-mode sites. Dead simple, looks expensive.

```css
/* Anchor a soft glow to the top of the hero */
.hero-glow {
  position: absolute;
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
  width: 900px;
  height: 600px;
  background: radial-gradient(
    rgba(73, 143, 255, 0.12) 0%,
    transparent 70%
  );
  pointer-events: none;
}

/* Bonus: make it react to app state */
.hero.success .hero-glow {
  background: radial-gradient(rgba(34, 197, 94, 0.15) 0%, transparent 70%);
  transition: background 0.8s;
}
.hero.error .hero-glow {
  background: radial-gradient(rgba(251, 54, 64, 0.15) 0%, transparent 70%);
  transition: background 0.8s;
}
```

GitVital takes this further by changing the glow color based on whether a repo is healthy or dying — a glow that reacts to data feels incredibly polished.

---

## 3. Blur-In Entrances (Better Than Plain Fades)

Swap opacity-only fades for blur + fade + translate combos. The blur dissolving away adds perceived depth.

```css
/* Element entrance */
@keyframes blurIn {
  0% {
    opacity: 0;
    filter: blur(8px);
    transform: translateY(12px) scale(0.97);
  }
  100% {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scale(1);
  }
}

.animate-blur-in {
  animation: blurIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Stagger children with delay */
.animate-blur-in:nth-child(1) { animation-delay: 0ms; }
.animate-blur-in:nth-child(2) { animation-delay: 80ms; }
.animate-blur-in:nth-child(3) { animation-delay: 160ms; }
```

Ultramock uses this on their logo, tooltips, dropdowns, and panels. Every piece of UI that appears uses blur-in instead of plain fade-in.

---

## 4. Glassmorphism Cards (The Modern Formula)

The exact recipe used by GitVital and Ultramock:

```css
.glass-card {
  /* The blur is the foundation */
  backdrop-filter: blur(12px);

  /* Very low opacity tinted background */
  background: rgba(255, 255, 255, 0.03);

  /* Subtle inner border using inset box-shadow */
  box-shadow:
    rgba(255, 255, 255, 0.12) 0px 0px 0px 0.5px inset,
    rgba(0, 0, 0, 0.08) 0px 10px 30px,
    rgba(0, 0, 0, 0.12) 0px 24px 48px;

  border-radius: 12px;
}

/* Dark glass variant */
.glass-dark {
  backdrop-filter: blur(12px);
  background: rgba(35, 63, 72, 0.4);
  border: 1px solid rgba(76, 202, 240, 0.1);
}
```

The 0.5px inset box-shadow is the trick — it's thinner than a border and catches light more naturally.

---

## 5. CSS Grid/Dot Texture Background

A subtle grid or dot pattern adds depth to dark backgrounds without visual noise.

```css
/* Subtle grid */
.grid-bg {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 32px 32px;
}

/* Dot variant */
.dot-bg {
  background-image: radial-gradient(
    rgba(255, 255, 255, 0.08) 1px,
    transparent 1px
  );
  background-size: 24px 24px;
}

/* Themed color version (from GitVital) */
.radar-grid {
  background-image:
    linear-gradient(rgba(76, 202, 240, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(76, 202, 240, 0.05) 1px, transparent 1px);
  background-size: 20px 20px;
}
```

---

## 6. Gradient Text

Used by GitVital for accent words in headlines. Works as a simple CSS class:

```css
.gradient-text {
  background: linear-gradient(
    135deg,
    rgb(255, 179, 128) 0%,
    rgb(255, 199, 166) 50%,
    rgb(255, 218, 204) 100%
  );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Brand color version */
.gradient-text-brand {
  background: linear-gradient(90deg, #60a5fa, #a78bfa, #f472b6);
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

---

## 7. Slot-Machine Word Scroller (Hero Headline Effect)

GitVital's most memorable UI trick — cycling words in the hero headline like a slot machine. Pure CSS + tiny JS class toggle.

```html
<h1>
  Is your GitHub repo
  <span class="word-scroller">
    <span class="word-scroller-inner">
      <span class="word word--red">Dying?</span>
      <span class="word word--green">Healthy?</span>
    </span>
  </span>
</h1>
```

```css
.word-scroller {
  display: grid;
  height: 1.15em;
  overflow: hidden;
}

.word-scroller-inner {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
}

.word-scroller-inner.animating {
  animation: scrollWord 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes scrollWord {
  0%   { transform: translateY(-1.4em); }
  100% { transform: translateY(0); }
}
```

```js
// Cycle words every N seconds
function cycleWords() {
  inner.classList.remove('animating');
  // Move first word to end
  inner.appendChild(inner.firstElementChild);
  void inner.offsetWidth; // force reflow
  inner.classList.add('animating');
}
setInterval(cycleWords, 2500);
```

---

## 8. 3D Perspective Product Mockups

Both Ultramock and SiteVett display their product inside a subtle 3D-tilted browser frame. SiteVett's version:

```css
/* The stage sets the 3D context */
.stage {
  perspective: 1200px;
  perspective-origin: 50% 44%;
}

/* The card tilts slightly and breathes */
.browser-mockup {
  transform: rotateX(1.5deg);
  animation: breathe 4s ease-in-out infinite;
  border-radius: 12px;
  box-shadow:
    rgba(255, 255, 255, 0.06) 0px 1px 0px inset,
    rgba(0, 0, 0, 0.08) 0px 12px 24px,
    rgba(0, 0, 0, 0.12) 0px 24px 48px;
}

@keyframes breathe {
  0%, 100% {
    box-shadow:
      rgba(255,255,255,0.06) 0px 1px 0px inset,
      rgba(0,0,0,0.04) 0px 2px 4px,
      rgba(0,0,0,0.08) 0px 12px 24px;
  }
  50% {
    box-shadow:
      rgba(255,255,255,0.06) 0px 1px 0px inset,
      rgba(0,0,0,0.06) 0px 4px 8px,
      rgba(0,0,0,0.14) 0px 20px 40px;
  }
}
```

Ultramock takes this further with a full `stageIn` entrance animation:
```css
.stage {
  perspective: 2000px;
  animation: 1s cubic-bezier(0.22, 1, 0.36, 1) 50ms stageIn;
}

@keyframes stageIn {
  0% { opacity: 0; transform: translateY(48px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

---

## 9. Scan Line Effect

A sci-fi/data-tool aesthetic — a translucent line sweeping over a UI element to suggest "scanning." Used by both GitVital and SiteVett.

```css
.scan-line {
  position: absolute;
  width: 100%;
  height: 40%;
  background: linear-gradient(
    transparent,
    rgba(76, 202, 240, 0.15),
    transparent
  );
  pointer-events: none;
  animation: scan 3s linear infinite;
}

@keyframes scan {
  0%   { opacity: 0; top: -40%; }
  10%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; top: 100%; }
}
```

---

## 10. Skeleton Shimmer Loading States

GitVital uses this for a polished loading experience instead of spinners:

```css
.skeleton {
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 25%,
    rgba(255, 255, 255, 0.09) 50%,
    rgba(255, 255, 255, 0.04) 75%
  );
  background-size: 600px 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}
```

Apply to placeholder divs that match the shape of incoming content.

---

## 11. Pulsing Glow on Icons / Status Indicators

VibeCarats and GitVital both use this for "live" / active status dots:

```css
/* Ping animation — a ring that expands and fades */
.ping-dot {
  position: relative;
}
.ping-dot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: currentColor;
  animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@keyframes ping {
  75%, 100% {
    transform: scale(2);
    opacity: 0;
  }
}

/* Drop-shadow glow pulse (for icons) */
.glow-pulse {
  animation: glowPulse 2s ease-in-out infinite;
}

@keyframes glowPulse {
  0%, 100% { filter: drop-shadow(0 0 2px currentColor); }
  50%       { filter: drop-shadow(0 0 10px currentColor); }
}
```

---

## 12. Infinite Scrolling Marquee (Logo/Tag Strip)

GitVital uses this for a ticker of repository tags. Smooth, no JS needed:

```html
<div class="marquee-wrapper">
  <div class="marquee-track">
    <!-- Duplicate content for seamless loop -->
    <span>React</span><span>TypeScript</span><!-- ... -->
    <span>React</span><span>TypeScript</span><!-- ... -->
  </div>
</div>
```

```css
.marquee-wrapper {
  overflow: hidden;
  mask-image: linear-gradient(
    to right,
    transparent,
    black 10%,
    black 90%,
    transparent
  );
}

.marquee-track {
  display: flex;
  gap: 1rem;
  width: max-content;
  animation: marquee 30s linear infinite;
}

@keyframes marquee {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
```

The `mask-image` on the wrapper makes the edges fade out gracefully.

---

## 13. Content Fade-Mask (Trailing Off Effect)

SiteVett uses this on their product mockup to make scrollable content appear to fade into the card bottom:

```css
.preview-container {
  mask-image: linear-gradient(black 82%, transparent 100%);
  overflow: hidden;
}
```

Works great for testimonial sections, code blocks, or any scrollable content you want to hint at without fully showing.

---

## 14. Responsive Typography with clamp()

Every site uses this. No media query breakpoints for font sizes:

```css
h1 {
  font-size: clamp(2rem, 6.5vw, 4.75rem);
  letter-spacing: -0.04em;
  line-height: 1;
}

h2 {
  font-size: clamp(1.5rem, 3.5vw, 2.75rem);
  letter-spacing: -0.02em;
}

p.lead {
  font-size: clamp(0.9rem, 1.3vw, 1.1rem);
  line-height: 1.65;
}
```

---

## 15. GPU Acceleration with will-change

Always add this to elements you're animating with transform/opacity/filter:

```css
.animated-element {
  will-change: opacity, transform, filter;
}

/* Remove it after animation completes to free memory */
.animated-element.done {
  will-change: auto;
}
```

SiteVett and Ultramock both apply this to their frame-transition elements.

---

## 16. Pricing Card Hover Lift

SiteVett's pricing section uses the cleanest version of this pattern:

```css
.pricing-card {
  transition: transform 0.2s, box-shadow 0.2s;
}

.pricing-card:hover {
  transform: translateY(-4px);
  box-shadow: rgba(0, 0, 0, 0.1) 0px 12px 32px;
}

/* Featured card gets a colored glow */
.pricing-card.featured {
  border-color: var(--brand);
  box-shadow: rgba(13, 148, 136, 0.15) 0px 8px 24px;
}
```

---

## Design Principles (Beyond the CSS)

**Restraint is a feature.** AwesomeOSAI has almost zero animations and still looks great. Strong typography, consistent spacing, and a clear hierarchy do more than any keyframe animation.

**Pick one accent color and use it at multiple opacities.** GitVital does everything with `rgba(76, 202, 240, X)` — borders at 0.1, backgrounds at 0.05, glows at 0.15, text at full. This creates cohesion without needing a complex palette.

**Dark mode is the default for "serious" tools.** GitVital, Ultramock, and VibeCarats all default to dark. SiteVett and AwesomeOSAI go light. Dark lends itself to glows, glassmorphism, and scan effects far more naturally.

**Every entrance should have a purpose.** These sites don't animate things randomly — elements animate in when they enter the viewport, dropdowns animate in when opened, modals animate in when triggered. Animation communicates state, not decoration.

**Layered box-shadows over single shadows.** Compare:
```css
/* Amateur */
box-shadow: 0 4px 8px rgba(0,0,0,0.2);

/* What these sites do */
box-shadow:
  rgba(255, 255, 255, 0.06) 0px 1px 0px inset,
  rgba(0, 0, 0, 0.04) 0px 2px 4px,
  rgba(0, 0, 0, 0.08) 0px 12px 24px,
  rgba(0, 0, 0, 0.12) 0px 24px 48px;
```
The layered approach creates a natural light-falloff that single shadows can't replicate.

---

## Quick Reference — Animation Snippets

```css
/* Fade up (minimal) */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Blur in (premium feel) */
@keyframes blurIn {
  from { opacity: 0; filter: blur(8px); transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; filter: blur(0);   transform: translateY(0)    scale(1);    }
}

/* Scale pop (modals, cards) */
@keyframes scalePop {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
}

/* Slide in from right */
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* Spin (loading) */
@keyframes spin {
  to { transform: rotate(1turn); }
}

/* Ping (live indicator) */
@keyframes ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}

/* Breathe (subtle card pulse) */
@keyframes breathe {
  0%, 100% { box-shadow: 0 12px 24px rgba(0,0,0,0.08); }
  50%       { box-shadow: 0 20px 40px rgba(0,0,0,0.14); }
}
```

---

*Extracted from live inspection of vibecarats.com, awesomeosai.com, ultramock.io, gitvital.com, sitevett.com — April 2026*
