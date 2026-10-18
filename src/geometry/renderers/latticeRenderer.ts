/**
 * latticeRenderer.ts
 *
 * The global-lattice ladder's live grid pass. Design
 * `.claude/lod-rd/06-integration-design.md` section 3.3: at the active level L the
 * lattice is stroked solid and unclipped, and the two coarser rungs (L-2, L-1) are
 * stroked as lighter, thicker "district" lines under a single clip to the drawn map.
 *
 * Lattices are stroked LIVE every frame, never baked into the static surface: a baked
 * lattice thickens under a scale-blit, which is the most visible crossing artefact there
 * is. What IS cached is the lattice's PATH (MEM-02): one Path2D per (canvas, ladder,
 * level, epoch, padded world rect), built once from an SVG string in level-cell units and
 * stroked under a uniform scale with `lineWidth / scale`, so the on-screen width is
 * exactly the style's width at any zoom. A steady frame is then one native `stroke()`
 * per rung with no existence walks. The `clip()` runs in world space too, and the base
 * transform is handed straight back afterwards.
 */

import type { GeometryLadder } from '../core/createGeometryLadder';
import { estimateCellsInRect, MATERIALISE_CELL_CAP } from '../core/materialiseLevel';
import { forEachCellInWorldRect } from '../core/lattice';

/** Screen = offset + world * zoom, matching renderCanvas's view state. */
export interface LatticeView {
  offsetX: number;
  offsetY: number;
  zoom: number;
  width: number;
  height: number;
}

export interface LatticeStyle {
  alpha: number;
  width: number;
  colour: string;
}

interface LatticeClipEntry {
  level: number;
  epoch: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** null = every cell in the padded rect exists, i.e. do not clip at all. */
  path: Path2D | null;
}

/**
 * Opaque per-canvas clip cache. Hold one for the lifetime of the canvas and pass the same
 * instance every frame; a steady frame then costs one `clip()` and allocates nothing.
 */
export interface LatticeClipCache {
  /** @internal */
  entry: LatticeClipEntry | null;
}

interface WorldRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface CornerOffset {
  x: number;
  y: number;
}

/** Below this on-screen cell width a lattice reads as moire, not as a grid. */
const MIN_LATTICE_PX = 3;

/** District rung styling, from the design's section 3.3. */
const DISTRICT_FAR: Readonly<Omit<LatticeStyle, 'colour'>> = Object.freeze({ alpha: 0.30, width: 3 });
const DISTRICT_NEAR: Readonly<Omit<LatticeStyle, 'colour'>> = Object.freeze({ alpha: 0.42, width: 2.2 });
const ACTIVE: Readonly<Omit<LatticeStyle, 'colour'>> = Object.freeze({ alpha: 1, width: 1 });

/**
 * A pass whose alpha is at or below this draws nothing visible (about 1/255, one 8-bit
 * step): skip it outright rather than enumerate and stroke an invisible lattice.
 */
const LATTICE_MIN_ALPHA = 0.004;

/**
 * Padding of a cached path's world rect (clip and stroke caches alike). The fraction is of
 * the viewport's world width/height, added on EACH side, so a pan of up to 35% of the
 * view in any direction stays inside the cache with no rebuild. `CLIP_PAD_CELLS` is in
 * cells of the rung being built and covers the hexes that straddle the rect's edge (a
 * cell's corners reach one cell size past its centre) plus one ring of slack, so a cell
 * whose centre lies just outside the view still has its visible edges in the path.
 */
const CLIP_PAD_FRACTION = 0.35;
const CLIP_PAD_CELLS = 2;

/** Stroke paths retained per canvas: the active rung, two district rungs, one spare for a crossing. */
const STROKE_CACHE_LIMIT = 4;

