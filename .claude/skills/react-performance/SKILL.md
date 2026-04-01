# React/Preact Performance Optimization

Adapted from [Vercel Engineering's react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) (68 rules, Jan 2026). Filtered and adjusted for Windrose's Preact/Datacore environment — no Next.js, no RSC, no SSR.

Apply when: writing new components/hooks, reviewing for performance issues, refactoring existing code, or diagnosing re-render problems.

**Note:** Windrose uses Preact via Datacore, not React. `dc.useState`, `dc.useEffect`, etc. replace React hooks. The optimization principles are identical.

---

## Priority 1: Re-render Optimization (MEDIUM-HIGH impact for Windrose)

These matter most because Windrose is a canvas-heavy app with frequent state updates from mouse/touch input.

### 1.1 Don't subscribe to state only used in callbacks

```typescript
// BAD — re-renders on every zoom change even though zoom is only used in the handler
function MyComponent() {
  const [zoom, setZoom] = dc.useState(1);
  const handleClick = dc.useCallback((e) => {
    doSomething(e, zoom);  // zoom in dependency array
  }, [zoom]);
  return <canvas onClick={handleClick} />;
}

// GOOD — ref doesn't cause re-renders
function MyComponent() {
  const [zoom, setZoom] = dc.useState(1);
  const zoomRef = dc.useRef(zoom);
  zoomRef.current = zoom;  // sync ref on every render
  const handleClick = dc.useCallback((e) => {
    doSomething(e, zoomRef.current);  // stable ref, no dep
  }, []);
  return <canvas onClick={handleClick} />;
}
```

**Windrose impact:** `useEventCoordinator.ts` has 20 refs + 36 event listeners. Many handlers read state that changes frequently (zoom, pan offset, tool mode). If these are in dependency arrays, the effects re-run and re-register listeners constantly.

### 1.2 Derive state during render, not in effects

```typescript
// BAD — extra render cycle
const [items, setItems] = dc.useState([]);
const [filteredItems, setFilteredItems] = dc.useState([]);
dc.useEffect(() => {
  setFilteredItems(items.filter(i => i.visible));
}, [items]);

// GOOD — computed inline, no extra state or effect
const [items, setItems] = dc.useState([]);
const filteredItems = items.filter(i => i.visible);
```

**Windrose impact:** With 161 `dc.useEffect` calls across 48 files, some are likely computing derived state that could be inline.

### 1.3 Use functional setState for stable callbacks

```typescript
// BAD — callback recreated when count changes
const increment = dc.useCallback(() => {
  setCount(count + 1);
}, [count]);

// GOOD — no dependency on count
const increment = dc.useCallback(() => {
  setCount(prev => prev + 1);
}, []);
```

### 1.4 Split hooks with independent dependencies

```typescript
// BAD — recomputes both when either dependency changes
const { sorted, stats } = dc.useMemo(() => ({
  sorted: items.sort(compareFn),
  stats: calculateStats(items, filter),
}), [items, filter, compareFn]);

// GOOD — sorted only recomputes when items/compareFn change
const sorted = dc.useMemo(() => items.sort(compareFn), [items, compareFn]);
const stats = dc.useMemo(() => calculateStats(items, filter), [items, filter]);
```

### 1.5 Use refs for transient frequent values

Values that update on every mouse move, scroll, or animation frame should be refs, not state:

```typescript
// BAD — re-renders 60x/sec during drag
const [mousePos, setMousePos] = dc.useState({ x: 0, y: 0 });

// GOOD — ref updated without re-render, read in requestAnimationFrame
const mousePosRef = dc.useRef({ x: 0, y: 0 });
```

**Windrose impact:** Drawing tools, pan/zoom, drag operations all have high-frequency input. Any state that tracks mouse position during active interaction should be a ref.

### 1.6 Don't define components inside components

```typescript
// BAD — new component type every render, loses all child state
function Parent() {
  const Child = () => <div>hello</div>;  // recreated each render
  return <Child />;
}

// GOOD — stable component identity
const Child = () => <div>hello</div>;
function Parent() {
  return <Child />;
}
```

### 1.7 Hoist default non-primitive props

```typescript
// BAD — new object every render, breaks memoization downstream
function MyComponent({ options = { size: 10, color: 'red' } }) { ... }

// GOOD — stable reference
const DEFAULT_OPTIONS = { size: 10, color: 'red' };
function MyComponent({ options = DEFAULT_OPTIONS }) { ... }
```

### 1.8 Put interaction logic in event handlers, not effects

```typescript
// BAD — effect runs after render, may be stale
dc.useEffect(() => {
  if (shouldSave) {
    saveData(data);
    setShouldSave(false);
  }
}, [shouldSave, data]);

// GOOD — save happens immediately in response to user action
const handleSave = dc.useCallback(() => {
  saveData(data);
}, [data]);
```

---

## Priority 2: Event Listener & Cleanup Patterns (HIGH impact for Windrose)

Windrose has 269 addEventListener calls across 33 files. Leaks here are real.

### 2.1 Always clean up event listeners

```typescript
dc.useEffect(() => {
  const handler = (e) => { ... };
  canvas.addEventListener('pointermove', handler);
  return () => canvas.removeEventListener('pointermove', handler);
}, []);  // empty deps = mount/unmount only
```

### 2.2 Use passive listeners for scroll/touch

```typescript
canvas.addEventListener('wheel', handler, { passive: true });
canvas.addEventListener('touchmove', handler, { passive: true });
```

### 2.3 Deduplicate global event listeners

```typescript
// BAD — multiple components each add their own window resize listener
dc.useEffect(() => {
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}, []);

// GOOD — single coordinator manages the listener, notifies subscribers
// (This is what useEventCoordinator.ts should be doing)
```

### 2.4 Store event handlers in refs for stable listeners

```typescript
// The handler logic can change without re-registering the listener
const handlerRef = dc.useRef(handler);
handlerRef.current = handler;

dc.useEffect(() => {
  const stableHandler = (e) => handlerRef.current(e);
  el.addEventListener('click', stableHandler);
  return () => el.removeEventListener('click', stableHandler);
}, []);  // never re-runs
```

**Windrose impact:** This is likely the single biggest performance win available. If event handlers have state in their dependency arrays, the effect re-runs on every state change, removing and re-adding the listener. Using refs makes the listener registration stable.

---

## Priority 3: JavaScript Performance (LOW-MEDIUM but matters for canvas rendering)

### 3.1 Build Map/Set for repeated lookups

```typescript
// BAD — O(n) per lookup in a render loop
objects.forEach(obj => {
  const layer = layers.find(l => l.id === obj.layerId);
});

// GOOD — O(1) per lookup
const layerMap = new Map(layers.map(l => [l.id, l]));
objects.forEach(obj => {
  const layer = layerMap.get(obj.layerId);
});
```

### 3.2 Combine filter + map into single pass

```typescript
// BAD — iterates twice
const visible = items.filter(i => i.visible).map(i => i.render());

// GOOD — single pass with flatMap
const visible = items.flatMap(i => i.visible ? [i.render()] : []);

// Also GOOD — single loop
const visible = [];
for (const i of items) {
  if (i.visible) visible.push(i.render());
}
```

### 3.3 Cache object properties in hot loops

```typescript
// BAD — property access on every iteration
for (let i = 0; i < array.length; i++) { ... }

// GOOD — cached length
for (let i = 0, len = array.length; i < len; i++) { ... }
```

### 3.4 Early return from functions

```typescript
// BAD — deep nesting
function process(item) {
  if (item) {
    if (item.type === 'hex') {
      // 50 lines of logic
    }
  }
}

// GOOD — guard clauses
function process(item) {
  if (!item) return;
  if (item.type !== 'hex') return;
  // 50 lines of logic
}
```

### 3.5 Use requestAnimationFrame for canvas rendering

```typescript
// BAD — immediate render on every state change
dc.useEffect(() => {
  renderCanvas(data);
}, [data]);

// GOOD — batched to frame rate
const rafRef = dc.useRef(0);
dc.useEffect(() => {
  cancelAnimationFrame(rafRef.current);
  rafRef.current = requestAnimationFrame(() => renderCanvas(data));
  return () => cancelAnimationFrame(rafRef.current);
}, [data]);
```

---

## Priority 4: CSS & Rendering Performance

### 4.1 Use content-visibility for off-screen content

```css
.layer-panel-item {
  content-visibility: auto;
  contain-intrinsic-size: 40px;
}
```

### 4.2 Group CSS changes via classes, not inline styles

```typescript
// BAD — triggers layout per property
el.style.width = '100px';
el.style.height = '100px';

// GOOD — single reflow
el.classList.add('expanded');
```

### 4.3 Reduce SVG coordinate precision

```typescript
// BAD
path.setAttribute('d', `M ${x.toFixed(10)} ${y.toFixed(10)}`);

// GOOD — 2 decimal places is plenty for screen rendering
path.setAttribute('d', `M ${x.toFixed(2)} ${y.toFixed(2)}`);
```

---

## What NOT to Optimize

- **Don't memoize simple primitives.** `dc.useMemo(() => a + b, [a, b])` is slower than just `a + b`.
- **Don't split hooks that share most dependencies.** The split only helps when dependencies are independent.
- **Don't optimize code that runs once** (initialization, settings load, etc.).
- **Don't add `dc.useCallback` to every function.** Only when the function is passed as a prop to a memoized child or used in a dependency array.
- **geometry/*.ts and curveBoolean.ts** — these are pure math with no hooks/effects. Micro-optimize the hot loops if profiling shows them as bottlenecks, but don't refactor their structure for "cleanliness."
