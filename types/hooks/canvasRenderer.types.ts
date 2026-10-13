/**
 * Canvas Renderer Hook Type Definitions
 *
 * Types for useCanvasRenderer hook - handles all canvas rendering
 * including grid, cells, objects, text labels, fog of war, and selections.
 */

import type { RefObject } from 'preact';
import type { MapData, StoredViewState } from '../core/map.types';
import type { ExtendedGeometry, LayerVisibility, SelectedItem } from '../contexts/context.types';
import type { ExportLayerOption } from '../core/export.types';
import type { ViewController } from './viewController.types';
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

/**
 * Adjacent sub-hex slot with no navigable sibling yet (missing, or existing
 * but empty). Rendered as a "+" affordance where the sibling's label would be.
 */
export interface AdjacentEmptySlotRenderData {
  hexKey: string;
  /** Delta from current hex in axial coords */
  dq: number;
  dr: number;
  /** True when the sibling sub-map exists but has no content yet. */
  exists: boolean;
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
  /** Empty adjacent slots rendered as "+" create affordances (sub-hex view). */
  adjacentEmptySlots?: AdjacentEmptySlotRenderData[] | null;
  hiddenTileLayers?: Set<string>;
  /** Flips when async tile images finish loading; part of the static-layer cache key. */
  tileImagesReady?: boolean;
  /**
   * Wall currently being edit-dragged. Excluded from the static raster so the
   * live overlay preview owns it — the gesture pays one re-raster on drag start
   * (to drop it) and one on commit (to re-include it), not one per frame.
   */
  draggingWallId?: string | null;
  /**
   * Current sub-hex drill path ('/'-joined "q,r" hexKeys); null at root. Keys
   * the parent-map backdrop snapshot, which only renders for the exact path it
   * was captured for.
   */
  subHexPath?: string | null;
  /**
   * Live viewState from the ViewController during a pan/zoom/pinch gesture.
   * When present it OVERRIDES mapData.viewState for the canvas transform, so
   * the canvas follows the gesture without setMapData reconciling the tree.
   */
  liveViewState?: StoredViewState | null;
  /**
   * Image export only: the exact set of map layers to composite, each at its own
   * opacity. Overrides the live layer stack (getRenderLayers), which shows only
   * the active layer on simple maps and the active board's layers on strata maps.
   */
  exportLayers?: ExportLayerOption[] | null;
}

/** Main render function */
export type RenderCanvas = (
  canvas: HTMLCanvasElement,
  fogCanvas: HTMLCanvasElement | null,
  mapData: MapData,
  geometry: ExtendedGeometry,
  selectedItems?: RendererSelectedItem | RendererSelectedItem[],
  options?: RenderCanvasOptions,
) => void;

/** Additional hook-specific options beyond RenderCanvasOptions */
export type UseCanvasRendererOptions = RenderCanvasOptions;

/** useCanvasRenderer result */
export interface UseCanvasRendererResult {
  /** Identity-stable: queue one coordinated repaint (coalesced per frame) with the latest inputs */
  scheduleRender: () => void;
}

/** useCanvasRenderer hook - triggers re-render on data changes */
export type UseCanvasRenderer = (
  canvasRef: RefObject<HTMLCanvasElement>,
  fogCanvasRef: RefObject<HTMLCanvasElement> | null,
  mapData: MapData | null,
  geometry: ExtendedGeometry | null,
  selectedItems: RendererSelectedItem | RendererSelectedItem[] | undefined,
  options: UseCanvasRendererOptions | undefined,
  viewController: ViewController,
) => UseCanvasRendererResult;