/**
 * Edge k of a hex (the segment corner k -> corner k+1) faces this axial neighbour.
 * Derived from `HexGeometry.getHexVertices`' corner phase: flat corners sit at 60k deg so
 * edge k points at 60k+30; pointy corners sit at 60k+30 so edge k points at 60k+60. The
 * neighbour is then one full cell width (sqrt3 * hexSize) along that direction, resolved
 * back into axial through `hexToWorld`. Used by `strokeLattice` to close the map's
 * silhouette without stroking any interior edge twice.
 */
const EDGE_NEI_FLAT: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]
]);
const EDGE_NEI_POINTY: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0]
]);

function edgeNeighbours(orientation: 'flat' | 'pointy'): ReadonlyArray<readonly [number, number]> {
  return orientation === 'pointy' ? EDGE_NEI_POINTY : EDGE_NEI_FLAT;
}

function createLatticeClipCache(): LatticeClipCache {
  return { entry: null };
}

/** The viewport as a world rect: the enumeration window every lattice pass shares. */
function viewWorldRect(view: LatticeView): WorldRect {
  const { offsetX, offsetY, zoom, width, height } = view;
  return {
    x0: (0 - offsetX) / zoom,
    y0: (0 - offsetY) / zoom,
    x1: (width - offsetX) / zoom,
    y1: (height - offsetY) / zoom
  };
}

/** `rect` grown by the shared cache pad for cells of size `s`. */
function padRect(rect: WorldRect, s: number): WorldRect {
  const padX = (rect.x1 - rect.x0) * CLIP_PAD_FRACTION + CLIP_PAD_CELLS * s;
  const padY = (rect.y1 - rect.y0) * CLIP_PAD_FRACTION + CLIP_PAD_CELLS * s;
  return { x0: rect.x0 - padX, y0: rect.y0 - padY, x1: rect.x1 + padX, y1: rect.y1 + padY };
}

function rectContains(outer: WorldRect, inner: WorldRect): boolean {
  return inner.x0 >= outer.x0 && inner.y0 >= outer.y0 && inner.x1 <= outer.x1 && inner.y1 <= outer.y1;
}

/** The six corner offsets of a level-L cell, relative to its centre. */
function cornerOffsets(ladder: GeometryLadder, level: number): CornerOffset[] {
  // hexToWorld(0, 0) is the origin in both orientations, so the level's own geometry hands
  // back the corner offsets directly - no duplicated trigonometry, and EDGE_NEI stays in
  // step with whatever corner order HexGeometry uses.
  return ladder
    .geometryForLevel(level)
    .getHexVertices(0, 0)
    .map((v) => ({ x: v.worldX, y: v.worldY }));
}

/**
 * The DRAWN map as a WORLD-space `Path2D`: every existing level-L hexagon over a padded
 * world rect, each its own subpath. Hexes are edge-adjacent and never overlap, so the
 * nonzero rule turns the pile into their union with no boolean work. Never clip to
 * `hexBounds`: a bounded map's silhouette is the union of its hexagons, not their bounding
 * shape.
 *
 * Returns null when every cell in the padded rect exists - the view is deep inside the map
 * and there is nothing to clip away.
 */
