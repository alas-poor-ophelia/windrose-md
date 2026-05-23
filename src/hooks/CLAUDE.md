# Custom Hooks

## Purpose

Encapsulate complex stateful logic, side effects, and event handling. Hooks are the bridge between pure utilities and Preact components.

## Directory Structure

```
hooks/
├── canvas/          # Canvas infrastructure
│   ├── useCanvasRenderer.ts     # Coordinates all canvas rendering
│   ├── useCanvasInteraction.ts  # Mouse/touch event handling
│   ├── useEventCoordinator.ts   # Centralizes event handling across layers
│   └── usePanZoomCoordinator.ts # Pan and zoom state, transforms
├── drawing/         # Drawing tools
│   ├── useDrawingTools.ts       # Drawing tool state and operations
│   ├── usePaintTool.ts          # Cell painting tool
│   ├── useEdgeDragTool.ts       # Edge drag tool
│   ├── useSegmentDragTool.ts    # Segment drag tool
│   ├── useShapeTools.ts         # Rectangle/circle shape tools
│   ├── useSegmentPicker.ts      # Segment picker UI
│   ├── useSegmentHover.ts       # Segment hover feedback
│   └── useDiagonalFill.ts       # Diagonal line fill tool
├── objects/         # Object interactions
│   ├── useObjectInteractions.ts # Object selection, dragging, placement
│   ├── useObjectPlacement.ts    # Object placement logic
│   ├── useObjectDragSelect.ts   # Object drag-select
│   ├── useObjectResize.ts       # Object resize
│   ├── useObjectHover.ts        # Object hover feedback
│   ├── useObjectModifications.ts # Object property changes
│   ├── useObjectUIPositions.ts  # Object UI positioning
│   ├── useObjectModals.ts       # Object-related modals
│   ├── useEdgeSnapModifiers.ts  # Edge snap logic
│   └── useGroupDrag.ts          # Multi-object dragging
├── state/           # State management & data
│   ├── useMapData.ts            # Map data loading/saving
│   ├── useLayerHistory.ts       # Per-layer history management
│   ├── useHistory.ts            # Undo/redo stack
│   ├── useDataHandlers.ts       # Data persistence coordination
│   ├── useToolState.ts          # Current tool selection
│   ├── usePanelState.ts         # Panel visibility state
│   ├── useUILayout.ts           # UI layout calculations
│   └── useViewControls.ts       # View control state
└── interactions/    # Feature-specific tool interactions
    ├── useTextLabelInteraction.ts # Text label editing
    ├── useNotePinInteraction.ts   # Note pin placement/editing
    ├── useAreaSelect.ts           # Rectangle multi-selection
    ├── useFogOfWar.ts             # Fog state and operations
    ├── useFogTools.ts             # Fog painting tools
    ├── useRegionTools.ts          # Region management tools
    ├── useImageAlignment.ts       # Background image positioning
    ├── useDistanceMeasurement.ts  # Distance measuring tool
    ├── useSubHexNavigation.ts     # Sub-hex map navigation
    ├── useAlignmentMode.ts        # Alignment mode
    ├── useKeyboardShortcuts.ts    # Global keyboard shortcuts (undo/redo, layer nav)
    ├── usePlayerFogClear.ts       # Player light radius fog clearing on drop
    ├── useCustomEventHandlers.ts  # Custom event handling
    └── useToolbarPosition.ts      # Toolbar positioning
```

## Patterns

### Stable References

Always memoize callbacks and objects to prevent unnecessary re-renders:

```typescript
import { useCallback, useMemo } from 'preact/hooks';

function useMyHook(dependency: string) {
  const handleAction = useCallback((value: number) => {
    doSomething(value, dependency);
  }, [dependency]);
  
  const result = useMemo(() => ({
    value: computeExpensive(dependency),
    handler: handleAction
  }), [dependency, handleAction]);
  
  return result;
}
```

### Hook Composition

Hooks can use other hooks:
```typescript
function useDrawingTools() {
  const { geometry } = useMapState();
  const { currentTool } = useToolState();
  const history = useHistory();
  
  // Compose behavior from other hooks
}
```

### Return Shape

Return objects with clear, stable structure:
```typescript
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
```typescript
import { useCallback } from 'preact/hooks';

// Good - minimal dependencies
const calculate = useCallback((x: number) => {
  return x * multiplier;
}, [multiplier]);

// Bad - object reference changes every render
const calculate = useCallback((x: number) => {
  return x * options.multiplier;
}, [options]); // options is new object each render!
```

## Event Handling Pattern

Event handlers coordinate through `useEventCoordinator`:

```typescript
import { useEffect } from 'preact/hooks';

function useMyInteraction() {
  const { registerHandler } = useEventCoordinator();
  
  useEffect(() => {
    const handler = {
      onPointerDown: (e: PointerEvent, coords: Point) => { /* ... */ },
      onPointerMove: (e: PointerEvent, coords: Point) => { /* ... */ },
      onPointerUp: (e: PointerEvent, coords: Point) => { /* ... */ },
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

1. Create `use*.ts` file in the appropriate subdirectory
2. Import hooks from `preact/hooks`: `import { useState, useCallback, useMemo, useEffect } from 'preact/hooks'`
3. Consume contexts via `useMapState()`, `useApp()`, etc.
4. Return stable object references
5. Document with JSDoc
6. Export via `export { useMyHook }`

## Common Gotchas

- **Missing dependencies** - ESLint helps but verify manually
- **Stale closures** - Most "caching" bugs are actually this
- **Unstable references** - Return new object = re-render consumers
- **Effect cleanup** - Always return cleanup function for event listeners
