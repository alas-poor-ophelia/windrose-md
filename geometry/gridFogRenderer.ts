/**
 * Grid Fog Renderer Module
 *
 * Renders fog of war for grid (square) maps with optional blur effects.
 * Handles edge cell detection, multi-pass blur rendering, and interior grid lines.
 */

interface FogCell {
  col: number;
  row: number;
}

interface GridFogRenderContext {
  ctx: CanvasRenderingContext2D;
  fogCtx: CanvasRenderingContext2D | null;
  offsetX: number;
  offsetY: number;
  scaledSize: number;
}

interface GridFogRenderOptions {
  fowOpacity: number;
  fowBlurEnabled: boolean;
  blurRadius: number;
  useGlobalAlpha: boolean;
}

/**
 * Identifies which fog cells are edge cells (adjacent to non-fogged cells).
 */
function identifyEdgeCells(
  fogCells: FogCell[],
  foggedSet: Set<string>,
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number }
): { visibleFogCells: FogCell[]; edgeCells: FogCell[] } {
  const { minCol, maxCol, minRow, maxRow } = visibleBounds;
  const visibleFogCells: FogCell[] = [];
  const edgeCells: FogCell[] = [];

  for (const fogCell of fogCells) {
    const { col, row } = fogCell;

    // Skip cells outside visible bounds
    if (col < minCol || col > maxCol || row < minRow || row > maxRow) {
      continue;
    }

    visibleFogCells.push({ col, row });

    // Check if this is an edge cell (has at least one non-fogged neighbor)
    const isEdge = !foggedSet.has(`${col - 1},${row}`) ||
                   !foggedSet.has(`${col + 1},${row}`) ||
                   !foggedSet.has(`${col},${row - 1}`) ||
                   !foggedSet.has(`${col},${row + 1}`);

    if (isEdge) {
      edgeCells.push({ col, row });
    }
  }

  return { visibleFogCells, edgeCells };
}

/**
 * Renders blur passes for edge cells (the soft fog edge effect).
 */
function renderBlurPasses(
  edgeCells: FogCell[],
  context: GridFogRenderContext,
  options: GridFogRenderOptions
): void {
  const { ctx, fogCtx, offsetX, offsetY, scaledSize } = context;
  const { fowOpacity, blurRadius } = options;

  if (edgeCells.length === 0 || blurRadius <= 0) return;

  const baseOpacity = fowOpacity;
  const numPasses = 8;
  const cellRadius = scaledSize / 2;
  const maxRadius = cellRadius + blurRadius;

  const targetCtx = fogCtx || ctx;
  const useFilterFallback = !fogCtx;
  const filterBlurAmount = blurRadius / numPasses;

  for (let i = 0; i < numPasses; i++) {
    const t = i / (numPasses - 1);
    const radius = maxRadius - (blurRadius * t);
    const opacity = 0.50 + (0.30 * t);

    if (useFilterFallback) {
      const passBlur = filterBlurAmount * (1.5 - t);
      targetCtx.filter = passBlur > 0.5 ? `blur(${passBlur}px)` : 'none';
    }

    targetCtx.beginPath();
    for (const { col, row } of edgeCells) {
      const centerX = offsetX + col * scaledSize + scaledSize / 2;
      const centerY = offsetY + row * scaledSize + scaledSize / 2;
      targetCtx.moveTo(centerX + radius, centerY);
      targetCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    }
    targetCtx.globalAlpha = baseOpacity * opacity;
    targetCtx.fill();
  }

  if (useFilterFallback) {
    ctx.filter = 'none';
  }
}

/**
 * Renders the solid fog rectangles for all visible fog cells.
 */
function renderFogCells(
  visibleFogCells: FogCell[],
  context: GridFogRenderContext
): void {
  const { ctx, offsetX, offsetY, scaledSize } = context;

  ctx.beginPath();
  for (const { col, row } of visibleFogCells) {
    const centerX = offsetX + col * scaledSize + scaledSize / 2;
    const centerY = offsetY + row * scaledSize + scaledSize / 2;
    const halfSize = scaledSize / 2;
    ctx.rect(centerX - halfSize, centerY - halfSize, scaledSize, scaledSize);
  }
  ctx.fill();
}

/**
 * Renders subtle interior grid lines between adjacent fog cells.
 */
function renderInteriorGridLines(
  visibleFogCells: FogCell[],
  foggedSet: Set<string>,
  context: GridFogRenderContext,
  zoom: number
): void {
  const { ctx, offsetX, offsetY, scaledSize } = context;

  if (visibleFogCells.length <= 1) return;

  const drawnLines = new Set<string>();
  const interiorLineWidth = Math.max(1, 1 * zoom * 0.5);
  const halfWidth = interiorLineWidth / 2;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';

  for (const { col, row } of visibleFogCells) {
    const screenX = offsetX + col * scaledSize;
    const screenY = offsetY + row * scaledSize;

    // Right edge (vertical line)
    if (foggedSet.has(`${col + 1},${row}`)) {
      const lineKey = `v:${col + 1},${row}`;
      if (!drawnLines.has(lineKey)) {
        ctx.fillRect(screenX + scaledSize - halfWidth, screenY, interiorLineWidth, scaledSize);
        drawnLines.add(lineKey);
      }
    }

    // Bottom edge (horizontal line)
    if (foggedSet.has(`${col},${row + 1}`)) {
      const lineKey = `h:${col},${row + 1}`;
      if (!drawnLines.has(lineKey)) {
        ctx.fillRect(screenX, screenY + scaledSize - halfWidth, scaledSize, interiorLineWidth);
        drawnLines.add(lineKey);
      }
    }
  }
}

/**
 * Main entry point for rendering grid fog of war.
 * Orchestrates edge detection, blur passes, solid fog, and interior lines.
 */
function renderGridFog(
  fogCells: FogCell[],
  context: GridFogRenderContext,
  options: GridFogRenderOptions,
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  zoom: number
): void {
  const foggedSet = new Set(fogCells.map(c => `${c.col},${c.row}`));

  // Identify visible and edge cells
  const { visibleFogCells, edgeCells } = identifyEdgeCells(
    fogCells,
    foggedSet,
    visibleBounds
  );

  // Render blur passes for edge cells
  if (options.fowBlurEnabled && options.blurRadius > 0) {
    renderBlurPasses(edgeCells, context, options);
    context.ctx.globalAlpha = options.useGlobalAlpha ? options.fowOpacity : 1;
  }

  // Render solid fog cells
  renderFogCells(visibleFogCells, context);

  // Render interior grid lines
  renderInteriorGridLines(visibleFogCells, foggedSet, context, zoom);
}

return {
  identifyEdgeCells,
  renderBlurPasses,
  renderFogCells,
  renderInteriorGridLines,
  renderGridFog
};
