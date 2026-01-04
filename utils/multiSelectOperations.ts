/**
 * multiSelectOperations.ts
 * 
 * Utilities for multi-select functionality:
 * - Finding items within a selection rectangle
 * - Calculating bounds for objects and text labels
 * - Batch update operations
 */

// Type-only imports
import type { Point } from '#types/core/geometry.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject, ObjectSize } from '#types/objects/object.types';
import type { TextLabel, FontFace } from './textLabelOperations';
import type { IGeometry } from '#types/core/geometry.types';
import type { HexOrientation } from '#types/settings/settings.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer
};

const { getFontCss } = await requireModuleByName("fontOptions.ts") as {
  getFontCss: (fontFace: FontFace) => string
};

const { GridGeometry } = await requireModuleByName("GridGeometry.ts") as {
  GridGeometry: new () => GridGeometryInstance
};

const { HexGeometry } = await requireModuleByName("HexGeometry.ts") as {
  HexGeometry: new () => HexGeometryInstance
};

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

/** Item types in selection */
export type SelectableItemType = 'object' | 'text';

/** Selected item reference */
export interface SelectedItem {
  type: SelectableItemType;
  id: string;
  data: MapObject | TextLabel;
}

/** Position update for group move */
export interface PositionUpdate {
  id: string;
  position: Point;
}

/** Grid geometry instance interface */
interface GridGeometryInstance extends IGeometry {
  cellSize: number;
}

/** Hex geometry instance interface */
interface HexGeometryInstance extends IGeometry {
  hexSize: number;
  hexToWorld(q: number, r: number): { worldX: number; worldY: number };
}

/** Geometry with bounds check */
interface GeometryWithBounds {
  isWithinBounds?(x: number, y: number): boolean;
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
  geometry: IGeometry,
  mapData: MapData
): WorldBounds {
  const pos = obj.position;
  const size: ObjectSize = obj.size || { width: 1, height: 1 };
  
  // For grid maps: convert grid cell to world coords
  if (geometry instanceof GridGeometry) {
    const cellSize = (geometry as GridGeometryInstance).cellSize;
    return {
      minX: pos.x * cellSize,
      minY: pos.y * cellSize,
      maxX: (pos.x + size.width) * cellSize,
      maxY: (pos.y + size.height) * cellSize
    };
  }
  
  // For hex maps: get hex center in world coords and create bounds around it
  if (geometry instanceof HexGeometry) {
    const hexGeo = geometry as HexGeometryInstance;
    const center = hexGeo.hexToWorld(pos.x, pos.y);
    const hexSize = hexGeo.hexSize;
    
    // Approximate hex bounds as a rectangle
    const orientation: HexOrientation = (mapData as MapData & { orientation?: HexOrientation }).orientation || 'flat';
    let halfWidth: number, halfHeight: number;
    
    if (orientation === 'flat') {
      halfWidth = hexSize;
      halfHeight = hexSize * Math.sqrt(3) / 2;
    } else {
      halfWidth = hexSize * Math.sqrt(3) / 2;
      halfHeight = hexSize;
    }
    
    return {
      minX: center.worldX - halfWidth,
      minY: center.worldY - halfHeight,
      maxX: center.worldX + halfWidth,
      maxY: center.worldY + halfHeight
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
  const rotation = label.rotation || 0;
  
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
  geometry: IGeometry,
  ctx: CanvasRenderingContext2D | null
): SelectedItem[] {
  const activeLayer = getActiveLayer(mapData);
  const items: SelectedItem[] = [];
  
  // Normalize rectangle bounds
  const minX = Math.min(corner1.worldX, corner2.worldX);
  const maxX = Math.max(corner1.worldX, corner2.worldX);
  const minY = Math.min(corner1.worldY, corner2.worldY);
  const maxY = Math.max(corner1.worldY, corner2.worldY);
  
  // Check objects
  const objects = activeLayer.objects || [];
  for (const obj of objects) {
    const objBounds = getObjectWorldBounds(obj as unknown as MapObject, geometry, mapData);
    if (rectsOverlap(minX, minY, maxX, maxY, objBounds)) {
      items.push({ type: 'object', id: obj.id, data: obj as unknown as MapObject });
    }
  }
  
  // Check text labels
  const textLabels = activeLayer.textLabels || [];
  for (const label of textLabels) {
    const labelBounds = getTextLabelWorldBounds(label as unknown as TextLabel, ctx);
    if (rectsOverlap(minX, minY, maxX, maxY, labelBounds)) {
      items.push({ type: 'text', id: label.id, data: label as unknown as TextLabel });
    }
  }
  
  return items;
}

/**
 * Calculate the combined bounding box for multiple selected items.
 * Used for positioning the multi-select toolbar.
 */
function getSelectionBounds(
  selectedItems: SelectedItem[] | null | undefined,
  geometry: IGeometry,
  mapData: MapData,
  ctx: CanvasRenderingContext2D | null
): WorldBounds | null {
  if (!selectedItems || selectedItems.length === 0) {
    return null;
  }
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const item of selectedItems) {
    let bounds: WorldBounds | undefined;
    
    if (item.type === 'object') {
      bounds = getObjectWorldBounds(item.data as MapObject, geometry, mapData);
    } else if (item.type === 'text') {
      bounds = getTextLabelWorldBounds(item.data as TextLabel, ctx);
    }
    
    if (bounds) {
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }
  
  if (minX === Infinity) {
    return null;
  }
  
  return { minX, minY, maxX, maxY };
}

// ===========================================
// Bounds Validation
// ===========================================

/**
 * Check if a position is within map bounds
 */
function isWithinBounds(
  gridX: number,
  gridY: number,
  geometry: IGeometry & GeometryWithBounds | null,
  mapData: MapData
): boolean {
  if (!geometry) return true;
  
  // Use geometry's bounds check if available
  if (geometry.isWithinBounds) {
    return geometry.isWithinBounds(gridX, gridY);
  }
  
  // For grid maps without explicit bounds, assume unbounded
  return true;
}

/**
 * Validate that all positions in a group move are within bounds
 */
function validateGroupMove(
  updates: PositionUpdate[],
  geometry: IGeometry & GeometryWithBounds | null,
  mapData: MapData
): boolean {
  for (const update of updates) {
    if (update.position) {
      if (!isWithinBounds(update.position.x, update.position.y, geometry, mapData)) {
        return false;
      }
    }
  }
  return true;
}

// ===========================================
// Exports
// ===========================================

return {
  rectsOverlap,
  getObjectWorldBounds,
  getTextLabelWorldBounds,
  getItemsInWorldRect,
  getSelectionBounds,
  isWithinBounds,
  validateGroupMove
};