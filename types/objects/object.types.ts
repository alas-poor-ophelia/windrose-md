/**
 * Map Object Type Definitions
 *
 * Object placement and manipulation types.
 * Updated during Tier 3 migration (objectOperations.ts).
 */

import type { Point } from '../core/geometry.types';
import type { MapType } from '../core/map.types';

// ===========================================
// Object Categories
// ===========================================

/** Object category for grouping in UI */
export type ObjectCategory = 
  | 'structures'
  | 'doors'
  | 'furniture'
  | 'hazards'
  | 'nature'
  | 'symbols'
  | 'custom';

// ===========================================
// Object Alignment
// ===========================================

/** Object alignment within a cell (grid maps) */
export type ObjectAlignment = 'center' | 'north' | 'south' | 'east' | 'west';

// ===========================================
// Object Type Definition
// ===========================================

/** Object type identifier (e.g., "door", "chest", "trap") */
export type ObjectTypeId = string;

/** Object type definition (from objectTypes/objectTypeResolver) */
export interface ObjectTypeDef {
  id: ObjectTypeId;
  name: string;
  label?: string;
  category: ObjectCategory;
  symbol: string;
  defaultSize?: number;
  rotatable?: boolean;
  isUnknown?: boolean;
  isCustom?: boolean;
}

// ===========================================
// Object Size
// ===========================================

export interface ObjectSize {
  width: number;
  height: number;
}

// ===========================================
// Placed Object Instance
// ===========================================

/** Unique object instance ID */
export type ObjectId = string;

export interface MapObject {
  id: ObjectId;
  type: string;           // typeId reference
  position: Point;
  size: ObjectSize;
  label?: string;
  linkedNote?: string | null;
  alignment?: ObjectAlignment;
  slot?: number;          // Hex maps: slot position (0-3)
  scale?: number;         // Rendering scale (0.25-1.3)
  rotation?: number;      // Rotation in degrees
  color?: string;
  opacity?: number;
  locked?: boolean;
  layerId?: string;
}

export type ObjectUpdate = Partial<Omit<MapObject, 'id'>>;

// ===========================================
// Operation Results
// ===========================================

/** Result of object placement operation */
export interface PlacementResult {
  objects: MapObject[];
  success: boolean;
  error?: string;
  object?: MapObject;
}

/** Result of object removal operation */
export interface RemovalResult {
  objects: MapObject[];
  success: boolean;
  removed?: MapObject;
}

// ===========================================
// Placement Options
// ===========================================

/** Options for placeObject unified API */
export interface PlacementOptions {
  mapType: MapType;
  alignment?: ObjectAlignment;
}

// ===========================================
// Alignment Offset
// ===========================================

export interface AlignmentOffset {
  offsetX: number;
  offsetY: number;
}

// ===========================================
// Hex Slot Types
// ===========================================

/** Slot position for multi-object hex cells (0-3) */
export type HexSlot = 0 | 1 | 2 | 3;

/** Maximum objects per hex cell */
export const MAX_OBJECTS_PER_HEX = 4;