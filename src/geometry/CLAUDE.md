# Geometry System

## Purpose

Abstraction layer for grid and hex coordinate systems. All spatial calculations go through geometry classes, allowing the rest of the app to be map-type agnostic.

## Architecture

```
geometry/
├── core/                  # Geometry abstractions
│   ├── BaseGeometry.ts    # Abstract base class implementing IGeometry
│   ├── GridGeometry.ts    # Square grid implementation
│   ├── HexGeometry.ts     # Hexagonal grid implementation
│   ├── createGeometry.ts  # Factory: MapData → Grid/HexGeometry with defaults
│   ├── cellAccessor.ts    # Cell data access, manipulation, queries
│   ├── hexMeasurements.ts # Hex-specific calculations
│   ├── offsetCoordinates.ts # Coordinate system conversions
│   ├── lattice.ts         # Lattice ladder math: rung ownership, zoom crossings, existsAt (LOD, flag-gated)
│   ├── createGeometryLadder.ts # GeometryLadder: one geometry per rung over the root, activeLevel(zoom), existsAt, ancestorAt
│   ├── materialiseLevel.ts # Rung layer for level >= 1: root cells and authored rung cells resolved onto that rung
│   ├── contentFitView.ts  # Pure "fit to content" view (center + zoom) for the recenter control
│   ├── viewportMath.ts    # Pure view math: client->canvas px, north (un)rotation, canvas<->world, pan deltas, anchored zoom
│   └── subHexBackdrop.ts  # Pure placement math for the parent-map snapshot behind a sub-hex map
├── renderers/             # Canvas draw functions
│   ├── mapRenderer.ts     # renderCanvas: whole-map render (backdrop, rotation, static cache blit, fog, selections); pure, no React
│   ├── staticPasses.ts    # Static content as named passes over one RenderFrame (#types/rendering/renderFrame.types), in draw order
│   ├── staticLayerCache.ts # Offscreen static snapshot cache (12M px budget, rotated maps blit under rotation, settle re-render)
│   ├── levelSurfaces.ts   # Ladder: which per-level surface a frame may drift from at a crossing (pure selection)
│   ├── surfaceBudget.ts   # Ladder: global byte budget and LRU eviction for per-level surfaces; active canvas slot; __windrose.surfaces
│   ├── ladderTelemetry.ts # Ladder: frame ring buffer and crossing/median ratio per canvas, recorded only with the capability on; __windrose.ladder
│   ├── latticeRenderer.ts # Ladder: live lattice stroke after the blit (active rung plus district rungs)
│   ├── elementBands.ts    # Ladder: per-home-rung visibility bands, floors and held sizes for objects and labels
│   ├── ladderElementPass.ts # Ladder: one banded, culled member set per frame; live draw and selection chrome share it
│   ├── tileClipRegion.ts  # Ladder: crossing clip for tiles homed on a finer rung
│   ├── layerCellsRenderer.ts # One layer's cells/borders/edges (viewport-culled) + grid/hex renderer dispatch
│   ├── gridRenderer.ts, hexRenderer.ts, backgroundRenderer.ts
│   ├── objectRenderer.ts, textLabelRenderer.ts, selectionRenderer.ts
│   ├── badgeRenderer.ts, segmentRenderer.ts, regionRenderer.ts
│   ├── tileRenderer.ts (entry; composes canvasBlur.ts, regionFillRenderer.ts, computeTileDrawPlan.ts), curveRenderer.ts, wallPathRenderer.ts
│   ├── outlineRenderer.ts       # Polygon outlines (hex)
│   ├── shapeOverlayRenderer.ts  # Rectangle/circle shape overlays
│   └── subHexBackdropRenderer.ts # Blits the parent snapshot, right after the background fill
├── fog/                   # Fog-of-war rendering pipeline
│   ├── fogRenderer.ts, gridFogRenderer.ts, hexFogRenderer.ts
│   ├── foggedCellIndex.ts # Indexed isCellFogged lookups
│   ├── rungFog.ts         # Ladder: fog for deep-rung elements, answered at the root hex containing the rung cell's centre
├── strokes/
│   └── terrainStrokeGeometry.ts # Pure terrain-brush stroke math (thinning, simplification, bounds, erase hit test)
└── curves/                # Bezier math & boolean ops
    ├── curveBoolean.ts, curveCellOverlap.ts
    ├── curveFitting.ts, polygonClipping.ts
```

Type definitions live in `types/core/geometry.types.ts` (path alias `#types/*`).

### Lattice ladder rendering (LOD, dormant unless enabled)

