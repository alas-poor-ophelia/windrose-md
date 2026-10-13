/**
 * Grid Fog Renderer Module
 *
 * Renders fog of war for grid (square) maps with optional blur effects.
 * Handles edge cell detection, multi-pass blur rendering, and interior grid lines.
 */

import type { FoggedCell } from '#types/core/map.types';
import { getFoggedCellSet } from './foggedCellIndex';

import { FOG_PASS_OPACITY_BASE, FOG_PASS_OPACITY_RAMP, FOG_FILTER_BLUR_START, FOG_FILTER_MIN_BLUR_PX } from '../renderers/renderConstants';

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
  fogCells: FoggedCell[],
  foggedSet: Set<string>,
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number }
): { visibleFogCells: FoggedCell[]; edgeCells: FoggedCell[] } {
  const { minCol, maxCol, minRow, maxRow } = visibleBounds;
  const visibleFogCells: FoggedCell[] = [];
  const edgeCells: FoggedCell[] = [];

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
  edgeCells: FoggedCell[],
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

  const targetCtx = fogCtx ?? ctx;
  const useFilterFallback = !fogCtx;
  const filterBlurAmount = blurRadius / numPasses;

  for (let i = 0; i < numPasses; i++) {
    const t = i / (numPasses - 1);
    const radius = maxRadius - (blurRadius * t);
    const opacity = FOG_PASS_OPACITY_BASE + (FOG_PASS_OPACITY_RAMP * t);

    if (useFilterFallback) {
      const passBlur = filterBlurAmount * (FOG_FILTER_BLUR_START - t);
      targetCtx.filter = passBlur > FOG_FILTER_MIN_BLUR_PX ? `blur(${passBlur}px)` : 'none';
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
  visibleFogCells: FoggedCell[],
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
  visibleFogCells: FoggedCell[],
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
  fogCells: FoggedCell[],
  context: GridFogRenderContext,
  options: GridFogRenderOptions,
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  zoom: number
): void {
  // Cached per foggedCells identity (MEM-02); was rebuilt every frame.
  const foggedSet = getFoggedCellSet(fogCells);

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

export { identifyEdgeCells, renderBlurPasses, renderFogCells, renderInteriorGridLines, renderGridFog };