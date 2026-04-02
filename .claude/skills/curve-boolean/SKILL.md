# Bezier Curves & Boolean Erasure

Reference this skill when working with freehand curves, curve erasure, polygon-clipping operations, or curve fitting in Windrose. This is the most algorithmically complex subsystem.

## Curve Data Structure

```typescript
interface Curve {
  id: string;
  start: [number, number];              // Starting point
  segments: BezierSegment[];            // Cubic bezier segments
  closed: boolean;                      // Closed = fillable
  color: string;                        // Fill color (only when closed)
  opacity: number;
  strokeColor: string;
  strokeWidth: number;
  innerRings?: [number, number][][];    // Holes from boolean subtraction
}

// Each segment is 6 numbers, NOT [x, y] pairs
type BezierSegment = [cp1x, cp1y, cp2x, cp2y, endX, endY];
// Control point 1, Control point 2, End point
// Start point = previous segment's endpoint (or curve.start for first)
```

## Boolean Subtraction Pipeline

When erasing cells/rectangles/polygons from curves:

```
Curve ──flattenCurve()──> Dense polygon (point array)
                              ↓
                    curveToPolygon() — ensure winding + add inner rings
                              ↓
                    expandClipRing() — perturb clip by 0.01px
                              ↓
                    difference(subject, clip) — polygon-clipping library
                              ↓
                    polygonToCurve() — rebuild as linear bezier segments
                              ↓
                         0, 1, or N result Curves
```

### Step 1: Flatten

`flattenCurve(curve, stepsPerSegment = 16)` converts beziers to a dense point array.

**Linear optimization:** If a segment's control points lie on the line between start/end (within epsilon 0.1), only the endpoint is emitted — no subdivision. This prevents vertex explosion after repeated operations.

```typescript
function isLinearBezier(p0x, p0y, cp1x, cp1y, cp2x, cp2y, p3x, p3y, epsilon = 0.1): boolean
// Checks perpendicular distance of both control points from the p0→p3 line
```

The result is a **closed ring** where `first === last` (GeoJSON requirement).

### Step 2: Build Polygon

`curveToPolygon(curve)` produces `Polygon = Ring[]` for polygon-clipping:
- Outer ring: CCW (counter-clockwise)
- Inner rings (holes): CW (clockwise)
- Winding enforced via `ensureCCW()` / `ensureCW()`

### Step 3: Expand Clip Ring

**polygon-clipping crashes on shared edges** (subject and clip share exact boundary vertices). This is common when erasing along grid lines.

`expandClipRing(ring)` perturbs each vertex 0.01 world units outward from the ring's centroid. This is invisible at any zoom level but prevents the crash.

```typescript
const CLIP_EXPAND_EPSILON = 0.01;
// For each vertex: move (dx/dist) * epsilon away from centroid
```

**Always apply before calling `difference()`.** All three erasure functions do this.

### Step 4: Boolean Difference

```typescript
const result: MultiPolygon = difference(subjectPoly, clipPoly);
// result = Polygon[] — may be 0 (fully erased), 1, or many (split)
```

### Step 5: Rebuild Curves

`polygonToCurve(rings, templateCurve, newId?)` converts polygon back to a Curve:
- Each polygon edge becomes a **linear bezier** (control points at 1/3 and 2/3)
- Inner rings (index 1+ in the polygon) stored as `curve.innerRings`
- Closing points removed from rings before storage
- Rings with fewer than 3 points are discarded

**ID assignment for splits:**
- First result keeps original `curve.id`
- Additional results get `curve.id + '-' + timestamp + '-' + random`

## Entry Points

| Function | Input | Output | Use Case |
|----------|-------|--------|----------|
| `eraseCellFromCurves(curves, x, y, cellSize)` | Cell coords | `Curve[] \| null` | Single cell erase tool |
| `eraseRectangleFromCurves(curves, minX, minY, maxX, maxY)` | World rect | `Curve[] \| null` | Rectangle erase tool |
| `eraseWorldPolygonFromCurves(curves, clipVertices)` | Arbitrary polygon | `Curve[] \| null` | Hex cell erase (hex polygon) |

All return `null` if no curves were affected. Return `[]` if all curves fully erased.

### Supporting Functions

