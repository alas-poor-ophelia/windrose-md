# Geometry & Coordinate Systems

Reference this skill when working with coordinate transforms, cell positions, rendering, or any geometry-dependent logic in Windrose. Getting coordinate spaces wrong produces **silent data corruption** — tiles render in the wrong hex, clicks select the wrong cell, and zoom drifts at non-1.0 levels. These bugs are hard to reproduce because they only appear at specific zoom levels or near cell boundaries.

## Three Coordinate Spaces

Windrose has three distinct coordinate spaces. Mixing them is the #1 source of geometry bugs. Each space exists for a reason:

| Space | Type | Units | Origin |
|-------|------|-------|--------|
| **Grid** | `Point {x, y}` | Integer cell indices | (0,0) = first cell |
| **World** | `WorldCoords {worldX, worldY}` | Float pixels, zoom-independent | (0,0) = map origin |
| **Screen** | `ScreenCoords {screenX, screenY}` | Float pixels on canvas | (0,0) = canvas top-left |

**Why three spaces?** Grid is for logical addressing (which cell). World is for stable positioning (zoom/pan-independent — use for storing positions). Screen is for rendering and hit-testing (changes every frame as the user pans/zooms).

**Grid coordinates are geometry-dependent:**
- GridGeometry: `x = column`, `y = row`
- HexGeometry: `x = q` (axial), `y = r` (axial)

The same `Point {x, y}` means different things depending on which geometry produced it. Never pass grid coordinates between different geometry instances — they are semantically incompatible even though they share the same type.

## Transform Chain

```
Screen ──screenToWorld()──> World ──worldToGrid()──> Grid
Screen <──gridToScreen()── Grid (shortcut: world + viewport in one step)
World  <──gridToWorld()─── Grid
Screen <──worldToScreen()── World
```

### Method Signatures

```typescript
// Shared (BaseGeometry) — geometry-agnostic
worldToScreen(worldX, worldY, offsetX, offsetY, zoom): ScreenCoords
screenToWorld(screenX, screenY, zoom): WorldCoords

// Geometry-specific — different formulas per type
worldToGrid(worldX, worldY): Point
gridToWorld(x, y): WorldCoords
gridToScreen(x, y, offsetX, offsetY, zoom): ScreenCoords
getCellCenter(x, y): WorldCoords
```

### Grid vs Hex Differences in Same-Named Methods

| Method | Grid | Hex |
|--------|------|-----|
| `worldToGrid` | `floor(worldX/cellSize)` | Inverse hex matrix + cube rounding |
| `gridToWorld` | `(x*cellSize, y*cellSize)` — returns **top-left** | `hexToWorld(q,r)` — returns **center** |
| `getCellCenter` | `((x+0.5)*cellSize, (y+0.5)*cellSize)` | Same as `gridToWorld` (hex center) |
| `getScaledCellSize` | `cellSize * zoom` | `hexSize * zoom` |
| `getNeighbors` | 4 neighbors (cardinal) | 6 neighbors (axial directions) |
| `getCellDistance` | Supports `diagonalRule` option | Ignores options (single metric) |
| `isWithinBounds` | Always `true` (unbounded) | Checks bounds if set |

**The `gridToWorld` asymmetry is the most dangerous difference.** Grid rendering starts from the top-left corner and draws right/down. Hex rendering centers the hexagon on its world point. Code that uses `gridToWorld` to position a tile image will be correct on one geometry and off by half a cell on the other. When you need a center for both geometry types, always use `getCellCenter()`:

```typescript
// WRONG — works on hex, off by half-cell on grid:
const pos = geometry.gridToWorld(x, y);
ctx.drawImage(img, pos.worldX, pos.worldY); // grid: draws from top-left (wrong anchor)

// RIGHT — works on both:
const center = geometry.getCellCenter(x, y);
ctx.drawImage(img, center.worldX - w/2, center.worldY - h/2, w, h);
```

