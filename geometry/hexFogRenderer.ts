/**
 * Hex Fog Renderer Module
 *
 * Renders fog of war for hex maps with optional blur effects.
 * Handles edge cell detection, multi-pass blur rendering, and interior hex outlines.
 */

interface FogCell {
  col: number;
  row: number;
}

interface EdgeCell extends FogCell {
  q: number;
  r: number;
}

interface HexGeometryLike {
  hexSize: number;
  getHexVertices: (q: number, r: number) => Array<{ worldX: number; worldY: number }>;
  hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
  getNeighbors: (q: number, r: number) => Array<{ q: number; r: number }>;
}

interface GeometryLike {
  worldToScreen: (worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number };
}

interface HexFogRenderContext {
  ctx: CanvasRenderingContext2D;
  fogCtx: CanvasRenderingContext2D | null;
  offsetX: number;
  offsetY: number;
  zoom: number;
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
  fogCells: FogCell[],
  foggedSet: Set<string>,
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  hexGeometry: HexGeometryLike,
  orientation: string,
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number }
): { visibleFogCells: FogCell[]; edgeCells: EdgeCell[] } {
  const { minCol, maxCol, minRow, maxRow } = visibleBounds;
  const visibleFogCells: FogCell[] = [];
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
      const { col: nCol, row: nRow } = axialToOffset(n.q, n.r, orientation);
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
  geometry: GeometryLike,
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
  geometry: GeometryLike
): void {
  const { ctx, fogCtx, offsetX, offsetY, zoom } = context;
  const { fowOpacity, blurRadius } = options;

  if (edgeCells.length === 0 || blurRadius <= 0) return;

  const baseOpacity = fowOpacity;
  const numPasses = 8;
  const maxExpansion = blurRadius / (hexGeometry.hexSize * zoom);

  const targetCtx = fogCtx || ctx;
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
  visibleFogCells: FogCell[],
  context: HexFogRenderContext,
  hexGeometry: HexGeometryLike,
  geometry: GeometryLike,
  orientation: string,
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number }
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
  visibleFogCells: FogCell[],
  foggedSet: Set<string>,
  context: HexFogRenderContext,
  hexGeometry: HexGeometryLike,
  geometry: GeometryLike,
  orientation: string,
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number }
): void {
  const { ctx, offsetX, offsetY, zoom } = context;

  if (visibleFogCells.length <= 1) return;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = Math.max(1, 1 * zoom);

  for (const { col, row } of visibleFogCells) {
    const { q, r } = offsetToAxial(col, row, orientation);

    const neighbors = hexGeometry.getNeighbors(q, r);
    const hasFoggedNeighbor = neighbors.some(n => {
      const { col: nCol, row: nRow } = axialToOffset(n.q, n.r, orientation);
      return foggedSet.has(`${nCol},${nRow}`);
    });

    if (hasFoggedNeighbor) {
      const vertices = hexGeometry.getHexVertices(q, r);

      ctx.beginPath();
      const first = geometry.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
      ctx.moveTo(first.screenX, first.screenY);

      for (let i = 1; i < vertices.length; i++) {
        const vertex = geometry.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
        ctx.lineTo(vertex.screenX, vertex.screenY);
      }

      ctx.closePath();
      ctx.stroke();
    }
  }
}

/**
 * Main entry point for rendering hex fog of war.
 * Orchestrates edge detection, blur passes, solid fog, and interior outlines.
 */
function renderHexFog(
  fogCells: FogCell[],
  context: HexFogRenderContext,
  options: HexFogRenderOptions,
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  hexGeometry: HexGeometryLike,
  geometry: GeometryLike,
  orientation: string,
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number }
): void {
  const foggedSet = new Set(fogCells.map(c => `${c.col},${c.row}`));

  // Identify visible and edge cells
  const { visibleFogCells, edgeCells } = identifyHexEdgeCells(
    fogCells,
    foggedSet,
    visibleBounds,
    hexGeometry,
    orientation,
    offsetToAxial,
    axialToOffset
  );

  // Render blur passes for edge cells
  if (options.fowBlurEnabled && options.blurRadius > 0) {
    renderHexBlurPasses(edgeCells, context, options, hexGeometry, geometry);
    context.ctx.globalAlpha = options.useGlobalAlpha ? options.fowOpacity : 1;
  }

  // Render solid fog cells
  renderHexFogCells(visibleFogCells, context, hexGeometry, geometry, orientation, offsetToAxial);

  // Render interior hex outlines
  renderInteriorHexOutlines(
    visibleFogCells,
    foggedSet,
    context,
    hexGeometry,
    geometry,
    orientation,
    offsetToAxial,
    axialToOffset
  );
}

return {
  identifyHexEdgeCells,
  traceHexPath,
  renderHexBlurPasses,
  renderHexFogCells,
  renderInteriorHexOutlines,
  renderHexFog
};
