# Color & Theming — Modern CSS Reference

## CSS Custom Properties
**Tier**: 1–4 (universal)

```css
:root {
  --color-brand: oklch(0.6 0.2 260);
  --space-md: 1rem;
  --radius-sm: 0.375rem;
}
```

---

## OKLCH Color Space
**Tier**: 2+ | Chrome 111, Safari 15.4, Firefox 113

Perceptually uniform — equal lightness steps look visually equal. Better for gradients, palettes, and accessible contrast.

```css
/* oklch(lightness chroma hue) */
/* lightness: 0–1, chroma: 0–0.4, hue: 0–360 */

.button {
  background: oklch(0.6 0.2 260);   /* a rich blue */
  color: oklch(0.98 0 0);           /* near-white */
}

/* Gradient that stays vivid (no grey muddy middle) */
.gradient {
  background: linear-gradient(
    to right,
    oklch(0.6 0.2 30),   /* orange */
    oklch(0.6 0.2 260)   /* blue */
  );
}
```

**`@supports` guard for Tier 3**:
```css
.button { background: hsl(220 70% 50%); }
@supports (color: oklch(0 0 0)) {
  .button { background: oklch(0.6 0.2 260); }
}
```

---

## `color-mix()`
**Tier**: 2+ | Chrome 111, Safari 16.2, Firefox 113

Mix two colors in any color space. Replaces SCSS `mix()` and manual rgba opacity tricks.

```css
:root {
  --brand: oklch(0.6 0.2 260);
  --brand-light: color-mix(in oklch, var(--brand) 30%, white);
  --brand-dark:  color-mix(in oklch, var(--brand) 70%, black);
  --brand-muted: color-mix(in oklch, var(--brand), transparent 40%);
}
```

---

## Relative Color Syntax
**Tier**: 1+ | Chrome 119, Safari 16.4, Firefox 128

Derive a new color from an existing one by modifying individual channels.

```css
:root { --brand: oklch(0.6 0.2 260); }

.muted    { color: oklch(from var(--brand) l 0.05 h); }  /* desaturate */
.lighter  { color: oklch(from var(--brand) calc(l + 0.2) c h); }
.opposite { color: oklch(from var(--brand) l c calc(h + 180)); }
```

**`@supports` guard**:
```css
@supports (color: oklch(from red l c h)) {
  .muted { color: oklch(from var(--brand) l 0.05 h); }
}
```

---

## `light-dark()` Function
**Tier**: 1+ | Chrome 123, Safari 17.5, Firefox 120

Single declaration that adapts to `prefers-color-scheme` and `color-scheme` property. Replaces dual `@media` blocks.

```css
:root {
  color-scheme: light dark; /* required */

  --bg:   light-dark(#ffffff, #1a1a1a);
  --text: light-dark(#111111, #eeeeee);
  --card: light-dark(oklch(0.97 0 0), oklch(0.2 0 0));
}

/* Also works inline */
.alert {
  background: light-dark(oklch(0.95 0.05 110), oklch(0.25 0.05 110));
}
```

**`@supports` guard**:
```css
@supports (color: light-dark(#000, #fff)) {
  :root { --bg: light-dark(#fff, #111); }
}
```

---

## `color-contrast()` *(limited support — use cautiously)*
**Tier**: experimental | Only Safari TP as of 2025

Automatically picks the highest-contrast color from a list against a background.
Wrap in `@supports` and always provide a fallback.

```css
@supports (color: color-contrast(white vs black, blue)) {
  .label {
    color: color-contrast(var(--bg) vs black, white);
  }
}
```
