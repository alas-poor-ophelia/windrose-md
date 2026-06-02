---
name: css-modern-features
description: >
  Use this skill whenever writing, reviewing, or refactoring any CSS, whether in plain .css files,
  styled-components, CSS Modules, Tailwind arbitrary values, inline styles in React/Vue/Svelte, or
  any other frontend context. This skill ensures modern CSS features are used wherever browser
  support allows — things like clamp(), :has(), container queries, OKLCH colors, scroll-driven
  animations, anchor positioning, @starting-style, light-dark(), text-wrap: balance, and more.
  Trigger this skill any time CSS is being written or touched, even indirectly (e.g. a component
  that needs responsive sizing, a theme system, an animation, a layout). Do NOT default to legacy
  patterns like px-based media queries, JS-driven animations, or CSS-in-JS workarounds when a
  native modern CSS feature exists and is supported by the project's browser targets.
---

# Modern CSS Skill

Write CSS that uses the most capable, expressive features available for the project's browser targets.
Never reach for a legacy workaround when a modern native feature is supported.

---

## Step 1 — Detect Browser Targets

Before writing any CSS, resolve the project's browser target. Check in this order:

### 1a. `package.json`
```json
"browserslist": ["> 1%", "last 2 versions", "not dead"]
```
or a `"browserslist"` key pointing to a config.

### 1b. `.browserslistrc` file
```
> 1%
last 2 versions
not dead
```

### 1c. Framework-specific configs
- **Vite**: `build.target` in `vite.config.*`
- **Next.js**: check `next.config.*` for `browserslist` or `transpilePackages`
- **Astro**: `build.target` in `astro.config.*`

### 1d. No config found → assume **Tier 2** (conservative-modern)

---

## Step 2 — Map Targets to Feature Tiers

Once you know the targets, map them to a tier:

| Tier | Typical Target | Description |
|------|---------------|-------------|
| **Tier 0** | Latest Chrome/Edge only, or explicit opt-in | Experimental — `@supports` required, JS fallback recommended |
| **Tier 1** | Last 1–2 Chrome/Edge/Firefox/Safari | Bleeding edge — use everything stable |
| **Tier 2** | Last 2 versions / > 0.5% | Modern baseline — most features safe |
| **Tier 3** | > 1% / IE excluded but Safari 15- included | Be selective — use `@supports` guards |
| **Tier 4** | IE 11 or legacy Android included | Stick to fundamentals + polyfills |

**Quick heuristic**: if the browserslist resolves to Chrome 125+, Safari 17.5+, Firefox 128+ → **Tier 1**.
If it resolves to Chrome 111+, Safari 16.4+, Firefox 113+ → **Tier 2**.
If it resolves to Chrome 105+, Safari 15+, Firefox 110+ → **Tier 3**.

Use `npx browserslist` in the project root to get the exact resolved list when uncertain.

---

## Step 3 — Apply the Modern CSS Checklist

Before finalizing any CSS, run through this checklist. Each item has a minimum tier.

### 🎨 Color & Theming
- [ ] Use **CSS custom properties** for all repeated values (colors, spacing, radii) — *Tier 1–4*
- [ ] Use **OKLCH** for color definitions instead of hex/hsl — *Tier 2+*
- [ ] Use **`color-mix()`** for tints, shades, opacity variants — *Tier 2+*
- [ ] Use **relative color syntax** (`oklch(from var(--color) l c h)`) for derived colors — *Tier 1+*
- [ ] Use **`light-dark()`** instead of two `@media (prefers-color-scheme)` blocks — *Tier 1+*
- [ ] Use **`accent-color`** to theme native form controls in one line — *Tier 2+*

### 📐 Layout & Sizing
- [ ] Use **`clamp()`** for fluid typography and spacing instead of breakpoint steps — *Tier 2+*
- [ ] Use **`min()` / `max()`** for bounded sizing instead of JS or complex media queries — *Tier 2+*
- [ ] Use **`round()`, `mod()`, `abs()`, `sign()`** for grid-snapping and math — *Tier 2+*
- [ ] Use **dynamic viewport units** (`svh`, `dvh`, `lvh`) instead of `100vh` — *Tier 2+*
- [ ] Use **container queries** for component-level responsiveness instead of viewport media queries — *Tier 2+*
- [ ] Use **`subgrid`** when grid children need to align across rows/columns — *Tier 2+*
- [ ] Use **`aspect-ratio`** instead of the padding-top hack — *Tier 2+*
- [ ] Use **`field-sizing: content`** for auto-resizing inputs/textareas — *Tier 1+*
- [ ] Use **`margin-trim`** to remove edge-child margins instead of `:last-child` overrides — *Tier 1+*

