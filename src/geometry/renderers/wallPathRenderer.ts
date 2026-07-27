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

import type { WallGapTile, WallPath } from '#types/core/wallpath.types';
import type { TilesetDef, TileMetadataStore } from '#types/tiles/tile.types';

import { getTileMetadataForRender } from '../../persistence/tileMetadata';
import { DEFAULT_PIXELS_PER_CELL } from '../../assets/spanPredictor';
import { resolveTileEntry } from '../../assets/tilesetOperations';
import {
  buildGapFlatten,
  clampGapToSegment,
  pointAtLength,
  subtractIntervals,
} from '../../drawing/wallGapOperations';
import type { GapFlatten } from '../../drawing/wallGapOperations';

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

/**
 * Per-object STABLE flatten cache (fixed-subdivision; geometry F6), keyed by
 * WallPath ref. Gap math and gap-aware rendering (skip-spans, caps, seated art)
 * all run on this flatten so a gap's arc-length position does not step as a bow's
 * adaptive subdivision count changes. Strip texturing rides the same flatten so
 * the holes it cuts stay exactly aligned with the drawn strip. Immutable — never
 * mutated in place (the old `flat.points.reverse()` flip bug, geometry F1/§4.0).
 */
const gapFlattenCache = new WeakMap<WallPath, GapFlatten>();

/** Cached stable flatten for gap math + gap-aware rendering (see gapFlattenCache). */
function stableFlatten(wallPath: WallPath): GapFlatten {
  const cached = gapFlattenCache.get(wallPath);
  if (cached != null) return cached;
  const result = buildGapFlatten(wallPath);
  gapFlattenCache.set(wallPath, result);
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
  const entry = resolveTileEntry(tileset, wallPath.tileId);
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

/**
 * Skip intervals (gap spans) for one wall, in GLOBAL flattened arc length on the
 * STABLE flatten (geometry F6). Each gap's span is clamped inside its own segment
 * (invariant 3) WITHOUT touching stored values, so a door wider than its segment
 * cuts a segment-wide hole yet returns to full size when the wall is lengthened.
 */
function computeGapSpans(
  wall: WallPath,
  flat: GapFlatten,
  cellSize: number,
): Array<[number, number]> {
  const gaps = wall.gaps;
  if (gaps == null || gaps.length === 0) return [];
  const spans: Array<[number, number]> = [];
  for (const gap of gaps) {
    const s = clampGapToSegment(gap, flat, cellSize);
    if (s.hi > s.lo) spans.push([s.lo, s.hi]);
  }
  return spans;
}

/**
 * Split a wall's centerline into solid sub-polylines with each gap's derived
 * span (invariant 3, clamp-at-derive) cut out. Consumed by the flood-fill wall
 * barrier (§9, Guildmaster ruling D7): a doorway is a hole in the barrier —
 * fill leaks through it regardless of seated art — so the barrier is built
 * from these gap-free pieces rather than the raw centerline. Runs on the same
 * STABLE flatten as rendering (geometry F6) so the hole lines up with what's
 * drawn. A gapless wall returns its single unbroken polyline; a wall whose
 * gaps consume it entirely returns [].
 */
function solidWallPolylines(wall: WallPath, cellSize: number): Array<Array<[number, number]>> {
  if (wall.vertices.length < 2) return [];
  const flat = stableFlatten(wall);
  if (flat.points.length < 2) return [];
  const skips = computeGapSpans(wall, flat, cellSize);
  if (skips.length === 0) return [flat.points];

  const solids = subtractIntervals(0, flat.totalLength, skips);
  const out: Array<Array<[number, number]>> = [];
  for (const [lo, hi] of solids) {
    if (hi - lo < 1e-9) continue;
    const start = pointAtLength(flat, lo);
    const pts: Array<[number, number]> = [[start.x, start.y]];
    for (let i = 0; i < flat.points.length; i++) {
      const len = flat.cumLen[i];
      if (len > lo + 1e-9 && len < hi - 1e-9) pts.push(flat.points[i]);
    }
    const end = pointAtLength(flat, hi);
    pts.push([end.x, end.y]);
    if (pts.length >= 2) out.push(pts);
  }
  return out;
}

function drawStripAlong(
  ctx: CanvasRenderingContext2D,
  flat: GapFlatten,
  strip: ResolvedWallStrip,
  skips: ReadonlyArray<readonly [number, number]>,
  flip: boolean,
): void {
  const { points } = flat;
  const { img, srcW, srcH, worldScale } = strip;
  const widthWorld = srcH * worldScale;
  const halfW = widthWorld / 2;

  // Non-degenerate sub-segments with tangent angles and their global arc-length
  // start, so joint turns compare true neighbours and the texture u-coordinate
  // (derived from global arc length) advances continuously across gaps.
  const segs: Array<{ x0: number; y0: number; angle: number; len: number; gStart: number }> = [];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len <= 0) continue;
    segs.push({ x0, y0, angle: Math.atan2(y1 - y0, x1 - x0), len, gStart: acc });
    acc += len;
  }
  if (segs.length === 0) return;

  // Closed polylines share one more joint between the last and first segment.
  const [fx, fy] = points[0];
  const [lx, ly] = points[points.length - 1];
  const isClosed = segs.length > 1 && Math.hypot(lx - fx, ly - fy) < 1e-6;

  for (let j = 0; j < segs.length; j++) {
    const seg = segs[j];
    const segLen = seg.len;
    const segEnd = seg.gStart + segLen;
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

    // Draw only the solid sub-pieces of this segment (gap spans subtracted). The
    // texture u-coordinate is derived from the GLOBAL arc position, so it keeps
    // advancing across gaps — the wall reads as continuous stone with holes cut.
    const visible = subtractIntervals(seg.gStart, segEnd, skips);
    for (const [gA, gB] of visible) {
      const pieceEndIsSegEnd = Math.abs(gB - segEnd) < 1e-6;
      let sPos = gA;
      while (sPos < gB - 1e-9) {
        const uStart = (sPos / worldScale) % srcW;
        const remWorld = gB - sPos;
        const chunkSrc = Math.min(srcW - uStart, remWorld / worldScale);
        const chunkWorld = chunkSrc * worldScale;
        const localX = sPos - seg.gStart;
        const isLastChunk = sPos + chunkWorld >= gB - 1e-9;
        // Overlap bridges intra-piece chunk seams and the miter join at a
        // segment end, but must NOT bleed texture into a gap edge.
        const overlap = !isLastChunk || pieceEndIsSegEnd ? CHUNK_OVERLAP : 0;
        if (flip) {
          // Invert only the source-u mapping (geometry F1/§4.0): read the
          // mirrored source columns and draw flipped along the wall. The
          // overlap must still land on the SAME dest interval as the unflipped
          // path ([localX, localX + chunkWorld + overlap]) so it bleeds forward
          // into safe territory, never backward into the start of a gap: shift
          // the mirror origin by +overlap so the mirrored rect ends at
          // localX + chunkWorld + overlap rather than localX + chunkWorld.
          ctx.save();
          ctx.translate(localX + chunkWorld + overlap, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(
            img,
            srcW - uStart - chunkSrc, 0, chunkSrc, srcH,
            0, -halfW, chunkWorld + overlap, widthWorld,
          );
          ctx.restore();
        } else {
          ctx.drawImage(
            img,
            uStart, 0, chunkSrc, srcH,
            localX, -halfW, chunkWorld + overlap, widthWorld,
          );
        }
        sPos += chunkWorld;
      }
    }

    ctx.restore();
  }
}

