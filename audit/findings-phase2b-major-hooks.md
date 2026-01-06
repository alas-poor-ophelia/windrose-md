# Phase 2b: Major Hooks Audit

## Session Metadata
- Date: 2026-01-05
- Files examined: 4 (major hooks)
- Examination depth: Full read of all files

### Files Examined
| File | Lines | Role |
|------|-------|------|
| `useCanvasRenderer.ts` | 1071 | Canvas rendering orchestration |
| `useObjectInteractions.ts` | 1145 | Object placement, selection, dragging, resizing |
| `useDrawingTools.ts` | 945 | Paint, shapes, segments, edges |
| `useEventCoordinator.ts` | 843 | Event routing and coordination |

**Total: ~4,000 lines in 4 files**

---

## Architecture Assessment

### Overall Pattern

The hooks follow a **coordinator pattern**:
1. `useEventCoordinator` - Central event router (no rendering)
2. `useDrawingTools` - Drawing state machine
3. `useObjectInteractions` - Object state machine
4. `useCanvasRenderer` - Pure rendering (no interaction logic)

This is a clean separation of concerns.

### Strengths

**1. Clear Responsibility Separation**
- Rendering (`useCanvasRenderer`) doesn't know about interaction
- Interaction hooks (`useDrawingTools`, `useObjectInteractions`) don't render
- Event routing (`useEventCoordinator`) dispatches to registered handlers

**2. Batched History Management**
Drawing tools use refs to track "stroke" state:
```typescript
strokeInitialStateRef.current = [...activeLayer.cells];
// ... during drag ...
onCellsChange(newCells, true); // skipHistory = true
// ... on stop ...
onCellsChange(activeLayer.cells, false); // Commit to history
```
This gives good undo granularity.

**3. Touch-First Design**
Significant touch handling:
- Multi-touch pinch-zoom detection (lines 178-207 in useEventCoordinator)
- Long-press for edge snap mode (useObjectInteractions)
- Touch preview confirmation for shapes (useDrawingTools)
- `recentMultiTouch` flag to prevent ghost clicks

**4. Layer Visibility Respected**
All interaction code checks `layerVisibility` before processing:
```typescript
if (layerVisibility.objects && objectHandlers?.handleObjectSelection) { ... }
```

---

## Critical (P0) - Must Fix

None identified. The hooks are well-structured and handle edge cases.

---

## Important (P1) - Should Fix Soon

### 1. Object Rendering Doesn't Support Y-Ordering
**Location**: `useCanvasRenderer.ts:312-457`
**Issue**: Objects render in array order, not by any z-index or Y position.
```typescript
for (const obj of activeLayer.objects) {
  // Renders in insertion order
}
```
**Impact**: For 1.6.x Y-level ordering, objects will render incorrectly.
**Recommendation**: Before the render loop, sort objects:
```typescript
const sortedObjects = [...activeLayer.objects].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
```

### 2. No Zoom-Sensitive Visibility
**Location**: `useCanvasRenderer.ts:307-458`, `461-486`
**Issue**: All objects and text labels render at all zoom levels.
**Impact**: For 1.6.x zoom-sensitive visibility, will need filtering.
**Recommendation**: Add filtering before render:
```typescript
const visibleObjects = activeLayer.objects.filter(obj =>
  (obj.minZoom ?? 0) <= zoom && zoom <= (obj.maxZoom ?? Infinity)
);
```

### 3. Large Render Function
**Location**: `useCanvasRenderer.ts:102-1059` - `renderCanvas` is 957 lines
**Issue**: Single function handles grid, cells, objects, text, fog, selections, coordinate display.
**Impact**: Hard to test, hard to modify, risk of bugs during changes.
**Recommendation**: Extract sub-functions:
- `renderBackground()`
- `renderCellLayer()`
- `renderObjectLayer()` ← This is where Y-ordering would go
- `renderTextLayer()`
- `renderFogLayer()`
- `renderSelectionOverlays()`

