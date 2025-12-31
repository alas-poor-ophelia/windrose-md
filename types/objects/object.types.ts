/**
 * Map Object Type Definitions
 * Path: types/objects/object.types.ts
 * 
 * Object placement and manipulation types.
 * Populated during Phase 1 (Tier 3 migration - objectTypes.ts, objectOperations.js).
 */

import type { Point } from '../core/geometry.types';

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
// Object Definition
// ===========================================

/** Object type definition (from objectTypes.ts) */
export interface ObjectTypeDef {
  id: string;
  name: string;
  category: ObjectCategory;
  symbol: string;
  defaultSize: number;
  rotatable: boolean;
}

// ===========================================
// Placed Object Instance
// ===========================================

/** Unique object instance ID */
export type ObjectId = string;

/** A placed object on the map */
export interface MapObject {
  id: ObjectId;
  typeId: string;
  position: Point;
  size: number;
  rotation: number;
  color?: string;
  opacity?: number;
  locked?: boolean;
  layerId?: string;
}

// ===========================================
// Object Operations
// ===========================================

/** Object placement result */
export interface PlaceObjectResult {
  success: boolean;
  object: MapObject | null;
  error?: string;
}

// TODO: Expand during objectOperations.js migration