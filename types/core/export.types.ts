/**
 * Export Type Definitions
 *
 * Types for map export functionality - image generation, rendering parameters,
 * and file operations.
 */

import type { BoundingBox } from './geometry.types';
import type { MapData } from './map.types';
import type { HexColor } from './common.types';
import type { ExtendedGeometry } from '../contexts/context.types';

// ===========================================
// Render Parameters
// ===========================================

/** Render parameters for canvas export */
export interface RenderParams {
  mapData: MapData;
  geometry: ExtendedGeometry;
  bounds: BoundingBox;
  width: number;
  height: number;
}

// ===========================================
// Export Result
// ===========================================

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