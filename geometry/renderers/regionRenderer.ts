/**
 * regionRenderer.ts
 * Renders named hex regions: fill overlay, outer boundary, and label.
 * Hex maps only. Designed to slot into the render pipeline between
 * painted cells and objects.
 */

import type { Point } from '#types/core/geometry.types';
import type { Region } from '#types/core/map.types';

// ── Types ────────────────────────────────────────────────────────────

interface HexGeometryLike {
  hexSize: number;
  orientation: string;
  hexToWorld(q: number, r: number): { worldX: number; worldY: number };
  getHexVertices(q: number, r: number): { worldX: number; worldY: number }[];
  worldToScreen(worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number): { screenX: number; screenY: number };
  getNeighbors(x: number, y: number): Point[];
  isWithinBounds(q: number, r: number): boolean;
}

interface ViewState {
  x: number;       // offsetX
  y: number;       // offsetY
  zoom: number;
}

interface RegionRenderOptions {
  foggedCells?: Set<string>;
}

// ── Helpers ──────────────────────────────────────────────────────────

function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

function computeCentroid(hexes: Point[], geometry: HexGeometryLike): { worldX: number; worldY: number } {
  let sumX = 0;
  let sumY = 0;
  for (const h of hexes) {
    const { worldX, worldY } = geometry.hexToWorld(h.x, h.y);
    sumX += worldX;
    sumY += worldY;
  }
  return { worldX: sumX / hexes.length, worldY: sumY / hexes.length };
}

/**
 * Find the outer boundary edges of a region.
 * Returns pairs of vertex indices that form the exterior boundary.
 * Each edge is [hex, vertexIndex] where the edge goes from vertex[i] to vertex[(i+1)%6].
 */
function computeBoundaryEdges(
  hexes: Point[],
  geometry: HexGeometryLike
): Array<{ q: number; r: number; edgeIndex: number }> {
  const memberSet = new Set<string>();
  for (const h of hexes) {
    memberSet.add(hexKey(h.x, h.y));
  }

  const edges: Array<{ q: number; r: number; edgeIndex: number }> = [];

  for (const h of hexes) {
    const neighbors = geometry.getNeighbors(h.x, h.y);
    for (let i = 0; i < 6; i++) {
      const neighbor = neighbors[i];
      if (!memberSet.has(hexKey(neighbor.x, neighbor.y))) {
        edges.push({ q: h.x, r: h.y, edgeIndex: i });
      }
    }
  }

  return edges;
}

// ── Render Functions ─────────────────────────────────────────────────

function renderRegionFill(
  ctx: CanvasRenderingContext2D,
  region: Region,
  geometry: HexGeometryLike,
  viewState: ViewState,
  options: RegionRenderOptions
): void {
  if (!region.visible || region.hexes.length === 0) return;

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = region.opacity;
  ctx.fillStyle = region.color;

  ctx.beginPath();

  for (const h of region.hexes) {
    // Skip fogged cells (they'll be covered by fog layer)
    if (options.foggedCells && options.foggedCells.has(hexKey(h.x, h.y))) continue;

    const vertices = geometry.getHexVertices(h.x, h.y);
    const screenVerts = vertices.map(v =>
      geometry.worldToScreen(v.worldX, v.worldY, viewState.x, viewState.y, viewState.zoom)
    );

    ctx.moveTo(screenVerts[0].screenX, screenVerts[0].screenY);
    for (let i = 1; i < screenVerts.length; i++) {
      ctx.lineTo(screenVerts[i].screenX, screenVerts[i].screenY);
    }
    ctx.closePath();
  }

  ctx.fill();
  ctx.globalAlpha = prevAlpha;
}

