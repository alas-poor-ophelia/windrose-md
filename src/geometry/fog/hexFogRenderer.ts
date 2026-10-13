/**
 * Hex Fog Renderer Module
 *
 * Renders fog of war for hex maps with optional blur effects.
 * Handles edge cell detection, multi-pass blur rendering, and interior hex outlines.
 */

import type { FoggedCell } from '#types/core/map.types';

interface EdgeCell extends FoggedCell {
  q: number;
  r: number;
}

import type { HexGeometryLike } from './fogRenderer';
import type { IGeometry } from '#types/core/geometry.types';
import { getFoggedCellSet } from './foggedCellIndex';

/** Screen-space rectangle (pre-rotation) a fog cell centre must fall inside to be drawn. */
interface ScreenCullRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface HexFogRenderContext {
  ctx: CanvasRenderingContext2D;
  fogCtx: CanvasRenderingContext2D | null;
  offsetX: number;
  offsetY: number;
  zoom: number;
  /** Viewport cull rect; absent = draw every cell (legacy callers, tests). */
  cull?: ScreenCullRect;
}

/**
 * Interior outlines are batched into ONE stroked path. A single stroke paints
 * a shared edge once, where the old per-cell strokes painted it twice at 0.15
 * (composited ~0.28). 0.28 keeps the interior lattice looking the same.
 */
const INTERIOR_OUTLINE_STYLE = 'rgba(255, 255, 255, 0.28)';

// ===========================================
// Topology cache (MEM-02)
// ===========================================
//
// Which fog cells are edges (some neighbour unfogged) and which have a fogged
// neighbour depends only on the foggedCells array, the orientation and the
// hex size, never on the viewport. Fog updates are immutable (a changed fog
// state is a new array), so the classification is computed once per array
// identity in a WeakMap, the same convention as foggedCellIndex, and the
// per-frame work drops to a cull + path trace over the visible cells.

interface HexFogCellInfo {
  col: number;
  row: number;
  q: number;
  r: number;
  /** World-space centre, for the viewport cull. */
  wx: number;
  wy: number;
  /** At least one neighbour is NOT fogged (gets the blur passes). */
  edge: boolean;
  /** At least one neighbour IS fogged (gets an interior outline). */
  interior: boolean;
}

interface HexFogTopology {
  orientation: 'flat' | 'pointy';
  hexSize: number;
  cells: HexFogCellInfo[];
}

const topologyCache = new WeakMap<readonly FoggedCell[], HexFogTopology>();

function getHexFogTopology(
  fogCells: FoggedCell[],
  hexGeometry: HexGeometryLike,
  orientation: 'flat' | 'pointy',
  offsetToAxial: (col: number, row: number, orientation: 'flat' | 'pointy') => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: 'flat' | 'pointy') => { col: number; row: number }
): HexFogTopology {
  const cached = topologyCache.get(fogCells);
  if (cached && cached.orientation === orientation && cached.hexSize === hexGeometry.hexSize) return cached;

  const foggedSet = getFoggedCellSet(fogCells);
  const cells: HexFogCellInfo[] = [];
  for (const { col, row } of fogCells) {
    const { q, r } = offsetToAxial(col, row, orientation);
    let edge = false;
    let interior = false;
    for (const n of hexGeometry.getNeighbors(q, r)) {
      const { col: nCol, row: nRow } = axialToOffset(n.x, n.y, orientation);
      if (foggedSet.has(`${nCol},${nRow}`)) interior = true; else edge = true;
      if (edge && interior) break;
    }
    const { worldX, worldY } = hexGeometry.hexToWorld(q, r);
    cells.push({ col, row, q, r, wx: worldX, wy: worldY, edge, interior });
  }
  const topology: HexFogTopology = { orientation, hexSize: hexGeometry.hexSize, cells };
  topologyCache.set(fogCells, topology);
  return topology;
}

interface HexFogRenderOptions {
  fowOpacity: number;
  fowBlurEnabled: boolean;
  blurRadius: number;
  useGlobalAlpha: boolean;
}

/**
 * Identifies which fog cells are edge cells (adjacent to non-fogged cells).
 */
