/**
 * Canvas Renderer Hook Type Definitions
 * Path: types/hooks/canvasRenderer.types.ts
 *
 * Types for useCanvasRenderer hook - handles all canvas rendering
 * including grid, cells, objects, text labels, fog of war, and selections.
 */

import type { MapData } from '../core/map.types';
import type { IGeometry } from '../core/geometry.types';
import type { MapObject } from '../objects/object.types';
import type { TextLabel } from '../objects/note.types';
import type { LayerVisibility } from '../contexts/context.types';

// ===========================================
// Selected Item Types
// ===========================================

/** Selected item for rendering selection indicators */
export interface RendererSelectedItem {
  type: 'object' | 'text';
  id: string;
  data?: MapObject | TextLabel;
}

// LayerVisibility imported from contexts/context.types above

// ===========================================
// Theme Types
// ===========================================

/** Theme object for rendering */
export interface RendererTheme {
  grid: {
    background: string;
    lines: string;
    lineWidth?: number;
  };
  cells: {
    border: string;
    borderWidth: number;
  };
}

// ===========================================
// Renderer ViewState
// ===========================================

/** ViewState for renderer (screen coordinates) */
export interface RendererViewState {
  x: number;
  y: number;
  zoom: number;
}

// ===========================================
// Function Types
// ===========================================

/** Main render function */
export type RenderCanvas = (
  canvas: HTMLCanvasElement,
  fogCanvas: HTMLCanvasElement | null,
  mapData: MapData,
  geometry: IGeometry,
  selectedItems?: RendererSelectedItem | RendererSelectedItem[],
  isResizeMode?: boolean,
  theme?: RendererTheme | null,
  showCoordinates?: boolean,
  layerVisibility?: LayerVisibility | null
) => void;

/** useCanvasRenderer hook - triggers re-render on data changes */
export type UseCanvasRenderer = (
  canvasRef: React.RefObject<HTMLCanvasElement>,
  fogCanvasRef: React.RefObject<HTMLCanvasElement> | null,
  mapData: MapData | null,
  geometry: IGeometry | null,
  selectedItems?: RendererSelectedItem | RendererSelectedItem[],
  isResizeMode?: boolean,
  theme?: RendererTheme | null,
  showCoordinates?: boolean,
  layerVisibility?: LayerVisibility | null,
  tileImagesReady?: boolean
) => void;
