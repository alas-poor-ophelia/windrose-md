# Freehand Drawing/Outlining - Implementation Plan

## Status
**Planning Complete** - Ready for implementation

## Overview

Enable organic, freehand drawing (jagged cavern corridors, natural coastlines) that integrates seamlessly with Windrose's existing cell-based map system. Users can draw smooth curves that blend with painted cells, share borders, and support cell-by-cell erasure.

## Recommended Approach: Vector Paths with Boolean Cell Erasure (C2)

Store paths as vector geometry, render with true bezier curves, use "virtual cells" for border integration, and support cell-by-cell erasure via polygon boolean subtraction.

### Why This Approach

1. **True curves**: Path rendering uses Canvas 2D bezier curves - genuinely smooth, not grid-approximated
2. **Integration**: Virtual cells contribute to `CellLookup` - borders automatically merge with adjacent painted cells
3. **Cell-by-cell erasure**: Boolean subtraction modifies path geometry when erasing - paths can split, shrink, or get cut
4. **Future-proof**: Stored points enable future point-editing tools
5. **Hex extensible**: Path storage is geometry-agnostic; only rasterization needs geometry awareness

### Key Tradeoff

When you erase a cell from a path, the cut edges are straight (cell-boundary-aligned) while the rest remains smooth. This is acceptable for v1 - advanced smoothing could come with future editing tools.

---

## Data Model

### New Type: `FreehandPath`

```typescript
// types/core/freehand.types.ts (new file)
interface FreehandPath {
  id: string;
  points: Point[];           // Simplified points (post-RDP compression)
  color: string;
  opacity: number;
  filled: boolean;           // true = fill interior, false = stroke only
  strokeWidth?: number;      // For unfilled strokes (default: 2)
  closed: boolean;           // Whether path forms closed loop
}
```

**Storage optimization**: Raw input points are simplified via Ramer-Douglas-Peucker (RDP) algorithm on commit. Typical 80-90% reduction (500 raw points → 30-50 stored points) while maintaining visual fidelity.

### Extended `MapLayer`

```typescript
// types/core/map.types.ts - add to MapLayer interface
interface MapLayer {
  // ... existing fields
  freehandPaths?: FreehandPath[];  // New optional field
}
```

---

## Rendering Integration

### Current Pipeline (useCanvasRenderer.ts)
```
1. Grid lines
2. Simple cells (renderPaintedCells)
3. Segment cells (segmentRenderer)
4. Interior grid lines
5. Build allCellsLookup ← LINE 194
6. Cell borders (renderCellBorders)
7. Segment borders
8. Edges, objects, text, fog
```

### Modified Pipeline
```
1. Grid lines
2. Simple cells
3. Segment cells
4. Freehand path fills (smooth curves) ← NEW
5. Interior grid lines
6. Build unified lookup (cells + virtual cells from paths) ← MODIFIED
7. Cell borders (unchanged - sees virtual cells)
8. Segment borders
9. Freehand path strokes (if unfilled) ← NEW
10. Edges, objects, text, fog
```

### Key Integration Point

```typescript
// useCanvasRenderer.ts ~line 194
// BEFORE:
const allCellsLookup = buildCellLookup(cellsWithColor);

// AFTER:
const allCellsLookup = buildUnifiedCellLookup(
  cellsWithColor,
  layer.freehandPaths || [],
  geometry
);
```

The `buildUnifiedCellLookup` function:
1. Builds normal lookup from cells
2. For each filled path, rasterizes to virtual cells
3. Adds virtual cell coordinates to lookup
4. Returns unified lookup

Border calculation sees ALL covered cells - real and virtual - and automatically draws exterior-only borders around the combined region.

---

## Core Algorithms

### Path Smoothing (Catmull-Rom Spline)

Converts discrete input points into smooth bezier curves for rendering:

```typescript
function smoothPathForRendering(points: Point[], tension = 0.5): Path2D {
  const path = new Path2D();
  if (points.length < 2) return path;

  path.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Catmull-Rom to bezier control points
    const cp1x = p1.x + (p2.x - p0.x) / 6 * tension;
    const cp1y = p1.y + (p2.y - p0.y) / 6 * tension;
    const cp2x = p2.x - (p3.x - p1.x) / 6 * tension;
    const cp2y = p2.y - (p3.y - p1.y) / 6 * tension;

    path.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  return path;
}
```