### Viewport Offset Calculation

This is a common source of bugs. The formula differs by geometry type:

```typescript
// Grid: offset = canvasCenter - gridCenter * (cellSize * zoom)
// Hex:  offset = canvasCenter - hexCenter * zoom  (NO cellSize factor)
```

**Why the difference?** Hex world coordinates are already in pixel-scale units (hexToWorld produces pixel positions). Grid world coordinates are in cell units (gridToWorld returns `x * cellSize`), so they need the `cellSize` factor to convert to pixels. Applying `cellSize * zoom` to hex coordinates double-scales them.

The `handleWheel` zoom bug (fixed 2026-02-25) was caused by exactly this: using `getScaledCellSize(zoom)` for hex maps when it should have been just `zoom`. The bug was invisible at zoom=1.0 and only appeared as drift during zoom in/out.

## Cell Types

Cells have **different shapes** per geometry:

```typescript
// Grid cell
{ x: number, y: number, color: string, opacity?: number, segments?: SegmentMap }

// Hex cell
{ q: number, r: number, color: string, opacity?: number }
```

Use `geometry.cellMatchesCoords(cell, point)` and `geometry.createCellObject(point, color)` to abstract this. Never construct cells manually with hardcoded field names unless you're in geometry-specific code.

## Hex Orientation

HexGeometry takes `'flat' | 'pointy'` orientation. This affects **everything**:

| Property | Flat | Pointy |
|----------|------|--------|
| `width` | `2 * hexSize` | `sqrt(3) * hexSize` |
| `height` | `sqrt(3) * hexSize` | `2 * hexSize` |
| `horizSpacing` | `1.5 * hexSize` | `sqrt(3) * hexSize` |
| `vertSpacing` | `sqrt(3) * hexSize` | `1.5 * hexSize` |
| worldToHex formula | Different matrix | Different matrix |
| Offset conversion | Orientation-dependent | Orientation-dependent |

Always pass orientation when converting between axial and offset coordinates via `offsetCoordinates.ts`.

## Hex Coordinate Systems

Hex maps use **two** coordinate systems internally:

- **Axial (q, r)**: Used for storage, distance, neighbors. This is what `Point {x, y}` maps to.
- **Offset (col, row)**: Used for rectangular bounds checking and fog-of-war storage.

Conversion: `axialToOffset(q, r, orientation)` / `offsetToAxial(col, row, orientation)`

**Bounds come in two flavors:**
- Rectangular: `{ maxCol, maxRow }` — offset coordinate space
- Radial: `{ maxRing }` — ring distance from origin

Check `geometry.renderingMode` (`'rectangular' | 'radial'`) to know which.

## Hex Rounding

`worldToHex()` produces fractional coordinates that must be rounded to the nearest hex. The rounding uses cube coordinates internally:

```
axial (q, r) → cube (x = q, y = -q-r, z = r)
round each independently → fix largest rounding error to maintain x+y+z=0
cube → axial
```

**Why not `Math.round()`?** Axial coordinates live on a constrained lattice where `q + r + s = 0`. Rounding q and r independently violates this constraint, which means the rounded point may not correspond to any actual hex cell. Near hex boundaries this consistently selects the wrong cell. Cube rounding fixes the component with the largest error to restore the constraint.

```typescript
// WRONG — picks wrong cell near hex edges:
const q = Math.round(fractionalQ);
const r = Math.round(fractionalR);

// RIGHT — always lands on a valid hex:
const { q, r } = roundHex(fractionalQ, fractionalR);
```

This is handled by `roundHex()` inside `worldToHex()`. You should never need to call it directly — just call `geometry.worldToGrid()`.

## Distance Calculations

