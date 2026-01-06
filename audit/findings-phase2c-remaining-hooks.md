# Phase 2c: Remaining Hooks Audit

## Session Metadata
- Date: 2026-01-05
- Files examined: 16 (remaining hooks after major 4)
- Examination depth: Full read of all files

### Files Examined
| File | Lines | Role |
|------|-------|------|
| `useAreaSelect.ts` | 187 | Rectangle multi-selection |
| `useCanvasInteraction.ts` | 429 | Pan/zoom state and coordinate transforms |
| `useDataHandlers.ts` | 255 | Data change handler factory |
| `useDiagonalFill.ts` | 362 | Diagonal corner fill tool |
| `useDistanceMeasurement.ts` | 154 | Distance measurement tool |
| `useFogOfWar.ts` | 207 | Fog UI state and high-level operations |
| `useFogTools.ts` | 275 | Fog paint/erase/rectangle interactions |
| `useGroupDrag.ts` | 417 | Multi-select group drag operations |
| `useHistory.ts` | 137 | Generic undo/redo stack |
| `useImageAlignment.ts` | 145 | Background image drag positioning |
| `useLayerHistory.ts` | 345 | Per-layer history with caching |
| `useMapData.ts` | 209 | Map loading, autosave, preloading |
| `useNotePinInteraction.ts` | 206 | Note Pin placement and note linking |
| `usePanZoomCoordinator.ts` | 151 | Pan/zoom handler registration |
| `useTextLabelInteraction.ts` | 537 | Text label CRUD and positioning |
| `useToolState.ts` | 89 | Tool/color/opacity state |

**Total: ~4,105 lines in 16 files**

---

## Architecture Assessment

### Overall Pattern

The remaining hooks follow a **single-responsibility pattern**:
1. Each hook owns one feature domain (fog, measurement, text, etc.)
2. Hooks consume context (MapContext, MapSelectionContext, EventHandlerContext)
3. Hooks return handlers and state for their domain
4. No rendering - purely state/logic

This is clean, testable architecture.

### Strengths

**1. Factory Pattern for Data Handlers**
`useDataHandlers.ts` uses a factory to create consistent handlers:
```typescript
const createLayerDataHandler = <T,>(field: LayerField) => {
  return (newValue: T, suppressHistory = false): void => { ... };
};
```
Reduces code duplication for cells/objects/textLabels/edges handlers.

**2. Per-Layer History Caching**
`useLayerHistory.ts` maintains independent undo/redo stacks per layer:
```typescript
layerHistoryCache.current[currentLayerId] = getHistoryState();
```
This prevents layer switches from corrupting history.

**3. Race Condition Prevention**
`useMapData.ts` uses version tracking for async save operations:
```typescript
const currentVersion = ++saveVersionRef.current;
// ... async save ...
if (saveVersionRef.current === currentVersion) {
  // Safe to clear pending
}
```
Prevents data loss when saves overlap.

**4. Touch/Mouse Mode Parity**
All interaction hooks handle both input modes:
- `useDistanceMeasurement`: Click-to-measure (mouse) vs tap-to-lock (touch)
- `useDiagonalFill`: Live preview (mouse) vs tap-confirm (touch)
- `useAreaSelect`: Two-click rectangle for both modes

**5. Batched History for Drags**
`useTextLabelInteraction.ts` and `useGroupDrag.ts` suppress history during drag:
```typescript
onTextLabelsChange(updatedLabels, true); // Suppress history
// ... on stop ...
onTextLabelsChange(getActiveLayer(mapData).textLabels, false); // Single entry
```
Correct undo granularity.

---

## Critical (P0) - Must Fix

None identified. The remaining hooks are focused and well-implemented.

---

## Important (P1) - Should Fix Soon

### 1. History Undo/Redo Race Condition
**Location**: `useHistory.ts:65-93`
**Issue**: `undo()` and `redo()` use `let result` pattern with `setHistoryState`:
```typescript
const undo = dc.useCallback((): T | null => {
  let result: T | null = null;
  setHistoryState((prev: HistoryState<T>) => {
    if (prev.currentIndex > 0) {
      result = prev.history[prev.currentIndex - 1];
      return { ... };
    }
    return prev;
  });
  return result;  // Returns BEFORE state update
}, []);
```
**Impact**: The returned value is from before React's state update completes. This works because `useLayerHistory` applies the result immediately, but it's fragile.
**Recommendation**: Return the state from within the updater or use a ref to ensure consistency.

### 2. Button Position Calculation Complexity
**Location**: `useTextLabelInteraction.ts:402-482`
**Issue**: `calculateRotateButtonPosition()` has 80 lines of coordinate math, including:
- Canvas/container offset calculation
- Canvas rotation compensation
- Text metrics measurement
- Rotated bounding box calculation
- Scale factor application
**Impact**: Hard to maintain, potential for edge case bugs.
**Recommendation**: Extract to utility function with unit tests.