function identifyHexEdgeCells(
  fogCells: FoggedCell[],
  foggedSet: Set<string>,
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  hexGeometry: HexGeometryLike,
  orientation: 'flat' | 'pointy',
  offsetToAxial: (col: number, row: number, orientation: 'flat' | 'pointy') => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: 'flat' | 'pointy') => { col: number; row: number }
): { visibleFogCells: FoggedCell[]; edgeCells: EdgeCell[] } {
  const { minCol, maxCol, minRow, maxRow } = visibleBounds;
  const visibleFogCells: FoggedCell[] = [];
  const edgeCells: EdgeCell[] = [];

  for (const fogCell of fogCells) {
    const { col, row } = fogCell;

    // Skip cells outside visible bounds
    if (col < minCol || col > maxCol || row < minRow || row > maxRow) {
      continue;
    }

    visibleFogCells.push({ col, row });

    // Check if this is an edge cell (has at least one non-fogged neighbor)
    const { q, r } = offsetToAxial(col, row, orientation);
    const neighbors = hexGeometry.getNeighbors(q, r);
    const isEdge = neighbors.some(n => {
      const { col: nCol, row: nRow } = axialToOffset(n.x, n.y, orientation);
      return !foggedSet.has(`${nCol},${nRow}`);
    });

    if (isEdge) {
      edgeCells.push({ col, row, q, r });
    }
  }

  return { visibleFogCells, edgeCells };
}

/**
 * Traces a hex path on the given canvas context.
 */
function traceHexPath(
  ctx: CanvasRenderingContext2D,
  q: number,
  r: number,
  scale: number,
  hexGeometry: HexGeometryLike,
  geometry: IGeometry,
  context: { offsetX: number; offsetY: number; zoom: number }
): void {
  const { offsetX, offsetY, zoom } = context;
  const vertices = hexGeometry.getHexVertices(q, r);

  if (scale === 1.0) {
    const first = geometry.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
    ctx.moveTo(first.screenX, first.screenY);
    for (let i = 1; i < vertices.length; i++) {
      const vertex = geometry.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
      ctx.lineTo(vertex.screenX, vertex.screenY);
    }
  } else {
    const center = hexGeometry.hexToWorld(q, r);
    const screenCenter = geometry.worldToScreen(center.worldX, center.worldY, offsetX, offsetY, zoom);

    const scaledVertices = vertices.map(v => {
      const screen = geometry.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, zoom);
      return {
        screenX: screenCenter.screenX + (screen.screenX - screenCenter.screenX) * scale,
        screenY: screenCenter.screenY + (screen.screenY - screenCenter.screenY) * scale
      };
    });

    ctx.moveTo(scaledVertices[0].screenX, scaledVertices[0].screenY);
    for (let i = 1; i < scaledVertices.length; i++) {
      ctx.lineTo(scaledVertices[i].screenX, scaledVertices[i].screenY);
    }
  }
  ctx.closePath();
}

/**
 * Renders blur passes for edge cells (the soft fog edge effect).
 */
function renderHexBlurPasses(
  edgeCells: EdgeCell[],
  context: HexFogRenderContext,
  options: HexFogRenderOptions,
  hexGeometry: HexGeometryLike,
  geometry: IGeometry
): void {
  const { ctx, fogCtx, offsetX, offsetY, zoom } = context;
  const { fowOpacity, blurRadius } = options;

  if (edgeCells.length === 0 || blurRadius <= 0) return;

  const baseOpacity = fowOpacity;
  const numPasses = 8;
  const maxExpansion = blurRadius / (hexGeometry.hexSize * zoom);

  const targetCtx = fogCtx ?? ctx;
  const useFilterFallback = !fogCtx;
  const filterBlurAmount = blurRadius / numPasses;

  for (let i = 0; i < numPasses; i++) {
    const t = i / (numPasses - 1);
    const scale = 1.0 + (maxExpansion * (1.0 - t));
    const opacity = 0.50 + (0.30 * t);

    if (useFilterFallback) {
      const passBlur = filterBlurAmount * (1.5 - t);
      targetCtx.filter = passBlur > 0.5 ? `blur(${passBlur}px)` : 'none';
    }

    targetCtx.beginPath();
    for (const { q, r } of edgeCells) {
      traceHexPath(targetCtx, q, r, scale, hexGeometry, geometry, { offsetX, offsetY, zoom });
    }
    targetCtx.globalAlpha = baseOpacity * opacity;
    targetCtx.fill();
  }

  if (useFilterFallback) {
    ctx.filter = 'none';
  }
}

/**
 * Renders the solid fog hexes for all visible fog cells.
 */
function renderHexFogCells(
  visibleFogCells: FoggedCell[],
  context: HexFogRenderContext,
  hexGeometry: HexGeometryLike,
  geometry: IGeometry,
  orientation: 'flat' | 'pointy',
  offsetToAxial: (col: number, row: number, orientation: 'flat' | 'pointy') => { q: number; r: number }
): void {
  const { ctx, offsetX, offsetY, zoom } = context;

  ctx.beginPath();
  for (const { col, row } of visibleFogCells) {
    const { q, r } = offsetToAxial(col, row, orientation);
    traceHexPath(ctx, q, r, 1.0, hexGeometry, geometry, { offsetX, offsetY, zoom });
  }
  ctx.fill();
}