### Point Simplification (Ramer-Douglas-Peucker)

Reduces storage size by 80-90% while preserving shape:

```typescript
function simplifyPath(points: Point[], epsilon: number): Point[] {
  // Find point furthest from line between start and end
  // If distance > epsilon, recursively simplify both halves
  // Otherwise, discard intermediate points
}
```

### Virtual Cell Rasterization (Point-in-Polygon)

Determines which grid cells a path covers for border integration:

```typescript
function rasterizePathToCells(
  path: FreehandPath,
  geometry: IGeometry
): Set<string> {
  if (!path.filled) return new Set();

  const virtualCells = new Set<string>();
  const bounds = getPathBounds(path.points);

  // Convert bounds to grid coordinates
  const minGrid = geometry.screenToGrid(bounds.minX, bounds.minY);
  const maxGrid = geometry.screenToGrid(bounds.maxX, bounds.maxY);

  // Scan cells in bounding box
  for (let x = minGrid.x - 1; x <= maxGrid.x + 1; x++) {
    for (let y = minGrid.y - 1; y <= maxGrid.y + 1; y++) {
      const cellCenter = geometry.gridToScreen(x, y);
      const cx = cellCenter.x + geometry.cellSize / 2;
      const cy = cellCenter.y + geometry.cellSize / 2;

      if (pointInPolygon({ x: cx, y: cy }, path.points)) {
        virtualCells.add(`${x},${y}`);
      }
    }
  }

  return virtualCells;
}
```

### Polygon Boolean Subtraction (Sutherland-Hodgman)

Enables cell-by-cell erasure by subtracting cell rectangles from paths:

```typescript
function subtractCellFromPath(
  path: FreehandPath,
  cellX: number,
  cellY: number,
  geometry: IGeometry
): FreehandPath[] {
  // Compute cell polygon (rectangle)
  // Run Sutherland-Hodgman clipping: path - cell
  // Return resulting polygon(s) - may be 0, 1, or 2+ paths
}
```

---

## Tool UX Flow

### Freehand Draw Tool

**Desktop (mouse/trackpad):**
1. Select freehand tool from palette
2. Pointer down: start collecting points
3. Pointer move: add points, render smooth preview
4. Pointer up: commit path to layer
5. Path initially unfilled (outline only)

**Fill operation:**
1. Draw closed path (end near start auto-closes)
2. OR click inside existing closed path to fill
3. Sets `filled: true`, re-renders with fill

**Touch:**
- Same as desktop drag
- Consider higher point sampling threshold for finger

### Tool States
- `freehand` - Draw outlines
- Future: `freehandFill` - Paint filled regions directly (1.7.x roadmap)

---

## Erasure (Boolean Subtraction)

### How It Works

When erasing a cell that intersects a filled path:

1. **Detect intersection**: Check if cell overlaps any path (via virtual cell lookup)
2. **Compute subtraction**: `new_geometry = path_polygon - cell_square`
3. **Handle results**:
   - Single modified path (edge trimmed)
   - Multiple paths (corridor cut in two)
   - Path with hole (cell in middle - rare for thin shapes)
4. **Update storage**: Replace original path with result(s)

### Visual Example

```
Before erasing (3,2):        After:
    ╭───────╮                  ╭──╮   ╭──╮
   ╱         ╲                ╱   │   │   ╲
  │           │      →       │    ╵   ╵    │
   ╲         ╱                ╲   │   │   ╱
    ╰───────╯                  ╰──╯   ╰──╯

  Original smooth         Two paths - smooth where original,
  closed path             straight at cell boundary cuts
```

### Erasure on Normal Cells

Works exactly as today - removes the cell from `layer.cells[]`. No interaction with paths unless the cell happens to be inside a path (in which case both the cell AND the path portion get removed).

### Stroke-Level Deletion

Still supported: click to select a path, Delete key removes the entire path.

---

## Files to Modify

### New Files
- `types/core/freehand.types.ts` - FreehandPath interface
- `src/rendering/freehandRenderer.ts` - Path rendering (Catmull-Rom smoothing, Path2D)
- `src/utils/pathRasterizer.ts` - Virtual cell generation (point-in-polygon)
- `src/utils/pathSimplify.ts` - RDP algorithm for point reduction
- `src/utils/polygonBoolean.ts` - Sutherland-Hodgman clipping for cell subtraction
- `src/hooks/useFreehandDrawing.ts` - Tool interaction hook

