/**
 * hexRenderer.ts
 * Pure functions for rendering hexagonal maps
 * 
 * All functions are stateless and side-effect free (except canvas drawing)
 * Designed to work with HexGeometry instances
 */

// Type-only imports
import type { Point, GridStyle } from '#types/core/geometry.types';
import type {
  RenderViewState,
  CanvasDimensions,
  RenderHexCell,
  BorderTheme,
  BuildCellLookupFn,
  CalculateBordersFn,
  IHexRenderer
} from '#types/core/rendering.types';

import { renderHexBackgroundImage } from './backgroundRenderer';
import { offsetToAxial } from '../core/offsetCoordinates';


// ===========================================
// Hex Renderer Module
// ===========================================

const hexRenderer = {
  /**
   * Whether this renderer supports segment (partial cell) rendering.
   * Hex maps do not support segments.
   */
  supportsSegments: false,

  /**
   * Calculate the scaled cell size for the current zoom level.
   */
  getScaledSize(geometry: IHexRenderer, zoom: number): number {
    return geometry.getScaledCellSize(zoom);
  },

  /**
   * Calculate viewport offset for hex maps.
   * Hex maps multiply center by zoom only (center is in world coordinates).
   */
  calculateViewportOffset(
    _geometry: IHexRenderer,
    center: { x: number; y: number },
    canvasSize: { width: number; height: number },
    zoom: number
  ): { offsetX: number; offsetY: number } {
    return {
      offsetX: canvasSize.width / 2 - center.x * zoom,
      offsetY: canvasSize.height / 2 - center.y * zoom,
    };
  },

  /**
   * Render background image for hex maps.
   * Centers the image based on hex grid bounds.
   */
  renderBackgroundImage(
    ctx: CanvasRenderingContext2D,
    geometry: IHexRenderer,
    bgImage: HTMLImageElement | null,
    bgConfig: { path: string; offsetX?: number; offsetY?: number; opacity?: number } | undefined,
    hexBounds: { maxCol: number; maxRow: number } | undefined,
    orientation: string,
    offsetX: number,
    offsetY: number,
    zoom: number
  ): void {
    if (bgImage == null || bgConfig?.path == null || bgConfig.path === '' || hexBounds == null) return;
    if (!bgImage.complete) return;

    renderHexBackgroundImage(
      bgImage,
      bgConfig,
      hexBounds,
      geometry,
      orientation,
      { ctx, offsetX, offsetY, zoom },
      offsetToAxial as (col: number, row: number, orientation: string) => { q: number; r: number }
    );
  },

  /**
   * Render hex grid overlay
   */
  renderGrid(
    ctx: CanvasRenderingContext2D,
    geometry: IHexRenderer,
    viewState: RenderViewState,
    canvasDimensions: CanvasDimensions,
    showGrid: boolean,
    style: GridStyle = {}
  ): void {
    if (!showGrid) return;

    const { lineColor = '#333333', lineWidth = 1, rotated = false } = style;

    // Use geometry's built-in drawGrid method which handles rotation
    geometry.drawGrid(
      ctx,
      viewState.x,
      viewState.y,
      canvasDimensions.width,
      canvasDimensions.height,
      viewState.zoom,
      { lineColor, lineWidth, rotated }
    );
  },

  /**
   * Render painted hexes
   */
  renderPaintedCells(
    ctx: CanvasRenderingContext2D,
    cells: RenderHexCell[],
    geometry: IHexRenderer,
    viewState: RenderViewState
  ): void {
    if (cells == null || cells.length === 0) return;

    const previousAlpha = ctx.globalAlpha;

    // Group by (opacity, color) and draw each group as a single batched Path2D
    // fill via geometry.drawCells, instead of one beginPath/fill per hex.
    const groups = new Map<string, { opacity: number; color: string; cells: Point[] }>();
    for (const cell of cells) {
      const opacity = cell.opacity ?? 1;
      const key = `${opacity}|${cell.color}`;
      let group = groups.get(key);
      if (group == null) {
        group = { opacity, color: cell.color, cells: [] };
        groups.set(key, group);
      }
      group.cells.push({ x: cell.q, y: cell.r });
    }

    for (const group of groups.values()) {
      ctx.globalAlpha = previousAlpha * group.opacity;
      geometry.drawCells(ctx, group.cells, viewState.x, viewState.y, viewState.zoom, group.color);
    }
    ctx.globalAlpha = previousAlpha;
  },

  /**
   * Render smart borders for painted hexes
   * NOTE: Hex maps don't use smart borders like grid maps
   * This is a no-op for API consistency with gridRenderer
   */
  renderCellBorders(
    _ctx: CanvasRenderingContext2D,
    _cells: RenderHexCell[],
    _geometry: IHexRenderer,
    _viewState: RenderViewState,
    _buildCellLookup: BuildCellLookupFn,
    _calculateBorders: CalculateBordersFn,
    _theme: BorderTheme
  ): void {
    // Hex rendering already draws complete hex shapes, no separate borders needed
    // This method exists for API consistency with gridRenderer
  },

  /**
   * Render selection highlight for a hex
   */
  renderCellHighlight(
    ctx: CanvasRenderingContext2D,
    cell: Point,
    geometry: IHexRenderer,
    viewState: RenderViewState,
    isResizeMode: boolean
  ): void {
    // Selection border (thicker for hex to be visible)
    // Use fillStyle since drawHexOutline now uses fill-based rendering
    ctx.fillStyle = isResizeMode ? '#ff6b6b' : '#4dabf7';
    const lineWidth = 3;
    
    // cell.x maps to q, cell.y maps to r for hex coordinates
    geometry.drawHexOutline(
      ctx,
      cell.x,
      cell.y,
      viewState.x,
      viewState.y,
      viewState.zoom,
      lineWidth
    );
  }
};

export { hexRenderer };