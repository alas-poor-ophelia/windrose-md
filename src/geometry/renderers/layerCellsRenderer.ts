/**
 * layerCellsRenderer.ts
 *
 * Painted cells, borders, interior grid lines and edges for one layer, plus
 * the grid/hex renderer dispatch (moved from useCanvasRenderer.ts, wave 8 /
 * STRUCT-A-29). Used by the layer composite, the ghost passes and the
 * adjacent sub-hex previews.
 */

import type { MapLayer } from '#types/core/map.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { Cell } from '#types/core/cell.types';
import { isGridCell } from '#types/core/cell.types';
import type { BuildCellLookupFn, CalculateBordersFn } from '#types/core/rendering.types';
import type { RendererTheme, RendererViewState } from '#types/hooks/canvasRenderer.types';

import { buildCellLookup, calculateBordersOptimized } from '../../drawing/borderCalculator';
import { getCellColor } from '../../drawing/colorOperations';
import { segmentRenderer } from './segmentRenderer';
import { gridRenderer } from './gridRenderer';
import { hexRenderer } from './hexRenderer';
import { INTERIOR_RATIO } from './renderConstants';

interface Renderer {
  // Polymorphic properties
  supportsSegments: boolean;

  // Method syntax enables bivariant checking — gridRenderer/hexRenderer methods
  // accept narrower IGridRenderer/IHexRenderer params but are safely called with
  // IGeometry since the runtime object always satisfies both.
  getScaledSize(geometry: IGeometry, zoom: number): number;
  calculateViewportOffset(geometry: IGeometry, center: { x: number; y: number }, canvasSize: { width: number; height: number }, zoom: number): { offsetX: number; offsetY: number };

  renderBackgroundImage(
    ctx: CanvasRenderingContext2D,
    geometry: IGeometry,
    bgImage: HTMLImageElement | null,
    bgConfig: { path: string; offsetX?: number; offsetY?: number; opacity?: number; imageGridSize?: number } | undefined,
    boundsOrDimensions: { maxCol: number; maxRow: number } | { width: number; height: number } | undefined,
    orientation: string,
    offsetX: number,
    offsetY: number,
    zoom: number,
    renderGridBackgroundImage?: (
      bgImage: HTMLImageElement,
      config: { path: string; offsetX?: number; offsetY?: number; opacity?: number; imageGridSize?: number },
      dimensions: { width: number; height: number },
      cellSize: number,
      context: { ctx: CanvasRenderingContext2D; offsetX: number; offsetY: number; zoom: number }
    ) => void
  ): void;

  renderGrid(ctx: CanvasRenderingContext2D, geometry: IGeometry, viewState: RendererViewState, dimensions: { width: number; height: number }, showGrid: boolean, options: { lineColor: string; lineWidth: number; rotated?: boolean }): void;
  renderPaintedCells(ctx: CanvasRenderingContext2D, cells: Cell[], geometry: IGeometry, viewState: RendererViewState): void;
  renderCellBorders(ctx: CanvasRenderingContext2D, cells: Cell[], geometry: IGeometry, viewState: RendererViewState, buildLookup: BuildCellLookupFn, calculateBorders: CalculateBordersFn, options: { border: string; borderWidth: number }): void;
  renderInteriorGridLines?(ctx: CanvasRenderingContext2D, cells: Cell[], geometry: IGeometry, viewState: RendererViewState, options: { lineColor: string; lineWidth: number; interiorRatio: number }): void;
  renderEdges?(ctx: CanvasRenderingContext2D, edges: unknown[], geometry: IGeometry, viewState: RendererViewState, options: { lineWidth: number; borderWidth: number }): void;
}



/** Spatial index for curve-cell visual merging */
interface CurveCellMergeIndex {
  cellBordersToSuppress: Map<string, Set<string>>;
  curveCellRects: Map<number, Array<{ x: number; y: number; w: number; h: number }>>;
}

/**
 * Get appropriate renderer for geometry type.
 * Uses geometry.type discriminator instead of instanceof.
 */
function getRenderer(geometry: IGeometry): Renderer {
  // Safe polymorphic cast: runtime geometry always satisfies the renderer's narrower param types
  return geometry.type === 'hex' ? hexRenderer : gridRenderer;
}

/** Options for rendering layer content */
interface RenderLayerContentOptions {
  opacity?: number;
  showGrid?: boolean;
  mergeIndex?: CurveCellMergeIndex | null;
  /** Map rotation in degrees; non-zero widens cull bounds to the rotated viewport. */
  northDirection?: number;
}

/**
 * Build a predicate that tests whether a cell lands inside the visible canvas.
 *
 * Without this, the painted-cell passes (fills, borders, interior lines, edges)
 * iterate every cell on the map, so per-frame fillRect volume scales with total
 * painted area instead of the viewport — the dominant render cost during pan,
 * and fatal on high-DPR mobile GPUs.
 *
 * Cells are drawn under the canvas rotation transform but gridToScreen returns
 * pre-rotation coordinates, so when rotated the bounds widen to the square
 * circumscribing the viewport. The 2-cell margin keeps interior-grid-line
 * neighbors (1 cell away) inside the culled set.
 */
