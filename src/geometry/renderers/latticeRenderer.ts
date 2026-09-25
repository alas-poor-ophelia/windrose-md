/**
 * latticeRenderer.ts
 *
 * The global-lattice ladder's live grid pass. Design
 * `.claude/lod-rd/06-integration-design.md` section 3.3: at the active level L the
 * lattice is stroked solid and unclipped, and the two coarser rungs (L-2, L-1) are
 * stroked as lighter, thicker "district" lines under a single clip to the drawn map.
 *
 * Lattices are stroked LIVE in screen space every frame, never baked: a baked lattice
 * thickens under a scale-blit, which is the most visible crossing artefact there is.
 * Only the `clip()` runs in world space, and the base transform is handed straight back
 * so every line width stays in screen pixels.
 */

import type { GeometryLadder } from '../core/createGeometryLadder';

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

const SQRT3 = Math.sqrt(3);

/** Below this on-screen cell width a lattice reads as moire, not as a grid. */
const MIN_LATTICE_PX = 3;

/** District rung styling, from the design's section 3.3. */
const DISTRICT_FAR: Readonly<Omit<LatticeStyle, 'colour'>> = Object.freeze({ alpha: 0.30, width: 3 });
const DISTRICT_NEAR: Readonly<Omit<LatticeStyle, 'colour'>> = Object.freeze({ alpha: 0.42, width: 2.2 });
const ACTIVE: Readonly<Omit<LatticeStyle, 'colour'>> = Object.freeze({ alpha: 1, width: 1 });

/** The cached rect is padded by this fraction of the viewport, plus `CLIP_PAD_CELLS` cells. */
const CLIP_PAD_FRACTION = 0.35;
const CLIP_PAD_CELLS = 2;

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

/**
 * Enumerate the cells of a lattice with centre-to-vertex radius `cellSize` whose centres lie
 * in the world rect, padded one cell on every side. The axial -> world mapping here is
 * `HexGeometry.hexToWorld` exactly: flat `x = 1.5 s q`, `y = sqrt3 s (r + q/2)`;
 * pointy `x = sqrt3 s (q + r/2)`, `y = 1.5 s r`.
 */
function forEachCellInWorldRect(
  orientation: 'flat' | 'pointy',
  cellSize: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fn: (q: number, r: number, wx: number, wy: number) => void
): void {
  const s = cellSize;
  if (orientation === 'pointy') {
    // rows advance in y (1.5 s), columns in x (sqrt3 s) with the r/2 shear
    const ra = Math.floor(y0 / (1.5 * s)) - 1;
    const rb = Math.ceil(y1 / (1.5 * s)) + 1;
    for (let r = ra; r <= rb; r++) {
      const qa = Math.floor(x0 / (SQRT3 * s) - r / 2) - 1;
      const qb = Math.ceil(x1 / (SQRT3 * s) - r / 2) + 1;
      for (let q = qa; q <= qb; q++) {
        fn(q, r, SQRT3 * s * (q + r / 2), 1.5 * s * r);
      }
    }
    return;
  }
  const qa = Math.floor(x0 / (1.5 * s)) - 1;
  const qb = Math.ceil(x1 / (1.5 * s)) + 1;
  for (let q = qa; q <= qb; q++) {
    const ra = Math.floor(y0 / (SQRT3 * s) - q / 2) - 1;
    const rb = Math.ceil(y1 / (SQRT3 * s) - q / 2) + 1;
    for (let r = ra; r <= rb; r++) {
      fn(q, r, 1.5 * s * q, SQRT3 * s * (r + q / 2));
    }
  }
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
  const padX = (rect.x1 - rect.x0) * CLIP_PAD_FRACTION + CLIP_PAD_CELLS * s;
  const padY = (rect.y1 - rect.y0) * CLIP_PAD_FRACTION + CLIP_PAD_CELLS * s;
  const ax0 = rect.x0 - padX;
  const ay0 = rect.y0 - padY;
  const ax1 = rect.x1 + padX;
  const ay1 = rect.y1 + padY;

  // The path is assembled as ONE SVG path string and parsed natively: thousands
  // of tiny hexagons through moveTo/lineTo bindings cost ~3 us per call (a fine
  // rung over a padded viewport ran to 100 ms), while string concatenation is
  // cheap and the parse is a single native pass. Existence is counted in the same
  // loop so a view deep inside the map never constructs a path at all.
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

/**
 * Stroke level L's hex edges over the viewport, in screen space.
 *
 * A cell is stroked only if it exists at level L (`ladder.existsAt`, the single existence
 * gate - it answers for the negative district rungs too), so no line is ever drawn over the
 * void beyond a bounded map's edge. Edges 0..2 belong to the cell, which is what makes every
 * interior edge come out exactly once so translucent district lines never double-alpha;
 * edges 3..5 belong to the neighbour across them and are stroked here ONLY when that
 * neighbour is off-map, which keeps the map's own ragged silhouette closed.
 */
function strokeLattice(
  ctx: CanvasRenderingContext2D,
  ladder: GeometryLadder,
  level: number,
  view: LatticeView,
  style: LatticeStyle
): void {
  if (style.alpha <= 0.004) return;
  const s = ladder.cellSizeAt(level);
  if (2 * s * view.zoom < MIN_LATTICE_PX) return;

  const orientation = ladder.root.orientation;
  const corners = cornerOffsets(ladder, level);
  const neighbours = edgeNeighbours(orientation);
  const { offsetX, offsetY, zoom } = view;
  const rect = viewWorldRect(view);

  ctx.save();
  ctx.globalAlpha = style.alpha;
  ctx.strokeStyle = style.colour;
  ctx.lineWidth = style.width;
  ctx.beginPath();
  forEachCellInWorldRect(orientation, s, rect.x0, rect.y0, rect.x1, rect.y1, (q, r, wx, wy) => {
    if (!ladder.existsAt(level, q, r)) return;
    const sx = offsetX + wx * zoom;
    const sy = offsetY + wy * zoom;
    for (let k = 0; k < 6; k++) {
      if (k >= 3) {
        const d = neighbours[k];
        // the neighbour owns this edge and already strokes it
        if (ladder.existsAt(level, q + d[0], r + d[1])) continue;
      }
      const a = corners[k];
      const b = corners[(k + 1) % 6];
      ctx.moveTo(sx + a.x * zoom, sy + a.y * zoom);
      ctx.lineTo(sx + b.x * zoom, sy + b.y * zoom);
    }
  });
  ctx.stroke();
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
  colours: { active: string; district: string },
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
      if (level >= 2) strokeLattice(ctx, ladder, level - 2, view, { ...DISTRICT_FAR, colour: colours.district });
      strokeLattice(ctx, ladder, level - 1, view, { ...DISTRICT_NEAR, colour: colours.district });
    });
    if (onPhase !== undefined) onPhase('district', now() - t1);
  }
  const t2 = now();
  strokeLattice(ctx, ladder, level, view, { ...ACTIVE, colour: colours.active });
  if (onPhase !== undefined) onPhase('active', now() - t2);
}

export {
  createLatticeClipCache,
  forEachCellInWorldRect,
  strokeLattice,
  withMapClip,
  drawLadderLattice
};
