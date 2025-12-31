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
  ViewState,
  CanvasDimensions,
  RenderHexCell,
  BorderTheme,
  CellLookup,
  BuildCellLookupFn,
  CalculateBordersFn,
  IHexRenderer
} from '#types/core/rendering.types';

// ===========================================
// Hex Renderer Module
// ===========================================

const hexRenderer = {
  /**
   * Render hex grid overlay
   */
  renderGrid(
    ctx: CanvasRenderingContext2D,
    geometry: IHexRenderer,
    viewState: ViewState,
    canvasDimensions: CanvasDimensions,
    showGrid: boolean,
    style: GridStyle = {}
  ): void {
    if (!showGrid) return;
    
    const { lineColor = '#333333', lineWidth = 1 } = style;
    
    // Use geometry's built-in drawGrid method which handles rotation
    geometry.drawGrid(
      ctx,
      viewState.x,
      viewState.y,
      canvasDimensions.width,
      canvasDimensions.height,
      viewState.zoom,
      { lineColor, lineWidth }
    );
  },

  /**
   * Render painted hexes
   */
  renderPaintedCells(
    ctx: CanvasRenderingContext2D,
    cells: RenderHexCell[],
    geometry: IHexRenderer,
    viewState: ViewState
  ): void {
    if (!cells || cells.length === 0) return;
    
    for (const cell of cells) {
      // Apply opacity if specified
      const opacity = cell.opacity ?? 1;
      if (opacity < 1) {
        ctx.globalAlpha = opacity;
      }
      
      geometry.drawHex(
        ctx,
        cell.q,
        cell.r,
        viewState.x,
        viewState.y,
        viewState.zoom,
        cell.color
      );
      
      // Reset opacity
      if (opacity < 1) {
        ctx.globalAlpha = 1;
      }
    }
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
    _viewState: ViewState,
    _buildCellLookup: BuildCellLookupFn<RenderHexCell>,
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
    viewState: ViewState,
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

return { hexRenderer };