### 🎯 Selectors & Logic
- [ ] Use **`:has()`** for conditional parent/sibling styling instead of JS class toggling — *Tier 2+*
- [ ] Use **`:is()` / `:where()`** to reduce selector repetition — *Tier 2+*
- [ ] Use **`@layer`** to manage cascade order instead of specificity hacks — *Tier 2+*
- [ ] Use **`@scope`** for component-scoped styles instead of BEM or data attributes — *Tier 1+*
- [ ] Use **CSS nesting** (`&`) instead of preprocessor nesting or repeated selectors — *Tier 2+*

### ✨ Animation & Transitions
- [ ] Use **scroll-driven animations** for scroll-linked effects instead of IntersectionObserver + JS — *Tier 2+*
- [ ] Use **`@starting-style`** for enter animations on newly displayed elements — *Tier 2+*
- [ ] Use **`transition-behavior: allow-discrete`** to animate `display: none` toggling — *Tier 2+*
- [ ] Use **`view-transition-name`** for page/component transitions instead of JS animation libraries — *Tier 2+*
- [ ] Use **`offset-path`** to animate elements along a curve instead of JS motion libraries — *Tier 2+*
- [ ] Use **`interpolate-size: allow-keywords`** to animate `height: auto` — *Tier 0 with `@supports`*
- [ ] Always respect **`prefers-reduced-motion`** — *Tier 1–4*

### 🔤 Typography
- [ ] Use **`text-wrap: balance`** on headings — *Tier 2+*
- [ ] Use **`text-wrap: pretty`** on body text paragraphs — *Tier 1+*
- [ ] Use **`cap` / `lh` / `rex` units** for cap-height or line-height-relative sizing — *Tier 2+*
- [ ] Use **`@font-face` `size-adjust`** to normalize font fallbacks — *Tier 2+*
- [ ] Use **`::marker`** to style list bullets/numbers instead of hiding them with `::before` — *Tier 2+*
- [ ] Use **`counter()`** for CSS-only numbered steps/sections — *Tier 2+*

### 📍 Positioning
- [ ] Use **`inset` shorthand** instead of top/right/bottom/left longhand — *Tier 2+*
- [ ] Use **logical properties** (`margin-inline`, `padding-block`, etc.) for i18n-ready layouts — *Tier 2+*
- [ ] Use **`scroll-margin` / `scroll-padding`** to offset sticky-header anchor scroll — *Tier 2+*
- [ ] Use **anchor positioning** for tooltips, popovers, dropdowns instead of JS position calculation — *Tier 1+*

### 🎨 Visual Effects
- [ ] Use **`backdrop-filter`** for frosted glass / blur overlays instead of image hacks — *Tier 2+*
- [ ] Use **`mix-blend-mode`** + **`isolation`** for CSS compositing — *Tier 2+*
- [ ] Use **`clip-path`** for shape masking instead of SVG wrappers — *Tier 2+*
- [ ] Use **gradient `border-image`** or `background-clip: padding-box` for gradient borders — *Tier 2+*

### 🧱 Component Patterns
- [ ] Use **`env(safe-area-inset-*)`** for iOS notch/Dynamic Island safe areas — *Tier 2+*
- [ ] Use **`scrollbar-color` / `scrollbar-width`** instead of `::-webkit-scrollbar` — *Tier 2+*
- [ ] Use **`overscroll-behavior`** to control scroll chaining on modals/drawers — *Tier 2+*
- [ ] Use **`scroll-behavior: smooth`** with `prefers-reduced-motion` guard — *Tier 2+*
- [ ] Use **`@media (hover: hover)`** to scope hover effects away from touch devices — *Tier 2+*
- [ ] Use **`@media (pointer: coarse)`** for larger touch targets — *Tier 2+*
- [ ] Use **`@media (scripting: none)`** for no-JS progressive enhancement — *Tier 1+*
- [ ] Use **`@media (prefers-contrast: more)`** for accessibility enhancement — *Tier 2+*