### 4. Handler Registration is Implicit
**Location**: `useEventCoordinator.ts:127-365`
**Issue**: Handler retrieval uses string keys with type assertions:
```typescript
const drawingHandlers = getHandlers('drawing') as DrawingHandlers | null;
```
If a handler isn't registered, operations silently fail.
**Impact**: Debugging issues with missing handlers is difficult.
**Recommendation**: Consider a registration validation on mount, or at least warn when expected handlers are missing.

---

## Watch List (P2) - Monitor

### 1. Fog of War Rendering Complexity
**Location**: `useCanvasRenderer.ts:488-904` - 416 lines for fog alone
**Issue**: Separate code paths for hex vs grid fog, blur passes, edge detection.
**What to watch**: As features grow, this could become a maintenance burden.
**Recommendation**: Consider extracting to `useFogOfWarRenderer` or a pure function.

### 2. Segment Picker Touch Fallback
**Location**: `useDrawingTools.ts:816-824`
**Issue**: Touch users get a picker UI instead of freehand segment painting.
```typescript
if (isTouch) {
  if (geometry instanceof GridGeometry) {
    openSegmentPicker(gridX, gridY);
  }
} else {
  startSegmentDrawing(e);
}
```
**What to watch**: This UX difference may confuse users or need documentation.

### 3. Object Duplicate Search Pattern
**Location**: `useObjectInteractions.ts:1033-1068`
**Issue**: Complex nested loops to find empty adjacent cell for duplication.
**What to watch**: On large maps with many objects, this could be slow.
**Recommendation**: Profile if users report sluggishness.

### 4. Local Type Declarations
**Location**: Throughout all hooks
**Issue**: Types like `MapStateValue`, `MapOperationsValue` are declared locally in each hook.
```typescript
interface MapStateValue {
  geometry: (IGeometry & { cellSize: number; ... }) | null;
  // ...
}
```
**What to watch**: These could drift out of sync with actual context values.
**Recommendation**: Move to shared type definitions in `types/contexts/`.

### 5. processedCells/processedEdges/processedSegments State
**Location**: `useDrawingTools.ts:158-160`
**Issue**: Uses `Set<string>` state for tracking processed items during drag.
```typescript
setProcessedCells((prev: Set<string>) => new Set([...prev, cellKey]));
```
**What to watch**: Creating new Sets on each cell during drag could be a perf issue on large strokes.
**Recommendation**: Consider using a ref instead of state for non-rendered tracking data.

---

## Notes

### Readiness for 1.6.x Features

| Feature | Hook Impact | Difficulty |
|---------|-------------|------------|
| Y-level ordering | `useCanvasRenderer` - sort before render | Easy |
| Zoom-sensitive visibility | `useCanvasRenderer` - filter before render | Easy |
| Custom image objects | New object type + render path in `useCanvasRenderer` | Medium |
| Radial hex | `useCanvasRenderer` needs to support non-coordinate hexes | Hard |

### Pattern Observations

1. **Handler Registry Pattern**: `useEventCoordinator` uses a handler registry (`getHandlers('drawing')`) to decouple event routing from handlers. Clean pattern.

2. **Ref vs State**: Good use of refs for values that don't need re-renders (e.g., `longPressTimerRef`, `strokeInitialStateRef`).

3. **instanceof Checks**: Frequent checks for `geometry instanceof HexGeometry` vs `GridGeometry`. This is the intended polymorphism pattern.

4. **iOS Defensive Patterns**: Reset `globalAlpha`, `globalCompositeOperation` before rendering. These workarounds are necessary.

---

## Summary

The major hooks are **well-architected** with clean separation of concerns. The coordinator pattern allows independent development of interaction layers.

**Main concern for 1.6.x**: The rendering path doesn't support Y-ordering or zoom-sensitive visibility, but these are **easy additions** - just sort/filter before the existing render loops.

**Main concern for maintainability**: `renderCanvas` at 957 lines is too large. Extracting sub-functions would make it easier to add features like Y-ordering without risk.

**No P0 issues** - the hook code is solid.