### Modified Files
- `types/core/map.types.ts` - Add freehandPaths to MapLayer
- `types/tools/tool.types.ts` - Add 'freehand' to ToolId
- `src/hooks/useCanvasRenderer.ts` - Integrate path rendering + unified lookup
- `src/components/ToolPalette.tsx` - Add freehand tool button
- `src/hooks/useEventCoordinator.ts` - Route freehand tool events
- `src/hooks/useDrawingTools.ts` - Add path erasure logic (boolean subtraction)
- `src/utils/layerAccessor.ts` - Add path accessor functions

---

## Implementation Phases

### Phase 1: Data Model & Storage
- Create `FreehandPath` type in `types/core/freehand.types.ts`
- Add `freehandPaths` to `MapLayer` interface
- Add path accessor functions to `layerAccessor.ts`
- File save/load works automatically (JSON handles arrays)

### Phase 2: Core Algorithms
- `pathSimplify.ts` - RDP algorithm for point reduction on commit
- `pathRasterizer.ts` - Point-in-polygon for virtual cell detection
- `polygonBoolean.ts` - Sutherland-Hodgman for cell subtraction
- Unit tests for all three algorithms

### Phase 3: Path Rendering
- Create `freehandRenderer.ts` with Catmull-Rom smoothing
- Render strokes and fills using Path2D
- Integrate into render pipeline (after segment cells, before borders)
- Create `buildUnifiedCellLookup` for border integration
- Test: manually add path to fixture data, verify smooth rendering + border merge

### Phase 4: Drawing Tool
- Add `freehand` to ToolId
- Create `useFreehandDrawing.ts` hook
- Handle pointer events, point collection during drag
- RDP simplification on commit
- Add tool to palette
- Test: draw paths, verify they persist and render

### Phase 5: Fill & Close
- Auto-close detection (end within threshold of start)
- Paths default to `filled: true, closed: true` when auto-closed
- Unfilled strokes for open paths

### Phase 6: Cell Erasure
- Detect when erase tool hits a path (via virtual cell lookup)
- Run boolean subtraction on affected path(s)
- Handle path splitting (one path becomes multiple)
- Integrate with undo/redo system
- Test: erase cells from paths, verify geometry updates correctly

### Phase 7: Polish
- Path selection (click to select)
- Whole-path deletion (Delete key)
- Touch device testing
- Performance validation with many paths

---

## Verification

### Unit Tests
- **RDP simplification**: Input points → reduced points within epsilon tolerance
- **Point-in-polygon**: Known polygons with test points inside/outside
- **Sutherland-Hodgman**: Polygon minus rectangle produces expected result
- **Path splitting**: Clipping that bisects polygon produces two polygons
- **Virtual cell rasterization**: Path covers expected cells

### E2E Tests
- Draw freehand path, verify renders smoothly
- Draw filled path adjacent to painted cells, verify borders merge
- Erase cell from path, verify geometry updates (path shrinks or splits)
- Delete entire path, verify removal
- Save/reload map, verify paths persist

### Manual Testing
- Draw organic cavern corridor shape
- Paint standard cells adjacent to path - verify unified border
- Erase a cell from the corridor - verify it splits into two paths
- Zoom in/out, verify rendering at all scales
- Draw many paths, verify performance remains acceptable

---

## Design Decisions Log

### Visual Quality vs Integration
**Decision**: True curves with virtual cells for border integration

Considered approaches:
1. Enhanced segments (16/32 per cell) - Still chunky, rejected
2. Cell-based freehand + flood fill - Too chunky, rejected
3. Rasterize-on-commit - Loses curves, rejected
4. Path objects (separate layer) - Doesn't integrate, rejected
5. **Virtual cells from paths** - Selected: true curves + seamless integration
6. Marching squares - Approximates curves, less control

### Erasure Model
**Decision**: C2 Boolean subtraction (cell-by-cell modifies geometry)

Considered approaches:
1. Stroke-level only - Too coarse
2. **C1 Exclusion mask** - Square holes in smooth shapes, acceptable fallback
3. **C2 Boolean subtraction** - Selected: proper geometry modification
4. C3 Cell-derived smoothing - Loses original curves

