/**
 * wallPathRenderer.ts
 *
 * Renders WallPath strips: a texture swept along an editable polyline whose
 * segments may carry one quadratic arc control point each (Dungeondraft-style
 * walls and paths).
 *
 * Approach: flatten each path to a polyline (straight segments pass through,
 * arcs subdivide adaptively), then walk the polyline drawing source-cropped
 * chunks of the strip rotated to each sub-segment's tangent. The texture's
 * u-coordinate advances with arc length and wraps at the strip width, so
 * straight runs tile seamlessly and curves bend the texture. `_end` cap
 * textures render outward from open termini.
 *
 * All geometry is in world space under a single translate/scale transform
 * (the curveRenderer convention). Rendering happens into the static layer
 * cache, so cost is per-edit, not per-frame.
 */

import type { WallPath } from '#types/core/wallpath.types';
import type { TilesetDef, TileMetadataStore } from '#types/tiles/tile.types';

import { getTileMetadataForRender } from '../../persistence/tileMetadata';
import { DEFAULT_PIXELS_PER_CELL } from '../../assets/spanPredictor';

// ===========================================
// Types
// ===========================================

interface WallViewState {
  x: number;
  y: number;
  zoom: number;
}

interface WallPathRenderOptions {
  /** Layer/ghost opacity (0-1). @default 1 */
  opacity?: number;
  getCachedImage?: (vaultPath: string) => HTMLImageElement | null;
  /** Injectable metadata store for tests; defaults to the render accessor. */
  tileMetadata?: TileMetadataStore;
}

interface FlattenedPath {
  /** Flattened polyline points in world coords. */
  points: Array<[number, number]>;
  /** Total arc length in world units. */
  totalLength: number;
}

interface ResolvedWallStrip {
  img: HTMLImageElement;
  capImg: HTMLImageElement | null;
  srcW: number;
  srcH: number;
  /** World units per source pixel: (cellSize / pixelsPerCell) × widthScale. */
  worldScale: number;
}

// ===========================================
// Pure geometry helpers (exported for tests)
// ===========================================

/** Evaluate a quadratic bezier at t. */
function quadPoint(
  p0x: number, p0y: number,
  cx: number, cy: number,
  p1x: number, p1y: number,
  t: number,
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * p0x + 2 * mt * t * cx + t * t * p1x,
    mt * mt * p0y + 2 * mt * t * cy + t * t * p1y,
  ];
}

/**
 * Subdivision count for a quadratic arc, scaled to how far the control point
 * bows the segment. Flat-ish arcs get few pieces, deep bows get more.
 */
function arcSubdivisions(
  p0x: number, p0y: number,
  cx: number, cy: number,
  p1x: number, p1y: number,
): number {
  const midX = (p0x + p1x) / 2;
  const midY = (p0y + p1y) / 2;
  const dev = Math.hypot(cx - midX, cy - midY);
  return Math.max(8, Math.min(48, Math.ceil(dev / 4) * 4));
}

/**
 * Flatten a wall path to a polyline. Straight segments contribute their two
 * endpoints; arc segments subdivide. Closed paths append the closing segment
 * (which may itself arc via the last vertex's `arc`).
 */
function flattenWallPath(wallPath: WallPath): FlattenedPath {
  const verts = wallPath.vertices;
  const points: Array<[number, number]> = [];
  if (verts.length < 2) return { points, totalLength: 0 };

  points.push([verts[0].x, verts[0].y]);

  const segCount = wallPath.closed ? verts.length : verts.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (a.arc != null) {
      const [cx, cy] = a.arc;
      const n = arcSubdivisions(a.x, a.y, cx, cy, b.x, b.y);
      for (let s = 1; s <= n; s++) {
        points.push(quadPoint(a.x, a.y, cx, cy, b.x, b.y, s / n));
      }
    } else {
      points.push([b.x, b.y]);
    }
  }

  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return { points, totalLength };
}

/** Tangent angle (radians) of the first polyline sub-segment. */
function startAngle(points: Array<[number, number]>): number {
  return Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0]);
}

/** Tangent angle (radians) of the last polyline sub-segment. */
function endAngle(points: Array<[number, number]>): number {
  const n = points.length;
  return Math.atan2(points[n - 1][1] - points[n - 2][1], points[n - 1][0] - points[n - 2][0]);
}

// ===========================================
// Asset resolution
// ===========================================

function resolveWallStrip(
  wallPath: WallPath,
  tilesets: TilesetDef[],
  metadata: TileMetadataStore,
  cellSize: number,
  getCachedImage: (vaultPath: string) => HTMLImageElement | null,
): ResolvedWallStrip | null {
  const tileset = tilesets.find(ts => ts.id === wallPath.tilesetId);
  const entry = tileset?.tiles.find(t => t.id === wallPath.tileId);
  if (entry == null) return null;

  const img = getCachedImage(entry.vaultPath);
  if (img == null || img.naturalWidth === 0) return null;

  const meta = metadata[entry.vaultPath];
  const capPath = meta?.wallEndCapPath;
  const capImg = capPath != null ? getCachedImage(capPath) : null;

  const ppc = tileset?.pixelsPerCell ?? DEFAULT_PIXELS_PER_CELL;
  const worldScale = (cellSize / ppc) * (wallPath.widthScale > 0 ? wallPath.widthScale : 1);

  return {
    img,
    capImg: capImg != null && capImg.naturalWidth > 0 ? capImg : null,
    srcW: img.naturalWidth,
    srcH: img.naturalHeight,
    worldScale,
  };
}

