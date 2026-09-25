/**
 * spikes/lod/g1-global-lattice — THE WHOLE MAP HAS A FINER LATTICE AT EVERY ZOOM BAND.
 *
 * No documents. No document identity. No per-document bitmaps.
 *
 * There is ONE world and a ladder of lattices over it:
 *   level 0 = the root hex lattice (hexSize 80)
 *   level L = the same lattice at cell size 80 / m^L, m = the ladder's integer linear scale.
 * Rotation-free sublattices exist exactly for integer m with generator (m,0); the
 * parent/child index maps and the Voronoi ownership come from h12's lattice.ts, unchanged.
 *
 * Every level carries a SPARSE map of AUTHORED cells. Everything else inherits:
 *     fill(L, cell) = authored[L].get(cell) ?? fill(L-1, parent(cell))
 * so an unauthored region at any depth looks like the coarse map cut into smaller
 * empty hexes, never a giant crisp hexagon and never blank.
 */
import {
  buildFixture, coarseColorAt, docToWorld, rectBoundaryCells,
  type Doc, type Fixture, type Orientation, type RootShape,
} from '../_shared/fixture';
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';
import { offsetToAxial } from '../../../src/geometry/core/offsetCoordinates';
import { axialRound, buildLadder, type Ladder } from '../h12-ladder-math/lattice';
import { startFrameClock } from '../_shared/instrument';

// ------------------------------------------------------------------ config
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 1) || 1;
// ---- DEFAULTS = the judge's recommended configuration (05-wave4-global-lattice.md section 5):
// ladder m=4, minCellPx 40, no hysteresis, `district` lattice (active level live + the two
// coarser levels as lighter/thicker region lines), and the slippy-map rule for finer levels.
const M = Number(params.get('ladder') ?? 4) || 4;            // ladder linear scale
const MIN_CELL_PX = Number(params.get('minCellPx') ?? 40) || 40;
const HYST = Number(params.get('hyst') ?? 0) || 0;
const LATTICE = params.get('lattice') ?? 'district';         // one | fade | district | off
/**
 * Which levels FINER than the active level A may draw their authored cells on top.
 *
 *   none  (DEFAULT) — nothing finer than A draws. A level's authored content renders only
 *                     when that level is the active level. This is the slippy-map rule: at a
 *                     coarse zoom you see the coarse map, not tiny smudges of finer work.
 *   next            — level A+1's authored cells may draw, and NO deeper level ever does.
 *                     The gate is legibility: A+1 draws only while its on-screen cell WIDTH
 *                     cellPx(A+1) = 2 * (80 / m^(A+1)) * zoom >= FINER_MIN_PX (4 px).
 *                     Since a crossing to A+1 happens at cellPx(A+1) >= minCellPx, this means
 *                     A+1 appears once it is at least 4 px wide and stays until it becomes
 *                     the active level. (At minCellPx=40 with m=4, cellPx(A+1) spans 10..40 px
 *                     inside a band, so it is always above the 4 px floor; at minCellPx=14
 *                     with m=13 it spans 1.08..14 px and the floor bites for most of the band.)
 *                     No sub-pixel specks are ever drawn under this rule.
 *   all             — every authored level finer than A draws on top, sub-pixel ones as
 *                     specks. This is the original behaviour of the spike.
 */
const FINER = (() => {
  const v = params.get('finer') ?? 'none';
  return v === 'next' || v === 'all' ? v : 'none';
})();
const FINER_MIN_PX = Number(params.get('finerMinPx') ?? 4) || 4;
const EXTRA_OPT = params.get('extra');
const FIDUCIAL = params.get('fiducial') === '1';
const LOOK = params.get('look') ?? 'dive';                   // dive | empty | siblings | coast | corner
const SETTLE_MS = Number(params.get('settle') ?? 150) || 150;
const PAD = 1.2;
const SEAT = params.get('seat') ?? 'nearest';                // nearest | finer  (see NOTES)
/**
 * ORIENTATION and ROOT SHAPE — both come straight from the plugin's own conventions.
 *
 *   ?orient=flat|pointy   DEFAULTS.hexOrientation is 'flat'; 'pointy' is the other shipped
 *                         value. It threads through the fixture (root cells, child docs),
 *                         the lattice's axial->world transform at EVERY level, the hex
 *                         outline angle (flat corners at 0 deg, pointy at 30 deg — the same
 *                         `angleOffset` HexGeometry.getHexCorners uses) and hit-testing.
 *   ?shape=radial|rect    'radial' (default) is the shipped sub-map shape and today's
 *                         fixture: bounds carry maxRing. 'rect' is the plugin's rectangular
 *                         hex map: bounds carry ONLY {maxCol, maxRow}, and the cell set is
 *                         offsetToAxial(col, row) over [0,cols) x [0,rows) — odd-q offset for
 *                         flat, odd-r for pointy (src/geometry/core/offsetCoordinates.ts).
 *   ?cols=N&rows=M        rect only. Default 24 x 16.
 *
 * The LADDER is unchanged by either: the (m,0) generator is a pure scale on AXIAL indices,
 * so parentOf / parentToChild are orientation- and shape-independent. Only the axial->world
 * transform changes. `__lod.orientProbe()` asserts exactly that.
 */
const ORIENT: Orientation = params.get('orient') === 'pointy' ? 'pointy' : 'flat';
const POINTY = ORIENT === 'pointy';
const SHAPE: RootShape = params.get('shape') === 'rect' ? 'rect' : 'radial';
const COLS = Math.max(3, Number(params.get('cols') ?? 24) || 24);
const ROWS = Math.max(3, Number(params.get('rows') ?? 16) || 16);

const HARD_MIN = 0.1;
const HARD_MAX = 900;                                        // same ceiling h6/h0 used
const SWEEP_MIN = Number(params.get('zmin') ?? 0.2) || 0.2;  // what zoomRange() reports
const WHEEL_K = 0.0015;                                      // identical to h6, so traces match
const BG = '#0b0e13';
const ROOT_SIZE = 80;
const SQRT3 = Math.sqrt(3);

