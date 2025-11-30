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
   * Render interior grid lines between adjacent painted cells
   * These are drawn on top of painted cells to restore grid visibility
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} cells - Array of {x, y, color}
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {Object} style - Grid style options
   * @param {string} style.lineColor - Grid line color
   * @param {number} style.lineWidth - Base grid line width
   * @param {number} style.interiorRatio - Ratio for interior lines (default 0.5)
   */
  renderInteriorGridLines(ctx, cells, geometry, viewState, style = {}) {
    if (!cells || cells.length === 0) return;
    
    const { lineColor = '#666666', lineWidth = 1, interiorRatio = 0.5 } = style;
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    
    // Build lookup set for O(1) cell existence checks
    const cellSet = new Set(cells.map(c => `${c.x},${c.y}`));
    
    // Track which interior lines we've already drawn to avoid duplicates
    const drawnLines = new Set();
    
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = Math.max(1, lineWidth * interiorRatio);
    ctx.beginPath();
    
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
          ctx.moveTo(screenX + scaledSize, screenY);
          ctx.lineTo(screenX + scaledSize, screenY + scaledSize);
          drawnLines.add(lineKey);
        }
      }
      
      // Check bottom neighbor - draw horizontal line between them
      const bottomKey = `${cell.x},${cell.y + 1}`;
      if (cellSet.has(bottomKey)) {
        const lineKey = `h:${cell.x},${cell.y + 1}`;
        if (!drawnLines.has(lineKey)) {
          ctx.moveTo(screenX, screenY + scaledSize);
          ctx.lineTo(screenX + scaledSize, screenY + scaledSize);
          drawnLines.add(lineKey);
        }
      }
    }
    
    ctx.stroke();
  },

  /**
   * Render smart borders for painted cells
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
    
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = theme.borderWidth;
    
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
      
      // Draw each border
      ctx.beginPath();
      for (const side of borders) {
        switch (side) {
          case 'top':
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(screenX + scaledSize, screenY);
            break;
          case 'right':
            ctx.moveTo(screenX + scaledSize, screenY);
            ctx.lineTo(screenX + scaledSize, screenY + scaledSize);
            break;
          case 'bottom':
            ctx.moveTo(screenX, screenY + scaledSize);
            ctx.lineTo(screenX + scaledSize, screenY + scaledSize);
            break;
          case 'left':
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(screenX, screenY + scaledSize);
            break;
        }
      }
      ctx.stroke();
    }
  },

  /**
   * Render selection highlight for a cell
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
    
    // Selection border
    ctx.strokeStyle = isResizeMode ? '#ff6b6b' : '#4dabf7';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      screenX,
      screenY,
      scaledSize,
      scaledSize
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