function makeCellVisibilityFilter(
  geometry: IGeometry,
  viewState: RendererViewState,
  canvasWidth: number,
  canvasHeight: number,
  northDirection: number
): (cx: number, cy: number) => boolean {
  const margin = geometry.getScaledCellSize(viewState.zoom) * 2;
  let minX = -margin;
  let minY = -margin;
  let maxX = canvasWidth + margin;
  let maxY = canvasHeight + margin;
  if (northDirection % 360 !== 0) {
    const halfDiag = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight) / 2;
    minX = canvasWidth / 2 - halfDiag - margin;
    maxX = canvasWidth / 2 + halfDiag + margin;
    minY = canvasHeight / 2 - halfDiag - margin;
    maxY = canvasHeight / 2 + halfDiag + margin;
  }
  return (cx, cy) => {
    const { screenX, screenY } = geometry.gridToScreen(cx, cy, viewState.x, viewState.y, viewState.zoom);
    return screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY;
  };
}

/**
 * Render a layer's cells, borders, and edges (but not objects or text labels).
 * Used for both active layer rendering and ghost layer transparency.
 */
function renderLayerCellsAndEdges(
  ctx: CanvasRenderingContext2D,
  layer: MapLayer,
  geometry: IGeometry,
  viewState: RendererViewState,
  theme: RendererTheme,
  renderer: Renderer,
  options: RenderLayerContentOptions = {}
): void {
  const { opacity = 1, showGrid: showInteriorGrid = true, mergeIndex = null, northDirection = 0 } = options;

  const isCellVisible = makeCellVisibilityFilter(
    geometry, viewState, ctx.canvas.width, ctx.canvas.height, northDirection
  );

  // Apply opacity if needed
  const previousAlpha = ctx.globalAlpha;
  if (opacity < 1) {
    ctx.globalAlpha = opacity;
  }

  // Draw filled cells (culled to the visible viewport)
  if (layer.cells.length > 0) {
    const visibleCells = layer.cells.filter(cell =>
      isGridCell(cell) ? isCellVisible(cell.x, cell.y) : isCellVisible(cell.q, cell.r)
    );

    const cellsWithColor = visibleCells.map(cell => ({
      ...cell,
      color: getCellColor(cell)
    }));

    const { simpleCells, segmentCells } = segmentRenderer.separateCellsByType(cellsWithColor);

    if (simpleCells.length > 0) {
      renderer.renderPaintedCells(ctx, simpleCells, geometry, viewState);
    }

    if (segmentCells.length > 0 && renderer.supportsSegments) {
      segmentRenderer.renderSegmentCells(ctx, segmentCells, geometry, viewState);
    }

    if (showInteriorGrid && renderer.renderInteriorGridLines && cellsWithColor.length > 0) {
      renderer.renderInteriorGridLines(ctx, cellsWithColor, geometry, viewState, {
        lineColor: theme.grid.lines,
        lineWidth: theme.grid.lineWidth ?? 1,
        interiorRatio: INTERIOR_RATIO
      });
    }

    // Border calculation must see ALL cells, not just visible ones — a culled
    // off-screen neighbor would otherwise give a visible boundary cell a
    // phantom border.
    const allCellsLookup = buildCellLookup(layer.cells);

    // Wrap border calculator to suppress borders adjacent to same-color curves
    const bordersCalculator = mergeIndex
      ? (lookup: Set<string>, x: number, y: number) => {
          const base = calculateBordersOptimized(lookup, x, y);
          const suppressed = mergeIndex.cellBordersToSuppress.get(`${x},${y}`);
          if (!suppressed) return base;
          return base.filter((side: string) => !suppressed.has(side));
        }
      : calculateBordersOptimized;

    if (simpleCells.length > 0) {
      renderer.renderCellBorders(
        ctx,
        simpleCells,
        geometry,
        viewState,
        () => allCellsLookup,
        bordersCalculator,
        {
          border: theme.cells.border,
          borderWidth: theme.cells.borderWidth
        }
      );
    }

    if (segmentCells.length > 0 && renderer.supportsSegments) {
      segmentRenderer.renderSegmentBorders(
        ctx,
        segmentCells,
        cellsWithColor,
        geometry,
        viewState,
        {
          border: theme.cells.border,
          borderWidth: theme.cells.borderWidth
        }
      );
    }
  }

  // Draw painted edges (grid maps only, culled to the visible viewport)
  if (layer.edges.length > 0 && renderer.supportsSegments && renderer.renderEdges) {
    const visibleEdges = layer.edges.filter(edge =>
      edge != null && typeof edge.x === 'number' && typeof edge.y === 'number' && isCellVisible(edge.x, edge.y)
    );
    if (visibleEdges.length > 0) {
      renderer.renderEdges(ctx, visibleEdges, geometry, viewState, {
        lineWidth: 1,
        borderWidth: theme.cells.borderWidth
      });
    }
  }

  // Restore opacity
  if (opacity < 1) {
    ctx.globalAlpha = previousAlpha;
  }
}

export { getRenderer, renderLayerCellsAndEdges, makeCellVisibilityFilter };
export type { Renderer, CurveCellMergeIndex, RenderLayerContentOptions };