const fx: Fixture = buildFixture(SEED, { orientation: ORIENT, shape: SHAPE, cols: COLS, rows: ROWS });

// ------------------------------------------------------------------ orientation-aware lattice
/**
 * Axial -> world for a hex lattice of cell size `s` in the page's orientation. Byte-identical
 * to HexGeometry.hexToWorld (src/geometry/core/HexGeometry.ts) with hexSize = s:
 *   flat   x = 1.5 s q            y = sqrt3 s (r + q/2)
 *   pointy x = sqrt3 s (q + r/2)  y = 1.5 s r
 * `__lod.orientProbe()` checks this against a REAL HexGeometry instance at every level.
 */
function posOf(q: number, r: number, s: number): { x: number; y: number } {
  return POINTY
    ? { x: s * SQRT3 * (q + r / 2), y: s * 1.5 * r }
    : { x: s * 1.5 * q, y: s * SQRT3 * (r + q / 2) };
}

/** inverse of posOf, cube-rounded — HexGeometry.worldToHex with hexSize = s. */
function cellOf(x: number, y: number, s: number): { q: number; r: number } {
  if (POINTY) return axialRound(((SQRT3 / 3) * x - y / 3) / s, ((2 / 3) * y) / s);
  const q = (x * 2) / (3 * s);
  return axialRound(q, y / (SQRT3 * s) - q / 2);
}
const ladder: Ladder = buildLadder({ slug: `m${M}`, ga: M, gb: 0, label: `m=${M}` });

// ------------------------------------------------------------------ the ladder of levels
/** world px, centre->vertex, of a level-L cell */
const sizeOf = (L: number): number => ROOT_SIZE / Math.pow(M, L);
/** on-screen WIDTH (2 * centre->vertex) of a level-L cell at the live zoom */
const cellPxOf = (L: number, z: number): number => 2 * sizeOf(L) * z;

/**
 * Which rung does a fixture document of depth d sit on?
 *
 * The brief's literal rule is "representable at this level: 15^d <= m^L" — the first rung
 * at least as FINE as the document. That rule disagrees with the brief's own ladder
 * enumeration for m=13 (it would put a depth-1 doc on rung 2 = scale 169, not rung 1 =
 * scale 13, and 13 is precisely the rung h12 showed the shipped 169-cell rosette re-seats
 * onto). So the default here is NEAREST RUNG IN LOG SCALE, which reproduces the brief's
 * enumeration for all three ladders:
 *   m=13: d1 -> L1 (13), d2 -> L2 (169)      [levels 0..2]
 *   m=5 : d1 -> L2 (25), d2 -> L3 (125)      [levels 0..4 with one virtual]
 *   m=3 : d1 -> L2 (9),  d2 -> L5 (243)      [levels 0..5]
 * `?seat=finer` switches to the literal rule. Both are measured.
 */
function seatLevel(d: number): number {
  const want = Math.log(Math.pow(15, d)) / Math.log(M);
  return SEAT === 'finer' ? Math.ceil(want - 1e-9) : Math.max(1, Math.round(want));
}

const SEAT_OF_DEPTH: number[] = [0, seatLevel(1), seatLevel(2)];
const DEEPEST_AUTHORED = Math.max(...SEAT_OF_DEPTH);
/** default virtual depth: keep subdividing until a cell is under 1/4 px at HARD_MAX */
const defaultExtra = (): number => {
  let L = DEEPEST_AUTHORED;
  while (L < 14 && cellPxOf(L, HARD_MAX) >= 0.25) L++;
  return L - DEEPEST_AUTHORED;
};
const EXTRA = EXTRA_OPT === null ? defaultExtra() : Math.max(0, Number(EXTRA_OPT) || 0);
const MAX_LEVEL = Math.min(14, DEEPEST_AUTHORED + EXTRA);

// ------------------------------------------------------------------ authored content
// Derivation (documented in NOTES.md): level 0 = the fixture root doc's 469 cells.
// For L = seatLevel(d), d in {1,2}: every level-L cell whose CENTRE resolves (through the
// fixture's own coarseColorAt at maxDepth d) to a cell of depth >= 1 is authored, and takes
// that cell's colour. Nothing else is authored at any level. Cells outside every child hull
// are unauthored at every L >= 1 and therefore inherit.
const authored: Array<Map<string, string>> = [];
for (let L = 0; L <= MAX_LEVEL; L++) authored.push(new Map<string, string>());

/** how many distinct fixture cells each authored level actually captured (re-seat loss) */
const seatStats: Array<{ level: number; depth: number; cells: number; distinctSrc: number; srcTotal: number }> = [];

(function buildAuthored(): void {
  // level 0 — the root lattice IS the root document
  for (const c of fx.root.cells.values()) authored[0].set(`${c.q},${c.r}`, c.color);

  for (let d = 1; d <= 2; d++) {
    const L = SEAT_OF_DEPTH[d];
    if (L > MAX_LEVEL) continue;
    const s = sizeOf(L);
    const docs = fx.docs.filter((doc) => doc.depth === d);
    let cells = 0;
    const seen = new Set<string>();
    let srcTotal = 0;
    for (const doc of docs) {
      srcTotal += doc.cells.size;
      const centre = docToWorld(doc, 0, 0);
      const E = (doc.rings + 1.2) * doc.hexSize * 1.5 * doc.transformToWorld.scale;
      forEachCellAtSize(s, centre.x - E, centre.y - E, centre.x + E, centre.y + E, (q, r, px, py) => {
        const hit = coarseColorAt(fx, px, py, d);
        if (!hit || hit.depth < 1) return;
        if (hit.docId !== doc.id) return;
        authored[L].set(`${q},${r}`, hit.color);
        seen.add(`${hit.docId}:${hit.q},${hit.r}`);
        cells++;
      });
    }
    seatStats.push({ level: L, depth: d, cells, distinctSrc: seen.size, srcTotal });
  }
})();

/**
 * Levels that hold authored content, ascending — recomputed on demand, NOT frozen at load.
 * (It used to be a `const` snapshot taken before any edit existed, so a cell painted onto a
 * level that happened to be empty at load was never drawn by the finer-levels pass and
 * appeared to vanish the moment you zoomed out past it. See NOTES "Guildmaster feedback".)
 */
