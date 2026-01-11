/**
 * gridRenderer.ts
 * Pure functions for rendering grid-based maps
 * 
 * All functions are stateless and side-effect free (except canvas drawing)
 * Designed to work with GridGeometry instances
 * 
 * RENDERING NOTE: Many functions use ctx.fillRect() instead of ctx.stroke()
 * to work around a rendering bug in Obsidian's Live Preview mode where
 * CodeMirror's canvas operations can corrupt the strokeStyle state.
 */

// Type-only imports
import type { Point, GridStyle } from '#types/core/geometry.types';
import type {
  ViewState,
  CanvasDimensions,
  RenderCell,
  Edge,
  InteriorGridStyle,
  EdgeStyle,
  BorderTheme,
  CellLookup,
  BuildCellLookupFn,
  CalculateBordersFn,
  IGridRenderer
} from '#types/core/rendering.types';

// ===========================================
// Grid Renderer Module
// ===========================================

const gridRenderer = {
  /**
   * Render grid overlay lines
   */
  renderGrid(
    ctx: CanvasRenderingContext2D,
    geometry: IGridRenderer,
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
   * Render painted cells
   */
  renderPaintedCells(
    ctx: CanvasRenderingContext2D,
    cells: RenderCell[],
    geometry: IGridRenderer,
    viewState: ViewState
  ): void {
    if (!cells || cells.length === 0) return;
    
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    
    // Separate cells by whether they have custom opacity
    const fullOpacityCells: RenderCell[] = [];
    const customOpacityCells: RenderCell[] = [];
    
    for (const cell of cells) {
      const opacity = cell.opacity ?? 1;
      if (opacity === 1) {
        fullOpacityCells.push(cell);
      } else {
        customOpacityCells.push(cell);
      }
    }
    
    // Draw full opacity cells grouped by color (efficient batch rendering)
    if (fullOpacityCells.length > 0) {
      const cellsByColor: Record<string, RenderCell[]> = {};
      for (const cell of fullOpacityCells) {
        const color = cell.color;
        if (!cellsByColor[color]) {
          cellsByColor[color] = [];
        }
        cellsByColor[color].push(cell);
      }
      
      for (const [color, cellGroup] of Object.entries(cellsByColor)) {
        geometry.drawCells(ctx, cellGroup, viewState.x, viewState.y, viewState.zoom, color);
      }
    }
    
    // Draw cells with custom opacity individually
    if (customOpacityCells.length > 0) {
      const previousAlpha = ctx.globalAlpha;
      for (const cell of customOpacityCells) {
        const opacity = cell.opacity ?? 1;
        ctx.globalAlpha = previousAlpha * opacity;
        ctx.fillStyle = cell.color;
        const { screenX, screenY } = geometry.gridToScreen(cell.x, cell.y, viewState.x, viewState.y, viewState.zoom);
        ctx.fillRect(screenX, screenY, scaledSize, scaledSize);
      }
      ctx.globalAlpha = previousAlpha;
    }
  },

  /**
   * Render interior grid lines between adjacent painted cells
   * These are drawn on top of painted cells to restore grid visibility
   * Uses fillRect instead of stroke for iOS/CodeMirror compatibility
   */
  renderInteriorGridLines(
    ctx: CanvasRenderingContext2D,
    cells: RenderCell[],
    geometry: IGridRenderer,
    viewState: ViewState,
    style: InteriorGridStyle = {}
  ): void {
    if (!cells || cells.length === 0) return;
    
    const { lineColor = '#666666', lineWidth = 1, interiorRatio = 0.5 } = style;
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    const actualLineWidth = Math.max(1, lineWidth * interiorRatio);
    const halfWidth = actualLineWidth / 2;
    
    // Build lookup set for O(1) cell existence checks
    const cellSet = new Set(cells.map(c => `${c.x},${c.y}`));
    
    // Track which interior lines we've already drawn to avoid duplicates
    const drawnLines = new Set<string>();
    
    ctx.fillStyle = lineColor;
    
    for (const cell of cells) {
      const { screenX, screenY } = geometry.gridToScreen(
        cell.x,
        cell.y,
        viewState.x,
        viewState.y,
        viewState.zoom
      );
      
      // Check right neighbor - draw vertical line between them
      const rightKey = `${cell.x + 1},${cell.y}`;
      if (cellSet.has(rightKey)) {
        const lineKey = `v:${cell.x + 1},${cell.y}`;
        if (!drawnLines.has(lineKey)) {
          // Vertical line using fillRect
          ctx.fillRect(
            screenX + scaledSize - halfWidth,
            screenY,
            actualLineWidth,
            scaledSize
          );
          drawnLines.add(lineKey);
        }
      }
      
      // Check bottom neighbor - draw horizontal line between them
      const bottomKey = `${cell.x},${cell.y + 1}`;
      if (cellSet.has(bottomKey)) {
        const lineKey = `h:${cell.x},${cell.y + 1}`;
        if (!drawnLines.has(lineKey)) {
          // Horizontal line using fillRect
          ctx.fillRect(
            screenX,
            screenY + scaledSize - halfWidth,
            scaledSize,
            actualLineWidth
          );
          drawnLines.add(lineKey);
        }
      }
    }
  },

  /**
   * Render painted edges (custom colored grid lines)
   * 
   * Edges are rendered after cells and before cell borders, appearing
   * as colored overlays on specific grid lines.
   */
  renderEdges(
    ctx: CanvasRenderingContext2D,
    edges: Edge[],
    geometry: IGridRenderer,
    viewState: ViewState,
    style: EdgeStyle = {}
  ): void {
    if (!edges || edges.length === 0) return;
    
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    // Edge thickness: slightly thicker than grid lines for visibility
    // Use 2.5x grid line width, clamped between 2 and borderWidth
    const baseWidth = style.lineWidth ?? 1;
    const edgeWidth = Math.min(Math.max(2, baseWidth * 2.5), style.borderWidth ?? 4);
    const halfWidth = edgeWidth / 2;
    
    for (const edge of edges) {
      // Skip malformed edges
      if (!edge || typeof edge.x !== 'number' || typeof edge.y !== 'number' || !edge.side || !edge.color) {
        continue;
      }
      
      const { screenX, screenY } = geometry.gridToScreen(
        edge.x,
        edge.y,
        viewState.x,
        viewState.y,
        viewState.zoom
      );
      
      // Apply opacity if specified (multiply with current globalAlpha)
      const edgeOpacity = edge.opacity ?? 1;
      const previousAlpha = ctx.globalAlpha;
      if (edgeOpacity < 1) {
        ctx.globalAlpha = previousAlpha * edgeOpacity;
      }

      ctx.fillStyle = edge.color;

      // Edges are stored normalized as 'right' or 'bottom' only
      if (edge.side === 'right') {
        // Right edge of cell (x,y) - vertical line at x+1 boundary
        ctx.fillRect(
          screenX + scaledSize - halfWidth,
          screenY - halfWidth,
          edgeWidth,
          scaledSize + edgeWidth
        );
      } else if (edge.side === 'bottom') {
        // Bottom edge of cell (x,y) - horizontal line at y+1 boundary
        ctx.fillRect(
          screenX - halfWidth,
          screenY + scaledSize - halfWidth,
          scaledSize + edgeWidth,
          edgeWidth
        );
      }

      // Restore previous opacity
      if (edgeOpacity < 1) {
        ctx.globalAlpha = previousAlpha;
      }
    }
  },

  /**
   * Render smart borders for painted cells using fill-based rendering
   * 
   * NOTE: This uses ctx.fillRect() instead of ctx.stroke() to work around
   * a rendering bug in Obsidian's Live Preview mode where CodeMirror's
   * canvas operations can corrupt the strokeStyle state.
   */
  renderCellBorders(
    ctx: CanvasRenderingContext2D,
    cells: RenderCell[],
    geometry: IGridRenderer,
    viewState: ViewState,
    buildCellLookup: BuildCellLookupFn,
    calculateBorders: CalculateBordersFn,
    theme: BorderTheme
  ): void {
    if (!cells || cells.length === 0) return;
    
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    const cellLookup = buildCellLookup(cells);
    const borderWidth = theme.borderWidth;
    const halfWidth = borderWidth / 2;
    
    // Use fillStyle instead of strokeStyle for fill-based rendering
    ctx.fillStyle = theme.border;
    
    for (const cell of cells) {
      const { screenX, screenY } = geometry.gridToScreen(
        cell.x,
        cell.y,
        viewState.x,
        viewState.y,
        viewState.zoom
      );
      
      // Calculate which borders this cell needs
      const borders = calculateBorders(cellLookup, cell.x, cell.y);
      
      // Draw each border as a filled rectangle
      for (const side of borders) {
        switch (side) {
          case 'top':
            ctx.fillRect(
              screenX - halfWidth,
              screenY - halfWidth,
              scaledSize + borderWidth,
              borderWidth
            );
            break;
          case 'right':
            ctx.fillRect(
              screenX + scaledSize - halfWidth,
              screenY - halfWidth,
              borderWidth,
              scaledSize + borderWidth
            );
            break;
          case 'bottom':
            ctx.fillRect(
              screenX - halfWidth,
              screenY + scaledSize - halfWidth,
              scaledSize + borderWidth,
              borderWidth
            );
            break;
          case 'left':
            ctx.fillRect(
              screenX - halfWidth,
              screenY - halfWidth,
              borderWidth,
              scaledSize + borderWidth
            );
            break;
        }
      }
    }
  },

  /**
   * Render selection highlight for a cell using fill-based rendering
   * 
   * NOTE: This uses ctx.fillRect() instead of ctx.strokeRect() to work around
   * a rendering bug in Obsidian's Live Preview mode where CodeMirror's
   * canvas operations can corrupt the strokeStyle state.
   */
  renderCellHighlight(
    ctx: CanvasRenderingContext2D,
    cell: Point,
    geometry: IGridRenderer,
    viewState: ViewState,
    isResizeMode: boolean
  ): void {
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    
    const { screenX, screenY } = geometry.gridToScreen(
      cell.x,
      cell.y,
      viewState.x,
      viewState.y,
      viewState.zoom
    );
    
    // Selection border - draw as 4 filled rectangles instead of strokeRect
    const color = isResizeMode ? '#ff6b6b' : '#4dabf7';
    const lineWidth = 2;
    const halfWidth = lineWidth / 2;
    
    ctx.fillStyle = color;
    
    // Top border
    ctx.fillRect(
      screenX - halfWidth,
      screenY - halfWidth,
      scaledSize + lineWidth,
      lineWidth
    );
    // Bottom border
    ctx.fillRect(
      screenX - halfWidth,
      screenY + scaledSize - halfWidth,
      scaledSize + lineWidth,
      lineWidth
    );
    // Left border
    ctx.fillRect(
      screenX - halfWidth,
      screenY - halfWidth,
      lineWidth,
      scaledSize + lineWidth
    );
    // Right border
    ctx.fillRect(
      screenX + scaledSize - halfWidth,
      screenY - halfWidth,
      lineWidth,
      scaledSize + lineWidth
    );
    
    // Corner handles for resize mode (grid cells don't resize, but kept for API consistency)
    if (isResizeMode) {
      const handleSize = 8;
      ctx.fillStyle = '#ff6b6b';
      
      // Top-left
      ctx.fillRect(screenX - handleSize/2, screenY - handleSize/2, handleSize, handleSize);
      // Top-right
      ctx.fillRect(screenX + scaledSize - handleSize/2, screenY - handleSize/2, handleSize, handleSize);
      // Bottom-left
      ctx.fillRect(screenX - handleSize/2, screenY + scaledSize - handleSize/2, handleSize, handleSize);
      // Bottom-right
      ctx.fillRect(screenX + scaledSize - handleSize/2, screenY + scaledSize - handleSize/2, handleSize, handleSize);
    }
  }
};

return { gridRenderer };