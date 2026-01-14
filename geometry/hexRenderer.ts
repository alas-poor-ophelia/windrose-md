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

// Datacore imports for background image rendering
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { renderHexBackgroundImage } = await requireModuleByName("backgroundRenderer.ts") as {
  renderHexBackgroundImage: (
    bgImage: HTMLImageElement,
    config: { path: string; offsetX?: number; offsetY?: number; opacity?: number },
    hexBounds: { maxCol: number; maxRow: number },
    hexGeometry: { hexSize: number; sqrt3: number; hexToWorld: (q: number, r: number) => { worldX: number; worldY: number } },
    orientation: string,
    context: { ctx: CanvasRenderingContext2D; offsetX: number; offsetY: number; zoom: number },
    offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number }
  ) => void;
};

const { offsetToAxial } = await requireModuleByName("offsetCoordinates.ts") as {
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number };
};

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
    if (!bgImage || !bgConfig?.path || !hexBounds) return;
    if (!bgImage.complete) return;

    renderHexBackgroundImage(
      bgImage,
      bgConfig,
      hexBounds,
      geometry as unknown as { hexSize: number; sqrt3: number; hexToWorld: (q: number, r: number) => { worldX: number; worldY: number } },
      orientation,
      { ctx, offsetX, offsetY, zoom },
      offsetToAxial
    );
  },

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
    
    const previousAlpha = ctx.globalAlpha;

    for (const cell of cells) {
      // Apply opacity if specified (multiply with current globalAlpha)
      const opacity = cell.opacity ?? 1;
      if (opacity < 1) {
        ctx.globalAlpha = previousAlpha * opacity;
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

      // Restore previous opacity
      if (opacity < 1) {
        ctx.globalAlpha = previousAlpha;
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