function liveClipPath(
  ladder: GeometryLadder,
  level: number,
  rect: WorldRect,
  epoch: number,
  cache: LatticeClipCache
): Path2D | null {
  const held = cache.entry;
  if (hasClipFor(cache, level, epoch, rect)) {
    return held === null ? null : held.path;
  }

  const s = ladder.cellSizeAt(level);
  const { x0: ax0, y0: ay0, x1: ax1, y1: ay1 } = padRect(rect, s);

  // The path is assembled as ONE SVG path string and parsed natively: thousands
  // of tiny hexagons through moveTo/lineTo bindings cost ~3 us per call (a fine
  // rung over a padded viewport ran to 100 ms), while string concatenation is
  // cheap and the parse is a single native pass. Existence is counted in the same
  // loop so a view deep inside the map never constructs a path at all.
  // Safety net for one-shot renders at a rung their zoom cannot justify (kgc.20):
  // past the materialiser's cap, draw unclipped rather than enumerate millions.
  if (estimateCellsInRect(s, ax0, ay0, ax1, ay1) > MATERIALISE_CELL_CAP) {
    cache.entry = { level, epoch, x0: ax0, y0: ay0, x1: ax1, y1: ay1, path: null };
    return null;
  }

  const corners = cornerOffsets(ladder, level);
  const segments: string[] = [];
  let missing = 0;
  forEachCellInWorldRect(ladder.root.orientation, s, ax0, ay0, ax1, ay1, (q, r, wx, wy) => {
    if (!ladder.existsAt(level, q, r)) {
      missing += 1;
      return;
    }
    let d = `M${(wx + corners[0].x).toFixed(3)} ${(wy + corners[0].y).toFixed(3)}`;
    for (let i = 1; i < 6; i++) d += `L${(wx + corners[i].x).toFixed(3)} ${(wy + corners[i].y).toFixed(3)}`;
    segments.push(d + 'Z');
  });

  const out = missing === 0 ? null : new Path2D(segments.join(''));
  cache.entry = { level, epoch, x0: ax0, y0: ay0, x1: ax1, y1: ay1, path: out };
  return out;
}

/** True when the cache already answers for this level, epoch and rect (no build needed). */
function hasClipFor(cache: LatticeClipCache, level: number, epoch: number, rect: WorldRect): boolean {
  const held = cache.entry;
  return held !== null
    && held.level === level
    && held.epoch === epoch
    && rect.x0 >= held.x0
    && rect.y0 >= held.y0
    && rect.x1 <= held.x1
    && rect.y1 <= held.y1;
}

interface StrokeEntry {
  ladder: GeometryLadder;
  level: number;
  epoch: number;
  /** The padded world rect the path covers. */
  rect: WorldRect;
  /** Level-L edges in level-cell units (world / cellSize); null when no edge exists in the rect. */
  path: Path2D | null;
}

/**
 * Stroke paths per canvas (MEM-02), keyed on `ctx.canvas` so the cache lives entirely in
 * this module and mapRenderer needs no second cache slot. A context with no canvas (a test
 * stub) keys on itself. Entries drop with the canvas.
 */
const strokeCaches = new WeakMap<object, StrokeEntry[]>();

function strokeCacheFor(ctx: CanvasRenderingContext2D): StrokeEntry[] {
  const owner: object = (ctx as { canvas?: object | null }).canvas ?? ctx;
  let held = strokeCaches.get(owner);
  if (held === undefined) {
    held = [];
    strokeCaches.set(owner, held);
  }
  return held;
}

function nowMs(): number {
  return typeof performance === 'undefined' ? 0 : performance.now();
}

/**
 * Level L's hex edges over `rect` as ONE SVG path string, in level-cell units: coordinates
 * are world / cellSize, so 4 decimals are 1/10000 of a cell at every rung (world-px
 * decimals would lose precision on fine rungs, whose cells are a fraction of a world px).
 *
 * A cell is stroked only if it exists at level L (`ladder.existsAt`, the single existence
 * gate - it answers for the negative district rungs too), so no line is ever drawn over the
 * void beyond a bounded map's edge. Edges 0..2 belong to the cell, which is what makes every
 * interior edge come out exactly once so translucent district lines never double-alpha;
 * edges 3..5 belong to the neighbour across them and are emitted here ONLY when that
 * neighbour is off-map, which keeps the map's own ragged silhouette closed.
 */
