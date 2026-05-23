/**
 * Canvas Renderer Hook Type Definitions
 *
 * Types for useCanvasRenderer hook - handles all canvas rendering
 * including grid, cells, objects, text labels, fog of war, and selections.
 */

import type { RefObject } from 'preact';
import type { MapData } from '../core/map.types';
import type { IGeometry } from '../core/geometry.types';
import type { LayerVisibility, SelectedItem } from '../contexts/context.types';
export type { LayerVisibility };

/** Adjacent sub-hex map for ghost preview rendering */
export interface AdjacentSubHexRenderData {
  hexKey: string;
  /** Delta from current hex in axial coords */
  dq: number;
  dr: number;
  mapData: MapData;
  name: string;
}

// ===========================================
// Selected Item Types
// ===========================================

/** Renderer accepts canonical SelectedItem; only processes 'object' and 'text' variants */
export type RendererSelectedItem = SelectedItem;

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

/** Optional rendering parameters */
export interface RenderCanvasOptions {
  isResizeMode?: boolean;
  theme?: RendererTheme | null;
  showCoordinates?: boolean;
  layerVisibility?: LayerVisibility | null;
  adjacentSubHexes?: AdjacentSubHexRenderData[] | null;
}

/** Main render function */
export type RenderCanvas = (
  canvas: HTMLCanvasElement,
  fogCanvas: HTMLCanvasElement | null,
  mapData: MapData,
  geometry: IGeometry,
  selectedItems?: RendererSelectedItem | RendererSelectedItem[],
  options?: RenderCanvasOptions,
) => void;

/** Additional hook-specific options beyond RenderCanvasOptions */
export interface UseCanvasRendererOptions extends RenderCanvasOptions {
  tileImagesReady?: boolean;
}

/** useCanvasRenderer hook - triggers re-render on data changes */
export type UseCanvasRenderer = (
  canvasRef: RefObject<HTMLCanvasElement>,
  fogCanvasRef: RefObject<HTMLCanvasElement> | null,
  mapData: MapData | null,
  geometry: IGeometry | null,
  selectedItems?: RendererSelectedItem | RendererSelectedItem[],
  options?: UseCanvasRendererOptions,
) => void;