A ladder map (`isLadderView` + per-map opt-in) passes `ladder` to `renderCanvas` (`mapRenderer.ts`); every ladder branch is guarded by `ladder !== null`, so classic maps render exactly as before. `mapRenderer.ts` picks the rung (`ladder.activeLevel(zoom)`, or the `level` option for export/previews), claims the surface budget's active slot, strokes the lattice live after the blit (`latticeRenderer.ts`, one cached world-space Path2D per canvas, level and padded rect; a crossing frame strokes a temporary viewport path instead of building), then hands the on-screen objects and text labels to `ladderElementPass.ts`, which bands them once per frame (`bandedMembersByRung`, viewport cull, per-cell slot index from `hexSlotPositioner.getObjectsInCellIndexed`) and draws them and their selection chrome from that one set with the `elementBands.ts` floors and holds, and records `ladderTelemetry`. Depth bakes use `HexGeometry.drawCellsBatched` (one string-built Path2D; level 0 keeps the classic call sequence). `staticPasses.ts` (scene `ladder`/`level`) skips the baked grid and adjacent sub-hex previews, draws the materialised rung layer at level >= 1 (`materialiseLevel.ts`), and draws tiles per home rung with the crossing clip (`renderLadderTiles`, `tileClipRegion.ts`, `ladderTileClipAt`). `staticLayerCache.ts` keeps one surface per rung per canvas (drift at a crossing, bake at settle, max two per canvas, global `surfaceBudget` for ladder canvases only). One-shot canvases pass `bypassSurfaceCache` and draw the scene directly.

The ladder's non-hook support modules live here, not in `hooks/`: geometry never imports `hooks/` at runtime (type-only imports from `#types/hooks/*` are the exception). Debug bridges `__windrose.ladder` and `__windrose.surfaces` are typed on `WindroseGlobal` (`types/core/global.types.ts`) and attach to the main `window`.

### Ladder invariants

Code comments elsewhere cite these by name ("src/geometry/CLAUDE.md, Ladder invariants").

1. **A crossing is a drift.** A zoom crossing only drifts the existing per-level surfaces (`levelSurfaces.ts`, `staticLayerCache.ts`); no synchronous bake runs in the crossing frame, the bake happens at settle.
2. **Quarantine is derived.** Whether a map's depth content is quarantined is computed from its data on every check (`isDepthQuarantined` in `core/lodFlags.ts`), never stored, and nothing un-quarantines a map.
3. **The depth budget is in encoded bytes.** The depth budget is measured in the save journal's own unit, the encoded payload length (`journalPayloadLength`), not in cells or elements.
4. **One deep-write gate.** Every deep write, cells and elements alike, goes through `persistence/depthAuthoring.ts` (`guardDepthWrite`, `writeDepthCells`).

### Extended geometry types

`IGeometry` is the common contract. Code that needs more (cell size, hex vertices, ring queries) uses `ExtendedGeometry`, a union of `ExtendedGridGeometry | ExtendedHexGeometry` currently defined in `types/contexts/context.types.ts` (this is what `useMapState().geometry` returns). Renderers take `IGridRenderer` / `IHexRenderer` (`types/core/rendering.types.ts`). Several modules still declare local `*GeometryLike` shapes; prefer `Pick<>` of the extended types in new code.

**Discriminator**: use `geometry.type === 'hex' | 'grid'` to narrow. Never `instanceof HexGeometry` / `GridGeometry` (none exist in `src/`; the union only narrows on `type`). Build instances with `createGeometry`.

## Coordinate Philosophy

The geometry system uses normalized `Point` ({x, y}) for all grid coordinates. This enables polymorphic code:

- **GridGeometry** interprets: `x = gridX`, `y = gridY`
- **HexGeometry** interprets: `x = q`, `y = r` (axial coordinates)

As long as the same geometry instance that produced coordinates is used to consume them, everything works transparently.

## Three Coordinate Spaces

1. **Grid coordinates** - Normalized as `Point {x, y}`
   - Grid: x = column, y = row
   - Hex: x = q, y = r (axial)

2. **World coordinates** - Float pixels in map coordinate system
   - Origin and scale defined by geometry
   - Pan/zoom independent

3. **Screen coordinates** - Pixels on the canvas
   - Includes viewport transforms (pan/zoom)

## The IGeometry Interface

From `types/core/geometry.types.ts`:

```typescript
interface IGeometry {
  // Coordinate Conversions
  worldToGrid(worldX: number, worldY: number): Point;
  gridToWorld(x: number, y: number): WorldCoords;
  gridToScreen(x: number, y: number, offsetX: number, offsetY: number, zoom: number): ScreenCoords;
  worldToScreen(worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number): ScreenCoords;
  screenToWorld(screenX: number, screenY: number, zoom: number): WorldCoords;
  
  // Cell Operations
  getScaledCellSize(zoom: number): number;
  createCellObject(coords: Point, color: string): Cell;
  cellMatchesCoords(cell: Cell, coords: Point): boolean;
  
  // Shape Queries
  getCellsInRectangle(x1: number, y1: number, x2: number, y2: number): Point[];
  getCellsInCircle(centerX: number, centerY: number, radius: number): Point[];
  getCellsInLine(x1: number, y1: number, x2: number, y2: number): Point[];
  
  // Distance Calculations (hex ignores options; for world-pixel distance use getCellCenter + Math.hypot)
  getCellDistance(x1: number, y1: number, x2: number, y2: number, options?: DistanceOptions): number;
  
  // Neighbors and Bounds
  getNeighbors(x: number, y: number): Point[];
  isWithinBounds(x: number, y: number): boolean;
  clampToBounds(x: number, y: number): Point;
  isBounded(): boolean;
  getBounds(): GridBounds | null;
  
  // Offset Coordinate Support
  toOffsetCoords(gridX: number, gridY: number): OffsetCoords;
  cellToOffsetCoords(cell: Cell): OffsetCoords;
  
  // Rendering
  drawGrid(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, 
           width: number, height: number, zoom: number, style: GridStyle): void;
  
  // Utility
  withStrokeStyle(ctx: CanvasRenderingContext2D, style: StrokeStyle, callback: () => void): void;
}
```

