/**
 * multiSelectOperations.ts
 * 
 * Utilities for multi-select functionality:
 * - Finding items within a selection rectangle
 * - Calculating bounds for objects and text labels
 * - Batch update operations
 */

// Type-only imports
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { MapData } from '#types/core/map.types';
import type { MapObject, ObjectSize } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { SelectedItem } from '#types/contexts/context.types';
import type { HexOrientation } from '#types/settings/settings.types';

import type { GeometryLadder } from '../geometry/core/createGeometryLadder';

import { getActiveLayer } from '../persistence/layerAccessor';
import { ladderObjectFootprint } from './ladderHitTest';
import { getFontCss } from '../text/fontOptions';


// ===========================================
// Type Definitions
// ===========================================

/** World-coordinate bounding box */
export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** World coordinate point */
export interface WorldPoint {
  worldX: number;
  worldY: number;
}

/** The camera under the lattice ladder: marquee bounds follow the drawn footprint. */
interface MarqueeLadderView {
  ladder: GeometryLadder;
  level: number;
  zoom: number;
  orientation: 'flat' | 'pointy';
}

// ===========================================
// Rectangle Operations
// ===========================================

/**
 * Check if two rectangles overlap
 */
function rectsOverlap(
  minX1: number,
  minY1: number,
  maxX1: number,
  maxY1: number,
  bounds: WorldBounds
): boolean {
  return !(bounds.maxX < minX1 || bounds.minX > maxX1 ||
           bounds.maxY < minY1 || bounds.minY > maxY1);
}

// ===========================================
// Bounds Calculation
// ===========================================

/**
 * Get the world-coordinate bounds of an object.
 * Objects use grid coordinates, so we need to convert based on geometry.
 */
function getObjectWorldBounds(
  obj: MapObject,
  geometry: ExtendedGeometry,
  mapData: MapData,
  view?: MarqueeLadderView,
  allObjects?: MapObject[]
): WorldBounds | null {
  if (view !== undefined && geometry.type === 'hex') {
    // Ladder view: the drawn footprint (zoomed world px) is the selectable area
    const rect = ladderObjectFootprint(obj, allObjects ?? [obj], view);
    if (rect === null) return null;
    return {
      minX: rect.screenX / view.zoom,
      minY: rect.screenY / view.zoom,
      maxX: (rect.screenX + rect.objectWidth) / view.zoom,
      maxY: (rect.screenY + rect.objectHeight) / view.zoom
    };
  }

  const pos = obj.position;
  const size: ObjectSize = obj.size ?? { width: 1, height: 1 };

  // For grid maps: convert grid cell to world coords
  if (geometry.type === 'grid') {
    const cellSize = geometry.cellSize;
    return {
      minX: pos.x * cellSize,
      minY: pos.y * cellSize,
      maxX: (pos.x + size.width) * cellSize,
      maxY: (pos.y + size.height) * cellSize
    };
  }

  // For hex maps: get hex center in world coords and create bounds around it
  if (geometry.type === 'hex') {
    const center = geometry.hexToWorld(pos.x, pos.y);
    const hexSize = geometry.hexSize;
    
    // Approximate hex bounds as a rectangle
    const orientation: HexOrientation = (mapData as MapData & { orientation?: HexOrientation }).orientation ?? 'flat';
    let halfWidth: number, halfHeight: number;
    
    if (orientation === 'flat') {
      halfWidth = hexSize;
      halfHeight = hexSize * Math.sqrt(3) / 2;
    } else {
      halfWidth = hexSize * Math.sqrt(3) / 2;
      halfHeight = hexSize;
    }
    
    // The renderer draws a hex object from (center - hexSize / 2) at
    // size * hexSize (objectRenderer.calculateObjectPosition), so a multi-cell
    // object reaches past its anchor hex: extend the one-hex box to cover it.
    const drawnMinX = center.worldX - hexSize / 2;
    const drawnMinY = center.worldY - hexSize / 2;
    return {
      minX: Math.min(center.worldX - halfWidth, drawnMinX),
      minY: Math.min(center.worldY - halfHeight, drawnMinY),
      maxX: Math.max(center.worldX + halfWidth, drawnMinX + size.width * hexSize),
      maxY: Math.max(center.worldY + halfHeight, drawnMinY + size.height * hexSize)
    };
  }
  
  // Fallback for unknown geometry
  return {
    minX: pos.x,
    minY: pos.y,
    maxX: pos.x + 1,
    maxY: pos.y + 1
  };
}