```typescript
// Grid: supports 3 diagonal rules
geometry.getCellDistance(x1, y1, x2, y2, { diagonalRule: 'alternating' })
// 'alternating': D&D 5e (5/10/5 ft pattern) — default
// 'equal': Chess king distance = max(dx, dy)
// 'euclidean': sqrt(dx^2 + dy^2)

// Hex: single metric, options ignored
geometry.getCellDistance(q1, r1, q2, r2)
// = (|q1-q2| + |q1+r1-q2-r2| + |r1-r2|) / 2
```

## iOS Canvas Safety

Canvas `strokeStyle` can corrupt on iOS under memory pressure. **All stroke operations must use `withStrokeStyle()`:**

```typescript
geometry.withStrokeStyle(ctx, { lineColor: '#ccc', lineWidth: 1 }, () => {
  ctx.stroke(path);  // Safe — style explicitly reset before callback
});
```

Both GridGeometry and HexGeometry avoid `ctx.stroke()` for grid rendering entirely, using fill-based line drawing instead (`fillRect` for grid, `drawLineAsFill` polygon for hex).

## Grid-Only Features

- `getNeighbors8(x, y)`: 8-directional neighbors (diagonals)
- `screenToEdge(worldX, worldY, threshold)`: Edge hit detection for walls/doors
- `snapToGrid(worldX, worldY)`: Snap to cell corner
- Cell segments: 8 triangular sub-regions per cell (`nw, n, ne, e, se, s, sw, w`)

## Hex-Only Features

- `getHexVertices(q, r)`: 6 vertex positions for polygon rendering
- `iterateRing(ring)`: All hexes at ring distance N from origin
- `getAllRadialCells(maxRing)`: All hexes within radius
- `snapToHexCenter(worldX, worldY)`: Snap to nearest hex center
- Sub-hex navigation: `enterSubHex(q, r)` drills into subdivided hex

## Common Recipes

**Click → cell:**
```typescript
const world = geometry.screenToWorld(screenX, screenY, zoom);
const cell = geometry.worldToGrid(world.worldX, world.worldY);
```

**Cell → canvas position:**
```typescript
const screen = geometry.gridToScreen(x, y, offsetX, offsetY, zoom);
```

**Render a hex:**
```typescript
const vertices = hexGeometry.getHexVertices(q, r);
ctx.beginPath();
for (const v of vertices) {
  const s = geometry.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, zoom);
  ctx.lineTo(s.screenX, s.screenY);
}
ctx.closePath();
ctx.fill();
```

## Anti-Patterns

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| `Math.round()` on hex coordinates | Violates cube constraint `q+r+s=0`, selects wrong cell near edges | Use `roundHex()` (cube rounding) |
| `cellSize * zoom` for hex viewport offset | Hex world coords are already pixel-scale; this double-scales them | Use just `zoom` for hex maps |
| `ctx.strokeStyle = color; ctx.stroke()` | iOS corrupts strokeStyle under memory pressure; style bleeds to next draw | Use `withStrokeStyle()` wrapper |
| Passing grid coords between geometries | `Point{3,2}` means col=3,row=2 on grid but q=3,r=2 on hex — different cells | Each geometry consumes its own output |
| `gridToWorld` expecting center (grid) | Grid returns top-left because grid rendering starts from corners | Use `getCellCenter()` for center |
| Ignoring orientation in offset conversion | Flat and pointy hexes have different axial↔offset mappings; wrong orientation = wrong cell | Always pass `geometry.orientation` |
| `instanceof GridGeometry` check | Creates hard import dependency; breaks when module loading order changes in Datacore | Use `geometry.type === 'grid'` |
| Extracting geometry methods into plain objects | `{ hexToWorld: geom.hexToWorld }` detaches `this` — methods like `hexToWorld` use `this.hexSize`, `this.sqrt3` internally, producing `NaN` silently | Use `.bind(geom)` or pass the geometry instance directly |

### Testing Tip

Most coordinate bugs are invisible at zoom=1.0. Always test at zoom 0.5 and 2.0 to catch viewport offset errors, and click near hex boundaries to catch rounding errors.
