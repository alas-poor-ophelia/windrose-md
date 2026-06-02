# Experimental CSS — Watch List

Features that are in-spec and actively shipping but **not yet safe for production** without
explicit opt-in. Either behind a flag, single-engine only, or syntax still in flux.

Check [caniuse.com](https://caniuse.com) and [chromestatus.com](https://chromestatus.com) before using any of these.
Always wrap in `@supports`. Always provide a full functional fallback.

---

## `if()` Inline Conditionals
**Status**: Chrome 137+ (Origin Trial / flag) | No Safari/Firefox as of 2025
**Spec**: [CSS Values 5](https://drafts.csswg.org/css-values-5/#if-notation)

CSS-native conditional logic without custom properties tricks or JS class toggling.

```css
/* Syntax: if(condition: value; else: fallback) */
.button {
  background: if(
    style(--variant: danger): oklch(0.55 0.2 25);
    style(--variant: success): oklch(0.55 0.2 145);
    else: oklch(0.6 0.2 260)
  );
}
```

**Do not use in production yet.** Syntax may change before stable release.

---

## `@function`
**Status**: Chrome 137+ (flag) | No Safari/Firefox as of 2025
**Spec**: [CSS Functions and Mixins](https://drafts.csswg.org/css-mixins/)

Define reusable CSS functions natively — no preprocessor needed.

```css
@function --fluid-size(--min, --max, --from: 320px, --to: 1200px) {
  result: clamp(
    var(--min),
    calc(var(--min) + (var(--max) - var(--min)) * ((100vw - var(--from)) / (var(--to) - var(--from)))),
    var(--max)
  );
}

h1 { font-size: --fluid-size(1.5rem, 3rem); }
```

**Do not use in production yet.** This is a significant addition and will see iteration.

---

## `interpolate-size: allow-keywords`
**Status**: Chrome 129+, Edge 129+ | Safari/Firefox in progress as of 2025
**Spec**: [CSS Values 5](https://drafts.csswg.org/css-values-5/#interpolate-size)

Solves the decade-old problem of animating to/from intrinsic size keywords like `height: auto`,
`width: max-content`, `height: fit-content`.

```css
/* Opt in at root */
:root {
  interpolate-size: allow-keywords;
}

/* Now this actually works */
.accordion-content {
  height: 0;
  overflow: hidden;
  transition: height 0.3s ease;
}

.accordion-content.is-open {
  height: auto; /* animates! */
}
```

**Tier 0** — safe to use with `@supports` guard for Tier 1 targets. Tier 2+ still needs JS fallback.

```css
@supports (interpolate-size: allow-keywords) {
  :root { interpolate-size: allow-keywords; }

  .accordion-content {
    height: 0;
    overflow: hidden;
    transition: height 0.3s;
  }

  .accordion-content.is-open { height: auto; }
}
```

---

## `masonry` Grid Layout
**Status**: Chrome 133+ (flag `enable-experimental-web-platform-features`) | Firefox 77+ (flag) | Safari — proposed alternate syntax
**Spec**: [CSS Grid Level 3](https://drafts.csswg.org/css-grid-3/)

Native Pinterest-style masonry layout — no JS column splitting needed.

```css
/* Chrome / Chromium proposal */
.masonry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  grid-template-rows: masonry;
  gap: 1rem;
}

/* Safari / WebKit alternate proposal */
.masonry-grid {
  display: masonry;
  masonry-template-tracks: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}
```

**Fallback**: CSS columns or a JS library like Masonry.js.

```css
/* CSS columns fallback */
.masonry-grid {
  columns: 3 250px;
  gap: 1rem;
}

@supports (grid-template-rows: masonry) {
  .masonry-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    grid-template-rows: masonry;
    columns: unset;
  }
}
```

---

## `reading-flow`
**Status**: Chrome 133+ (flag) | No Safari/Firefox as of 2025
**Spec**: [CSS Display 4](https://drafts.csswg.org/css-display-4/#reading-flow)

Control tab order and reading order based on visual layout rather than DOM order —
no more `tabindex` juggling when CSS Grid reorders items visually.

```css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  reading-flow: grid-order; /* tab follows visual grid order */
}

/* Also: flex-visual, flex-flow */
.flex-reversed {
  display: flex;
  flex-direction: row-reverse;
  reading-flow: flex-visual;
}
```

---

## `sibling-count()` / `sibling-index()`
**Status**: Chrome — in development | Not yet in stable browsers as of 2025
**Spec**: [CSS Values 5](https://drafts.csswg.org/css-values-5/)

Style elements based on their index or total sibling count — staggered animations,
dynamic grid sizing, color sequences without JS.

```css
/* Staggered animation delay */
.list-item {
  animation-delay: calc(sibling-index() * 100ms);
}

/* Wider items when fewer siblings */
.tag {
  font-size: calc(1rem + (1 / sibling-count()) * 0.5rem);
}
```

**Not production-ready.** Watch for Chrome stable release.

---

## `@media (prefers-color-scheme)` + `color-scheme` vs `light-dark()`
**Note**: Not experimental — clarifying the recommended modern pattern.

Prefer `light-dark()` (see `color.md`) over two separate `@media` blocks.
Use `color-scheme: light dark` on `:root` to get browser UI (scrollbars, form controls) to adapt too.

```css
/* ✅ Modern */
:root {
  color-scheme: light dark;
  --bg: light-dark(#fff, #111);
}

/* ❌ Legacy (still works, just more verbose) */
:root { --bg: #fff; }
@media (prefers-color-scheme: dark) { :root { --bg: #111; } }
```
