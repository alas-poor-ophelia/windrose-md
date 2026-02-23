/**
 * curveCellOverlap.ts
 *
 * Builds a spatial merge index that identifies where freehand curves
 * and painted grid cells of the same color overlap. Used at render time
 * to suppress interior borders between same-color regions, creating a
 * visually unified painted area.
 *
 * This is a rendering-time operation only — no data is modified.
 */

import type { Curve } from '#types/core/curve.types';
import type { BorderSide } from '#types/core/rendering.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { flattenCurve, pointInPolygon, cellOverlapsCurve } = await requireModuleByName("curveBoolean.ts") as {
  flattenCurve: (curve: Curve, stepsPerSegment?: number) => [number, number][];
  pointInPolygon: (px: number, py: number, poly: [number, number][]) => boolean;
  cellOverlapsCurve: (cellX: number, cellY: number, cellSize: number, outerPoly: [number, number][], innerRings?: [number, number][][]) => boolean;
};

/** A 2D point as [x, y] tuple */
type Pt = [number, number];

/** Minimal cell interface for the merge index */
interface MergeCell {
  x: number;
  y: number;
  color: string;
}

/** Spatial index for curve-cell visual merging */
interface CurveCellMergeIndex {
  /** Cell borders to suppress: key "x,y" → set of sides */
  cellBordersToSuppress: Map<string, Set<BorderSide>>;
  /** Same-color cell rects per curve index (world coordinates) */
  curveCellRects: Map<number, Array<{ x: number; y: number; w: number; h: number }>>;
}

/** Direction offsets for testing edge midpoints outward from a cell */
const EDGE_OFFSETS: Array<{ side: BorderSide; mx: number; my: number; dx: number; dy: number }> = [
  { side: 'top',    mx: 0.5, my: 0.0, dx:  0, dy: -1 },
  { side: 'right',  mx: 1.0, my: 0.5, dx:  1, dy:  0 },
  { side: 'bottom', mx: 0.5, my: 1.0, dx:  0, dy:  1 },
  { side: 'left',   mx: 0.0, my: 0.5, dx: -1, dy:  0 },
];

const flatPolyCache = new WeakMap<Curve, Pt[]>();

/**
 * Get (or cache) the flattened polygon for a curve.
 */
function getCachedFlatPoly(curve: Curve): Pt[] {
  const cached = flatPolyCache.get(curve);
  if (cached) return cached;
  const poly = flattenCurve(curve);
  flatPolyCache.set(curve, poly);
  return poly;
}

/**
 * Build the merge index for a set of cells and curves.
 *
 * For each closed curve, finds all same-color cells that overlap it.
 * For each overlapping cell, determines which border sides face into the
 * curve's filled region (and should be suppressed). Also records the
 * cell rectangles per curve (for clip-based stroke suppression).
 *
 * @param cells - Painted cells with resolved colors
 * @param curves - Layer curves
 * @param cellSize - Grid cell size in world units
 * @returns Merge index for both cell border and curve stroke suppression
 */
function buildMergeIndex(
  cells: MergeCell[],
  curves: Curve[],
  cellSize: number
): CurveCellMergeIndex {
  const cellBordersToSuppress = new Map<string, Set<BorderSide>>();
  const curveCellRects = new Map<number, Array<{ x: number; y: number; w: number; h: number }>>();

  if (!cells || cells.length === 0 || !curves || curves.length === 0) {
    return { cellBordersToSuppress, curveCellRects };
  }

  // Build cell color lookup: "x,y" → color
  const cellColorMap = new Map<string, string>();
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    cellColorMap.set(`${c.x},${c.y}`, c.color);
  }

  // Epsilon for outward offset when testing edge midpoints (world units)
  const epsilon = cellSize * 0.02;

  for (let ci = 0; ci < curves.length; ci++) {
    const curve = curves[ci];
    if (!curve || !curve.closed || !curve.color || curve.color === 'transparent') continue;

    const outerPoly = getCachedFlatPoly(curve);
    if (outerPoly.length < 3) continue;

    // Build inner ring polygons (for hole checking)
    let innerPolys: Pt[][] | undefined;
    if (curve.innerRings && curve.innerRings.length > 0) {
      innerPolys = curve.innerRings.filter(r => r.length >= 3) as Pt[][];
    }

    // Compute bounding box of the curve polygon → grid coordinate range
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let p = 0; p < outerPoly.length; p++) {
      const px = outerPoly[p][0], py = outerPoly[p][1];
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }

    // Expand by one cell in each direction to catch adjacency
    const gridMinX = Math.floor(minX / cellSize) - 1;
    const gridMinY = Math.floor(minY / cellSize) - 1;
    const gridMaxX = Math.ceil(maxX / cellSize);
    const gridMaxY = Math.ceil(maxY / cellSize);

    // Check each cell in the bounding box range
    for (let gx = gridMinX; gx <= gridMaxX; gx++) {
      for (let gy = gridMinY; gy <= gridMaxY; gy++) {
        const key = `${gx},${gy}`;
        const cellColor = cellColorMap.get(key);
        if (!cellColor) continue;

        // Color must match exactly
        if (cellColor !== curve.color) continue;

        // Check geometric overlap
        if (!cellOverlapsCurve(gx, gy, cellSize, outerPoly, innerPolys)) continue;

        // This cell overlaps a same-color curve — record the cell rect
        if (!curveCellRects.has(ci)) {
          curveCellRects.set(ci, []);
        }
        curveCellRects.get(ci)!.push({
          x: gx * cellSize,
          y: gy * cellSize,
          w: cellSize,
          h: cellSize
        });

        // Determine which border sides should be suppressed.
        // A border is suppressed if the point just outside that edge
        // is inside the curve's filled region.
        const worldX = gx * cellSize;
        const worldY = gy * cellSize;

        for (const edge of EDGE_OFFSETS) {
          // Midpoint of this cell edge in world coords
          const midX = worldX + edge.mx * cellSize;
          const midY = worldY + edge.my * cellSize;

          // Offset outward from the cell
          const testX = midX + edge.dx * epsilon;
          const testY = midY + edge.dy * epsilon;

          if (pointInPolygon(testX, testY, outerPoly)) {
            // Make sure the test point isn't inside a hole
            let inHole = false;
            if (innerPolys) {
              for (let h = 0; h < innerPolys.length; h++) {
                if (pointInPolygon(testX, testY, innerPolys[h])) {
                  inHole = true;
                  break;
                }
              }
            }

            if (!inHole) {
              if (!cellBordersToSuppress.has(key)) {
                cellBordersToSuppress.set(key, new Set());
              }
              cellBordersToSuppress.get(key)!.add(edge.side);
            }
          }
        }
      }
    }
  }

  return { cellBordersToSuppress, curveCellRects };
}

return {
  buildMergeIndex,
  getCachedFlatPoly
};
