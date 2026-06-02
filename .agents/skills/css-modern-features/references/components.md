# Component Patterns — Modern CSS Reference

## `accent-color`
**Tier**: 2+ | Chrome 93, Safari 15.4, Firefox 92

One-line theming for native form controls: checkboxes, radios, range inputs, progress bars.
No custom component needed for basic branded forms.

```css
:root {
  accent-color: oklch(0.6 0.2 260);
}

/* Per-element override */
input[type="range"]    { accent-color: oklch(0.7 0.15 150); }
input[type="checkbox"] { accent-color: var(--color-brand); }
```

---

## `::marker` Pseudo-element
**Tier**: 2+ | Chrome 86, Safari 14.1, Firefox 68

Style list bullets and numbers without replacing them with `::before` hacks.

```css
/* Style all markers */
li::marker {
  color: var(--color-brand);
  font-size: 0.75em;
}

/* Ordered list — style the number */
ol li::marker {
  color: oklch(0.6 0.2 260);
  font-weight: 700;
  content: counters(list-item, ".") ". ";
}

/* Custom content */
ul.checklist li::marker {
  content: "✓ ";
  color: oklch(0.6 0.2 145);
}
```

---

## `counter()` / `counter-reset` / `counter-increment`
**Tier**: 2+ | broadly supported

CSS-only numbered steps, progress indicators, section headings — no JS or manual numbering.

```css
/* Step list */
.steps { counter-reset: step; }

.steps li {
  counter-increment: step;
}

.steps li::before {
  content: "Step " counter(step);
  display: block;
  font-weight: 700;
  color: var(--color-brand);
}

/* Nested counters — "1.1", "1.2", "2.1" */
ol {
  counter-reset: section;
  list-style: none;
}

ol li { counter-increment: section; }
ol li::before {
  content: counters(section, ".") " ";
}
```

---

## `env()` Variables
**Tier**: 2+ | Chrome 69, Safari 11.1, Firefox 65

Access environment variables — critical for iOS safe areas (notch, Dynamic Island, home indicator).

```css
/* Safe area padding for iOS */
.navbar {
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

.bottom-nav {
  padding-bottom: max(env(safe-area-inset-bottom), 1rem);
}

/* Combined with custom properties */
:root {
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

Requires in HTML `<meta name="viewport" content="viewport-fit=cover">` to activate safe areas.

---

## Media Feature Queries — Beyond Viewport Size

### `(hover: hover)` and `(pointer: fine)`
**Tier**: 2+ | Chrome 41, Safari 9, Firefox 64

Style differently for touch vs. mouse devices.

```css
/* Only show hover effects on devices that support hover */
@media (hover: hover) {
  .card:hover { transform: translateY(-2px); }
  .button:hover { background: var(--color-brand-dark); }
}

/* Larger tap targets on coarse pointer (touch) */
@media (pointer: coarse) {
  .button { min-height: 44px; padding-inline: 1.5rem; }
  .checkbox { width: 1.5rem; height: 1.5rem; }
}

/* Mouse-optimized density */
@media (pointer: fine) {
  .data-table td { padding: 0.375rem 0.75rem; }
}
```

### `(prefers-contrast: more)`
**Tier**: 2+ | Chrome 96, Safari 14.1, Firefox 101

```css
@media (prefers-contrast: more) {
  :root {
    --color-text: #000000;
    --color-bg:   #ffffff;
    --border-width: 2px;
  }

  .button {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
}
```

### `(display-mode: standalone)`
**Tier**: 2+ | Chrome 45, Safari 13, Firefox 89

Style PWA installs differently from browser tabs.

```css
@media (display-mode: standalone) {
  .install-banner { display: none; } /* already installed */
  .navbar { padding-top: env(safe-area-inset-top); }
}
```

### `(scripting: none)`
**Tier**: 1+ | Chrome 120, Safari 17, Firefox 113

Progressive enhancement — show fallback content when JS is unavailable.

```css
/* Default: JS-enhanced accordion (JS handles open/close) */
.accordion-content { display: none; }

/* No-JS: show all content */
@media (scripting: none) {
  .accordion-content { display: block; }
  .accordion-toggle  { display: none; }
}
```

---

## `attr()` with Type Hints *(expanding support)*
**Tier**: Tier 0 — Chrome 130+ (basic), full typed values in progress

Use HTML data attributes directly as CSS values. Increasingly powerful.

```css
/* Stable: attr() in content */
[data-label]::before {
  content: attr(data-label);
}

/* Experimental: typed attr() — use with @supports */
@supports (width: attr(data-width px)) {
  .bar {
    width: attr(data-width px); /* reads data-width="200" as 200px */
  }
}
```

---

## `scroll-margin` / `scroll-padding`
**Tier**: 2+ | Chrome 69, Safari 14.1, Firefox 68

Offset scroll-to-anchor positions — essential when a sticky header covers anchor targets.

```css
/* Push scroll targets below sticky header */
:root { --header-height: 64px; }

html { scroll-padding-top: var(--header-height); }

/* Or per-element */
.section {
  scroll-margin-top: calc(var(--header-height) + 1rem);
}

/* Smooth scrolling (pair with this) */
html { scroll-behavior: smooth; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
```

---

## `scrollbar-color` / `scrollbar-width`
**Tier**: 2+ | Chrome 121, Safari 18.2, Firefox 64

Style scrollbars natively — no `::-webkit-scrollbar` hack needed.

```css
/* Global */
:root {
  scrollbar-color: oklch(0.6 0.1 260) transparent;
  scrollbar-width: thin; /* auto | thin | none */
}

/* Component-specific */
.sidebar {
  scrollbar-color: var(--color-muted) transparent;
  scrollbar-width: thin;
  overflow-y: auto;
}

/* Hide scrollbar but keep scrollable */
.carousel {
  scrollbar-width: none;
  overflow-x: scroll;
}
```

---

## `margin-trim`
**Tier**: 1+ | Safari 16.4, Chrome 130, Firefox — in progress

Remove the leading/trailing margin of children at the container edge.
Solves the classic "last child has bottom margin" problem without `> *:last-child { margin: 0 }`.

```css
.card-body {
  margin-trim: block;  /* trims block-start of first child, block-end of last */
}

/* Trim inline margins in flex row */
.tag-list {
  display: flex;
  margin-trim: inline;
}
```

**`@supports` guard**:
```css
@supports (margin-trim: block) {
  .card-body { margin-trim: block; }
}
```
