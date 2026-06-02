# Positioning — Modern CSS Reference

## Anchor Positioning
**Tier**: 1+ | Chrome 125, Edge 125 (Safari/Firefox in progress as of 2025)

Position an element relative to any other element on the page — no JS `getBoundingClientRect()` needed.
Perfect for tooltips, popovers, dropdowns, floating labels.

```css
/* 1. Name the anchor */
.trigger {
  anchor-name: --my-anchor;
}

/* 2. Position relative to it */
.tooltip {
  position: absolute;
  position-anchor: --my-anchor;

  /* anchor() references anchor's edges */
  top:    anchor(bottom);     /* tooltip top = anchor bottom */
  left:   anchor(center);
  translate: -50% 0;          /* center horizontally */
  margin-top: 0.5rem;
}

/* 3. Fallback positions with @position-try */
@position-try --flip-above {
  top:    auto;
  bottom: anchor(top);
  margin-top: 0;
  margin-bottom: 0.5rem;
}

.tooltip {
  position-try-fallbacks: --flip-above, --flip-left;
  position-try-order: most-width; /* pick the position with most space */
}
```

**`@supports` guard**:
```css
@supports (anchor-name: --x) {
  .tooltip {
    position: absolute;
    position-anchor: --my-anchor;
    top: anchor(bottom);
  }
}
```

---

## `inset` Shorthand
**Tier**: 2+ | Chrome 87, Safari 14.1, Firefox 87

```css
/* Old */
.overlay { top: 0; right: 0; bottom: 0; left: 0; }

/* Modern */
.overlay { inset: 0; }
.modal   { inset: 1rem; }
.tooltip { inset: auto auto 0 50%; } /* top right bottom left */
```

---

## Logical Properties
**Tier**: 2+ | Chrome 89, Safari 15, Firefox 87

Writing-mode aware layout — essential for i18n (RTL, vertical text).

```css
/* Physical → Logical */
margin-left   → margin-inline-start
margin-right  → margin-inline-end
margin-top    → margin-block-start
margin-bottom → margin-block-end

/* Shorthands */
.card {
  margin-inline:  auto;          /* left+right: auto */
  margin-block:   var(--space-m); /* top+bottom */
  padding-inline: var(--space-l);
  padding-block:  var(--space-m);

  border-inline-start: 3px solid var(--color-brand); /* left in LTR, right in RTL */
}

/* Sizing */
.icon {
  inline-size:  1.5rem;  /* width */
  block-size:   1.5rem;  /* height */
  max-inline-size: 100%; /* max-width */
}
```

---

## `position: sticky` with Logical Offsets
**Tier**: 2+

```css
.sticky-header {
  position: sticky;
  inset-block-start: 0; /* logical top: 0 */
  z-index: 10;
}
```
