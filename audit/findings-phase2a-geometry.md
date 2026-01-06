# Phase 2a: Geometry Files Audit

## Session Metadata
- Date: 2026-01-05
- Files examined: 9 (all geometry files)
- Examination depth: Full read of all files

### Files Examined
| File | Lines | Role |
|------|-------|------|
| `BaseGeometry.ts` | 311 | Abstract base class, IGeometry interface |
| `GridGeometry.ts` | 573 | Square grid implementation |
| `HexGeometry.ts` | 771 | Hexagonal grid implementation |
| `cellAccessor.ts` | 677 | Cell CRUD with Point abstraction |
| `gridRenderer.ts` | 411 | Grid-specific canvas rendering |
| `hexRenderer.ts` | 135 | Hex-specific canvas rendering |
| `segmentRenderer.ts` | 408 | Partial cell (triangle) rendering |
| `offsetCoordinates.ts` | 114 | Axial ↔ offset conversion |
| `hexMeasurements.ts` | 278 | Hex sizing calculations |

---

## Architecture Assessment

### Strengths

**1. Clean Abstraction Boundary**
The geometry abstraction is well-designed:
- `BaseGeometry` defines the interface with 20+ abstract methods
- `GridGeometry` and `HexGeometry` implement it consistently
- Higher-level code uses `IGeometry` interface, not concrete classes
- `cellAccessor.ts` provides Point-based API that hides storage format differences

**2. Polymorphic Design**
Grid and Hex geometries are truly interchangeable:
- Same method signatures (`worldToGrid`, `gridToWorld`, `getCellsInCircle`, etc.)
- Point type unifies coordinates (`{x, y}` where x=gridX/q, y=gridY/r)
- Renderers have matching APIs (`renderGrid`, `renderPaintedCells`, `renderCellHighlight`)

**3. iOS/Safari Defensive Coding**
Extensive workarounds for known issues:
- `withStrokeStyle()` explicitly resets all stroke properties (line 83-108, BaseGeometry.ts)
- All border/line rendering uses `fillRect()` instead of `stroke()` for CodeMirror compatibility
- Safety checks in HexGeometry.drawGrid for invalid inputs and hex count limits

**4. Good Documentation**
Each file has clear header comments explaining:
- Coordinate systems and their relationships
- Implementation guidelines
- Why certain workarounds exist

---

## Critical (P0) - Must Fix

None identified. The geometry layer is solid.

---

## Important (P1) - Should Fix Soon

### 1. Segment Support is Grid-Only
**Location**: `cellAccessor.ts:419-423`, `cellAccessor.ts:506-509`
**Issue**: Segment painting (partial cells) only works for grid maps, not hex.
**Impact**: For 1.6.x hex tile features, this pattern won't extend.
**Details**:
```typescript
if (!isGridGeometry(geometry)) {
  console.warn('setSegments: Segment painting is only supported for grid maps');
  return cells;
}
```
**Recommendation**: Document this limitation clearly. When adding hex tile support, may need different approach.

### 2. HexGeometry Bound to Coordinate-Based Rendering
**Location**: `HexGeometry.ts` throughout
**Issue**: All rendering assumes axial coordinate system. Radial rendering (1.6.x) will need significant additions.
**Impact**: The current HexGeometry cannot do radial hex rendering without extension.
**Details**:
- `hexToWorld()` uses coordinate math (line 175-185)
- `getHexVertices()` calculates vertices from center (line 219-235)
- No concept of "world position hex" vs "coordinate grid hex"

**Recommendation**: For 1.6.x radial hex, likely need:
- New method like `hexAtWorldPosition(worldX, worldY)` that doesn't use coordinate grid
- Or a separate `RadialHexRenderer` that places hexes by world position

### 3. Render Order Not Exposed
**Location**: `gridRenderer.ts`, `hexRenderer.ts`
**Issue**: Cells render in array order. No z-index or explicit ordering.
**Impact**: For 1.6.x Y-level ordering, will need to sort before render or change render approach.
**Details**: `renderPaintedCells()` iterates cells directly:
```typescript
for (const cell of cells) {
  geometry.drawHex(...);
}
```
**Recommendation**: The fix is simple - sort cells before passing to renderer. But needs to be done at the caller level (useCanvasRenderer).

---

## Watch List (P2) - Monitor

### 1. Performance at Scale
**Location**: `HexGeometry.ts:349-353`
**Issue**: Hard limit of 50,000 hexes for grid drawing, but no limit on painted cells.
**What to watch**: As maps get larger with more layers, painted cell count could grow unbounded.
```typescript
if (totalHexes > 50000 || !isFinite(totalHexes)) {
  console.warn(`[HexGeometry.drawGrid] Too many hexes to draw (${totalHexes}), aborting`);
  return;
}
```
**Recommendation**: Consider similar bounds checking for painted cells, or implement viewport culling.

### 2. Opacity Handling Per-Cell
**Location**: `gridRenderer.ts:103-113`, `hexRenderer.ts:66-85`
**Issue**: Cells with custom opacity are rendered individually, not batched.
**What to watch**: If many cells have opacity < 1, this bypasses batch rendering optimization.
**Recommendation**: Monitor performance. If it becomes an issue, could batch by (color, opacity) pairs.

### 3. segmentRenderer Complexity
**Location**: `segmentRenderer.ts` entire file
**Issue**: Complex rendering with internal/external border calculation.
**What to watch**: This is grid-only. As hex features grow, there may be temptation to add similar complexity there.
**Recommendation**: Keep hex rendering simpler. Segment triangles are a grid-specific feature.

### 4. Type Declaration Duplication
**Location**: `GridGeometry.ts:51-55`, `HexGeometry.ts:62-66`
**Issue**: Both files declare `BaseGeometryClass` locally because of Datacore runtime constraints.
```typescript
declare class BaseGeometryClass {
  cellSize: number;
  worldToScreen(...): ScreenCoords;
  screenToWorld(...): WorldCoords;
}
```
**What to watch**: If BaseGeometry interface changes, these declarations need manual sync.
**Recommendation**: Consider generating these from a single source, or add a note about keeping in sync.

---

## Notes

### Readiness for 1.6.x Features

| Feature | Geometry Support | Gap |
|---------|-----------------|-----|
| Radial hex rendering | Not supported | Need new rendering approach, HexGeometry is coordinate-bound |
| Y-level ordering | Not in geometry layer | Caller (useCanvasRenderer) must sort before render |
| Zoom-sensitive visibility | Not in geometry layer | Caller must filter before render |
| Custom hex tiles | Partial | Could use existing hex render with image instead of fill |

### Pattern Observations

1. **Pure Functions**: Most geometry code is pure - takes inputs, returns outputs, no side effects except canvas drawing.

2. **Defensive iOS Code**: Pervasive use of `fillRect()` workarounds. This is good but adds complexity.

3. **Two Coordinate Philosophies**:
   - Grid: Unbounded, integer coordinates, simple math
   - Hex: Optionally bounded, axial coordinates, more complex math

4. **Segment Cells**: A sophisticated feature for grid maps that won't easily port to hex. Hex tiles will need a different approach.

---

## Summary

The geometry layer is **production-ready and well-architected**. The abstraction is clean, the implementations are solid, and iOS workarounds are thorough.

**Main concern for 1.6.x**: HexGeometry is tightly coupled to coordinate-based rendering. Radial hex rendering will need either:
- Extension methods on HexGeometry
- A separate RadialHexGeometry class
- A completely different rendering approach at the hook level

**No P0 issues** - the geometry code is not a source of production risk.
