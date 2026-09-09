/**
 * shapeOverlayOperations.ts
 *
 * Pure operations for shape overlays (rectangle/circle). Shape overlays are
 * stored in world coordinates (`worldPosition` plus half-extents), so
 * "snapping to the grid" means quantising that world geometry rather than
 * swapping to a second, cell-based representation.
 *
 * Snapping rules (shared by the freeform toggle and by placement):
 * - the anchor moves to the centre of the cell that contains it
 * - each full extent (the rectangle's side, the circle's diameter) becomes a
 * whole number of cells, never fewer than one
 *
 * Everything goes through IGeometry, so grid and hex maps both work.
 */

// Type-only imports
import type { IGeometry, Point } from '#types/core/geometry.types';
import type { ShapeOverlay, ShapeOverlayType } from '#types/core/map.types';

/** The subset of a ShapeOverlay that snapping touches */
export interface ShapeOverlayGeometry {
  worldPosition: Point;
  size: number;
  /** Rectangle half-width; falls back to `size` when absent (pre-2.4.0 squares) */
  halfWidth?: number;
  /** Rectangle half-height; falls back to `size` when absent (pre-2.4.0 squares) */
  halfHeight?: number;
}

/** The subset of a ShapeOverlay that extent maths needs */
export interface ShapeOverlayExtents {
  shape?: ShapeOverlayType;
  size: number;
  halfWidth?: number;
  halfHeight?: number;
  rotation?: number;
}

/**
 * World size of one cell: `cellSize` on grid geometry, the hex size on hex
 * geometry. `getScaledCellSize(1)` is the interface-level fallback so this
 * never has to duck-type the geometry instance.
 */
function getCellWorldSize(geometry: IGeometry): number {
  const cellSize = geometry.cellSize ?? geometry.getScaledCellSize(1);
  return Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 1;
}

/**
 * Round a half-extent so the full extent spans a whole number of cells.
 * Minimum one cell, so a snapped shape is always visible.
 */
function snapSizeToWholeCells(size: number, cellWorldSize: number): number {
  const cells = Math.max(1, Math.round((size * 2) / cellWorldSize));
  return (cells * cellWorldSize) / 2;
}

/**
 * Snap a shape overlay's geometry to the grid: anchor to the containing
 * cell's centre, full extent to a whole number of cells.
 *
 * @param shape - Current world position and half-extent
 * @param geometry - Grid or hex geometry for the map
 * @returns New world position and half-extent (inputs are not mutated)
 */
function snapShapeOverlayToGrid(shape: ShapeOverlayGeometry, geometry: IGeometry): ShapeOverlayGeometry {
  const cellWorldSize = getCellWorldSize(geometry);
  const cell = geometry.worldToGrid(shape.worldPosition.x, shape.worldPosition.y);
  const center = geometry.getCellCenter(cell.x, cell.y);
  const { halfWidth, halfHeight } = getShapeHalfExtents(shape);
  const snappedHalfWidth = snapSizeToWholeCells(halfWidth, cellWorldSize);
  const snappedHalfHeight = snapSizeToWholeCells(halfHeight, cellWorldSize);

  return {
    worldPosition: { x: center.worldX, y: center.worldY },
    // `size` stays the larger half-extent so older builds draw a sane square
    size: Math.max(snappedHalfWidth, snappedHalfHeight),
    halfWidth: snappedHalfWidth,
    halfHeight: snappedHalfHeight
  };
}

/**
 * Per-axis half-extents of a shape. Pre-2.4.0 saves have no `halfWidth`/
 * `halfHeight`, so both fall back to the single `size` half-extent.
 */
function getShapeHalfExtents(shape: ShapeOverlayExtents): { halfWidth: number; halfHeight: number } {
  const halfWidth = Number.isFinite(shape.halfWidth) ? (shape.halfWidth as number) : shape.size;
  const halfHeight = Number.isFinite(shape.halfHeight) ? (shape.halfHeight as number) : shape.size;
  return { halfWidth, halfHeight };
}

/**
 * Axis-aligned bounding half-extents of a shape as it is drawn.
 *
 * Circles are radial, so rotation never grows their box. Rectangles use the
 * standard rotated-box formula, with `extraRotation` folded in for callers
 * that measure on a canvas already turned by the map's north direction.
 */
function getShapeBoundingHalfExtents(
  shape: ShapeOverlayExtents,
  extraRotation = 0
): { halfWidth: number; halfHeight: number } {
  if (shape.shape === 'circle') {
    return { halfWidth: shape.size, halfHeight: shape.size };
  }
  const { halfWidth, halfHeight } = getShapeHalfExtents(shape);
  const angle = ((shape.rotation ?? 0) + extraRotation) * Math.PI / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return {
    halfWidth: halfWidth * cos + halfHeight * sin,
    halfHeight: halfWidth * sin + halfHeight * cos
  };
}

/**
 * World-space hit test. Rectangles un-rotate the query point about the shape
 * centre and then test axis-aligned; circles ignore rotation entirely.
 */
function hitTestShapeOverlay(shape: ShapeOverlay, worldX: number, worldY: number): boolean {
  const dx = worldX - shape.worldPosition.x;
  const dy = worldY - shape.worldPosition.y;

  if (shape.shape === 'circle') {
    return dx * dx + dy * dy <= shape.size * shape.size;
  }

  const { halfWidth, halfHeight } = getShapeHalfExtents(shape);
  const angle = -(shape.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
}

export {
  snapShapeOverlayToGrid,
  snapSizeToWholeCells,
  getCellWorldSize,
  getShapeHalfExtents,
  getShapeBoundingHalfExtents,
  hitTestShapeOverlay
};