// ===========================================
// Drawing
// ===========================================

/** World-unit overlap between drawn chunks; hides hairline seams on curves. */
const CHUNK_OVERLAP = 0.5;

function drawStripAlong(
  ctx: CanvasRenderingContext2D,
  flat: FlattenedPath,
  strip: ResolvedWallStrip,
): void {
  const { points } = flat;
  const { img, srcW, srcH, worldScale } = strip;
  const widthWorld = srcH * worldScale;
  const halfW = widthWorld / 2;

  // Texture u-coordinate in source px, advancing with arc length.
  let u = 0;

  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const segLen = Math.hypot(x1 - x0, y1 - y0);
    if (segLen <= 0) continue;

    const angle = Math.atan2(y1 - y0, x1 - x0);
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(angle);

    // Walk the sub-segment, wrapping the texture at its seam.
    let drawn = 0;
    while (drawn < segLen) {
      const uStart = u % srcW;
      const remainingSrc = (segLen - drawn) / worldScale;
      const chunkSrc = Math.min(srcW - uStart, remainingSrc);
      const chunkWorld = chunkSrc * worldScale;
      ctx.drawImage(
        img,
        uStart, 0, chunkSrc, srcH,
        drawn, -halfW, chunkWorld + CHUNK_OVERLAP, widthWorld,
      );
      drawn += chunkWorld;
      u += chunkSrc;
    }

    ctx.restore();
  }
}

function drawEndCaps(
  ctx: CanvasRenderingContext2D,
  flat: FlattenedPath,
  strip: ResolvedWallStrip,
): void {
  const cap = strip.capImg;
  if (cap == null) return;
  const { points } = flat;
  const { worldScale } = strip;
  const capW = cap.naturalWidth * worldScale;
  const capH = cap.naturalHeight * worldScale;
  const halfH = capH / 2;

  // End cap: extends outward past the final point along the exit tangent.
  const [ex, ey] = points[points.length - 1];
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(endAngle(points));
  ctx.drawImage(cap, 0, -halfH, capW, capH);
  ctx.restore();

  // Start cap: mirrored, extends outward before the first point.
  const [sx, sy] = points[0];
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(startAngle(points));
  ctx.scale(-1, 1);
  ctx.drawImage(cap, 0, -halfH, capW, capH);
  ctx.restore();
}

/**
 * Render wall paths in world space. Call between curves and tiles in the
 * layer stack. `cellSize` is the world size of one grid cell (or hex size),
 * used with each tileset's pixelsPerCell to map strip pixels to world units.
 */
function renderWallPaths(
  ctx: CanvasRenderingContext2D,
  wallPaths: WallPath[],
  tilesets: TilesetDef[],
  viewState: WallViewState,
  cellSize: number,
  options: WallPathRenderOptions = {},
): void {
  if (wallPaths.length === 0 || tilesets.length === 0) return;
  const getImage = options.getCachedImage;
  if (getImage == null) return;
  const metadata = options.tileMetadata ?? getTileMetadataForRender();

  ctx.save();
  ctx.translate(viewState.x, viewState.y);
  ctx.scale(viewState.zoom, viewState.zoom);
  if (options.opacity != null && options.opacity < 1) {
    ctx.globalAlpha = options.opacity;
  }
  ctx.imageSmoothingEnabled = true;

  for (const wallPath of wallPaths) {
    if (wallPath.vertices.length < 2) continue;
    const strip = resolveWallStrip(wallPath, tilesets, metadata, cellSize, getImage);
    if (strip == null) continue;

    const flat = flattenWallPath(wallPath);
    if (flat.points.length < 2) continue;
    // DD convention: flip reverses the texture's travel direction.
    if (wallPath.flip === true) flat.points.reverse();

    drawStripAlong(ctx, flat, strip);
    if (!wallPath.closed) {
      drawEndCaps(ctx, flat, strip);
    }
  }

  ctx.restore();
}

/** Collect the vault paths a set of wall paths needs preloaded (strips + caps). */
function collectWallPathImagePaths(
  wallPaths: WallPath[],
  tilesets: TilesetDef[],
  metadata: TileMetadataStore,
): string[] {
  const paths = new Set<string>();
  for (const wp of wallPaths) {
    const ts = tilesets.find(t => t.id === wp.tilesetId);
    const entry = ts?.tiles.find(t => t.id === wp.tileId);
    if (entry?.vaultPath == null) continue;
    paths.add(entry.vaultPath);
    const cap = metadata[entry.vaultPath]?.wallEndCapPath;
    if (cap != null) paths.add(cap);
  }
  return Array.from(paths);
}

export {
  renderWallPaths,
  flattenWallPath,
  resolveWallStrip,
  collectWallPathImagePaths,
  quadPoint,
  arcSubdivisions,
};
export type { WallPathRenderOptions, FlattenedPath, ResolvedWallStrip, WallViewState };