### 3. Local Type Declarations
**Location**: Throughout all hooks
**Issue**: Context types are declared inline in each hook file:
```typescript
interface MapStateValue {
  canvasRef: { current: HTMLCanvasElement | null };
  mapData: MapData | null;
  // ...
}
```
**Impact**: Same as noted in Phase 2b - types could drift from actual context values.
**Recommendation**: Move to shared type definitions in `types/contexts/`.

### 4. Fog Tool Missing History Integration
**Location**: `useFogTools.ts` entire file
**Issue**: Fog paint/erase operations call `onFogChange` per cell, but there's no batched history like drawing tools have.
**Impact**: Undoing a fog stroke might undo cell-by-cell instead of the whole stroke.
**Recommendation**: Add `fogInitialStateRef` pattern like drawing tools use.

---

## Watch List (P2) - Monitor

### 1. processedCells Set Creation During Drag
**Location**: `useFogTools.ts:224`
**Issue**: Creates new Set on each processed cell:
```typescript
setProcessedCells((prev: Set<string>) => new Set([...prev, cellKey]));
```
**What to watch**: Same pattern as noted in `useDrawingTools.ts` - could be perf issue on large strokes.
**Recommendation**: Consider ref instead of state.

### 2. Autosave Timing
**Location**: `useMapData.ts:124-139`
**Issue**: Fixed 2-second debounce for autosave.
**What to watch**: May feel slow for users who want instant confirmation, or too aggressive for users with slow connections.
**Recommendation**: Consider making configurable in settings.

### 3. FoW Image Preload Dependency
**Location**: `useMapData.ts:92-109`
**Issue**: Fog of war image preload depends on `mapData?.settings`:
```typescript
dc.useEffect(() => {
  // ...
}, [mapData?.settings]);
```
**What to watch**: If settings change frequently, this could cause unnecessary preload attempts.
**Recommendation**: Track actual FoW image path change, not all settings changes.

### 4. Group Drag Collision Detection
**Location**: `useGroupDrag.ts:307-328`
**Issue**: O(n²) collision detection between moving and static objects:
```typescript
for (const update of objectUpdates) {
  for (const staticObj of nonSelectedObjects) {
    // Check overlap
  }
}
```
**What to watch**: Could be slow on maps with many objects.
**Recommendation**: Profile if users report sluggishness.

### 5. Text Label Hit Detection
**Location**: `useTextLabelInteraction.ts:140-169`
**Issue**: Uses canvas context for text measurement to determine hit box:
```typescript
const textLabel = getTextLabelAtPosition(
  getActiveLayer(mapData).textLabels,
  worldCoords.worldX,
  worldCoords.worldY,
  ctx
);
```
**What to watch**: If many text labels exist, this could be slow.
**Recommendation**: Consider caching text measurements.

---

## Notes

### Hook Organization

| Category | Hooks |
|----------|-------|
| **Data/State** | useMapData, useHistory, useLayerHistory, useDataHandlers, useToolState |
| **Interaction** | useCanvasInteraction, usePanZoomCoordinator, useAreaSelect, useGroupDrag |
| **Feature Tools** | useDiagonalFill, useDistanceMeasurement, useFogOfWar, useFogTools |
| **Entity Interaction** | useTextLabelInteraction, useNotePinInteraction, useImageAlignment |

### Readiness for 1.6.x Features

| Feature | Hook Impact | Difficulty |
|---------|-------------|------------|
| Y-level ordering | None in these hooks | N/A (rendering concern) |
| Zoom-sensitive visibility | None in these hooks | N/A (rendering concern) |
| Custom image objects | `useNotePinInteraction` pattern could extend | Easy |
| Background images (grid) | `useImageAlignment` works for any geometry | Easy |

### Pattern Observations

1. **Context-Driven Architecture**: All hooks consume from 3-4 contexts (MapContext, MapSelectionContext, EventHandlerContext). This is consistent and predictable.

2. **Ref Pattern for Non-Rendered State**: Good use of refs for:
   - `justSavedRef` in useNotePinInteraction (race condition prevention)
   - `dragInitialStateRef` in useTextLabelInteraction (batched history)
   - `saveVersionRef` in useMapData (async save tracking)

3. **Handler Registration Pattern**: `usePanZoomCoordinator` and `useImageAlignment` register handlers with EventHandlerContext. This decouples event routing from behavior.

4. **Consistent Modal Pattern**: `useNotePinInteraction` and `useTextLabelInteraction` both use:
   - State for modal visibility
   - State for pending/editing entity
   - Submit/cancel handlers that manage both

---

## Summary

The remaining hooks are **clean and well-organized**. They follow consistent patterns:
- Single responsibility per hook
- Context consumption for shared state
- Refs for non-rendered tracking data
- Touch/mouse parity

**Main concern for maintainability**: Local type declarations for context values. Should consolidate to shared types.

**Main concern for correctness**: Fog tools may have cell-by-cell history instead of stroke-level history.

**No P0 issues** - the hook code is solid.
