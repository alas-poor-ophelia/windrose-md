/**
 * screenPositionUtils.ts - Shared screen position calculations for objects
 */

import type { MapData } from '#types/core/map.types';
import type { MapObject, ObjectAlignment } from '#types/objects/object.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { GeometryLadder } from '../geometry/core/createGeometryLadder';

import { ladderObjectFootprint } from './ladderHitTest';
import { getActiveLayer } from '../persistence/layerAccessor';
import { calculateViewportOffset, rotateAboutCanvasCenter } from '../geometry/core/viewportMath';

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
 * Calculate an object's screen position accounting for zoom, pan, rotation, alignment, and container positioning.
 * Under the ladder the anchor is the drawn footprint on the object's home rung
 * (held size included); null when the object is not drawn at this zoom.
 * @returns Screen position data (screenX/screenY = centre) or null if inputs invalid
 */
function calculateObjectScreenPosition(
  object: MapObject,
  canvas: HTMLCanvasElement,
  mapData: MapData,
  geometry: IGeometry,
  containerRef: ContainerRef | null = null,
  ladder: GeometryLadder | null = null
): ScreenPosition | null {
  if (mapData == null || canvas == null || geometry == null) {
    return null;
  }

  const { gridSize, viewState, northDirection, mapType } = mapData;
  if (viewState == null) return null;
  const { zoom, center } = viewState;
  const size = object.size ?? { width: 1, height: 1 };
  const alignment = object.alignment ?? 'center';

  const canvasSize = { width: canvas.width, height: canvas.height };
  const { offsetX, offsetY } = calculateViewportOffset(geometry, center, canvasSize, zoom);

  let screenX: number, screenY: number;
  let objectWidth: number, objectHeight: number;

  if (ladder !== null && mapType === 'hex') {
    const rect = ladderObjectFootprint(object, getActiveLayer(mapData).objects, {
      ladder, level: ladder.activeLevel(zoom), zoom, orientation: mapData.orientation ?? 'flat'
    });
    if (rect === null) return null;
    screenX = offsetX + rect.screenX + rect.objectWidth / 2;
    screenY = offsetY + rect.screenY + rect.objectHeight / 2;
    objectWidth = rect.objectWidth;
    objectHeight = rect.objectHeight;
  } else if (object.freeform === true && object.worldPosition != null) {
    const cellUnit = mapType === 'hex' ? (geometry as HexGeometryLike).hexSize : gridSize ?? 32;
    const cellUnitValue = cellUnit ?? 32;
    // worldPosition is the object center; screenX/screenY should also be center
    screenX = offsetX + object.worldPosition.x * zoom;
    screenY = offsetY + object.worldPosition.y * zoom;
    objectWidth = size.width * cellUnitValue * zoom;
    objectHeight = size.height * cellUnitValue * zoom;
  } else if (mapType === 'hex') {
    const hexGeom = geometry as HexGeometryLike;
    const { worldX, worldY } = hexGeom.hexToWorld(object.position.x, object.position.y);

    const hexSize = hexGeom.hexSize;
    objectWidth = size.width * hexSize * zoom;
    objectHeight = size.height * hexSize * zoom;

    screenX = offsetX + worldX * zoom;
    screenY = offsetY + worldY * zoom;

    screenX += getAlignmentScreenOffset(alignment, hexSize, zoom).x;
    screenY += getAlignmentScreenOffset(alignment, hexSize, zoom).y;
  } else {
    const scaledGridSize = (gridSize ?? 32) * zoom;
    screenX = offsetX + (object.position.x + size.width / 2) * scaledGridSize;
    screenY = offsetY + (object.position.y + size.height / 2) * scaledGridSize;

    screenX += getAlignmentScreenOffset(alignment, scaledGridSize, 1).x;
    screenY += getAlignmentScreenOffset(alignment, scaledGridSize, 1).y;

    objectWidth = size.width * scaledGridSize;
    objectHeight = size.height * scaledGridSize;
  }

  ({ x: screenX, y: screenY } = rotateAboutCanvasCenter(screenX, screenY, canvasSize, northDirection ?? 0));

  const rect = canvas.getBoundingClientRect();
  const container = containerRef?.current ?? canvas.parentElement;
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

export { calculateObjectScreenPosition };