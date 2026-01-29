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
  | 'notes'
  | 'navigation'
  | 'hazards'
  | 'features'
  | 'encounters'
  | 'markers'
  | 'custom';

// ===========================================
// Object Alignment
// ===========================================

/** Object alignment within a cell (grid maps) */
export type ObjectAlignment = 'center' | 'north' | 'south' | 'east' | 'west';

// ===========================================
// Object Type Definitions
// ===========================================

/** Object type identifier (e.g., "door", "chest", "trap") */
export type ObjectTypeId = string;

/**
 * Base object type definition (built-in objects from objectTypes.ts)
 * These are the raw definitions before resolution.
 */
export interface ObjectType {
  id: ObjectTypeId;
  symbol: string;
  label: string;
  category: ObjectCategory;
}

/**
 * Resolved object type definition (from objectTypeResolver)
 * Extends base type with iconClass support and resolution metadata.
 */
export interface ObjectTypeDefinition {
  id: ObjectTypeId;
  symbol?: string;           // Unicode symbol (optional if iconClass or imagePath set)
  iconClass?: string;        // RPGAwesome icon class (optional if symbol or imagePath set)
  imagePath?: string;        // Vault image path for custom image objects
  label: string;
  category: ObjectCategory;
  order?: number;            // Sort order in UI
  isBuiltIn?: boolean;       // True for built-in objects
  isModified?: boolean;      // True if built-in was customized
  isCustom?: boolean;        // True for user-created objects
  isHidden?: boolean;        // True if hidden via override
  isUnknown?: boolean;       // True for unknown/deleted object fallback
}

/** @deprecated Use ObjectTypeDefinition instead */
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
// Category Definitions
// ===========================================

/**
 * Base category definition (built-in categories from objectTypes.ts)
 */
export interface Category {
  id: string;
  label: string;
}

/**
 * Resolved category definition (from objectTypeResolver)
 * Extends base type with resolution metadata.
 */
export interface CategoryDefinition {
  id: string;
  label: string;
  order?: number;            // Sort order in UI
  isBuiltIn?: boolean;       // True for built-in categories
  isCustom?: boolean;        // True for user-created categories
}

// ===========================================
// Render Helpers
// ===========================================

/** Result of getRenderChar() - the character to display for an object */
export interface RenderChar {
  char: string;              // The character/icon to render
  isIcon: boolean;           // True if char is from RPGAwesome font
  isImage?: boolean;         // True if rendering via image (imagePath)
  imagePath?: string;        // Vault image path for image rendering
}

// ===========================================
// Validation
// ===========================================

/** Result of object definition validation */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
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
  type: ObjectTypeId;     // typeId reference
  position: Point;
  size: ObjectSize;
  label?: string;
  customTooltip?: string; // Custom tooltip text (shown on hover)
  linkedNote?: string | null;
  linkedObject?: ObjectLink | null;
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

// ===========================================
// Object Linking
// ===========================================

/** Reference to a linked object within the same map (cross-layer navigation) */
export interface ObjectLink {
  layerId: string;
  objectId: string;
  position: Point;
  objectType?: string;
}