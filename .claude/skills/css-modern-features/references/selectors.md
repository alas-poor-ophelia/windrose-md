# Selectors & Logic — Modern CSS Reference

## `:has()` Selector
**Tier**: 2+ | Chrome 105, Safari 15.4, Firefox 121

The "parent selector". Conditionally style an element based on what it contains, or based on a sibling.

```css
/* Style a card that contains an image */
.card:has(img) { grid-template-columns: 1fr 2fr; }

/* Form field with error */
.field:has(input:invalid) label { color: oklch(0.55 0.2 30); }

/* Nav item that is or contains the current page link */
.nav-item:has(> [aria-current="page"]) {
  background: var(--color-active-bg);
  font-weight: 600;
}

/* Select the label BEFORE a focused input (sibling, not parent) */
:has(+ input:focus) { color: var(--color-brand); }

/* Table row that has a checked checkbox */
tr:has(input[type="checkbox"]:checked) {
  background: oklch(0.95 0.05 260);
}
```

**`@supports` guard**:
```css
@supports selector(:has(a)) {
  .card:has(img) { grid-template-columns: 1fr 2fr; }
}
```

---

## `:is()` and `:where()`
**Tier**: 2+ | Chrome 88, Safari 14, Firefox 78

Group selectors without repeating them. `:is()` keeps specificity of highest selector. `:where()` has zero specificity.

```css
/* Instead of h1 a, h2 a, h3 a, h4 a */
:is(h1, h2, h3, h4) a { color: var(--color-brand); }

/* Zero-specificity reset */
:where(ul, ol) { list-style: none; margin: 0; padding: 0; }

/* Useful for theming overrides */
:is(.theme-dark, [data-theme="dark"]) .card {
  background: oklch(0.2 0 0);
}
```

---

## CSS Nesting
**Tier**: 2+ | Chrome 112, Safari 17.2, Firefox 117

Native `&` nesting — no preprocessor required.

```css
.card {
  padding: var(--space-m);
  border-radius: var(--radius-md);

  & .card__title {
    font-size: 1.25rem;
  }

  &:hover {
    box-shadow: 0 4px 12px oklch(0 0 0 / 0.1);
  }

  & + & {
    margin-top: var(--space-s);
  }

  @media (min-width: 640px) {
    display: grid;
    grid-template-columns: 1fr 2fr;
  }
}
```

---

## `@layer`
**Tier**: 2+ | Chrome 99, Safari 15.4, Firefox 97

Explicit cascade layer ordering. Kills specificity wars.

```css
/* Declare layer order first — lower = lower priority */
@layer reset, base, components, utilities;

@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
}

@layer components {
  .button { background: var(--color-brand); }
}

@layer utilities {
  .sr-only { position: absolute; width: 1px; clip: rect(0,0,0,0); }
}
```

---

## `@scope`
**Tier**: 1+ | Chrome 118, Safari 17.4 (Firefox in progress as of 2025)

Scoped styles without BEM, data attributes, or CSS Modules.

```css
/* Styles only apply inside .card */
@scope (.card) {
  :scope { padding: 1rem; }
  h2 { font-size: 1.25rem; }
  p  { color: var(--color-muted); }
}

/* Scoped with a donut hole — exclude .card inside .card */
@scope (.card) to (.card) {
  p { font-weight: 500; }
}
```

**`@supports` guard**:
```css
@supports at-rule(@scope) {
  @scope (.card) { h2 { font-size: 1.25rem; } }
}
```

---

## `:nth-child(An+B of S)`
**Tier**: 1+ | Chrome 111, Safari 9, Firefox 113

Filter `nth-child` by a selector — skip non-matching siblings when counting.

```css
/* Every other .post (ignores .ad elements in the count) */
.post:nth-child(2n of .post) {
  background: var(--color-stripe);
}
```
