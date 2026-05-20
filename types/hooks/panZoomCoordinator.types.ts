/**
 * Pan/Zoom Coordinator Hook Type Definitions
 * Path: types/hooks/panZoomCoordinator.types.ts
 *
 * Types for usePanZoomCoordinator hook - coordinates pan and zoom
 * interactions between canvas interaction logic and event handlers.
 */

import type { RefObject } from 'preact';
import type { MapData } from '../core/map.types';
import type { IGeometry } from '../core/geometry.types';

// ===========================================
// Hook Options
// ===========================================

/** Options for usePanZoomCoordinator hook */
export interface UsePanZoomCoordinatorOptions {
  canvasRef: RefObject<HTMLCanvasElement>;
  mapData: MapData | null;
  geometry: IGeometry | null;
  isFocused: boolean;
}