function authoredLevels(): number[] {
  const out: number[] = [];
  for (let i = 1; i < authored.length; i++) if (authored[i].size) out.push(i);
  return out;
}

// ------------------------------------------------------------------ inherit-down resolve
let memo: Array<Map<string, string | null>> = authored.map(() => new Map<string, string | null>());

function resolve(L: number, q: number, r: number): string | null {
  const key = `${q},${r}`;
  const cache = memo[L];
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let out: string | null;
  const own = authored[L].get(key);
  if (own !== undefined) out = own;
  else if (L === 0) out = null;
  else {
    const p = ladder.parentOf(q, r);
    out = resolve(L - 1, p.Q, p.R);
  }
  cache.set(key, out);
  return out;
}

function invalidateFrom(L: number): void {
  latticeEpoch++;                            // the coarse ancestor sets may have changed
  for (let i = L; i < memo.length; i++) memo[i] = new Map<string, string | null>();
  for (const s of surfaces.values()) s.dirty = true;
}

// ------------------------------------------------------------------ level selection
/**
 * Active level A.
 *   hyst = 0     : A = the finest L with cellPx(L) >= minCellPx.  Pure function of zoom.
 *   hyst = h > 0 : PROMOTE (A -> A+1) as soon as cellPx(A+1) >= minCellPx;
 *                  DEMOTE  (A -> A-1) only once cellPx(A) < minCellPx * (1 - h).
 *                  One-sided band, so zooming out lags zooming in by a factor of (1-h).
 */
let level = 0;
function chooseLevel(z: number): number {
  const pure = (): number => {
    let L = 0;
    while (L < MAX_LEVEL && cellPxOf(L + 1, z) >= MIN_CELL_PX) L++;
    return L;
  };
  if (HYST <= 0) return pure();
  let L = level;
  while (L < MAX_LEVEL && cellPxOf(L + 1, z) >= MIN_CELL_PX) L++;
  while (L > 0 && cellPxOf(L, z) < MIN_CELL_PX * (1 - HYST)) L--;
  return L;
}

/** zooms at which A changes, for hyst = 0 (declared to the rig) */
const crossings: number[] = (() => {
  const out: number[] = [];
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const z = (MIN_CELL_PX * Math.pow(M, L)) / (2 * ROOT_SIZE);
    if (z > HARD_MIN && z < HARD_MAX) out.push(+z.toFixed(6));
  }
  return out;
})();

// ------------------------------------------------------------------ viewport
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

let cssW = 0;
let cssH = 0;
let zoom = 1;
let offX = 0;
let offY = 0;
let lastInputAt = -1e9;
let cellsDrawn = 0;
let rebuilds = 0;
let framesDrawn = 0;
const fiducialWorld = { x: fx.fiducial.x, y: fx.fiducial.y };

function worldAt(x: number, y: number): { x: number; y: number } {
  return { x: (x - offX) / zoom, y: (y - offY) / zoom };
}
function screenOf(wx: number, wy: number): { x: number; y: number } {
  return { x: offX + wx * zoom, y: offY + wy * zoom };
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  surfaces.clear();
}

function anchorPoint(): { x: number; y: number } {
  if (LOOK === 'siblings') {
    const a = fx.byId.get('forestA') as Doc;
    const b = fx.byId.get('forestB') as Doc;
    return {
      x: (a.transformToWorld.tx + b.transformToWorld.tx) / 2,
      y: (a.transformToWorld.ty + b.transformToWorld.ty) / 2,
    };
  }
  if (LOOK === 'coast') {
    // the isolated `shore` child: the wavy coastline crosses its parent hex boundary
    const s = fx.byId.get('shore') as Doc;
    return { x: s.transformToWorld.tx, y: s.transformToWorld.ty };
  }
  if (LOOK === 'empty') {
    // a root hex with NO authored children anywhere beneath it - the past-the-floor look
    const h = fx.shape === 'rect'
      ? offsetToAxial(2, 2, fx.orientation)                 // near the NW corner, no child there
      : { q: -5, r: -3 };
    const w = fx.root.geometry.hexToWorld(h.q, h.r);
    return { x: w.worldX, y: w.worldY };
  }
  if (LOOK === 'corner') {
    // The OUTER VERTEX of the map's NW-most cell - not its centre. Anchoring on the vertex
    // pins the map BOUNDARY under the cursor at every zoom, so the ragged offset-parity
    // zigzag (and its finer-level re-tiling) stays in frame however far you zoom in; an
    // anchor on the cell centre walks the edge off-screen past z~4.
    const h = fx.shape === 'rect'
      ? offsetToAxial(0, 0, fx.orientation)
      : { q: 0, r: -fx.root.rings };
    const w = fx.root.geometry.hexToWorld(h.q, h.r);
    // up-left corner of the hex: 240 deg for flat, 210 deg for pointy (CORNER_PHASE + 240)
    const cor = cornersOf(ROOT_SIZE);
    const v = POINTY ? cor[3] : cor[4];
    return { x: w.worldX + v.x, y: w.worldY + v.y };
  }
  return { x: fx.fiducial.x, y: fx.fiducial.y }; // dive: inside the depth-2 grandchild
}

function home(): void {
  const a = anchorPoint();
  zoom = SWEEP_MIN;
  offX = cssW * 0.32 - a.x * zoom;
  offY = cssH * 0.38 - a.y * zoom;
  fiducialWorld.x = a.x;
  fiducialWorld.y = a.y;
  lastInputAt = -1e9;
  surfaces.clear();
  level = chooseLevel(zoom);
}

// ------------------------------------------------------------------ per-level cached surfaces
interface Surface {
  canvas: HTMLCanvasElement;
  sctx: CanvasRenderingContext2D;
  cssW: number;
  cssH: number;
  /** the surface's own affine: local = sOffX + world * zoom0 */
  sOffX: number;
  sOffY: number;
  zoom0: number;
  bytes: number;
  crisp: boolean;
  dirty: boolean;
  lastCells: number;
  kind: 'fill' | 'authored';
}
const surfaces = new Map<string, Surface>();