/**
 * Draw a cap texture at a world point, rotated to the local tangent. `mirror`
 * flips it across the wall normal so it extends in the -tangent direction.
 * Used for whole-wall termini AND gap-edge framing (§4.3).
 */
function drawCapAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  cap: HTMLImageElement,
  worldScale: number,
  mirror: boolean,
): void {
  const capW = cap.naturalWidth * worldScale;
  const capH = cap.naturalHeight * worldScale;
  const halfH = capH / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(cap, 0, -halfH, capW, capH);
  ctx.restore();
}

/** Cap the open termini of a non-closed wall (extends outward past each end). */
function drawTerminusCaps(
  ctx: CanvasRenderingContext2D,
  flat: GapFlatten,
  strip: ResolvedWallStrip,
): void {
  const cap = strip.capImg;
  if (cap == null) return;
  const { points } = flat;
  const [ex, ey] = points[points.length - 1];
  drawCapAt(ctx, ex, ey, endAngle(points), cap, strip.worldScale, false);
  const [sx, sy] = points[0];
  drawCapAt(ctx, sx, sy, startAngle(points), cap, strip.worldScale, true);
}

/**
 * Frame each gap with the strip's `_end` cap at both edges, each cap facing INTO
 * the opening (low edge unmirrored → +tangent; high edge mirrored → -tangent).
 * No `_end` texture → blunt edges (same as open walls today). §4.3.
 */
function drawGapEdgeCaps(
  ctx: CanvasRenderingContext2D,
  flat: GapFlatten,
  strip: ResolvedWallStrip,
  skips: ReadonlyArray<readonly [number, number]>,
): void {
  const cap = strip.capImg;
  if (cap == null || skips.length === 0) return;
  for (const [lo, hi] of skips) {
    const a = pointAtLength(flat, lo);
    drawCapAt(ctx, a.x, a.y, a.angle, cap, strip.worldScale, false);
    const b = pointAtLength(flat, hi);
    drawCapAt(ctx, b.x, b.y, b.angle, cap, strip.worldScale, true);
  }
}

