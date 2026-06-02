# Typography — Modern CSS Reference

## `text-wrap: balance`
**Tier**: 2+ | Chrome 114, Safari 17.5, Firefox 121

Evenly distributes words across lines in headings. Eliminates awkward single-word orphans.
Use on headings — browser limits it to ~6 lines for performance.

```css
h1, h2, h3, h4, .card__title, .hero__headline {
  text-wrap: balance;
}
```

---

## `text-wrap: pretty`
**Tier**: 1+ | Chrome 117, Edge 117 (Safari/Firefox in progress as of 2025)

Like `balance` but for body text — prevents orphaned last words. No line limit.

```css
p, li, blockquote {
  text-wrap: pretty;
}
```

**Combined pattern**:
```css
:is(h1, h2, h3, h4, h5, h6, .heading) { text-wrap: balance; }
:is(p, li, blockquote, figcaption)     { text-wrap: pretty; }
```

---

## `cap` and `lh` Units
**Tier**: 2+ | Chrome 109, Safari 16.4, Firefox 110 (`cap`); Chrome 109, Safari 17, Firefox 120 (`lh`)

- `cap` = height of a capital letter in the current font
- `lh` = current `line-height`
- `rlh` = root `line-height`
- `rex` = x-height of root font

```css
/* Icon aligned to cap height */
.icon {
  width: 1cap;
  height: 1cap;
  vertical-align: middle;
}

/* Textarea min/max in line units */
textarea {
  min-height: 3lh;
  max-height: 20lh;
}

/* Consistent rhythm */
.section {
  padding-block: 2rlh;
}
```

---

## `font-size-adjust`
**Tier**: 2+ | Chrome 127, Safari 17, Firefox 118 (`from-font` value)

Normalizes x-height across font fallbacks so text doesn't jump size while the web font loads.

```css
body {
  font-family: "Inter", system-ui, sans-serif;
  font-size-adjust: from-font; /* auto-reads the primary font's metrics */
}

/* Or manual value */
body {
  font-size-adjust: 0.52; /* x-height ratio */
}
```

---

## `hyphenate-limit-chars`
**Tier**: 2+ | Chrome 109, Safari 17 (Firefox partial)

Fine-grained control over hyphenation — prevent breaking very short words.

```css
p {
  hyphens: auto;
  hyphenate-limit-chars: 8 4 3; /* min-word min-before min-after */
}
```

---

## `initial-letter`
**Tier**: 1+ | Chrome 110, Safari 9 (prefixed), Firefox 130

Drop caps natively.

```css
p::first-letter {
  initial-letter: 3;         /* drops 3 lines */
  color: var(--color-brand);
  margin-right: 0.125em;
}
```
