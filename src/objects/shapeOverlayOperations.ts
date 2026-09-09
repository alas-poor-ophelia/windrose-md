/**
 * shapeOverlayOperations.ts
 *
 * Pure operations for shape overlays (square/circle). Shape overlays are
 * stored in world coordinates (`worldPosition` plus a half-extent `size`),
 * so "snapping to the grid" means quantising that world geometry rather
 * than swapping to a second, cell-based representation.
 *
 * Snapping rules (shared by the freeform toggle and by placement):
 * - the anchor moves to the centre of the cell that contains it
 * - the full extent (2 x size: the square's side, the circle's diameter)
 * becomes a whole number of cells, never fewer than one
 *
 * Everything goes through IGeometry, so grid and hex maps both work.
 */

// Type-only imports
import type { IGeometry, Point } from '#types/core/geometry.types';

/** The subset of a ShapeOverlay that snapping touches */
export interface ShapeOverlayGeometry {
  worldPosition: Point;
  size: number;
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

  return {
    worldPosition: { x: center.worldX, y: center.worldY },
    size: snapSizeToWholeCells(shape.size, cellWorldSize)
  };
}

export { snapShapeOverlayToGrid, snapSizeToWholeCells, getCellWorldSize };
