/**
 * cellToScreenConverter.ts
 *
 * Shared utility for converting cell coordinates to screen coordinates.
 * Handles grid and hex geometries, rotation, and center/corner modes.
 */

import type { Point, IGeometry } from '#types/core/geometry.types';
import { worldToCanvasPx } from '../geometry/core/viewportMath';







interface CellToScreenGeometry extends IGeometry {
  cellSize: number;
  getHexCenter?: (x: number, y: number) => { worldX: number; worldY: number };
}

interface CellToScreenMapData {
  viewState: {
    zoom: number;
    center: Point;
  };
  northDirection?: number;
}

/**
 * Convert cell coordinates to screen pixel coordinates.
 * @param useCenter If true, returns center of cell. If false, returns top-left corner (grid) or center (hex).
 */
function cellToScreen(
  cellX: number,
  cellY: number,
  geometry: CellToScreenGeometry,
  mapData: CellToScreenMapData,
  canvasWidth: number,
  canvasHeight: number,
  useCenter = true
): Point {
  const { zoom, center } = mapData.viewState;
  const northDirection = mapData.northDirection ?? 0;

  let worldX: number, worldY: number;
  if (useCenter) {
    if (geometry.getCellCenter != null) {
      const cellCenter = geometry.getCellCenter(cellX, cellY);
      worldX = cellCenter.worldX;
      worldY = cellCenter.worldY;
    } else if (geometry.getHexCenter != null) {
      const hexCenter = geometry.getHexCenter(cellX, cellY);
      worldX = hexCenter.worldX;
      worldY = hexCenter.worldY;
    } else {
      worldX = (cellX + 0.5) * geometry.cellSize;
      worldY = (cellY + 0.5) * geometry.cellSize;
    }
  } else {
    if (geometry.type === 'hex') {
      // Hex: no rectangular corners, use cell center as approximation
      if (geometry.getCellCenter != null) {
        const cellCenter = geometry.getCellCenter(cellX, cellY);
        worldX = cellCenter.worldX;
        worldY = cellCenter.worldY;
      } else if (geometry.getHexCenter != null) {
        const hexCenter = geometry.getHexCenter(cellX, cellY);
        worldX = hexCenter.worldX;
        worldY = hexCenter.worldY;
      } else {
        worldX = cellX * geometry.cellSize;
        worldY = cellY * geometry.cellSize;
      }
    } else {
      worldX = cellX * geometry.cellSize;
      worldY = cellY * geometry.cellSize;
    }
  }

  return worldToCanvasPx(
    geometry, worldX, worldY,
    { width: canvasWidth, height: canvasHeight },
    { zoom, center },
    northDirection
  );
}

export { cellToScreen };