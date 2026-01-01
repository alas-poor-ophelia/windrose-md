# Geometry System

## Purpose

Abstraction layer for grid and hex coordinate systems. All spatial calculations go through geometry classes, allowing the rest of the app to be map-type agnostic.

## Architecture

```
BaseGeometry.ts      # Abstract base class implementing IGeometry
├── GridGeometry.ts  # Square grid implementation
└── HexGeometry.ts   # Hexagonal grid implementation

geometry_types.ts    # Type definitions (Point, IGeometry, etc.)
hexMeasurements.ts   # Hex-specific calculations
hexRenderer.ts       # Hex cell rendering
gridRenderer.ts      # Grid cell rendering
segmentRenderer.ts   # Segment/edge rendering
offsetCoordinates.js # Coordinate system conversions
```

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

From `geometry_types.ts`:

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
  
  // Distance Calculations
  getEuclideanDistance(x1: number, y1: number, x2: number, y2: number): number;
  getManhattanDistance(x1: number, y1: number, x2: number, y2: number): number;
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

1. Add abstract method signature to `IGeometry` in `geometry_types.ts`
2. Add abstract method to `BaseGeometry.ts`
3. Implement in both `GridGeometry.ts` and `HexGeometry.ts`
4. Test with both map types

## Common Gotchas

- **Always use geometry methods** - Never calculate positions manually
- **Point.x/y meaning changes** - Grid: col/row, Hex: q/r
- **Hex orientation matters** - Pointy vs flat changes all calculations
- **Offset vs axial** - Use `toOffsetCoords()` for array storage
- **iOS stroke safety** - Always use `withStrokeStyle()` for strokes