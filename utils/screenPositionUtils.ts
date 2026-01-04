/**
 * screenPositionUtils.ts - Shared screen position calculations for objects
 */

import type { MapData } from '#types/core/map.types';
import type { MapObject, ObjectAlignment } from '#types/objects/object.types';
import type { IGeometry } from '#types/core/geometry.types';

/** Screen position result */
interface ScreenPosition {
  screenX: number;
  screenY: number;
  objectWidth: number;
  objectHeight: number;
}

/** Screen offset */
interface ScreenOffset {
  x: number;
  y: number;
}

/** Container reference type */
interface ContainerRef {
  current: HTMLElement | null;
}

/** Extended geometry with hex-specific methods */
interface HexGeometryLike extends IGeometry {
  hexSize: number;
  hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
}

/**
 * Calculate an object's screen position accounting for zoom, pan, rotation, alignment, and container positioning
 * @returns Screen position data or null if inputs invalid
 */
function calculateObjectScreenPosition(
  object: MapObject,
  canvas: HTMLCanvasElement,
  mapData: MapData,
  geometry: IGeometry,
  containerRef: ContainerRef | null = null
): ScreenPosition | null {
  if (!mapData || !canvas || !geometry) {
    return null;
  }

  const { gridSize, viewState, northDirection, mapType } = mapData;
  const { zoom, center } = viewState;
  const size = object.size || { width: 1, height: 1 };
  const alignment = object.alignment || 'center';

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  let offsetX: number, offsetY: number, screenX: number, screenY: number;
  let objectWidth: number, objectHeight: number;

  if (mapType === 'hex') {
    const hexGeom = geometry as HexGeometryLike;
    const { worldX, worldY } = hexGeom.hexToWorld(object.position.x, object.position.y);

    const hexSize = hexGeom.hexSize;
    objectWidth = size.width * hexSize * zoom;
    objectHeight = size.height * hexSize * zoom;

    offsetX = centerX - center.x * zoom;
    offsetY = centerY - center.y * zoom;

    screenX = offsetX + worldX * zoom;
    screenY = offsetY + worldY * zoom;

    screenX += getAlignmentScreenOffset(alignment, hexSize, zoom).x;
    screenY += getAlignmentScreenOffset(alignment, hexSize, zoom).y;
  } else {
    const scaledGridSize = gridSize * zoom;
    offsetX = centerX - center.x * scaledGridSize;
    offsetY = centerY - center.y * scaledGridSize;

    screenX = offsetX + (object.position.x + size.width / 2) * scaledGridSize;
    screenY = offsetY + (object.position.y + size.height / 2) * scaledGridSize;

    screenX += getAlignmentScreenOffset(alignment, scaledGridSize, 1).x;
    screenY += getAlignmentScreenOffset(alignment, scaledGridSize, 1).y;

    objectWidth = size.width * scaledGridSize;
    objectHeight = size.height * scaledGridSize;
  }

  if (northDirection !== 0) {
    const relX = screenX - centerX;
    const relY = screenY - centerY;

    const angleRad = (northDirection * Math.PI) / 180;
    const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
    const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);

    screenX = centerX + rotatedX;
    screenY = centerY + rotatedY;
  }

  const rect = canvas.getBoundingClientRect();
  const container = containerRef?.current || canvas.parentElement;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();

  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;

  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  return {
    screenX: (screenX * scaleX) + canvasOffsetX,
    screenY: (screenY * scaleY) + canvasOffsetY,
    objectWidth: objectWidth * scaleX,
    objectHeight: objectHeight * scaleY
  };
}

/**
 * Calculate screen space offset for edge alignment
 */
function getAlignmentScreenOffset(
  alignment: ObjectAlignment,
  cellSize: number,
  zoom: number
): ScreenOffset {
  const halfCell = (cellSize * zoom) / 2;

  switch (alignment) {
    case 'north': return { x: 0, y: -halfCell };
    case 'south': return { x: 0, y: halfCell };
    case 'east': return { x: halfCell, y: 0 };
    case 'west': return { x: -halfCell, y: 0 };
    case 'center':
    default: return { x: 0, y: 0 };
  }
}

/**
 * Apply inverse rotation transformation to coordinates
 * Used when converting screen/canvas coordinates back to world/grid coordinates
 */
function applyInverseRotation(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  northDirection: number
): ScreenOffset {
  if (northDirection === 0) {
    return { x, y };
  }

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  const translatedX = x - centerX;
  const translatedY = y - centerY;

  const angleRad = (-northDirection * Math.PI) / 180;
  const rotatedX = translatedX * Math.cos(angleRad) - translatedY * Math.sin(angleRad);
  const rotatedY = translatedX * Math.sin(angleRad) + translatedY * Math.cos(angleRad);

  return {
    x: rotatedX + centerX,
    y: rotatedY + centerY
  };
}

return { calculateObjectScreenPosition, applyInverseRotation, getAlignmentScreenOffset };
