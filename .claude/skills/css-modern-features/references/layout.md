# Layout & Sizing — Modern CSS Reference

## `min()`, `max()`, `clamp()`
**Tier**: 2+ | Chrome 79, Safari 11.1, Firefox 75

Replace breakpoint-heavy sizing with fluid, math-driven values.

```css
/* clamp(min, preferred, max) */
h1 { font-size: clamp(1.5rem, 4vw + 1rem, 3.5rem); }
.container { width: clamp(320px, 90%, 1200px); }

/* min() — never exceeds the smallest value */
.sidebar { width: min(300px, 100%); }

/* max() — never goes below the largest value */
.hero { padding: max(2rem, 5vh); }

/* Fluid spacing without any media queries */
:root {
  --space-s: clamp(0.75rem, 1.5vw, 1rem);
  --space-m: clamp(1rem,    2vw,   1.5rem);
  --space-l: clamp(1.5rem,  4vw,   3rem);
}
```

---

## Container Queries
**Tier**: 2+ | Chrome 105, Safari 16, Firefox 110

Style components based on their container size, not the viewport.

```css
/* Define a containment context */
.card-wrapper {
  container-type: inline-size;
  container-name: card; /* optional name */
}

/* Style based on container width */
@container card (min-width: 400px) {
  .card { display: grid; grid-template-columns: 1fr 2fr; }
}

@container (min-width: 600px) {
  .card__title { font-size: 1.5rem; }
}
```

### Container Query Units
```css
/* cqw = 1% of container width, cqh = 1% of container height */
.card__heading {
  font-size: clamp(1rem, 4cqw, 2rem);
}
```

---

## Subgrid
**Tier**: 2+ | Chrome 117, Safari 16, Firefox 71

Align grid items across nested grid contexts.

```css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: auto auto auto;
  gap: 1rem;
}

/* Child participates in parent's tracks */
.card {
  display: grid;
  grid-row: span 3;
  grid-template-rows: subgrid; /* aligns title, body, footer across all cards */
}
```

---

## `aspect-ratio`
**Tier**: 2+ | Chrome 88, Safari 15, Firefox 89

Replace the padding-top hack entirely.

```css
/* Old hack — never do this */
.video-old { padding-top: 56.25%; position: relative; }

/* Modern */
.video { aspect-ratio: 16 / 9; width: 100%; }
.avatar { aspect-ratio: 1; border-radius: 50%; }
.square-grid { aspect-ratio: 1; }
```

---

## `field-sizing: content`
**Tier**: 1+ | Chrome 123, Edge 123 (Safari/Firefox limited as of 2025)

Auto-resize `<input>` and `<textarea>` to fit their content — no JS needed.

```css
textarea {
  field-sizing: content;
  min-height: 3lh;    /* at least 3 lines */
  max-height: 20lh;   /* cap at 20 lines */
  resize: none;       /* no manual resize handle needed */
}

input[type="text"] {
  field-sizing: content;
  min-width: 10ch;
}
```

**`@supports` guard**:
```css
@supports (field-sizing: content) {
  textarea { field-sizing: content; resize: none; }
}
```

---

## Intrinsic Sizing Keywords
**Tier**: 2+ | broadly supported

```css
.sidebar  { width: min-content; }   /* shrinks to smallest content */
.tag      { width: max-content; }   /* grows to full content width */
.card     { width: fit-content(400px); } /* max-content up to 400px */
```

---

## Dynamic Viewport Units
**Tier**: 2+ | Chrome 108, Safari 15.4, Firefox 101

Solve the classic `100vh` mobile browser bar problem.

```css
/* svh = small viewport height (browser UI fully visible)
   lvh = large viewport height (browser UI hidden)
   dvh = dynamic viewport height (updates as UI shows/hides) */

/* Old broken pattern */
.hero { height: 100vh; } /* gets covered by mobile address bar */

/* Modern */
.hero    { height: 100svh; } /* always fully visible */
.overlay { height: 100dvh; } /* tracks actual available height */
.panel   { min-height: 100svh; max-height: 100lvh; }

/* Also: svw, lvw, dvw, svi, lvi, dvi, svb, lvb, dvb, svmin/svmax */
:root {
  --viewport-height: 100dvh;
}
```

---

## CSS Math Functions — `round()`, `mod()`, `rem()`, `abs()`, `sign()`
**Tier**: 2+ | Chrome 125, Safari 15.4, Firefox 118

Snap values to a grid, compute remainders, and handle signs — all in CSS.

```css
/* round(value, step) — snap to grid */
.card {
  width: round(var(--container-width), 8px); /* snap to 8px grid */
}

/* Round to nearest, up, or down */
.font { font-size: round(nearest, 1.7rem, 0.25rem); }
.box  { width: round(up, 33.3%, 1px); }

/* mod() — CSS remainder (sign matches divisor) */
.stripe:nth-child(n) {
  background: oklch(calc(0.9 - mod(var(--i, 0), 3) * 0.1) 0 0);
}

/* abs() — always positive */
.offset { translate: abs(var(--x)) 0; }

/* sign() — returns -1, 0, or 1 */
.arrow {
  rotate: calc(sign(var(--delta)) * 45deg);
}
```
