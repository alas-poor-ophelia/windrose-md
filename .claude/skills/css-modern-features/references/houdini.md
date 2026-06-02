# Houdini — CSS Paint Worklet & Low-Level APIs

Houdini exposes hooks into the browser's rendering engine. Most of it is superseded by newer
native CSS features — focus on **Paint Worklet** (still uniquely powerful) and `@property` (the
CSS equivalent of `CSS.registerProperty()`).

---

## Paint Worklet (`CSS.paintWorklet`)
**Tier**: 1+ | Chrome 65, Edge 79 | Safari — not supported | Firefox — not supported
**Use with**: `@supports` guard + PNG/SVG fallback

Draw custom backgrounds, borders, and fills using a Canvas-like API — registered as a CSS
`image` value. Useful for: animated gradients, noise textures, custom borders, generative
patterns — without external images or SVG.

### Setup

**worklet file** (`paint-checkerboard.js`):
```js
class CheckerboardPainter {
  static get inputProperties() {
    return ['--checkerboard-size', '--checkerboard-color'];
  }

  paint(ctx, geometry, properties) {
    const size  = parseInt(properties.get('--checkerboard-size')) || 32;
    const color = properties.get('--checkerboard-color').toString().trim() || '#ccc';

    ctx.fillStyle = color;

    for (let y = 0; y < geometry.height; y += size) {
      for (let x = 0; x < geometry.width; x += size) {
        if ((x / size + y / size) % 2 === 0) {
          ctx.fillRect(x, y, size, size);
        }
      }
    }
  }
}

registerPaint('checkerboard', CheckerboardPainter);
```

**Register in JS** (main thread, runs once):
```js
if ('paintWorklet' in CSS) {
  CSS.paintWorklet.addModule('/paint-checkerboard.js');
}
```

**Use in CSS**:
```css
.pattern-bg {
  --checkerboard-size: 20;
  --checkerboard-color: oklch(0.85 0.05 260);

  /* Fallback first */
  background: oklch(0.95 0 0);

  /* Enhancement */
  background: paint(checkerboard);
}
```

### Animated Paint (with `@property`)
```js
class ProgressPainter {
  static get inputProperties() { return ['--progress']; }

  paint(ctx, geo, props) {
    const progress = parseFloat(props.get('--progress')) / 100;
    ctx.fillStyle = 'oklch(0.6 0.2 260)';
    ctx.fillRect(0, 0, geo.width * progress, geo.height);
  }
}

registerPaint('progress-bar', ProgressPainter);
```

```css
@property --progress {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}

.progress {
  background: paint(progress-bar);
  --progress: 0;
  transition: --progress 0.5s ease;
}

.progress.loaded { --progress: 75; }
```

### `@supports` guard pattern
```css
.hero {
  /* Always-works fallback */
  background: linear-gradient(135deg, oklch(0.7 0.15 260), oklch(0.5 0.2 300));
}

@supports (background: paint(anything)) {
  .hero {
    background: paint(noise-gradient);
  }
}
```

---

## `CSS.registerProperty()` — JS equivalent of `@property`
**Tier**: 2+ | Chrome 78, Safari 16.4, Firefox 128

Same as `@property` but registered from JavaScript. Use `@property` in CSS when possible;
use `CSS.registerProperty()` when the initial value is dynamic or computed at runtime.

```js
CSS.registerProperty({
  name: '--theme-hue',
  syntax: '<number>',
  inherits: true,
  initialValue: '260',
});

CSS.registerProperty({
  name: '--card-opacity',
  syntax: '<number>',
  inherits: false,
  initialValue: '1',
});
```

Once registered, the property can be transitioned/animated like a native property:
```css
.card {
  --card-opacity: 1;
  opacity: var(--card-opacity);
  transition: --card-opacity 0.3s;
}

.card:hover { --card-opacity: 0.85; }
```

---

## Layout Worklet *(skip — superseded)*

The CSS Layout Worklet API was meant to let developers define custom layout algorithms.
In practice, native CSS features (subgrid, container queries, masonry) cover the use cases
it was solving. Browser support never materialized beyond Chrome flags. Do not use.

---

## Typed OM (`element.attributeStyleMap`) *(JS territory)*

The CSS Typed Object Model exposes CSS values as typed JS objects rather than strings.
Useful in JS animation loops for performance (avoids string parsing). Not relevant to
CSS authoring — skip unless building a JS animation library or Canvas/WebGL integration.

```js
// Instead of:
el.style.opacity = String(value); // string

// Typed OM:
el.attributeStyleMap.set('opacity', CSS.number(value)); // typed, faster
```

---

## When to Reach for Houdini

| Need | Reach for |
|------|-----------|
| Custom background pattern / texture | Paint Worklet |
| Animating a custom property | `@property` (CSS) or `CSS.registerProperty()` (JS) |
| Masonry layout | `grid-template-rows: masonry` + CSS columns fallback (see `experimental.md`) |
| Custom scroll animation | Scroll-driven animations (see `animation.md`) |
| Gradient borders | `border-image` with gradient, or Paint Worklet for complex shapes |