## BaseGeometry Concrete Methods

These are implemented once in BaseGeometry and shared by all geometry types:

```typescript
// Coordinate transforms (pure math, geometry-agnostic)
worldToScreen(worldX, worldY, offsetX, offsetY, zoom): ScreenCoords
screenToWorld(screenX, screenY, zoom): WorldCoords

// iOS-safe stroke helper (protects against canvas state corruption)
withStrokeStyle(ctx, style, callback): void
```

## Distance Options

For `getCellDistance()`:

```typescript
interface DistanceOptions {
  diagonalRule?: 'alternating' | 'equal' | 'euclidean';
  // 'alternating': 5ft/10ft/5ft pattern (D&D 5e default)
  // 'equal': All moves cost 1 (4e style)
  // 'euclidean': True geometric distance
}
```

Note: Hex ignores these options (hex has no diagonal ambiguity).

## Viewport Math (screen <-> world)

`core/viewportMath.ts` is the ONLY place that converts between client/canvas pixels and world coordinates. It owns the view-centre unit rule: `StoredViewState.center` is in **cell units on grid** and **world px on hex**; `viewCenterScale(geometry, zoom)` (also `IGeometry.getViewCenterScale(zoom)`) is cellSize*zoom on grid and zoom on hex. Callers pass a geometry and never branch on map type.

- `clientToCanvasPx(canvas, clientX, clientY)`: honours CSS scaling (the canvas buffer can be larger than its CSS box).
- `clientToWorld` / `canvasPxToWorld` / `worldToCanvasPx`: full chain incl. inverse north rotation about the buffer centre.
- `calculateViewportOffset` (re-exported from `BaseGeometry` for old importers).
- `screenDeltaToCenterUnits`: pan/wheel deltas -> centre delta (negate for drag-to-pan).
- `anchoredZoomCenter`: zoom-to-cursor keeping the anchor's map point fixed (rotation and CSS scaling included).
- `applyNorthRotation(ctx, w, h, deg)`: rotate a 2D context about the surface centre; caller owns save/restore.

Do not hand-write `canvas.width / 2 - center.x * ...` or `northDirection * Math.PI / 180` outside this module.

## Grid vs Hex

| Aspect | GridGeometry | HexGeometry |
|--------|--------------|-------------|
| Coordinates | (x=col, y=row) | (x=q, y=r) axial |
| Neighbors | 4 cardinal (or 8 with diagonals) | 6 always |
| Cell shape | Square | Hexagon (pointy or flat) |
| Distance | Configurable diagonal rules | Hex distance |
| Bounds | maxCol × maxRow | Converted via offset |

## Hex Coordinate Systems

HexGeometry internally uses axial coordinates (q, r) but supports conversion:

- **Axial** - (q, r) native hex, used in Point.x/y
- **Offset** - (col, row) for array storage, fog of war
- **Cube** - (q, r, s) where q + r + s = 0 (used internally for some algorithms)

```javascript
// Convert for storage
const offset = geometry.toOffsetCoords(q, r);  // { col, row }
```

## Using Geometry in Components

```javascript
function SomeLayer() {
  const { geometry } = useMapState();
  
  // All these work for both grid and hex:
  const gridCoords = geometry.worldToGrid(worldX, worldY);
  const worldPos = geometry.gridToWorld(gridCoords.x, gridCoords.y);
  const neighbors = geometry.getNeighbors(gridCoords.x, gridCoords.y);
  const distance = geometry.getCellDistance(x1, y1, x2, y2);
  
  if (geometry.isWithinBounds(x, y)) {
    // Safe to use coordinates
  }
}
```

## iOS Canvas Protection

The `withStrokeStyle` helper protects against iOS canvas state corruption during memory pressure:

```javascript
geometry.withStrokeStyle(ctx, { lineColor: '#333', lineWidth: 1 }, () => {
  ctx.stroke(path);  // Safe stroke operations
});
```

Always use this for stroke operations instead of setting ctx properties directly.

## Adding Geometry Features

1. Add abstract method signature to `IGeometry` in `types/core/geometry.types.ts`
2. Add abstract method to `BaseGeometry.ts`
3. Implement in both `GridGeometry.ts` and `HexGeometry.ts`
4. Test with both map types

## Common Gotchas

- **Always use geometry methods** - Never calculate positions manually
- **Point.x/y meaning changes** - Grid: col/row, Hex: q/r
- **Hex orientation matters** - Pointy vs flat changes all calculations
- **Offset vs axial** - Use `toOffsetCoords()` for array storage
- **iOS stroke safety** - Always use `withStrokeStyle()` for strokes