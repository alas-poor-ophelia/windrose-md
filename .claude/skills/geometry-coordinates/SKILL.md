# Geometry & Coordinate Systems

Reference this skill when working with coordinate transforms, cell positions, rendering, or any geometry-dependent logic in Windrose. Getting coordinate spaces wrong produces silent data corruption.

## Three Coordinate Spaces

Windrose has three distinct coordinate spaces. Mixing them is the #1 source of geometry bugs.

| Space | Type | Units | Origin |
|-------|------|-------|--------|
| **Grid** | `Point {x, y}` | Integer cell indices | (0,0) = first cell |
| **World** | `WorldCoords {worldX, worldY}` | Float pixels, zoom-independent | (0,0) = map origin |
| **Screen** | `ScreenCoords {screenX, screenY}` | Float pixels on canvas | (0,0) = canvas top-left |

**Grid coordinates are geometry-dependent:**
- GridGeometry: `x = column`, `y = row`
- HexGeometry: `x = q` (axial), `y = r` (axial)

The same `Point {x, y}` means different things depending on which geometry produced it. Never pass grid coordinates between different geometry instances.

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

### Viewport Offset Calculation

This is a common source of bugs. The formula differs by geometry type:

```typescript
// Grid: offset = canvasCenter - gridCenter * (cellSize * zoom)
// Hex:  offset = canvasCenter - hexCenter * zoom  (NO cellSize factor)
```

The `handleWheel` zoom bug (fixed 2026-02-25) was caused by using `getScaledCellSize(zoom)` for hex maps when it should have been just `zoom`.

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

This is handled by `roundHex()`. Don't try to just `Math.round()` axial coordinates — it produces wrong results near hex boundaries.

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
| Using `Math.round()` on hex coordinates | Wrong cell near boundaries | Use `roundHex()` (cube rounding) |
| `cellSize * zoom` for hex viewport offset | Grid formula, not hex | Use just `zoom` for hex maps |
| `ctx.strokeStyle = color; ctx.stroke()` | iOS memory corruption | Use `withStrokeStyle()` wrapper |
| Passing grid coords from one geometry to another | Different coordinate semantics | Each geometry consumes its own output |
| `gridToWorld` expecting cell center (grid) | Returns top-left for grid | Use `getCellCenter()` for center |
| Ignoring orientation in offset conversion | Wrong axial↔offset mapping | Always pass `geometry.orientation` |
| Checking `instanceof GridGeometry` | Breaks polymorphism | Use `geometry.type === 'grid'` |