function renderRegionBorder(
  ctx: CanvasRenderingContext2D,
  region: Region,
  geometry: HexGeometryLike,
  viewState: ViewState,
  options: RegionRenderOptions
): void {
  if (!region.visible || region.hexes.length === 0) return;

  const edges = computeBoundaryEdges(region.hexes, geometry);
  if (edges.length === 0) return;

  ctx.strokeStyle = region.borderColor;
  ctx.lineWidth = region.borderWidth * viewState.zoom;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();

  for (const edge of edges) {
    // Skip border segments for fogged hexes
    if (options.foggedCells && options.foggedCells.has(hexKey(edge.q, edge.r))) continue;

    const vertices = geometry.getHexVertices(edge.q, edge.r);
    const v1 = vertices[edge.edgeIndex];
    const v2 = vertices[(edge.edgeIndex + 1) % 6];

    const s1 = geometry.worldToScreen(v1.worldX, v1.worldY, viewState.x, viewState.y, viewState.zoom);
    const s2 = geometry.worldToScreen(v2.worldX, v2.worldY, viewState.x, viewState.y, viewState.zoom);

    ctx.moveTo(s1.screenX, s1.screenY);
    ctx.lineTo(s2.screenX, s2.screenY);
  }

  ctx.stroke();
}

function renderRegionLabel(
  ctx: CanvasRenderingContext2D,
  region: Region,
  geometry: HexGeometryLike,
  viewState: ViewState,
  options: RegionRenderOptions
): void {
  if (!region.visible || region.hexes.length === 0 || !region.name) return;

  // Only show label when enough hexes are revealed
  if (options.foggedCells) {
    const visibleCount = region.hexes.filter(h => !options.foggedCells!.has(hexKey(h.x, h.y))).length;
    if (visibleCount / region.hexes.length < 0.5) return;
  }

  const centroid = region.labelPosition
    ? { worldX: region.labelPosition.x, worldY: region.labelPosition.y }
    : computeCentroid(region.hexes, geometry);

  const screen = geometry.worldToScreen(
    centroid.worldX, centroid.worldY,
    viewState.x, viewState.y, viewState.zoom
  );

  // Scale font with zoom, clamp to readable minimum
  const baseFontSize = Math.max(12, 14 * viewState.zoom);
  ctx.font = `bold ${baseFontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Background plate for readability
  const metrics = ctx.measureText(region.name);
  const padX = 6;
  const padY = 3;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(
    screen.screenX - metrics.width / 2 - padX,
    screen.screenY - baseFontSize / 2 - padY,
    metrics.width + padX * 2,
    baseFontSize + padY * 2
  );

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(region.name, screen.screenX, screen.screenY);
}

// ── Hit Detection ───────────────────────────────────────────────────

/**
 * Get the world-space position of a region's label.
 * Returns null if the region has no name or hexes.
 */
function getRegionLabelWorldPosition(
  region: Region,
  geometry: HexGeometryLike
): { worldX: number; worldY: number } | null {
  if (!region.visible || region.hexes.length === 0 || !region.name) return null;
  return region.labelPosition
    ? { worldX: region.labelPosition.x, worldY: region.labelPosition.y }
    : computeCentroid(region.hexes, geometry);
}

// ── Main Entry Point ─────────────────────────────────────────────────

/**
 * Render all regions for a hex map.
 * Call between painted cells/curves and objects in the render pipeline.
 */
function renderRegions(
  ctx: CanvasRenderingContext2D,
  regions: Region[],
  geometry: HexGeometryLike,
  viewState: ViewState,
  options: RegionRenderOptions = {}
): void {
  if (!regions || regions.length === 0) return;

  // Sort by order (lower = behind)
  const sorted = [...regions].sort((a, b) => a.order - b.order);

  for (const region of sorted) {
    renderRegionFill(ctx, region, geometry, viewState, options);
    renderRegionBorder(ctx, region, geometry, viewState, options);
    renderRegionLabel(ctx, region, geometry, viewState, options);
  }
}

return {
  renderRegions,
  renderRegionFill,
  renderRegionBorder,
  renderRegionLabel,
  computeBoundaryEdges,
  computeCentroid,
  getRegionLabelWorldPosition
};
