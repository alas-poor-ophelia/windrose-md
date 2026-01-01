# Custom Hooks

## Purpose

Encapsulate complex stateful logic, side effects, and event handling. Hooks are the bridge between pure utilities and React components.

## Key Hooks

| Hook | Purpose |
|------|---------|
| `useCanvasRenderer` | Coordinates all canvas rendering, manages render loop |
| `useCanvasInteraction` | Mouse/touch event handling on canvas |
| `useDrawingTools` | Drawing tool state and operations |
| `useEventCoordinator` | Centralizes event handling across layers |
| `useObjectInteractions` | Object selection, dragging, placement |
| `useTextLabelInteraction` | Text label editing, positioning |
| `usePanZoomCoordinator` | Pan and zoom state, transforms |
| `useAreaSelect` | Rectangle multi-selection |
| `useGroupDrag` | Multi-object dragging |
| `useDiagonalFill` | Diagonal line fill tool |
| `useDistanceMeasurement` | Distance measuring tool |
| `useFogOfWar` | Fog state and operations |
| `useFogTools` | Fog painting tools |
| `useHistory` | Undo/redo stack |
| `useLayerHistory` | Per-layer history management |
| `useMapData` | Map data loading/saving |
| `useDataHandlers` | Data persistence coordination |
| `useImageAlignment` | Background image positioning |
| `useNotePinInteraction` | Note pin placement/editing |
| `useToolState` | Current tool selection |

## Patterns

### Stable References

Always memoize callbacks and objects to prevent unnecessary re-renders:

```javascript
function useMyHook(dependency) {
  // Good - stable reference
  const handleAction = dc.useCallback((value) => {
    doSomething(value, dependency);
  }, [dependency]);
  
  // Good - memoized object
  const result = dc.useMemo(() => ({
    value: computeExpensive(dependency),
    handler: handleAction
  }), [dependency, handleAction]);
  
  return result;
}
```

### Hook Composition

Hooks can use other hooks:
```javascript
function useDrawingTools() {
  const { geometry } = useMapState();
  const { currentTool } = useToolState();
  const history = useHistory();
  
  // Compose behavior from other hooks
}
```

### Return Shape

Return objects with clear, stable structure:
```javascript
function useSomething() {
  // ...
  
  return {
    // State
    currentValue,
    isActive,
    
    // Actions
    start,
    stop,
    update,
    
    // Computed
    derivedValue
  };
}
```

### Dependency Arrays

Be precise with dependencies:
```javascript
// Good - minimal dependencies
const calculate = dc.useCallback((x) => {
  return x * multiplier;
}, [multiplier]);

// Bad - object reference changes every render
const calculate = dc.useCallback((x) => {
  return x * options.multiplier;
}, [options]); // options is new object each render!
```

## Event Handling Pattern

Event handlers coordinate through `useEventCoordinator`:

```javascript
function useMyInteraction() {
  const { registerHandler } = useEventCoordinator();
  
  dc.useEffect(() => {
    const handler = {
      onPointerDown: (e, coords) => { /* ... */ },
      onPointerMove: (e, coords) => { /* ... */ },
      onPointerUp: (e, coords) => { /* ... */ },
      priority: 10  // Higher = handled first
    };
    
    return registerHandler('myInteraction', handler);
  }, [/* deps */]);
}
```

## Touch Considerations

All interaction hooks must handle touch:
- Use pointer events (not mouse events) where possible
- Handle touch-specific gestures (pinch, two-finger pan)
- Respect touch target sizing
- Consider iPad trackpad as hybrid input

## Adding New Hooks

1. Create `use*.js` file
2. Use `dc.useState`, `dc.useCallback`, `dc.useMemo`, `dc.useEffect`
3. Consume contexts via `useMapState()`, etc.
4. Return stable object references
5. Document with JSDoc
6. Export via `return { useMyHook }`

## Common Gotchas

- **Missing dependencies** - ESLint helps but verify manually
- **Stale closures** - Most "caching" bugs are actually this
- **Unstable references** - Return new object = re-render consumers
- **Effect cleanup** - Always return cleanup function for event listeners
- **Datacore hooks** - Use `dc.useState` not `useState`