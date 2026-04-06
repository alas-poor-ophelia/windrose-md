/**
 * cellToScreenConverter.ts
 *
 * Shared utility for converting cell coordinates to screen coordinates.
 * Handles grid and hex geometries, rotation, and center/corner modes.
 */

import type { Point, IGeometry } from '#types/core/geometry.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { GridGeometry } = await requireModuleByName("GridGeometry.ts") as {
  GridGeometry: new (...args: unknown[]) => IGeometry;
};

interface CellToScreenGeometry extends IGeometry {
  cellSize: number;
  getCellCenter?: (x: number, y: number) => { worldX: number; worldY: number };
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
  const northDirection = mapData.northDirection || 0;

  let worldX: number, worldY: number;
  if (useCenter) {
    if (geometry.getCellCenter) {
      const cellCenter = geometry.getCellCenter(cellX, cellY);
      worldX = cellCenter.worldX;
      worldY = cellCenter.worldY;
    } else if (geometry.getHexCenter) {
      const hexCenter = geometry.getHexCenter(cellX, cellY);
      worldX = hexCenter.worldX;
      worldY = hexCenter.worldY;
    } else {
      worldX = (cellX + 0.5) * geometry.cellSize;
      worldY = (cellY + 0.5) * geometry.cellSize;
    }
  } else {
    if (geometry.getCellCenter) {
      // Hex: no rectangular corners, use cell center as approximation
      const cellCenter = geometry.getCellCenter(cellX, cellY);
      worldX = cellCenter.worldX;
      worldY = cellCenter.worldY;
    } else if (geometry.getHexCenter) {
      const hexCenter = geometry.getHexCenter(cellX, cellY);
      worldX = hexCenter.worldX;
      worldY = hexCenter.worldY;
    } else {
      worldX = cellX * geometry.cellSize;
      worldY = cellY * geometry.cellSize;
    }
  }

  let offsetX: number, offsetY: number;
  if (geometry instanceof GridGeometry) {
    const scaledCellSize = geometry.getScaledCellSize!(zoom);
    offsetX = canvasWidth / 2 - center.x * scaledCellSize;
    offsetY = canvasHeight / 2 - center.y * scaledCellSize;
  } else {
    offsetX = canvasWidth / 2 - center.x * zoom;
    offsetY = canvasHeight / 2 - center.y * zoom;
  }

  let screenX = offsetX + worldX * zoom;
  let screenY = offsetY + worldY * zoom;

  if (northDirection !== 0) {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    screenX -= centerX;
    screenY -= centerY;

    const angleRad = (northDirection * Math.PI) / 180;
    const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
    const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);

    screenX = rotatedX + centerX;
    screenY = rotatedY + centerY;
  }

  return { x: screenX, y: screenY };
}

return { cellToScreen };