/**
 * Renders subtle interior hex outlines between adjacent fog cells.
 */
function renderInteriorHexOutlines(
  visibleFogCells: FoggedCell[],
  foggedSet: Set<string>,
  context: HexFogRenderContext,
  hexGeometry: HexGeometryLike,
  geometry: IGeometry,
  orientation: 'flat' | 'pointy',
  offsetToAxial: (col: number, row: number, orientation: 'flat' | 'pointy') => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: 'flat' | 'pointy') => { col: number; row: number }
): void {
  if (visibleFogCells.length <= 1) return;

  const outlined: Array<{ q: number; r: number }> = [];
  for (const { col, row } of visibleFogCells) {
    const { q, r } = offsetToAxial(col, row, orientation);
    const hasFoggedNeighbor = hexGeometry.getNeighbors(q, r).some(n => {
      const { col: nCol, row: nRow } = axialToOffset(n.x, n.y, orientation);
      return foggedSet.has(`${nCol},${nRow}`);
    });
    if (hasFoggedNeighbor) outlined.push({ q, r });
  }
  strokeHexOutlines(outlined, context, hexGeometry, geometry);
}

/** One path, one stroke for every outlined hex (was one stroke per cell). */
function strokeHexOutlines(
  cells: ReadonlyArray<{ q: number; r: number }>,
  context: HexFogRenderContext,
  hexGeometry: HexGeometryLike,
  geometry: IGeometry
): void {
  if (cells.length === 0) return;
  const { ctx, offsetX, offsetY, zoom } = context;
  ctx.strokeStyle = INTERIOR_OUTLINE_STYLE;
  ctx.lineWidth = Math.max(1, 1 * zoom);
  ctx.beginPath();
  for (const { q, r } of cells) {
    traceHexPath(ctx, q, r, 1.0, hexGeometry, geometry, { offsetX, offsetY, zoom });
  }
  ctx.stroke();
}

/**
 * Main entry point for rendering hex fog of war.
 * Orchestrates edge detection, blur passes, solid fog, and interior outlines.
 */
function renderHexFog(
  fogCells: FoggedCell[],
  context: HexFogRenderContext,
  options: HexFogRenderOptions,
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  hexGeometry: HexGeometryLike,
  geometry: IGeometry,
  orientation: 'flat' | 'pointy',
  offsetToAxial: (col: number, row: number, orientation: 'flat' | 'pointy') => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: 'flat' | 'pointy') => { col: number; row: number }
): void {
  const topology = getHexFogTopology(fogCells, hexGeometry, orientation, offsetToAxial, axialToOffset);
  const { minCol, maxCol, minRow, maxRow } = visibleBounds;
  const { cull, offsetX, offsetY, zoom } = context;

  // Per-frame: cull the cached classification to the viewport.
  const visible: HexFogCellInfo[] = [];
  const edges: EdgeCell[] = [];
  const interiors: HexFogCellInfo[] = [];
  for (const cell of topology.cells) {
    if (cell.col < minCol || cell.col > maxCol || cell.row < minRow || cell.row > maxRow) continue;
    if (cull) {
      const { screenX, screenY } = geometry.worldToScreen(cell.wx, cell.wy, offsetX, offsetY, zoom);
      if (screenX < cull.minX || screenX > cull.maxX || screenY < cull.minY || screenY > cull.maxY) continue;
    }
    visible.push(cell);
    if (cell.edge) edges.push(cell);
    if (cell.interior) interiors.push(cell);
  }
  if (visible.length === 0) return;

  // Render blur passes for edge cells
  if (options.fowBlurEnabled && options.blurRadius > 0) {
    renderHexBlurPasses(edges, context, options, hexGeometry, geometry);
    context.ctx.globalAlpha = options.useGlobalAlpha ? options.fowOpacity : 1;
  }

  // Render solid fog cells (one path)
  const { ctx } = context;
  ctx.beginPath();
  for (const { q, r } of visible) {
    traceHexPath(ctx, q, r, 1.0, hexGeometry, geometry, { offsetX, offsetY, zoom });
  }
  ctx.fill();

  // Interior hex outlines (one path, one stroke)
  if (visible.length > 1) strokeHexOutlines(interiors, context, hexGeometry, geometry);
}

export { identifyHexEdgeCells, traceHexPath, renderHexBlurPasses, renderHexFogCells, renderInteriorHexOutlines, renderHexFog, getHexFogTopology };
export type { ScreenCullRect };