/** hex outline, same `angleOffset` rule as HexGeometry.getHexCorners: flat 0 deg, pointy 30 deg */
const CORNER_PHASE = POINTY ? Math.PI / 6 : 0;
const cornersOf = (s: number): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * 60 * i + CORNER_PHASE;
    out.push({ x: s * Math.cos(a), y: s * Math.sin(a) });
  }
  return out;
};

/**
 * Edge k of a hex (the segment corner k -> corner k+1) faces this axial neighbour.
 * Derived from the corner phase: flat corners sit at 60k deg so edge k points at 60k+30;
 * pointy corners sit at 60k+30 so edge k points at 60k+60. Used by `strokeLattice` to close
 * the map's silhouette without stroking any interior edge twice.
 */
const EDGE_NEI: ReadonlyArray<readonly [number, number]> = POINTY
  ? [[0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0]]
  : [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

/** iterate the level-L cells whose centres lie in a world rect */
function forEachCell(
  L: number, x0: number, y0: number, x1: number, y1: number,
  fn: (q: number, r: number, wx: number, wy: number) => void,
): void {
  forEachCellAtSize(sizeOf(L), x0, y0, x1, y1, fn);
}

/** the same enumeration at an arbitrary cell size, in the page's orientation */
function forEachCellAtSize(
  s: number, x0: number, y0: number, x1: number, y1: number,
  fn: (q: number, r: number, wx: number, wy: number) => void,
): void {
  if (POINTY) {
    // rows advance in y (1.5 s), columns in x (sqrt3 s) with the r/2 shear
    const ra = Math.floor(y0 / (1.5 * s)) - 1;
    const rb = Math.ceil(y1 / (1.5 * s)) + 1;
    for (let r = ra; r <= rb; r++) {
      const qa = Math.floor(x0 / (SQRT3 * s) - r / 2) - 1;
      const qb = Math.ceil(x1 / (SQRT3 * s) - r / 2) + 1;
      for (let q = qa; q <= qb; q++) {
        const p = posOf(q, r, s);
        fn(q, r, p.x, p.y);
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
      const p = posOf(q, r, s);
      fn(q, r, p.x, p.y);
    }
  }
}

function buildSurface(key: string, L: number, kind: 'fill' | 'authored'): Surface {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.ceil(cssW * PAD);
  const h = Math.ceil(cssH * PAD);
  let surf = surfaces.get(key);
  if (!surf || surf.cssW !== w || surf.cssH !== h) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    surf = {
      canvas: c, sctx: c.getContext('2d') as CanvasRenderingContext2D,
      cssW: w, cssH: h, sOffX: 0, sOffY: 0, zoom0: 1,
      bytes: c.width * c.height * 4, crisp: false, dirty: true, lastCells: 0, kind,
    };
    surfaces.set(key, surf);
  }
  const padX = (w - cssW) / 2;
  const padY = (h - cssH) / 2;
  surf.zoom0 = zoom;
  surf.sOffX = offX + padX;
  surf.sOffY = offY + padY;

  const g = surf.sctx;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const x0 = (0 - surf.sOffX) / zoom;
  const y0 = (0 - surf.sOffY) / zoom;
  const x1 = (w - surf.sOffX) / zoom;
  const y1 = (h - surf.sOffY) / zoom;
  const s = sizeOf(L);
  const cor = cornersOf(s);
  let n = 0;

  if (kind === 'fill') {
    forEachCell(L, x0, y0, x1, y1, (q, r, wx, wy) => {
      const col = resolve(L, q, r);
      if (!col) return;
      const sx = surf!.sOffX + wx * zoom;
      const sy = surf!.sOffY + wy * zoom;
      g.beginPath();
      g.moveTo(sx + cor[0].x * zoom, sy + cor[0].y * zoom);
      for (let k = 1; k < 6; k++) g.lineTo(sx + cor[k].x * zoom, sy + cor[k].y * zoom);
      g.closePath();
      g.fillStyle = col;
      g.fill();
      n++;
    });
  } else {
    // "highest detail available": only the AUTHORED cells of a level finer than A
    for (const [k, col] of authored[L]) {
      const ci = k.indexOf(',');
      const q = +k.slice(0, ci);
      const r = +k.slice(ci + 1);
      const p = posOf(q, r, s);
      if (p.x < x0 - s || p.x > x1 + s || p.y < y0 - s || p.y > y1 + s) continue;
      const sx = surf!.sOffX + p.x * zoom;
      const sy = surf!.sOffY + p.y * zoom;
      const px = Math.max(0.7, 2 * s * zoom);
      if (px < 2.2) {
        g.fillStyle = col;
        g.fillRect(sx - px / 2, sy - px / 2, px, px); // sub-pixel speck
      } else {
        g.beginPath();
        g.moveTo(sx + cor[0].x * zoom, sy + cor[0].y * zoom);
        for (let j = 1; j < 6; j++) g.lineTo(sx + cor[j].x * zoom, sy + cor[j].y * zoom);
        g.closePath();
        g.fillStyle = col;
        g.fill();
      }
      n++;
    }
  }
  surf.lastCells = n;
  surf.crisp = true;
  surf.dirty = false;
  rebuilds++;
  return surf;
}

/** blitStaticContent: scale-blit the cached surface, rebuild crisp when it drifts or settles */
function drawLevelSurface(key: string, L: number, kind: 'fill' | 'authored', alpha = 1): void {
  let surf = surfaces.get(key);
  const settled = performance.now() - lastInputAt > SETTLE_MS;
  let need = !surf || surf.dirty;
  if (surf && !need) {
    const k = zoom / surf.zoom0;
    if (k < 1 / 1.5 || k > 1.5) need = true;
    else {
      const dx = offX - surf.sOffX * k;
      const dy = offY - surf.sOffY * k;
      if (dx > 0 || dy > 0 || dx + surf.cssW * k < cssW || dy + surf.cssH * k < cssH) need = true;
      else if (settled && Math.abs(k - 1) > 1e-6) need = true;
    }
  }
  if (need) surf = buildSurface(key, L, kind);
  const s = surf as Surface;
  const k = zoom / s.zoom0;
  const dx = offX - s.sOffX * k;
  const dy = offY - s.sOffY * k;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(s.canvas, 0, 0, s.canvas.width, s.canvas.height, dx, dy, s.cssW * k, s.cssH * k);
  ctx.restore();
}

// ------------------------------------------------------------------ does a cell EXIST?
/**
 * A level-L cell exists iff its OWNERSHIP CHAIN reaches a root cell. Nothing that fails this
 * test may be stroked: the lattice must stop at the map's edge, not run on over the void.
 *
 *  - L >= 0: exactly `resolve()`'s own test. `resolve` walks parentOf up to level 0 and
 *    returns null when the level-0 ancestor is unauthored; every root cell carries a colour,
 *    so `resolve(L,q,r) !== null` IS existence, and it is already memoised per level.
 *  - L < 0 (the coarser `district` rungs, cells m^|L| times the root cell): a coarse cell
 *    exists iff it OWNS at least one root cell. That ancestor set is built once by walking
 *    every root cell up |L| rungs — 469 (radial) / 384 (rect) keys, not a viewport sweep.
 *
 * `latticeEpoch` bumps with every edit (see `invalidateFrom`), so painting a new cell shows
 * up in the coarse sets on the next frame. No per-frame allocation beyond the cache miss.
 */
let latticeEpoch = 0;
const coarseCache = new Map<number, { epoch: number; set: Set<string> }>();

function coarseCells(L: number): Set<string> {
  const hit = coarseCache.get(L);
  if (hit && hit.epoch === latticeEpoch) return hit.set;
  let cur = new Set<string>(authored[0].keys());
  for (let i = 0; i > L; i--) {
    const up = new Set<string>();
    for (const k of cur) {
      const ci = k.indexOf(',');
      const p = ladder.parentOf(+k.slice(0, ci), +k.slice(ci + 1));
      up.add(`${p.Q},${p.R}`);
    }
    cur = up;
  }
  coarseCache.set(L, { epoch: latticeEpoch, set: cur });
  return cur;
}

/**
 * The DRAWN map as a WORLD-space Path2D: every existing ACTIVE-level hexagon over a padded
 * world rect, each its own subpath. Hexes are edge-adjacent and never overlap, so the nonzero
 * rule turns the pile into their union with no boolean work — and that union is exactly the
 * region the fill pass paints, outer corners and all (not the centre-to-centre polygon
 * `hullWorld` uses for the hole mask, which would shave every boundary cell in half).
 *
 * This is what the COARSER (district) passes clip to. Per-cell existence alone cannot trim
 * them: a coarse cell legitimately exists as soon as it owns one root cell, but its hexagon is
 * m^|L| times bigger, so its outline still runs out over the void. Clipping to the ROOT
 * footprint is not enough either — a parent's children do not fill the parent hexagon
 * (the crenellation of Surprise 1), so the root edge itself can sit in unpainted void.
 *
 * Cached: rebuilt only when the active level changes, an edit bumps `latticeEpoch`, or the
 * camera leaves the padded rect — the same "pad and reuse" rule the cached surfaces use, so a
 * steady frame costs one `clip()` and allocates nothing.
 */
let liveClip: {
  L: number; epoch: number; x0: number; y0: number; x1: number; y1: number; path: Path2D | null;
} | null = null;

/** null = every cell in the padded rect exists, i.e. the view is deep inside the map: DON'T clip. */
function liveClipPath(L: number, x0: number, y0: number, x1: number, y1: number): Path2D | null {
  const c = liveClip;
  if (c && c.L === L && c.epoch === latticeEpoch
    && x0 >= c.x0 && y0 >= c.y0 && x1 <= c.x1 && y1 <= c.y1) return c.path;
  const s = sizeOf(L);
  const padX = (x1 - x0) * 0.35 + 2 * s;
  const padY = (y1 - y0) * 0.35 + 2 * s;
  const ax0 = x0 - padX;
  const ay0 = y0 - padY;
  const ax1 = x1 + padX;
  const ay1 = y1 + padY;
  const cor = cornersOf(s);
  const path = new Path2D();
  let off = 0;
  forEachCellAtSize(s, ax0, ay0, ax1, ay1, (q, r, wx, wy) => {
    if (!existsAt(L, q, r)) { off++; return; }
    path.moveTo(wx + cor[0].x, wy + cor[0].y);
    for (let i = 1; i < 6; i++) path.lineTo(wx + cor[i].x, wy + cor[i].y);
    path.closePath();
  });
  const out = off === 0 ? null : path;
  liveClip = { L, epoch: latticeEpoch, x0: ax0, y0: ay0, x1: ax1, y1: ay1, path: out };
  return out;
}

/** the viewport as a world rect — the enumeration window every lattice pass shares */
function viewWorldRect(): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: (0 - offX) / zoom, y0: (0 - offY) / zoom,
    x1: (cssW - offX) / zoom, y1: (cssH - offY) / zoom,
  };
}