function latticePathString(ladder: GeometryLadder, level: number, rect: WorldRect): string {
  const s = ladder.cellSizeAt(level);
  const corners = cornerOffsets(ladder, level).map((c) => ({ x: c.x / s, y: c.y / s }));
  const neighbours = edgeNeighbours(ladder.root.orientation);
  const parts: string[] = [];
  forEachCellInWorldRect(ladder.root.orientation, s, rect.x0, rect.y0, rect.x1, rect.y1, (q, r, wx, wy) => {
    if (!ladder.existsAt(level, q, r)) return;
    const cx = wx / s;
    const cy = wy / s;
    for (let k = 0; k < 6; k++) {
      if (k >= 3) {
        const d = neighbours[k];
        // the neighbour owns this edge and already emits it
        if (ladder.existsAt(level, q + d[0], r + d[1])) continue;
      }
      const a = corners[k];
      const b = corners[(k + 1) % 6];
      parts.push(`M${(cx + a.x).toFixed(4)} ${(cy + a.y).toFixed(4)}L${(cx + b.x).toFixed(4)} ${(cy + b.y).toFixed(4)}`);
    }
  });
  return parts.join('');
}

/**
 * The cached stroke path for this level, building it over the padded view when no entry
 * covers the view. On a crossing frame (`deferBuild`) nothing is cached: a covering entry
 * is used if one exists, otherwise an UNPADDED, uncached path for just the viewport is
 * built (still one string parse, far cheaper than the padded build), and the padded build
 * waits for the next steady frame. Drawing nothing instead would drop the grid from every
 * one-shot canvas (export, preview), whose first and only frame counts as a crossing.
 */
function strokePathFor(
  ctx: CanvasRenderingContext2D,
  ladder: GeometryLadder,
  level: number,
  view: LatticeView,
  epoch: number,
  deferBuild: boolean,
  onPhase?: (name: string, ms: number) => void
): Path2D | null {
  const rect = viewWorldRect(view);
  const entries = strokeCacheFor(ctx);
  for (const e of entries) {
    if (e.ladder === ladder && e.level === level && e.epoch === epoch && rectContains(e.rect, rect)) return e.path;
  }
  const t0 = onPhase === undefined ? 0 : nowMs();
  if (deferBuild) {
    const d = latticePathString(ladder, level, rect);
    if (onPhase !== undefined) onPhase('strokeDeferred', nowMs() - t0);
    return d.length === 0 ? null : new Path2D(d);
  }
  const padded = padRect(rect, ladder.cellSizeAt(level));
  const d = latticePathString(ladder, level, padded);
  const path = d.length === 0 ? null : new Path2D(d);
  // One entry per (ladder, level): a rebuild replaces the stale one in place of growing.
  const kept = entries.filter((e) => !(e.ladder === ladder && e.level === level));
  kept.push({ ladder, level, epoch, rect: padded, path });
  while (kept.length > STROKE_CACHE_LIMIT) kept.shift();
  entries.length = 0;
  entries.push(...kept);
  if (onPhase !== undefined) onPhase('strokeBuild', nowMs() - t0);
  return path;
}

/**
 * Stroke level L's hex edges over the viewport (edge ownership: `latticePathString`).
 *
 * The path is world-space (level-cell units) and cached per canvas; it is stroked under
 * `translate(offset) scale(zoom * cellSize)` with `lineWidth = width / (zoom * cellSize)`,
 * a uniform scale, so the screen width is exactly `style.width` and never thickens.
 * `epoch` must be bumped by any edit that changes which cells exist. `deferBuild` marks a
 * crossing frame: no padded build runs in it (see `strokePathFor`).
 */
function strokeLattice(
  ctx: CanvasRenderingContext2D,
  ladder: GeometryLadder,
  level: number,
  view: LatticeView,
  style: LatticeStyle,
  epoch = 0,
  deferBuild = false,
  onPhase?: (name: string, ms: number) => void
): void {
  if (style.alpha <= LATTICE_MIN_ALPHA) return;
  const s = ladder.cellSizeAt(level);
  if (2 * s * view.zoom < MIN_LATTICE_PX) return;

  const path = strokePathFor(ctx, ladder, level, view, epoch, deferBuild, onPhase);
  if (path === null) return;
  const scale = view.zoom * s;

  ctx.save();
  ctx.globalAlpha = style.alpha;
  ctx.strokeStyle = style.colour;
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(scale, scale);
  ctx.lineWidth = style.width / scale;
  ctx.stroke(path);
  ctx.restore();
}