### 🔧 Architecture
- [ ] Use **`@property`** for typed custom properties that need transitions or range-clamping — *Tier 2+*
- [ ] Use **`content-visibility: auto`** on off-screen heavy sections for rendering performance — *Tier 2+*
- [ ] Use **`::backdrop`** for dialog/popover overlay styling instead of a separate overlay element — *Tier 2+*
- [ ] Use **`:popover-open`** for native popover state styling — *Tier 1+*

### 🧪 Experimental (Tier 0 — `@supports` required)
- [ ] **`interpolate-size: allow-keywords`** — animate to/from `height: auto` — *Chrome 129+*
- [ ] **`masonry` grid layout** — native Pinterest layout — *behind flag*
- [ ] **`if()` inline conditionals** — CSS-native branching — *too early, watch only*
- [ ] **`@function`** — reusable CSS functions — *too early, watch only*

---

## Step 4 — `@supports` Guards for Tier 3

When writing for Tier 3, wrap cutting-edge features with `@supports` and provide a functional fallback:

```css
/* Fallback first */
.card {
  color: hsl(220 80% 50%);
}

/* Enhancement */
@supports (color: oklch(0 0 0)) {
  .card {
    color: oklch(0.55 0.2 260);
  }
}
```

For layout:
```css
.grid {
  display: flex; /* fallback */
  flex-wrap: wrap;
}

@supports (grid-template-rows: subgrid) {
  .grid {
    display: grid;
    grid-template-rows: subgrid;
  }
}
```

---

## Step 5 — Tailwind Arbitrary Values

When using Tailwind, modern CSS features belong in **arbitrary values** rather than custom CSS files when they're one-off utilities:

```html
<!-- clamp() for fluid text -->
<h1 class="text-[clamp(1.5rem,4vw,3rem)]">

<!-- OKLCH color -->
<div class="bg-[oklch(0.7_0.15_200)]">

<!-- dynamic viewport height -->
<div class="h-[100dvh]">

<!-- container query size (within @container) -->
<p class="[@container(min-width:400px)]:text-lg">

<!-- CSS variable reference -->
<div class="gap-[var(--space-md)]">

<!-- light-dark() -->
<div class="text-[light-dark(#111,#eee)]">

<!-- anchor positioning -->
<div class="[position-anchor:--my-anchor]">

<!-- backdrop-filter -->
<nav class="backdrop-blur-md bg-white/70">

<!-- scroll margin for sticky header offset -->
<section class="scroll-mt-16">

<!-- accent color -->
<input type="checkbox" class="accent-[oklch(0.6_0.2_260)]">
```

For reusable patterns, extend `tailwind.config.*` with the feature value rather than repeating arbitrary syntax.

---

## Feature Reference

For full browser support tables, syntax examples, and implementation patterns, load the relevant section from:

- `references/color.md` — OKLCH, color-mix, relative color, light-dark
- `references/layout.md` — clamp, container queries, subgrid, field-sizing, dvh units, math functions
- `references/selectors.md` — :has(), @layer, @scope, nesting
- `references/animation.md` — scroll-driven, @starting-style, view transitions, offset-path
- `references/typography.md` — text-wrap, cap unit, font-size-adjust, ::marker, counter()
- `references/positioning.md` — anchor positioning, logical properties, scroll-margin
- `references/misc.md` — @property, content-visibility, popover, backdrop-filter, blend modes, clip-path
- `references/components.md` — accent-color, env(), media features, scrollbar, margin-trim, scroll-snap
- `references/experimental.md` — interpolate-size, masonry, if(), @function, reading-flow (watch list)
- `references/houdini.md` — Paint Worklet, CSS.registerProperty() (load only when building design systems or custom paint effects)

Load a reference file when you need exact syntax, browser version floors, or `@supports` patterns for a specific feature. Do not load all reference files at once.

---

## Non-Claude Agent Usage

This skill is framework- and model-agnostic. Any agent writing CSS should:

1. Read `package.json` / `.browserslistrc` for targets
2. Map to a tier using the table in Step 2
3. Run the checklist in Step 3 before finalizing output
4. Wrap Tier-3-only features in `@supports`
5. Apply modern features in Tailwind arbitrary values where applicable

The reference files in `references/` are plain markdown — load them as context as needed.