/**
 * Get the world-coordinate bounds of a text label.
 * Text labels already use world coordinates.
 */
function getTextLabelWorldBounds(
  label: TextLabel,
  ctx: CanvasRenderingContext2D | null
): WorldBounds {
  const pos = label.position;
  const fontSize = label.fontSize || 16;
  const fontFace = label.fontFace || 'sans';
  const rotation = label.rotation ?? 0;
  
  // Measure text width
  let textWidth: number, textHeight: number;
  
  if (ctx) {
    const fontFamily = getFontCss(fontFace);
    ctx.font = `${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(label.content || '');
    textWidth = metrics.width;
    textHeight = fontSize * 1.2;
  } else {
    // Estimate if no context available
    textWidth = (label.content || '').length * fontSize * 0.6;
    textHeight = fontSize * 1.2;
  }
  
  // Add padding (same as selection box)
  const paddingX = 4;
  const paddingY = 2;
  const boundingWidth = textWidth + paddingX * 2;
  const boundingHeight = textHeight + paddingY * 2;
  
  // For rotated text, calculate the axis-aligned bounding box
  if (rotation !== 0) {
    const angleRad = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(angleRad));
    const sin = Math.abs(Math.sin(angleRad));
    const rotatedWidth = boundingWidth * cos + boundingHeight * sin;
    const rotatedHeight = boundingWidth * sin + boundingHeight * cos;
    
    return {
      minX: pos.x - rotatedWidth / 2,
      minY: pos.y - rotatedHeight / 2,
      maxX: pos.x + rotatedWidth / 2,
      maxY: pos.y + rotatedHeight / 2
    };
  }
  
  // Non-rotated: simple bounding box centered on position
  return {
    minX: pos.x - boundingWidth / 2,
    minY: pos.y - boundingHeight / 2,
    maxX: pos.x + boundingWidth / 2,
    maxY: pos.y + boundingHeight / 2
  };
}

// ===========================================
// Selection Operations
// ===========================================

/**
 * Find all objects and text labels within a world-coordinate rectangle
 */
function getItemsInWorldRect(
  mapData: MapData,
  corner1: WorldPoint,
  corner2: WorldPoint,
  geometry: ExtendedGeometry,
  ctx: CanvasRenderingContext2D | null,
  view?: MarqueeLadderView
): SelectedItem[] {
  const activeLayer = getActiveLayer(mapData);
  const items: SelectedItem[] = [];
  
  // Normalize rectangle bounds
  const minX = Math.min(corner1.worldX, corner2.worldX);
  const maxX = Math.max(corner1.worldX, corner2.worldX);
  const minY = Math.min(corner1.worldY, corner2.worldY);
  const maxY = Math.max(corner1.worldY, corner2.worldY);
  
  // Check objects
  const objects = activeLayer.objects ?? [];
  for (const obj of objects) {
    const objBounds = getObjectWorldBounds(obj, geometry, mapData, view, objects);
    if (objBounds !== null && rectsOverlap(minX, minY, maxX, maxY, objBounds)) {
      items.push({ type: 'object', id: obj.id, data: obj });
    }
  }

  // Check text labels
  const textLabels = activeLayer.textLabels ?? [];
  for (const label of textLabels) {
    const labelBounds = getTextLabelWorldBounds(label, ctx);
    if (rectsOverlap(minX, minY, maxX, maxY, labelBounds)) {
      items.push({ type: 'text', id: label.id, data: label });
    }
  }
  
  return items;
}

// ===========================================
// Exports
// ===========================================

export type { MarqueeLadderView };
export { rectsOverlap, getObjectWorldBounds, getTextLabelWorldBounds, getItemsInWorldRect };