/**
 * Run `fn` clipped to the drawn map. ONE clip per frame, not one per pass, and none at all
 * when the view is deep inside the map — which is most frames on a radial world.
 */
function withMapClip(fn: () => void): void {
  const v = viewWorldRect();
  const path = liveClipPath(level, v.x0, v.y0, v.x1, v.y1);
  if (!path) { fn(); return; }
  ctx.save();
  // clip in WORLD space, then hand the transform back so the strokes stay screen-space (line
  // widths unchanged). getTransform/setTransform keeps the canvas's dpr scale intact.
  const base = ctx.getTransform();
  ctx.translate(offX, offY);
  ctx.scale(zoom, zoom);
  ctx.clip(path);
  ctx.setTransform(base);
  fn();
  ctx.restore();
}

function existsAt(L: number, q: number, r: number): boolean {
  if (L < 0) return coarseCells(L).has(`${q},${r}`);
  if (L < memo.length) return resolve(L, q, r) !== null;
  let Q = q;
  let R = r;
  for (let i = L; i > 0; i--) {
    const p = ladder.parentOf(Q, R);
    Q = p.Q;
    R = p.R;
  }
  return authored[0].has(`${Q},${R}`);
}

// ------------------------------------------------------------------ lattice (live, screen space)
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Stroke level L's hex edges over the viewport, CLIPPED TO THE MAP.
 *
 * A cell is stroked only if it exists at level L (`existsAt`), so no line is ever drawn over
 * the void beyond a bounded map's edge — at the active level and at the coarser `district`
 * rungs alike. Edges 0..2 belong to the cell (which is what makes every interior edge come
 * out exactly once, so translucent district lines never double-alpha); edges 3..5 belong to
 * the neighbour across them and are stroked here ONLY when that neighbour is off-map, which
 * is what keeps the map's own ragged silhouette closed and crisp.
 */