| Function | Purpose |
|----------|---------|
| `findCurveAtCell(curves, x, y, cellSize)` | Find curve index overlapping a cell |
| `cellOverlapsCurve(x, y, cellSize, outerPoly, innerRings?)` | Check if cell center is inside curve (respecting holes) |
| `pointInPolygon(px, py, poly)` | Ray-cast point-in-polygon test |
| `unionCurves(curves)` | Boolean union of multiple curves |
| `flattenCurve(curve, steps?)` | Bezier → dense point array |
| `curveToPolygon(curve)` | Curve → GeoJSON polygon (with winding) |
| `polygonToCurve(rings, template, id?)` | GeoJSON polygon → Curve |
| `simplifyRing(ring, epsilon?)` | Remove collinear vertices (Douglas-Peucker) |
| `polygonArea(rings)` / `signedArea(ring)` | Area calculation / winding detection |

## Inner Rings (Holes)

When boolean subtraction creates holes (e.g., erasing interior of a curve):
- polygon-clipping returns them as additional rings in the result polygon
- `polygonToCurve()` stores them in `curve.innerRings` as `[number, number][][]`
- They are raw coordinate arrays, NOT bezier segments
- `curveToPolygon()` re-adds them with CW winding for the next operation

**Rendering:** Even-odd fill rule handles holes automatically as long as winding is correct.

**Overlap checking:** `cellOverlapsCurve()` checks both outer polygon AND inner rings — a cell center inside a hole returns `false`.

## Cell vs Curve Erasure

These are completely different operations:

| | Cell Erasure | Curve Erasure |
|---|---|---|
| **Method** | Filter by coordinates | Boolean polygon subtraction |
| **Complexity** | O(n) filter | O(n log n) polygon clipping |
| **Result** | Remove matching cells | 0-N modified curves |
| **Holes** | N/A | Creates inner rings |

The drawing tools call `eraseCellFromCurves()` separately from cell filtering. Both happen in the same erase operation.

## Curve Fitting (Input → Bezier)

`curveFitting.ts` converts raw pointer input to smooth curves:

```typescript
fitPointsToBezier(rawPoints, simplifyTolerance = 2, fitError = 16)
→ { start: [x, y], segments: BezierSegment[] } | null
```

Pipeline:
1. **Deduplicate** exact duplicate points
2. **Simplify** via Ramer-Douglas-Peucker (remove points within `simplifyTolerance` of the line)
3. **Fit** using Schneider's iterative least-squares bezier fitting:
   - Parameterize by chord length
   - Generate bezier, check fit error
   - Newton-Raphson reparameterization (up to 4 iterations)
   - If still too large, split at max error point and recurse

## Vendored polygon-clipping

The library is bundled as a UMD module, not imported from npm:

```
src/vendor/polygon-clipping.umd.js    ← The library
src/geometry/polygon-clipping-wrapper.js  ← Loads UMD, exports difference/union
src/geometry/polygonClipping.ts        ← Datacore module that loads wrapper
```

**Why vendored:** Compiled mode has no filesystem access. The UMD bundle is inlined into the compiled artifact.

**For unit tests:** `polygonClipping.ts` is `vi.mock`'d to use the npm package directly (faster, no Datacore overhead).

## Anti-Patterns

| Mistake | Consequence | Fix |
|---------|------------|-----|
| Treating segments as `[x, y]` pairs | Rendering breaks, wrong shapes | Each segment is 6 numbers: `[cp1x, cp1y, cp2x, cp2y, endX, endY]` |
| Skipping `expandClipRing()` | polygon-clipping crashes on shared edges | Always expand before `difference()` |
| Losing `innerRings` during updates | Holes disappear | Preserve `innerRings` when copying/updating curves |
| Re-bezierizing after boolean ops | Unnecessary complexity, visual artifacts | Keep linear bezier segments — `isLinearBezier()` optimizes future flattens |
| Using npm polygon-clipping in compiled mode | Import fails (no filesystem) | Use vendored UMD via wrapper |
| Applying cell erasure logic to curves | Wrong operation entirely | Curves use boolean subtraction, not coordinate filtering |
| Ignoring `null` return from erase functions | Unnecessary saves/updates | `null` means no curves were affected — skip the update |
| Creating curves without `id` | Can't track/select/split | Always generate unique IDs |
| Forgetting winding order | polygon-clipping gives wrong results | Outer CCW, inner CW — use `ensureCCW()`/`ensureCW()` |