### Storage Optimization
**Decision**: RDP compression (80-90% point reduction)

Raw freehand input generates many points. RDP simplification on commit reduces storage while preserving visual fidelity. Catmull-Rom smoothing at render time recreates the curve.

### Hex Support
**Decision**: Grid-only for v1, architecture supports future hex

Path storage is geometry-agnostic (just points). Only rasterization and coordinate transforms need geometry awareness. Hex support can be added later without data model changes.

---

## Future Enhancements (Post-v1)

- **Point editing**: Select and drag individual control points
- **Bezier handles**: Explicit curve control for precision
- **Path smoothing on erase**: Regenerate smooth curves after cell removal
- **Freehand brush tool**: Paint filled regions directly (no outline-then-fill)
- **Path combining**: Merge adjacent paths into single shape
- **Hex support**: Extend rasterization for hex geometry

---

## Implementation Gap Analysis (January 2026)

An initial implementation was started but diverged from this spec. This section documents what exists, what's missing, and the remediation plan.

### What Was Implemented

| Spec Requirement | Actual Implementation | Status |
|-----------------|----------------------|--------|
| Data Model | `types/core/curve.types.ts` with `Curve` interface | ✅ Equivalent |
| MapLayer integration | `curves: Curve[]` in `MapLayer` | ✅ Done |
| Path Smoothing (Catmull-Rom) | `src/geometry/curveMath.ts` | ✅ Done |
| Point Simplification (RDP) | `src/geometry/curveMath.ts` | ✅ Done |
| Path Rendering | `src/geometry/curveRenderer.ts` | ✅ Done |
| Drawing Tool | `src/hooks/useDrawingTools.ts` | ✅ Done |
| Tool Palette | `freehandDraw` in ToolPalette.tsx | ✅ Done |
| Auto-close detection | Checks if end point near start | ✅ Done |
| E2E Tests | `tests/e2e/freehand-curves.test.ts` | ✅ Done |

### What's Missing

| Spec Requirement | Status |
|-----------------|--------|
| Virtual Cell Rasterization (`pathRasterizer.ts`) | ❌ Not created |
| Unified Cell Lookup (`buildUnifiedCellLookup`) | ❌ Not implemented |
| Polygon Boolean Subtraction (`polygonBoolean.ts`) | ❌ Not created |
| Cell-by-cell erasure | ❌ Current impl deletes entire curves |
| Border integration with paths | ❌ Paths don't contribute to lookup |

### Implementation Divergence

The initial implementation took a **hybrid approach** that differs from this spec:

**Spec approach**:
- Store paths as vector geometry with `filled: true`
- Use virtual cells for border integration
- Support boolean subtraction for cell-by-cell erasure

**Actual approach** (in `useDrawingTools.ts` lines 577-602):
- When drawing closed shapes, immediately paint **actual cells** for the interior
- Store only the curve outline with `filled: false`
- Erasure deletes whole curves, not cell-by-cell subtraction

This hybrid approach means:
- ✅ Cell erasure works for fill (uses normal cell erasure)
- ✅ Borders naturally merge (cells contribute to lookup)
- ❌ Loses smooth curve geometry for filled areas
- ❌ Curve outline deleted as whole stroke, not cell-by-cell

---

## Remediation Plan

### Phase R1: Path Rasterizer (Virtual Cells)

**New file**: `src/utils/pathRasterizer.ts`

```typescript
/**
 * Get bounding box of path points
 */
function getPathBounds(points: CurvePoint[]): BoundingBox;

/**
 * Point-in-polygon test using ray casting
 */
function pointInPolygon(point: CurvePoint, polygon: CurvePoint[]): boolean;

/**
 * Rasterize a filled path to virtual cell coordinates
 */
function rasterizePathToCells(
  path: Curve,
  geometry: IGeometry
): Set<string>;

/**
 * Rasterize multiple paths
 */
function rasterizePathsToCells(
  paths: Curve[],
  geometry: IGeometry
): Set<string>;
```

**Unit tests**: `tests/unit/utils/pathRasterizer.test.ts`

---

### Phase R2: Polygon Boolean Operations

**New file**: `src/utils/polygonBoolean.ts`