function strokeLattice(L: number, alpha: number, width: number, colour: string): void {
  if (alpha <= 0.004) return;
  const s = sizeOf(L);
  const px = 2 * s * zoom;
  if (px < 3) return;                      // below 3 px the lattice is moire, not a grid
  const cor = cornersOf(s);
  const { x0, y0, x1, y1 } = viewWorldRect();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  forEachCell(L, x0, y0, x1, y1, (q, r, wx, wy) => {
    if (!existsAt(L, q, r)) return;
    const sx = offX + wx * zoom;
    const sy = offY + wy * zoom;
    for (let k = 0; k < 6; k++) {
      if (k >= 3) {
        const d = EDGE_NEI[k];
        if (existsAt(L, q + d[0], r + d[1])) continue;   // the neighbour already strokes it
      }
      const a = cor[k];
      const b = cor[(k + 1) % 6];
      ctx.moveTo(sx + a.x * zoom, sy + a.y * zoom);
      ctx.lineTo(sx + b.x * zoom, sy + b.y * zoom);
    }
  });
  ctx.stroke();
  ctx.restore();
}

/** fractional position inside the active band: 0 just after a crossing, ->1 just before the next */
function bandF(): number {
  return Math.max(0, Math.min(0.999999, Math.log(cellPxOf(level, zoom) / MIN_CELL_PX) / Math.log(M)));
}

function drawLattice(): void {
  if (LATTICE === 'off') return;
  const ink = 'rgba(8,11,16,0.55)';
  if (LATTICE === 'one') {
    strokeLattice(level, 1, 1, ink);
    return;
  }
  if (LATTICE === 'fade') {
    // continuous by construction: A-1 fades out over the first 40% of the band, A+1 fades
    // in over the last 40%, A is always solid. At a crossing every alpha is continuous.
    const f = bandF();
    withMapClip(() => strokeLattice(level - 1, 1 - smoothstep(0, 0.4, f), 1, ink));
    strokeLattice(level, 1, 1, ink);
    strokeLattice(level + 1, smoothstep(0.6, 1, f), 1, ink);
    return;
  }
  // district: A live, plus up to 2 coarser levels as lighter/thicker region lines
  withMapClip(() => {
    strokeLattice(level - 2, 0.30, 3, 'rgba(232,216,168,0.9)');
    strokeLattice(level - 1, 0.42, 2.2, 'rgba(232,216,168,0.9)');
  });
  strokeLattice(level, 1, 1, ink);
}

/** the HUD's one-line statement of the finer-level rule and whether it is firing right now */
function finerHudLine(): string {
  if (FINER === 'none') return 'finer none — only L' + level + ' authored content draws';
  if (FINER === 'all') return `finer all — every authored level > L${level} draws (specks incl.)`;
  const px = cellPxOf(level + 1, zoom);
  const on = level + 1 <= MAX_LEVEL && authored[level + 1] && authored[level + 1].size > 0
    && px >= FINER_MIN_PX;
  return `finer next — L${level + 1} @ ${px.toFixed(1)}px ${on ? 'ON' : `off (<${FINER_MIN_PX}px)`}`;
}

