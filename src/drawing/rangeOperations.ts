/**
 * rangeOperations.ts
 *
 * Cells-within-range enumeration for range-based features (party pin range
 * ring, in-range queries). All distance tests route through
 * geometry.getCellDistance so results agree exactly with the measure tool
 * under every diagonal rule and on hex maps. getCellsInCircle is NOT used
 * here: its grid implementation is Euclidean-only and diverges from the
 * measure tool under 'alternating'/'equal' rules.
 */

// Type-only imports
import type { IGeometry, Point, DistanceOptions } from '#types';

/**
 * Tolerance for unit→cell conversions: a cell exactly at the range boundary
 * must be included even when floating-point division lands a hair over.
 */
const RANGE_EPSILON = 1e-6;

/**
 * Enumeration safety cap, in cells from the center. Bounds the bounding-box
 * scan at (2 * 512 + 1)^2 candidates so a pathological range value cannot
 * freeze the UI; beyond this reach callers should present the geometric
 * circle style instead of per-cell highlights.
 */
const MAX_RANGE_REACH = 512;

/**
 * Convert a range in map distance units to a radius in cells.
 * @param rangeInUnits - Range in the map's distance units (e.g. 30 ft)
 * @param distancePerCell - Real-world units per cell (e.g. 5 ft)
 */
function rangeUnitsToCells(rangeInUnits: number, distancePerCell: number): number {
  if (!(distancePerCell > 0) || !(rangeInUnits > 0)) return 0;
  return rangeInUnits / distancePerCell;
}

/**
 * Check whether a cell lies within range of a center cell under the map's
 * distance rules.
 * @param center - Center cell in native coordinates (col/row or q/r)
 * @param cell - Candidate cell in native coordinates
 * @param rangeInCells - Range radius in cells
 * @param options - Diagonal rule (grid maps; ignored for hex)
 */
function isCellWithinRange(
  geometry: IGeometry,
  center: Point,
  cell: Point,
  rangeInCells: number,
  options?: DistanceOptions
): boolean {
  const distance = geometry.getCellDistance(center.x, center.y, cell.x, cell.y, options);
  return distance <= rangeInCells + RANGE_EPSILON;
}

/**
 * Enumerate all in-bounds cells within range of a center cell.
 *
 * Scans the native-coordinate bounding box around the center, then filters
 * through getCellDistance. The box is guaranteed to cover the disk because
 * every supported metric (hex distance and all three grid diagonal rules)
 * is bounded below by Chebyshev distance in native coordinates.
 *
 * @param center - Center cell in native coordinates (col/row or q/r)
 * @param rangeInCells - Range radius in cells
 * @param options - Diagonal rule (grid maps; ignored for hex)
 * @returns Cells within range, including the center cell
 */
function getCellsWithinRange(
  geometry: IGeometry,
  center: Point,
  rangeInCells: number,
  options?: DistanceOptions
): Point[] {
  if (!(rangeInCells >= 0)) return [];
  const reach = Math.min(Math.ceil(rangeInCells + RANGE_EPSILON), MAX_RANGE_REACH);

  const cells: Point[] = [];
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (!geometry.isWithinBounds(x, y)) continue;
      if (isCellWithinRange(geometry, center, { x, y }, rangeInCells, options)) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

export { rangeUnitsToCells, isCellWithinRange, getCellsWithinRange, MAX_RANGE_REACH };