/**
 * Run `fn` clipped to the drawn map. ONE `clip()` per frame, not one per pass, and none at
 * all when the view is deep inside the map. `epoch` must be bumped by any edit that changes
 * which cells exist; the cache otherwise survives pan and zoom inside its padded rect.
 */
function withMapClip(
  ctx: CanvasRenderingContext2D,
  ladder: GeometryLadder,
  level: number,
  view: LatticeView,
  epoch: number,
  cache: LatticeClipCache,
  fn: () => void
): void {
  const path = liveClipPath(ladder, level, viewWorldRect(view), epoch, cache);
  if (path === null) {
    fn();
    return;
  }
  ctx.save();
  // Clip in WORLD space, then hand the transform straight back so the strokes stay
  // screen-space (line widths unchanged). getTransform/setTransform preserves whatever base
  // transform the caller had set.
  const base = ctx.getTransform();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.zoom, view.zoom);
  ctx.clip(path);
  ctx.setTransform(base);
  fn();
  ctx.restore();
}

/**
 * The full district pass: the two coarser rungs as region lines under one clip to the drawn
 * map, then the active level solid and unclipped. Call it from the live phase, after the
 * static surface has been blitted.
 */
function drawLadderLattice(
  ctx: CanvasRenderingContext2D,
  ladder: GeometryLadder,
  level: number,
  view: LatticeView,
  epoch: number,
  cache: LatticeClipCache,
  colours: { active: string; district: string; activeWidth?: number },
  onPhase?: (name: string, ms: number) => void,
  deferClipBuild = false
): void {
  const now = (): number => (typeof performance === 'undefined' ? 0 : performance.now());
  // A crossing is a drift (D17): nothing heavy may run in the crossing frame. When the
  // footprint clip for the new rung is not cached yet, the district pass waits one frame
  // rather than building the path now; the active lattice still draws.
  // District rungs are the coarser PAINTABLE lattices, and the root is the
  // coarsest one there is: nothing above level 0 is ever stroked. At the root
  // itself there is no district pass, so no footprint clip is resolved either.
  if (level < 1) {
    // nothing coarser to show
  } else if (deferClipBuild && !hasClipFor(cache, level, epoch, viewWorldRect(view))) {
    if (onPhase !== undefined) onPhase('clipDeferred', 0);
  } else {
    if (onPhase !== undefined) {
      // Resolve the clip first so its build cost is attributed on its own; withMapClip
      // below then hits the cache.
      const before = cache.entry;
      const t0 = now();
      liveClipPath(ladder, level, viewWorldRect(view), epoch, cache);
      onPhase(cache.entry === before ? 'clipHit' : 'clipBuild', now() - t0);
    }
    const t1 = now();
    withMapClip(ctx, ladder, level, view, epoch, cache, () => {
      if (level >= 2) strokeLattice(ctx, ladder, level - 2, view, { ...DISTRICT_FAR, colour: colours.district }, epoch, deferClipBuild, onPhase);
      strokeLattice(ctx, ladder, level - 1, view, { ...DISTRICT_NEAR, colour: colours.district }, epoch, deferClipBuild, onPhase);
    });
    if (onPhase !== undefined) onPhase('district', now() - t1);
  }
  const t2 = now();
  // The active rung is the user-facing grid: it takes the theme's grid line width.
  strokeLattice(ctx, ladder, level, view, { ...ACTIVE, width: colours.activeWidth ?? ACTIVE.width, colour: colours.active }, epoch, deferClipBuild, onPhase);
  if (onPhase !== undefined) onPhase('active', now() - t2);
}

export {
  createLatticeClipCache,
  strokeLattice,
  withMapClip,
  drawLadderLattice
};
