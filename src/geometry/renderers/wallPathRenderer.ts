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
 * Per-object flatten cache, keyed by WallPath reference. Mutations replace the
 * WallPath object (immutable updates), so a changed wall misses and re-flattens
 * while unchanged walls reuse across frames; entries are GC'd with their walls.
 * Mirrors curveRenderer's `path2DCache`.
 */
const flattenCache = new WeakMap<WallPath, FlattenedPath>();

/**
 * Flatten a wall path to a polyline. Straight segments contribute their two
 * endpoints; arc segments subdivide. Closed paths append the closing segment
 * (which may itself arc via the last vertex's `arc`).
 */
function flattenWallPath(wallPath: WallPath): FlattenedPath {
  const cached = flattenCache.get(wallPath);
  if (cached != null) return cached;
  const result = computeFlattenWallPath(wallPath);
  flattenCache.set(wallPath, result);
  return result;
}

function computeFlattenWallPath(wallPath: WallPath): FlattenedPath {
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

/** Wrap an angle difference into (-PI, PI]. */
function wrapAngle(a: number): number {
  while (a <= -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/** Turn angle (radians) below which joint overlap is invisible and the miter
 *  clip is skipped — protects arc subdivisions (many tiny turns) from paying
 *  a clip per sub-segment. */
const MITER_MIN_TURN = 0.12;
/** Max seam offset in half-widths before the miter clamps (~bevel), so
 *  near-U-turns don't spike the seam to infinity. */
const MITER_LIMIT = 3;

/**
 * Clip polygon (in a segment's local frame: x along the segment from 0 to
 * segLen, y across it) that trims the segment's texture rectangle at the
 * angle bisector of each shared joint. Two segments clipped at their common
 * bisector tile a turn exactly — no overlap wedge on the inside, no gap on
 * the outside — which is what makes 45° walls render contiguously.
 *
 * turnIn/turnOut are the signed turns at the segment's start/end joints
 * (0 or below MITER_MIN_TURN = no joint / straight enough to skip). Returns
 * null when neither joint needs clipping. Exported for tests.
 */
function miterClipPoly(
  turnIn: number,
  turnOut: number,
  segLen: number,
  halfW: number,
  overlap: number,
): Array<[number, number]> | null {
  const clipIn = Math.abs(turnIn) > MITER_MIN_TURN;
  const clipOut = Math.abs(turnOut) > MITER_MIN_TURN;
  if (!clipIn && !clipOut) return null;

  const maxOff = MITER_LIMIT * halfW;
  const clampOff = (o: number): number => Math.max(-maxOff, Math.min(maxOff, o));
  // Seam through the joint along the bisector of the two segment directions:
  // its x-offset at height y is y·tan(turn/2) (start) / -y·tan(turn/2) (end).
  const kIn = clipIn ? Math.tan(turnIn / 2) : 0;
  const kOut = clipOut ? Math.tan(turnOut / 2) : 0;
  const pad = overlap + 1; // unclipped edges sit past the drawn rect
  const xStart = (y: number): number => (clipIn ? clampOff(y * kIn) : -pad);
  const xEnd = (y: number): number => segLen + (clipOut ? clampOff(-y * kOut) : pad);
  return [
    [xStart(-halfW), -halfW],
    [xEnd(-halfW), -halfW],
    [xEnd(halfW), halfW],
    [xStart(halfW), halfW],
  ];
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

  // Non-degenerate sub-segments with tangent angles, so joint turns compare
  // true neighbours even when the polyline repeats a point.
  const segs: Array<{ x0: number; y0: number; angle: number; len: number }> = [];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len <= 0) continue;
    segs.push({ x0, y0, angle: Math.atan2(y1 - y0, x1 - x0), len });
  }
  if (segs.length === 0) return;

  // Closed polylines share one more joint between the last and first segment.
  const [fx, fy] = points[0];
  const [lx, ly] = points[points.length - 1];
  const isClosed = segs.length > 1 && Math.hypot(lx - fx, ly - fy) < 1e-6;

  // Texture u-coordinate in source px, advancing with arc length.
  let u = 0;

  for (let j = 0; j < segs.length; j++) {
    const seg = segs[j];
    const segLen = seg.len;
    const prev = j > 0 ? segs[j - 1] : isClosed ? segs[segs.length - 1] : null;
    const next = j < segs.length - 1 ? segs[j + 1] : isClosed ? segs[0] : null;

    ctx.save();
    ctx.translate(seg.x0, seg.y0);
    ctx.rotate(seg.angle);

    const poly = miterClipPoly(
      prev != null ? wrapAngle(seg.angle - prev.angle) : 0,
      next != null ? wrapAngle(next.angle - seg.angle) : 0,
      segLen,
      halfW,
      CHUNK_OVERLAP,
    );
    if (poly != null) {
      const clip = new Path2D();
      clip.moveTo(poly[0][0], poly[0][1]);
      for (let p = 1; p < poly.length; p++) clip.lineTo(poly[p][0], poly[p][1]);
      clip.closePath();
      ctx.clip(clip);
    }

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
  wrapAngle,
  miterClipPoly,
  MITER_MIN_TURN,
  MITER_LIMIT,
};
export type { WallPathRenderOptions, FlattenedPath, ResolvedWallStrip, WallViewState };
