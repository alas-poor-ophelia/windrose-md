/**
 * Export Type Definitions
 *
 * Types for map export functionality - image generation, rendering parameters,
 * and file operations.
 */

import type { BoundingBox } from './geometry.types';
import type { LayerId, MapData } from './map.types';
import type { ExtendedGeometry, LayerVisibility } from '../contexts/context.types';

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
// Image Export Options
// ===========================================

/** A map layer chosen for image export, with the opacity it composites at */
export interface ExportLayerOption {
  id: LayerId;
  /** 0-1 multiplier applied to the layer's cells, curves, wall paths and tiles */
  opacity: number;
}

/** Everything the image export dialog collects */
export interface ExportImageOptions {
  /** Layers to composite; resolved and drawn bottom-to-top by layer order */
  layers: ExportLayerOption[];
  /** Content categories the canvas renderer gates */
  visibility: LayerVisibility;
  /** Padding in world units added around the content bounds */
  buffer?: number;
}