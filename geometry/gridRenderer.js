/**
 * gridRenderer.js
 * Pure functions for rendering grid-based maps
 * 
 * All functions are stateless and side-effect free (except canvas drawing)
 * Designed to work with GridGeometry instances
 */

const gridRenderer = {
  /**
   * Render grid overlay lines
   * @param {CanvasRenderingContext2D} ctx
   * @param {GridGeometry} geometry
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
   * Render painted cells
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} cells - Array of {x, y, color}
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   */
  renderPaintedCells(ctx, cells, geometry, viewState) {
    if (!cells || cells.length === 0) return;
    
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    
    // Group cells by color for efficient rendering
    const cellsByColor = {};
    for (const cell of cells) {
      const color = cell.color;
      if (!cellsByColor[color]) {
        cellsByColor[color] = [];
      }
      cellsByColor[color].push(cell);
    }
    
    // Draw all cells of each color using geometry's batch rendering
    for (const [color, cellGroup] of Object.entries(cellsByColor)) {
      geometry.drawCells(ctx, cellGroup, viewState.x, viewState.y, viewState.zoom, color);
    }
  },

  /**
   * Render painted edges (custom colored grid lines)
   * 
   * Edges are rendered after cells and before cell borders, appearing
   * as colored overlays on specific grid lines.
   * 
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} edges - Array of {x, y, side, color} where side is 'right' or 'bottom'
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {Object} style - Edge style options
   * @param {number} style.lineWidth - Base line width (will be scaled for visibility)
   */
  renderEdges(ctx, edges, geometry, viewState, style = {}) {
    if (!edges || edges.length === 0) return;
    
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    // Edge thickness: slightly thicker than grid lines for visibility
    // Use 2.5x grid line width, clamped between 2 and borderWidth
    const baseWidth = style.lineWidth || 1;
    const edgeWidth = Math.min(Math.max(2, baseWidth * 2.5), style.borderWidth || 4);
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
    }
  },

  /**
   * Render smart borders for painted cells using fill-based rendering
   * 
   * NOTE: This uses ctx.fillRect() instead of ctx.stroke() to work around
   * a rendering bug in Obsidian's Live Preview mode where CodeMirror's
   * canvas operations can corrupt the strokeStyle state.
   * 
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} cells - Array of {x, y, color}
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {Function} buildCellLookup - Function to build cell lookup map
   * @param {Function} calculateBorders - Function to calculate borders for a cell
   * @param {Object} theme - Border styling from theme
   */
  renderCellBorders(ctx, cells, geometry, viewState, buildCellLookup, calculateBorders, theme) {
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
   * 
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} cell - {x, y}
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {boolean} isResizeMode
   */
  renderCellHighlight(ctx, cell, geometry, viewState, isResizeMode) {
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