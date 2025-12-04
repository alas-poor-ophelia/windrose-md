/**
 * hexRenderer.js
 * Pure functions for rendering hexagonal maps
 * 
 * All functions are stateless and side-effect free (except canvas drawing)
 * Designed to work with HexGeometry instances
 */

const hexRenderer = {
  /**
   * Render hex grid overlay
   * @param {CanvasRenderingContext2D} ctx
   * @param {HexGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {Object} canvasDimensions - {width, height}
   * @param {boolean} showGrid
   * @param {Object} style - Grid style options
   */
  renderGrid(ctx, geometry, viewState, canvasDimensions, showGrid, style = {}) {
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
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} cells - Array of {q, r, color, opacity?}
   * @param {HexGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   */
  renderPaintedCells(ctx, cells, geometry, viewState) {
    if (!cells || cells.length === 0) return;
    
    cells.forEach(cell => {
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
    });
  },

  /**
   * Render smart borders for painted hexes
   * NOTE: Hex maps don't use smart borders like grid maps
   * This is a no-op for API consistency with gridRenderer
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} cells
   * @param {HexGeometry} geometry
   * @param {Object} viewState
   * @param {Function} buildCellLookup
   * @param {Function} calculateBorders
   * @param {Object} theme
   */
  renderCellBorders(ctx, cells, geometry, viewState, buildCellLookup, calculateBorders, theme) {
    // Hex rendering already draws complete hex shapes, no separate borders needed
    // This method exists for API consistency with gridRenderer
  },

  /**
   * Render selection highlight for a hex
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} cell - {q, r}
   * @param {HexGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {boolean} isResizeMode
   */
  renderCellHighlight(ctx, cell, geometry, viewState, isResizeMode) {
    // Selection border (thicker for hex to be visible)
    // Use fillStyle since drawHexOutline now uses fill-based rendering
    ctx.fillStyle = isResizeMode ? '#ff6b6b' : '#4dabf7';
    const lineWidth = 3;
    
    geometry.drawHexOutline(
      ctx,
      cell.q,
      cell.r,
      viewState.x,
      viewState.y,
      viewState.zoom,
      lineWidth
    );
    
    // Note: Resize mode doesn't apply to individual hexes (no corner handles)
  }
};

return { hexRenderer };