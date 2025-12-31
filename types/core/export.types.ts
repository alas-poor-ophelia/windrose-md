/**
 * Export Type Definitions
 * Path: types/core/export.types.ts
 * 
 * Types for map export functionality - image generation, rendering parameters,
 * and file operations.
 */

import type { Point, BoundingBox } from './geometry.types';
import type { MapData } from './map.types';
import type { Cell } from './cell.types';
import type { MapObject } from '../objects/object.types';
import type { HexColor } from '../settings/settings.types';

// ===========================================
// Export Geometry Interface
// ===========================================

/** Geometry interface with bounds methods needed for export */
export interface ExportGeometry {
  getCellBounds(cell: Cell): BoundingBox;
  getObjectBounds(obj: MapObject): BoundingBox;
  worldToGrid?(worldX: number, worldY: number): Point;
}

// ===========================================
// Render Parameters
// ===========================================

/** Render parameters for canvas export */
export interface RenderParams {
  mapData: MapData;
  geometry: ExportGeometry;
  bounds: BoundingBox;
  width: number;
  height: number;
}

// ===========================================
// Export Result
// ===========================================

/** Export operation result */
export interface ExportResult {
  success: boolean;
  path?: string;
  error?: string;
}

// ===========================================
// Export Theme
// ===========================================

/** Theme configuration for export rendering */
export interface ExportTheme {
  grid: {
    lines: HexColor;
    lineWidth: number;
    background: HexColor;
  };
  cells: {
    fill: HexColor;
    border: HexColor;
    borderWidth: number;
  };
  compass: {
    color: HexColor;
    size: number;
  };
  decorativeBorder: {
    color: HexColor;
    width: number;
    pattern: string;
  };
  coordinateKey: HexColor;
}

// ===========================================
// Visibility Options
// ===========================================

/** Layer visibility options for export rendering */
export interface ExportVisibilityOptions {
  objects: boolean;
  textLabels: boolean;
  hexCoordinates: boolean;
}