```typescript
/**
 * Clip polygon against convex clip polygon (Sutherland-Hodgman)
 */
function clipPolygon(
  subject: CurvePoint[],
  clip: CurvePoint[]
): CurvePoint[];

/**
 * Subtract a rectangle from a polygon
 * Returns 0, 1, or 2+ resulting polygons
 */
function subtractRectFromPolygon(
  polygon: CurvePoint[],
  rect: BoundingBox
): CurvePoint[][];

/**
 * Subtract a cell from a path
 */
function subtractCellFromPath(
  path: Curve,
  cellX: number,
  cellY: number,
  geometry: IGeometry
): Curve[];
```

**Unit tests**: `tests/unit/utils/polygonBoolean.test.ts`

---

### Phase R3: Unified Cell Lookup

**File**: `src/hooks/useCanvasRenderer.ts`

Modify line ~199:

```typescript
// BEFORE:
const allCellsLookup = buildCellLookup(cellsWithColor);

// AFTER:
const allCellsLookup = buildUnifiedCellLookup(
  cellsWithColor,
  activeLayer.curves || [],
  geometry
);
```

Add helper function:

```typescript
function buildUnifiedCellLookup(
  cells: Cell[],
  curves: Curve[],
  geometry: IGeometry
): CellMap {
  const lookup = buildCellLookup(cells);
  const virtualCells = rasterizePathsToCells(
    curves.filter(c => c.filled),
    geometry
  );
  for (const key of virtualCells) {
    if (!lookup.has(key)) {
      lookup.set(key, { virtual: true });
    }
  }
  return lookup;
}
```

---

### Phase R4: Fix Drawing Tool

**File**: `src/hooks/useDrawingTools.ts`

Remove cell-painting for closed shapes (lines 577-590). Instead:

```typescript
const template: CurveTemplate = {
  points: simplifiedPoints,
  color: selectedColor,
  opacity: 1,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  smoothing: DEFAULT_SMOOTHING,
  closed: isClosedShape,
  filled: isClosedShape,  // TRUE for closed shapes
};
```

---

### Phase R5: Cell-by-Cell Erasure

**File**: `src/hooks/useDrawingTools.ts`

In erase logic, after checking for curve at point:

```typescript
// Check if erase cell intersects any FILLED path
const erasedCell = geometry.worldToGrid(worldX, worldY);
const filledPaths = curves.filter(c => c.filled);

for (const path of filledPaths) {
  const virtualCells = rasterizePathToCells(path, geometry);
  const cellKey = `${erasedCell.x},${erasedCell.y}`;

  if (virtualCells.has(cellKey)) {
    // Subtract cell from path
    const resultPaths = subtractCellFromPath(
      path, erasedCell.x, erasedCell.y, geometry
    );

    // Remove original, add results
    let newCurves = removeCurve(curves, path.id);
    for (const result of resultPaths) {
      newCurves = addCurve(newCurves, result);
    }

    onCurvesChange(newCurves, isBatchedStroke);
    return;
  }
}
```

---

### Phase R6: Additional Tests

**Unit tests** (~300 lines):
- `tests/unit/utils/pathRasterizer.test.ts`
- `tests/unit/utils/polygonBoolean.test.ts`

**E2E tests** (extend `freehand-curves.test.ts`):
- Filled path borders merge with adjacent painted cells
- Erasing cell from filled path modifies geometry
- Erasing cell that splits path creates two paths

---

### Estimated Effort

| Phase | Description | Lines |
|-------|-------------|-------|
| R1 | Path Rasterizer | ~120 |
| R2 | Polygon Boolean | ~200 |
| R3 | Unified Cell Lookup | ~40 |
| R4 | Fix Drawing Tool | ~25 |
| R5 | Cell-by-Cell Erasure | ~50 |
| R6 | Tests | ~400 |
| **Total** | | **~835** |

### Implementation Order

1. R1 (Rasterizer) - foundation
2. R2 (Boolean ops) - required for erasure
3. Unit tests for R1, R2
4. R4 (Fix drawing) - use `filled: true`
5. R3 (Unified lookup) - border integration
6. R5 (Erasure) - complete the feature
7. R6 (E2E tests)

### Risks

| Risk | Mitigation |
|------|------------|
| Performance with many paths | Cache virtual cell sets |
| Sutherland-Hodgman edge cases | Thorough unit tests |
| Path splitting creates many small paths | Add minimum area threshold |
| Existing maps have `filled: false` curves | No migration needed - they still render correctly |