/** Resolve a gap's seated art image; null (bare gap) when unresolvable (invariant 5). */
function resolveGapImage(
  tile: WallGapTile,
  tilesets: TilesetDef[],
  getCachedImage: (vaultPath: string) => HTMLImageElement | null,
): HTMLImageElement | null {
  const ts = tilesets.find(t => t.id === tile.tilesetId);
  const entry = resolveTileEntry(ts, tile.tileId);
  if (entry == null) return null;
  const img = getCachedImage(entry.vaultPath);
  if (img == null || img.naturalWidth === 0) return null;
  return img;
}

/**
 * Seated-leaf world size. The along-wall scale fills the gap width (aspect
 * preserved); the perpendicular (leaf-height) scale folds in the host wall's
 * `widthScale` so the leaf height tracks the rendered wall thickness — the
 * skip-span cut a widthScale-tall hole (geometry F3). `heightScale` (default 1)
 * is the per-door escape hatch on top of that default. Exported for tests.
 */
function seatedLeafSize(
  widthWorld: number,
  imgW: number,
  imgH: number,
  wallWidthScale: number,
  heightScale: number | undefined,
): { w: number; h: number } {
  const w = widthWorld;
  const uScale = imgW > 0 ? w / imgW : 0;
  const vScale = uScale * (wallWidthScale > 0 ? wallWidthScale : 1) * (heightScale ?? 1);
  return { w, h: imgH * vScale };
}

/** Draw the seated door/window art centered in each bound gap, on top of caps. */
function drawSeatedOpenings(
  ctx: CanvasRenderingContext2D,
  wall: WallPath,
  flat: GapFlatten,
  tilesets: TilesetDef[],
  cellSize: number,
  getCachedImage: (vaultPath: string) => HTMLImageElement | null,
): void {
  const gaps = wall.gaps;
  if (gaps == null || gaps.length === 0) return;
  const wallWidthScale = wall.widthScale > 0 ? wall.widthScale : 1;
  for (const gap of gaps) {
    if (gap.tile == null) continue;
    const img = resolveGapImage(gap.tile, tilesets, getCachedImage);
    if (img == null) continue; // bare gap fallback (already cut + capped)
    const span = clampGapToSegment(gap, flat, cellSize);
    const { x, y, angle } = pointAtLength(flat, span.centerLen);
    const { w, h } = seatedLeafSize(
      span.widthWorld, img.naturalWidth, img.naturalHeight, wallWidthScale, gap.tile.heightScale,
    );
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + (gap.tile.rotation ?? 0));
    if (gap.tile.flip === true) ctx.scale(1, -1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
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

    // Stable, IMMUTABLE flatten (never reversed for flip — geometry F1/§4.0);
    // all gap math + gap-aware rendering runs on it.
    const flat = stableFlatten(wallPath);
    if (flat.points.length < 2) continue;

    const skips = computeGapSpans(wallPath, flat, cellSize);
    // Z-order (§4.4): (a) strip with holes, (b) gap-edge caps, (c) seated art.
    drawStripAlong(ctx, flat, strip, skips, wallPath.flip === true);
    if (!wallPath.closed) drawTerminusCaps(ctx, flat, strip);
    drawGapEdgeCaps(ctx, flat, strip, skips);
    drawSeatedOpenings(ctx, wallPath, flat, tilesets, cellSize, getImage);
  }

  ctx.restore();
}

/**
 * Collect the vault paths a set of wall paths needs preloaded (strips + caps +
 * seated gap art). The caller invokes this per layer over ALL boards, matching
 * the strip-image preloader scope so other-board ghost renders never pop in bare
 * (I-F8). Gap-tile art is enumerated here even for unresolved-strip walls.
 */
function collectWallPathImagePaths(
  wallPaths: WallPath[],
  tilesets: TilesetDef[],
  metadata: TileMetadataStore,
): string[] {
  const paths = new Set<string>();
  for (const wp of wallPaths) {
    const ts = tilesets.find(t => t.id === wp.tilesetId);
    const entry = resolveTileEntry(ts, wp.tileId);
    if (entry?.vaultPath != null) {
      paths.add(entry.vaultPath);
      const cap = metadata[entry.vaultPath]?.wallEndCapPath;
      if (cap != null) paths.add(cap);
    }
    if (wp.gaps != null) {
      for (const gap of wp.gaps) {
        const gapTile = gap.tile;
        if (gapTile == null) continue;
        const gts = tilesets.find(t => t.id === gapTile.tilesetId);
        const gEntry = resolveTileEntry(gts, gapTile.tileId);
        if (gEntry?.vaultPath != null) paths.add(gEntry.vaultPath);
      }
    }
  }
  return Array.from(paths);
}

export {
  renderWallPaths,
  flattenWallPath,
  resolveWallStrip,
  collectWallPathImagePaths,
  computeGapSpans,
  solidWallPolylines,
  seatedLeafSize,
  quadPoint,
  arcSubdivisions,
  wrapAngle,
  miterClipPoly,
  MITER_MIN_TURN,
  MITER_LIMIT,
};
export type { WallPathRenderOptions, FlattenedPath, ResolvedWallStrip, WallViewState };