// ------------------------------------------------------------------ world footprint
const hullWorld: Array<{ x: number; y: number }> = (() => {
  // RECT: the exact RAGGED boundary, walked in offset order (top row, right column, bottom
  // row, left column) through the boundary cells' CENTRES. Consecutive entries are adjacent
  // cells, so the polygon is simple and every chord lies inside the union of two hexes - and
  // it zigzags on exactly the two edges the offset parity shifts (top/bottom for odd-q flat,
  // left/right for odd-r pointy). The rig's mask is even-odd point-in-polygon, so a concave
  // polygon is fine, and a convex hull would wrongly call the notches holes.
  if (fx.shape === 'rect') {
    return rectBoundaryCells(fx.root).map((c) => {
      const w = fx.root.geometry.hexToWorld(c.q, c.r);
      return { x: w.worldX, y: w.worldY };
    });
  }
  // RADIAL: unchanged - convex hull of the outer ring's centres.
  const pts: Array<{ x: number; y: number }> = [];
  for (const c of fx.root.cells.values()) {
    const ring = (Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.q + c.r)) / 2;
    if (ring !== fx.root.rings) continue;
    const w = fx.root.geometry.hexToWorld(c.q, c.r);
    pts.push({ x: w.worldX, y: w.worldY });
  }
  pts.sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const build = (src: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> => {
    const out: Array<{ x: number; y: number }> = [];
    for (const p of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(pts), ...build([...pts].reverse())];
})();

// ------------------------------------------------------------------ draw
const clock = startFrameClock();
let levelsDrawn = 0;

function draw(): void {
  clock.beginDraw();
  level = chooseLevel(zoom);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cssW, cssH);

  // (1) level-A fills for every visible cell, through resolve() — inherit-down
  drawLevelSurface(`fill:${level}`, level, 'fill');
  levelsDrawn = 1;

  // (2) levels FINER than A, on top — governed by ?finer (see the FINER doc comment)
  if (FINER !== 'none') {
    for (const L of authoredLevels()) {
      if (L <= level) continue;
      if (FINER === 'next' && (L !== level + 1 || cellPxOf(L, zoom) < FINER_MIN_PX)) continue;
      drawLevelSurface(`auth:${L}`, L, 'authored');
      levelsDrawn++;
    }
  }

  cellsDrawn = 0;
  for (const s2 of surfaces.values()) cellsDrawn += s2.lastCells;

  // (3) the lattice, live, in screen space
  drawLattice();

  // (4) roads / labels / fiducial, live, in screen space
  for (const road of fx.roads) {
    ctx.save();
    ctx.strokeStyle = road.color;
    ctx.lineWidth = Math.max(1.2, Math.min(7, road.width * zoom));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    road.points.forEach((p, i) => {
      const s = screenOf(p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.restore();
  }
  ctx.textAlign = 'center';
  for (const lab of fx.labels) {
    const seat = SEAT_OF_DEPTH[lab.depth];
    if (cellPxOf(seat, zoom) < 6) continue;      // its rung is not legible yet
    const s = screenOf(lab.x, lab.y);
    if (s.x < -200 || s.x > cssW + 200 || s.y < -60 || s.y > cssH + 60) continue;
    ctx.font = `${lab.depth === 0 ? 17 : 14}px ui-monospace, Consolas, monospace`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8,11,16,0.85)';
    ctx.strokeText(lab.text, s.x, s.y);
    ctx.fillStyle = '#f2ead8';
    ctx.fillText(lab.text, s.x, s.y);
  }
  ctx.textAlign = 'left';

  if (FIDUCIAL) {
    const s = screenOf(fiducialWorld.x, fiducialWorld.y);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.round(s.x - 3.5), Math.round(s.y - 3.5), 7, 7);
  }

  // HUD — OPAQUE (a translucent HUD reads as a hole to the rig)
  ctx.fillStyle = '#161b24';
  ctx.fillRect(8, 8, 330, 80);
  ctx.fillStyle = '#dfe7f2';
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillText(`z ${zoom.toFixed(3)}  m=${M}  L${level}/${MAX_LEVEL}  ${cellPxOf(level, zoom).toFixed(1)}px`, 16, 26);
  ctx.fillText(`${ORIENT}/${SHAPE}${SHAPE === 'rect' ? ` ${COLS}x${ROWS}` : ` ring${fx.root.rings}`}  ${LATTICE}  minPx ${MIN_CELL_PX}  f ${bandF().toFixed(2)}`, 16, 44);
  ctx.fillText(finerHudLine(), 16, 62);
  ctx.fillText(`cells ${cellsDrawn}  surf ${surfaces.size}  rb ${rebuilds}`, 16, 80);

  framesDrawn++;
  clock.endDraw();
}

function loop(): void {
  draw();
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ input
function zoomAbout(next: number, ax: number, ay: number): void {
  const clamped = Math.max(HARD_MIN, Math.min(HARD_MAX, next));
  const w = worldAt(ax, ay);
  zoom = clamped;
  offX = ax - w.x * zoom;
  offY = ay - w.y * zoom;
  lastInputAt = performance.now();
}

canvas.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  zoomAbout(zoom * Math.exp(-e.deltaY * WHEEL_K), e.clientX, e.clientY);
}, { passive: false });

let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  if (e.shiftKey) {                       // shift+click paints the active level's cell
    const w = worldAt(e.clientX, e.clientY);
    paint(w.x, w.y, '#e8462f');
    return;
  }
  if (e.altKey) {
    const w = worldAt(e.clientX, e.clientY);
    erase(w.x, w.y);
    return;
  }
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragging) return;
  offX += e.clientX - lastX;
  offY += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  lastInputAt = performance.now();
  for (const s of surfaces.values()) s.crisp = false;
});
const endDrag = (e: PointerEvent): void => {
  dragging = false;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('keydown', (e: KeyboardEvent) => {
  const set = (k: string, v: string): void => {
    const p = new URLSearchParams(location.search);
    p.set(k, v);
    location.search = p.toString();
  };
  if (e.key === '1') set('ladder', '3');
  if (e.key === '2') set('ladder', '5');
  if (e.key === '3') set('ladder', '13');
  if (e.key === '4') set('ladder', '4');
  if (e.key === '5') set('ladder', '2');
  if (e.key === 'q') set('lattice', 'one');
  if (e.key === 'w') set('lattice', 'fade');
  if (e.key === 'e') set('lattice', 'district');
  if (e.key === 'a') set('finer', 'none');
  if (e.key === 's') set('finer', 'next');
  if (e.key === 'd') set('finer', 'all');
  if (e.key === 'o') set('orient', 'flat');
  if (e.key === 'p') set('orient', 'pointy');
  if (e.key === 'h') set('shape', 'radial');
  if (e.key === 'r') set('shape', 'rect');
});
window.addEventListener('resize', () => { resize(); home(); });

// ------------------------------------------------------------------ edit
function cellAt(L: number, wx: number, wy: number): { q: number; r: number } {
  return cellOf(wx, wy, sizeOf(L));
}
function paint(wx: number, wy: number, color: string): { level: number; q: number; r: number } {
  const c = cellAt(level, wx, wy);
  authored[level].set(`${c.q},${c.r}`, color);
  invalidateFrom(level);
  return { level, q: c.q, r: c.r };
}
function erase(wx: number, wy: number): { level: number; q: number; r: number; had: boolean } {
  const c = cellAt(level, wx, wy);
  const had = authored[level].delete(`${c.q},${c.r}`);
  invalidateFrom(level);
  return { level, q: c.q, r: c.r, had };
}

// ------------------------------------------------------------------ contract surface
resize();
home();

const ready = new Promise<void>((resolve2) => {
  requestAnimationFrame(() => {
    draw();
    requestAnimationFrame(() => { loop(); resolve2(); });
  });
});

let bytesCached = 0;

(window as unknown as { __lod: unknown }).__lod = {
  ready,
  worldAt,
  screenOf,
  getZoom: () => zoom,
  setZoom: (z: number, ax?: number, ay?: number) => zoomAbout(z, ax ?? cssW / 2, ay ?? cssH / 2),
  zoomRange: () => ({ min: SWEEP_MIN, max: HARD_MAX }),
  crossings,
  fiducialWorld,
  setFiducial: (wx: number, wy: number) => { fiducialWorld.x = wx; fiducialWorld.y = wy; },
  footprint: () => ({
    kind: 'polygon',
    points: hullWorld.map((p) => ({ x: offX + p.x * zoom, y: offY + p.y * zoom })),
  }),
  paint,
  erase,
  metrics: () => {
    bytesCached = 0;
    for (const s of surfaces.values()) bytesCached += s.bytes;
    return {
      level,
      levelsDrawn,
      cellsDrawn,
      surfaces: surfaces.size,
      bytesCached,
      rebuilds,
      ladder: M,
      maxLevel: MAX_LEVEL,
      finer: FINER,
      finerDrawn: FINER === 'none' ? 0 : levelsDrawn - 1,
      bandF: +bandF().toFixed(3),
      cellPx: +cellPxOf(level, zoom).toFixed(2),
      framesDrawn,
    };
  },
  // spike-private, for the NOTES tables
  stats: () => ({
    orient: ORIENT,
    shape: SHAPE,
    cols: SHAPE === 'rect' ? COLS : 0,
    rows: SHAPE === 'rect' ? ROWS : 0,
    rootCells: fx.root.cells.size,
    childAt: fx.childAt,
    seatOfDepth: SEAT_OF_DEPTH,
    authoredPerLevel: authored.map((m) => m.size),
    authoredLevels: authoredLevels(),
    finer: FINER,
    finerMinPx: FINER_MIN_PX,
    minCellPx: MIN_CELL_PX,
    lattice: LATTICE,
    seatStats,
    crossings,
    maxLevel: MAX_LEVEL,
  }),
  reset: () => { resize(); home(); rebuilds = 0; clock.clear(); },

  /**
   * THE ORIENTATION ASSERTION. Four checks, all at the live ?orient / ?shape:
   *
   *  1. centreVsPlugin - every level's axial->world transform equals a REAL
   *     HexGeometry(80 / m^L, ORIENT).hexToWorld. The finer lattices are not a
   *     re-derivation: they are the plugin's own formula at a smaller hexSize.
   *  2. pureScale - the (m,0) generator is a pure scale, so a level-0 cell (Q,R) and the
   *     level-L cell parentToChild^L(Q,R) must be the SAME world point, and parentOf must
   *     invert it exactly. A rotated generator (h12's (15,-7)) fails this immediately.
   *  3. outlineScale - a level-L hex OUTLINE is the root outline times 1/m^L, corner for
   *     corner: identical corner ANGLES, so the finer levels keep the orientation.
   *  4. rootCells - the level-0 cell set is EXACTLY what the plugin enumerates for this
   *     shape (getCellsInRectangle over the offset bounds / getAllRadialCells).
   */
  orientProbe: () => {
    const samples: Array<[number, number]> = [
      [0, 0], [1, 0], [0, 1], [-1, 2], [3, -1], [-4, -2], [7, 5], [-9, 3],
    ];
    let centreVsPlugin = 0;
    let pureScale = 0;
    let outlineScale = 0;
    let parentInverts = true;
    const c0 = cornersOf(ROOT_SIZE);
    const levels = Math.min(4, MAX_LEVEL);
    for (let L = 0; L <= levels; L++) {
      const s = sizeOf(L);
      const g = new HexGeometry(s, ORIENT, null);
      const cL = cornersOf(s);
      const k = Math.pow(M, L);
      for (let i = 0; i < 6; i++) {
        outlineScale = Math.max(outlineScale,
          Math.abs(cL[i].x - c0[i].x / k), Math.abs(cL[i].y - c0[i].y / k));
      }
      for (const [Q, R] of samples) {
        const mine = posOf(Q, R, s);
        const plug = g.hexToWorld(Q, R);
        centreVsPlugin = Math.max(centreVsPlugin,
          Math.abs(mine.x - plug.worldX), Math.abs(mine.y - plug.worldY));
        let q = Q;
        let r = R;
        for (let i = 0; i < L; i++) {
          const c = ladder.parentToChild(q, r);
          q = c.q;
          r = c.r;
        }
        const deep = posOf(q, r, s);
        const root = posOf(Q, R, ROOT_SIZE);
        pureScale = Math.max(pureScale, Math.abs(deep.x - root.x), Math.abs(deep.y - root.y));
        let pq = q;
        let pr = r;
        for (let i = 0; i < L; i++) {
          const pp = ladder.parentOf(pq, pr);
          pq = pp.Q;
          pr = pp.R;
        }
        if (pq !== Q || pr !== R) parentInverts = false;
      }
    }
    const geom = fx.root.geometry;
    let pluginCells: Array<{ x: number; y: number }>;
    if (SHAPE === 'rect') {
      const a = offsetToAxial(0, 0, ORIENT);
      const b = offsetToAxial(COLS - 1, ROWS - 1, ORIENT);
      pluginCells = geom.getCellsInRectangle(a.q, a.r, b.q, b.r);
    } else {
      pluginCells = geom.getAllRadialCells(fx.root.rings).map((c) => ({ x: c.q, y: c.r }));
    }
    const mineSet = new Set(authored[0].keys());
    let missing = 0;
    for (const c of pluginCells) if (!mineSet.has(`${c.x},${c.y}`)) missing++;
    return {
      orient: ORIENT,
      shape: SHAPE,
      ladder: M,
      levelsChecked: levels,
      centreVsPlugin: +centreVsPlugin.toExponential(3),
      pureScale: +pureScale.toExponential(3),
      outlineScale: +outlineScale.toExponential(3),
      parentInverts,
      cornerPhaseDeg: POINTY ? 30 : 0,
      rootCellsMine: mineSet.size,
      rootCellsPlugin: pluginCells.length,
      rootCellsMissing: missing,
      expectedRootCells: SHAPE === 'rect' ? COLS * ROWS : 1 + 3 * fx.root.rings * (fx.root.rings + 1),
      footprintPoints: hullWorld.length,
    };
  },
};
