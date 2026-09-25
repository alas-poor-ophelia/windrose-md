/**
 * spikes/lod/_shared/fixture.ts
 *
 * THE shared world every LOD spike renders. Deterministic, pure TS, no DOM.
 *
 * It mirrors the SHIPPED Windrose nesting exactly:
 *   - root = radial hex map, ring 12 (469 cells), flat-top, hexSize 80 (DEFAULTS.hexSize)
 *   - a sub-map lives under a single parent hex, is a ring-7 rosette (169 cells),
 *     and is placed at ONE linear scale: cellsAcross = rings*2+1 = 15.
 *   - therefore  childWorld = parentHexCentre + childLocal / 15  (composed affine).
 *
 * The /15 is NOT re-derived here: it comes from the real
 * subHexChildPointToParentOffset / subHexContinuityZoom in
 * src/geometry/core/hexMeasurements.ts, so if the shipped math ever moves, the
 * fixture moves with it.
 */
import type { MapData, MapLayer, SubHexMapData } from '#types/core/map.types';
import type { HexCell } from '#types/core/cell.types';
import type { TextLabel } from '#types/objects/note.types';

import { HexGeometry } from '../../../src/geometry/core/HexGeometry';
import { offsetToAxial } from '../../../src/geometry/core/offsetCoordinates';
import {
  subHexAnchorToChildCenter,
  subHexChildPointToParentOffset,
  subHexContinuityZoom,
} from '../../../src/geometry/core/hexMeasurements';

// ------------------------------------------------------------------ constants
/** DEFAULTS.hexSize — centre-to-vertex, world px, at every depth (sub-maps inherit it). */
export const HEX_SIZE = 80;
/** DEFAULTS.hexOrientation — the fixture's DEFAULT. `buildFixture` can override it. */
export const ORIENTATION: 'flat' | 'pointy' = 'flat';
export type Orientation = 'flat' | 'pointy';
export type RootShape = 'radial' | 'rect';
/** default rectangular root map, in the plugin's OFFSET convention (odd-q flat / odd-r pointy) */
export const RECT_COLS = 24;
export const RECT_ROWS = 16;
export const ROOT_RINGS = 12;   // 1 + 3*12*13 = 469 cells
export const CHILD_RINGS = 7;   // 1 + 3*7*8  = 169 cells (SubHexMapData.subdivisionRings)
/** rings*2+1 — one parent hex spans this many child cells across. */
export const CELLS_ACROSS = CHILD_RINGS * 2 + 1; // 15
/** Parent-world px per child-world px. Straight from the shipped math. */
export const CHILD_SCALE = subHexChildPointToParentOffset(1, 0, HEX_SIZE, HEX_SIZE, CHILD_RINGS).x; // 1/15
/** Zoom multiplier at which a child occupies its parent hex's footprint. */
export const CONTINUITY_ZOOM_PER_LEVEL = subHexContinuityZoom(1, HEX_SIZE, HEX_SIZE, CHILD_RINGS); // 1/15

export type TerrainId =
  | 'ocean' | 'coast' | 'plains' | 'forest'
  | 'hills' | 'mountains' | 'lake' | 'town';

export const TERRAIN_PALETTE: Record<TerrainId, string> = {
  ocean:     '#1d3a56',
  coast:     '#c8b183',
  plains:    '#7f9a55',
  forest:    '#2f5b39',
  hills:     '#8a7a42',
  mountains: '#6d6a72',
  lake:      '#3b7ea1',
  town:      '#b2562f',
};

export const FIDUCIAL_COLOR = '#ff00c8';

// ------------------------------------------------------------------ types
export interface Affine { scale: number; tx: number; ty: number }

export interface FixtureCell {
  q: number;
  r: number;
  terrain: TerrainId;
  color: string;
  /** true for the one hidden-landmark cell */
  secret?: boolean;
}

export interface FixtureLabel {
  docId: string;
  depth: number;
  /** ROOT world px */
  x: number;
  y: number;
  text: string;
  /** ROOT world px — already divided down for deep docs */
  fontSize: number;
}

export interface FixtureRoad {
  id: string;
  /** ROOT world px, crosses a child boundary */
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

export interface FixtureSecret {
  docId: string;
  q: number;
  r: number;
  x: number;
  y: number;
  text: string;
}

export interface Doc {
  id: string;
  depth: number;
  parentId: string | null;
  /** the hex of the PARENT doc this sits inside (null for root) */
  parentHex: { q: number; r: number } | null;
  rings: number;
  /** 'radial' = ring-bounded rosette (every sub-map, and the default root). */
  shape: RootShape;
  /** rect only — the plugin's hexBounds {maxCol, maxRow} */
  cols: number;
  rows: number;
  orientation: Orientation;
  hexSize: number;
  geometry: HexGeometry;
  cells: Map<string, FixtureCell>;
  /** composed doc-local -> ROOT world px */
  transformToWorld: Affine;
  labels: FixtureLabel[];
  roads: FixtureRoad[];
  secret: FixtureSecret | null;
  childIds: string[];
}

export interface FixtureOptions {
  /** hex orientation for EVERY doc in the tree. Default 'flat' (DEFAULTS.hexOrientation). */
  orientation?: Orientation;
  /** root map shape. Default 'radial' (ring ROOT_RINGS), i.e. today's fixture. */
  shape?: RootShape;
  /** rect only: plugin hexBounds.maxCol / .maxRow. Defaults RECT_COLS x RECT_ROWS. */
  cols?: number;
  rows?: number;
}

export interface Fixture {
  seed: number;
  orientation: Orientation;
  shape: RootShape;
  /** rect only (0 for radial) */
  cols: number;
  rows: number;
  /** which ROOT hex each depth-1 doc was anchored on, for the record */
  childAt: Record<string, { q: number; r: number }>;
  root: Doc;
  docs: Doc[];
  byId: Map<string, Doc>;
  labels: FixtureLabel[];
  roads: FixtureRoad[];
  secret: FixtureSecret | null;
  fiducial: { x: number; y: number };
  /** half-extent of the root rosette in ROOT world px (for fit-zoom) */
  worldRadius: number;
}

// ------------------------------------------------------------------ helpers
function hash32(a: number, b: number, seed: number): number {
  let h = seed ^ Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function shade(hex: string, delta: number): string {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number): number => Math.max(0, Math.min(255, Math.round(v + delta * 255)));
  const to2 = (v: number): string => v.toString(16).padStart(2, '0');
  return '#' + to2(cl((n >> 16) & 255)) + to2(cl((n >> 8) & 255)) + to2(cl(n & 255));
}

function hexRing(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

function hexDistance(aq: number, ar: number, bq: number, br: number): number {
  return hexRing(aq - bq, ar - br);
}

export function docToWorld(doc: Doc, x: number, y: number): { x: number; y: number } {
  const t = doc.transformToWorld;
  return { x: t.tx + x * t.scale, y: t.ty + y * t.scale };
}

export function worldToDoc(doc: Doc, wx: number, wy: number): { x: number; y: number } {
  const t = doc.transformToWorld;
  return { x: (wx - t.tx) / t.scale, y: (wy - t.ty) / t.scale };
}

// ------------------------------------------------------------------ terrain field
/**
 * The coarse terrain field, evaluated in ROOT world px. Every depth samples the
 * SAME field at its own cell centres, so children refine their parent honestly
 * (coastline, forest edge and ridge all cross parent-hex boundaries); the
 * per-doc overrides below are the deliberate contradictions.
 */
export function terrainAtWorld(wx: number, wy: number): TerrainId {
  // coastline: a wavy meridian on the west side
  const coastX = -900 + 240 * Math.sin(wy / 460) + 100 * Math.sin(wy / 155);
  if (wx < coastX) return 'ocean';
  if (wx < coastX + 110) return 'coast';

  // mountain ridge running NE, with foothills either side
  const ridge = wy - (0.5 * wx + 520);
  const ridgeW = 190 + 90 * Math.sin(wx / 300);
  if (Math.abs(ridge) < ridgeW) return 'mountains';
  if (Math.abs(ridge) < ridgeW + 190) return 'hills';

  // forest band (ellipse) straddling the two adjacent children
  const fx = (wx - 420) / 620;
  const fy = (wy - 104) / 480;
  if (fx * fx + fy * fy < 1) return 'forest';

  return 'plains';
}

// ------------------------------------------------------------------ world layout
/** Root hexes that own a sub-map. forestA/forestB are NEIGHBOURS (dq=1, dr=0). */
const CHILD_AT: Record<string, { q: number; r: number }> = {
  forestA: { q: 3, r: -1 },   // adjacent pair, member A  (lake contradiction)
  forestB: { q: 4, r: -1 },   // adjacent pair, member B  (town)
  shore:   { q: -8, r: 4 },   // isolated child, coastline crosses it
  range:   { q: 0, r: 5 },    // mountain child, carries the depth-2 grandchild
};
/** The hex INSIDE the `range` child that carries the depth-2 rosette. */
const GRANDCHILD_AT = { q: 2, r: -3 };

type Override = (q: number, r: number) => TerrainId | null;

function makeOverrides(id: string): Override {
  if (id === 'forestA') {
    // a lake where the parent hex says FOREST — the deliberate disagreement
    return (q, r) => (hexDistance(q, r, -2, 2) <= 2 ? 'lake' : null);
  }
  if (id === 'forestB') {
    // a 7-cell town (centre + ring 1)
    return (q, r) => (hexDistance(q, r, 1, -2) <= 1 ? 'town' : null);
  }
  if (id === 'range') {
    // a sheltered valley inside the mountains
    return (q, r) => (hexDistance(q, r, 3, 1) <= 2 ? 'plains' : null);
  }
  if (id === 'grand') {
    // a 7-cell hold, plus its pasture
    return (q, r) => {
      const d = hexDistance(q, r, 0, 0);
      if (d <= 1) return 'town';
      if (d <= 3) return 'plains';
      return null;
    };
  }
  return () => null;
}

// ------------------------------------------------------------------ builder
function makeDoc(
  id: string,
  depth: number,
  parent: Doc | null,
  parentHex: { q: number; r: number } | null,
  rings: number,
  orientation: Orientation = ORIENTATION,
  shape: RootShape = 'radial',
  cols = 0,
  rows = 0,
): Doc {
  // RADIAL: bounds carry maxRing, so HexGeometry.renderingMode === 'radial'.
  // RECT  : bounds carry ONLY {maxCol, maxRow} (no maxRing) — that is exactly how the
  //         plugin expresses a rectangular hex map (types/core/map.types.ts hexBounds),
  //         and HexGeometry.isWithinBounds then tests the OFFSET coords for
  //         0 <= col < maxCol, 0 <= row < maxRow (odd-q for flat, odd-r for pointy).
  const geometry = shape === 'rect'
    ? new HexGeometry(HEX_SIZE, orientation, { maxCol: cols, maxRow: rows })
    : new HexGeometry(HEX_SIZE, orientation, {
      maxCol: rings * 2 + 1, maxRow: rings * 2 + 1, maxRing: rings,
    });

  let transformToWorld: Affine;
  if (!parent || !parentHex) {
    transformToWorld = { scale: 1, tx: 0, ty: 0 };
  } else {
    const centre = parent.geometry.hexToWorld(parentHex.q, parentHex.r);
    // one child-world px is CHILD_SCALE parent-world px (the shipped /15)
    transformToWorld = {
      scale: parent.transformToWorld.scale * CHILD_SCALE,
      tx: parent.transformToWorld.tx + parent.transformToWorld.scale * centre.worldX,
      ty: parent.transformToWorld.ty + parent.transformToWorld.scale * centre.worldY,
    };
  }

  return {
    id, depth, parentId: parent ? parent.id : null, parentHex, rings,
    shape, cols, rows, orientation,
    hexSize: HEX_SIZE, geometry, cells: new Map<string, FixtureCell>(), transformToWorld,
    labels: [], roads: [], secret: null, childIds: [],
  };
}

/**
 * The doc's cell set, enumerated EXACTLY the way the plugin enumerates that map shape.
 *   radial -> HexGeometry.getAllRadialCells(rings)             (rings, like drawGrid's radial arm)
 *   rect   -> offsetToAxial(col, row) over [0, maxCol) x [0, maxRow)  (drawGrid's rectangular arm
 *             and getCellsInRectangle, both of which iterate offset coords and keep the ones
 *             isWithinBounds accepts). odd-q offset for flat, odd-r for pointy.
 */
export function docCells(doc: Doc): Array<{ q: number; r: number }> {
  if (doc.shape !== 'rect') return doc.geometry.getAllRadialCells(doc.rings);
  const out: Array<{ q: number; r: number }> = [];
  for (let col = 0; col < doc.cols; col++) {
    for (let row = 0; row < doc.rows; row++) out.push(offsetToAxial(col, row, doc.orientation));
  }
  return out;
}

function fillCells(doc: Doc, override: Override, seed: number): void {
  for (const { q, r } of docCells(doc)) {
    const local = doc.geometry.hexToWorld(q, r);
    const w = docToWorld(doc, local.worldX, local.worldY);
    const terrain = override(q, r) ?? terrainAtWorld(w.x, w.y);
    const jitter = ((hash32(q, r, seed + doc.depth * 7919) % 22) - 11) / 255;
    doc.cells.set(q + ',' + r, { q, r, terrain, color: shade(TERRAIN_PALETTE[terrain], jitter) });
  }
}

/**
 * Where the four depth-1 docs sit on a RECTANGULAR root map, in the plugin's OFFSET
 * convention, expressed relative to the map's centre cell so the same recipe works for any
 * cols x rows and for both orientations. forestA/forestB stay AXIAL neighbours (dq=1, dr=0)
 * exactly as in the radial fixture, so the shared-edge road still crosses a doc boundary.
 *
 *   forestA  centre cell (cc, cr)            forestB  = forestA + (1,0) in AXIAL
 *   range    (cc + 3, cr - 3)                shore    (cc - 6, cr + 3)
 *
 * with cc = floor((cols-1)/2), cr = floor((rows-1)/2) — i.e. all four sit near the middle of
 * the map, well away from the ragged edge, which is the point: the edge must be visible as a
 * boundary of the LATTICE, not as a boundary of authored content.
 */
function rectChildAt(cols: number, rows: number, orientation: Orientation): Record<string, { q: number; r: number }> {
  const cc = Math.floor((cols - 1) / 2);
  const cr = Math.floor((rows - 1) / 2);
  const at = (dc: number, dr: number): { q: number; r: number } => offsetToAxial(cc + dc, cr + dr, orientation);
  const forestA = at(0, 0);
  return {
    forestA,
    forestB: { q: forestA.q + 1, r: forestA.r },
    shore: at(-6, 3),
    range: at(3, -3),
  };
}

/**
 * The ordered ring of boundary cells of a RECT map, walked clockwise in offset space:
 * top row L->R, right column, bottom row R->L, left column. Consecutive entries are always
 * adjacent cells, so the polygon through their CENTRES is simple (it zigzags on the two
 * edges the offset parity shifts) and lies inside the union of the map's hexes — which is
 * what a footprint/hole mask needs.
 */
export function rectBoundaryCells(doc: Doc): Array<{ q: number; r: number }> {
  const out: Array<{ q: number; r: number }> = [];
  const push = (c: number, w: number): void => { out.push(offsetToAxial(c, w, doc.orientation)); };
  const C = doc.cols;
  const R = doc.rows;
  for (let c = 0; c < C; c++) push(c, 0);
  for (let w = 1; w < R; w++) push(C - 1, w);
  for (let c = C - 2; c >= 0; c--) push(c, R - 1);
  for (let w = R - 2; w >= 1; w--) push(0, w);
  return out;
}

export function buildFixture(seed = 1, opts: FixtureOptions = {}): Fixture {
  const orientation: Orientation = opts.orientation ?? ORIENTATION;
  const shape: RootShape = opts.shape ?? 'radial';
  const cols = shape === 'rect' ? Math.max(3, Math.round(opts.cols ?? RECT_COLS)) : 0;
  const rows = shape === 'rect' ? Math.max(3, Math.round(opts.rows ?? RECT_ROWS)) : 0;
  const childAt = shape === 'rect' ? rectChildAt(cols, rows, orientation) : CHILD_AT;

  const root = makeDoc('root', 0, null, null, ROOT_RINGS, orientation, shape, cols, rows);
  fillCells(root, () => null, seed);

  const mk = (key: string): Doc => {
    const d = makeDoc(key, 1, root, { ...childAt[key] }, CHILD_RINGS, orientation);
    fillCells(d, makeOverrides(key), seed);
    root.childIds.push(d.id);
    return d;
  };
  const forestA = mk('forestA');
  const forestB = mk('forestB');
  const shore = mk('shore');
  const range = mk('range');

  const grand = makeDoc('grand', 2, range, { ...GRANDCHILD_AT }, CHILD_RINGS, orientation);
  fillCells(grand, makeOverrides('grand'), seed);
  range.childIds.push(grand.id);

  const docs = [root, forestA, forestB, shore, range, grand];
  const byId = new Map<string, Doc>(docs.map((d) => [d.id, d]));

  // --- hidden landmark: one secret cell in the isolated shore child
  {
    const q = -3;
    const r = 1;
    const cell = shore.cells.get(q + ',' + r);
    if (cell) {
      cell.secret = true;
      cell.terrain = 'town';
      cell.color = shade(TERRAIN_PALETTE.town, -0.12);
    }
    const local = shore.geometry.hexToWorld(q, r);
    const w = docToWorld(shore, local.worldX, local.worldY);
    shore.secret = { docId: shore.id, q, r, x: w.x, y: w.y, text: 'Drowned Beacon' };
  }

  // --- labels, one per depth
  const labelAt = (doc: Doc, q: number, r: number, text: string, fontSize: number): FixtureLabel => {
    const local = doc.geometry.hexToWorld(q, r);
    const w = docToWorld(doc, local.worldX, local.worldY);
    const l: FixtureLabel = { docId: doc.id, depth: doc.depth, x: w.x, y: w.y, text, fontSize };
    doc.labels.push(l);
    return l;
  };
  const rootLabelHex = shape === 'rect'
    ? offsetToAxial(Math.max(0, Math.floor((cols - 1) / 2) - 5), Math.max(0, Math.floor((rows - 1) / 2) - 4), orientation)
    : { q: -2, r: -7 };
  const labels = [
    labelAt(root, rootLabelHex.q, rootLabelHex.r, 'THORNMERE REACH', 110),
    labelAt(forestB, 1, -2, 'Ashford', 110 * CHILD_SCALE),
    labelAt(grand, 0, 0, 'Cairn Hold', 110 * CHILD_SCALE * CHILD_SCALE),
  ];

  // --- one road crossing the shared edge of the two adjacent children
  const cA = root.geometry.hexToWorld(childAt.forestA.q, childAt.forestA.r);
  const cB = root.geometry.hexToWorld(childAt.forestB.q, childAt.forestB.r);
  const mid = { x: (cA.worldX + cB.worldX) / 2, y: (cA.worldY + cB.worldY) / 2 };
  const road: FixtureRoad = {
    id: 'road-ashford',
    points: [
      { x: cA.worldX - 62, y: cA.worldY - 48 },
      { x: cA.worldX - 8, y: cA.worldY + 6 },
      { x: mid.x - 6, y: mid.y - 10 },
      { x: cB.worldX - 10, y: cB.worldY + 4 },
      { x: cB.worldX + 54, y: cB.worldY + 52 },
    ],
    color: '#e8d8a8',
    width: 7,
  };
  forestA.roads.push(road);
  forestB.roads.push(road);

  // --- fiducial: a magenta point inside the depth-2 doc, off its centre
  const gl = grand.geometry.hexToWorld(-4, 2);
  const fiducial = docToWorld(grand, gl.worldX, gl.worldY);

  // half-extent of the root map in ROOT world px (fit-zoom). Radial keeps its closed form.
  let worldRadius = HEX_SIZE * (ROOT_RINGS + 0.5) * 2;
  if (shape === 'rect') {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const c of root.cells.values()) {
      const w = root.geometry.hexToWorld(c.q, c.r);
      if (w.worldX < x0) x0 = w.worldX;
      if (w.worldX > x1) x1 = w.worldX;
      if (w.worldY < y0) y0 = w.worldY;
      if (w.worldY > y1) y1 = w.worldY;
    }
    worldRadius = Math.max(x1 - x0, y1 - y0) / 2 + HEX_SIZE;
  }

  return {
    seed, orientation, shape, cols, rows, childAt,
    root, docs, byId,
    labels, roads: [road], secret: shore.secret,
    fiducial,
    worldRadius,
  };
}

/**
 * The magenta fiducial world point, computed without building the whole fixture
 * (same composed transform: root -> range hex (0,5) -> grandchild hex (2,-3)).
 */
export const FIDUCIAL_WORLD: { x: number; y: number } = (() => {
  const g = new HexGeometry(HEX_SIZE, ORIENTATION, null);
  const a = g.hexToWorld(CHILD_AT.range.q, CHILD_AT.range.r);
  const b = g.hexToWorld(GRANDCHILD_AT.q, GRANDCHILD_AT.r);
  const c = g.hexToWorld(-4, 2);
  return {
    x: a.worldX + CHILD_SCALE * (b.worldX + CHILD_SCALE * c.worldX),
    y: a.worldY + CHILD_SCALE * (b.worldY + CHILD_SCALE * c.worldY),
  };
})();

// ------------------------------------------------------------------ point query
export interface ResolvedCell {
  docId: string; depth: number; q: number; r: number;
  terrain: TerrainId; color: string; secret: boolean;
}

/**
 * Resolve the FINEST authored cell at a ROOT-world point, not deeper than
 * `maxDepth`. Returns null only when the point is outside the root rosette.
 * This is the coarse fallback every spike needs for G1 (never blank).
 */
export function coarseColorAt(
  fx: Fixture, worldX: number, worldY: number, maxDepth = 99,
): ResolvedCell | null {
  const ordered = [...fx.docs].sort((a, b) => b.depth - a.depth);
  for (const doc of ordered) {
    if (doc.depth > maxDepth) continue;
    const p = worldToDoc(doc, worldX, worldY);
    const { q, r } = doc.geometry.worldToHex(p.x, p.y);
    // radial -> ring <= rings; rect -> the plugin's offset-bounds test. Both are exactly
    // HexGeometry.isWithinBounds for the bounds this doc was constructed with.
    if (!doc.geometry.isWithinBounds(q, r)) continue;
    const cell = doc.cells.get(q + ',' + r);
    if (!cell) continue;
    return {
      docId: doc.id, depth: doc.depth, q, r,
      terrain: cell.terrain, color: cell.color, secret: !!cell.secret,
    };
  }
  return null;
}

/** Sanity assertions used by write-fixture.mjs. Returns [] when all hold. */
export function checkMath(fx: Fixture): string[] {
  const errs: string[] = [];
  const fwd = subHexAnchorToChildCenter(13, -29, HEX_SIZE, HEX_SIZE, CHILD_RINGS);
  const back = subHexChildPointToParentOffset(fwd.x, fwd.y, HEX_SIZE, HEX_SIZE, CHILD_RINGS);
  if (Math.abs(back.x - 13) > 1e-9 || Math.abs(back.y + 29) > 1e-9) errs.push('subHex mappings do not invert');
  if (Math.abs(CHILD_SCALE - 1 / CELLS_ACROSS) > 1e-12) errs.push('CHILD_SCALE != 1/15');
  if (Math.abs(CONTINUITY_ZOOM_PER_LEVEL - CHILD_SCALE) > 1e-12) errs.push('continuity zoom != child scale');
  // every depth-1 anchor hex must exist on the root map (it does not on a rect map unless
  // the anchors were re-derived from the offset bounds)
  for (const doc of fx.docs) {
    if (doc.depth !== 1 || !doc.parentHex) continue;
    if (!fx.root.cells.has(`${doc.parentHex.q},${doc.parentHex.r}`)) {
      errs.push(`${doc.id} anchor hex ${doc.parentHex.q},${doc.parentHex.r} is not a cell of the root map`);
    }
  }
  // every child centre must resolve to its own parent hex in the parent doc
  for (const doc of fx.docs) {
    if (!doc.parentId || !doc.parentHex) continue;
    const parent = fx.byId.get(doc.parentId) as Doc;
    const c = docToWorld(doc, 0, 0);
    const p = worldToDoc(parent, c.x, c.y);
    const hit = parent.geometry.worldToHex(p.x, p.y);
    if (hit.q !== doc.parentHex.q || hit.r !== doc.parentHex.r) {
      errs.push(`${doc.id} centre lands on parent hex ${hit.q},${hit.r} not ${doc.parentHex.q},${doc.parentHex.r}`);
    }
  }
  return errs;
}

// ------------------------------------------------------------------ MapData export
function toLayer(doc: Doc, id: string): MapLayer {
  const cells: HexCell[] = [];
  for (const c of doc.cells.values()) cells.push({ q: c.q, r: c.r, color: c.color });
  const textLabels: TextLabel[] = doc.labels.map((l, i) => {
    const local = worldToDoc(doc, l.x, l.y);
    return {
      id: `${doc.id}-label-${i}`,
      position: { x: local.x, y: local.y },
      content: l.text,
      fontSize: 24,
      fontFace: 'sans-serif',
      color: '#f2ead8',
      align: 'center' as const,
      rotation: 0,
    };
  });
  return {
    id, name: '1', order: 0, visible: true,
    cells, curves: [], edges: [], objects: [], textLabels, fogOfWar: null,
  };
}

function docToMapData(fx: Fixture, doc: Doc): MapData {
  const layerId = `${doc.id}-layer`;
  const subHexMaps: Record<string, SubHexMapData> = {};
  for (const childId of doc.childIds) {
    const child = fx.byId.get(childId);
    if (!child || !child.parentHex) continue;
    subHexMaps[`${child.parentHex.q},${child.parentHex.r}`] = {
      subdivisionRings: child.rings,
      mapData: docToMapData(fx, child),
      lastModified: '2026-01-01T00:00:00.000Z',
    };
  }
  const data: MapData = {
    schemaVersion: 2,
    mapType: 'hex',
    name: doc.depth === 0
      ? 'LOD fixture - Thornmere Reach'
      : `Hex (${doc.parentHex?.q}, ${doc.parentHex?.r})`,
    description: '',
    northDirection: 0,
    activeLayerId: layerId,
    layerPanelVisible: false,
    layers: [toLayer(doc, layerId)],
    hexSize: HEX_SIZE,
    orientation: doc.orientation,
    hexBounds: doc.shape === 'rect'
      ? { maxCol: doc.cols, maxRow: doc.rows }
      : { maxCol: doc.rings * 2 + 1, maxRow: doc.rings * 2 + 1, maxRing: doc.rings },
    customColors: [],
    sidebarCollapsed: false,
    expandedState: false,
    lastTextLabelSettings: null,
    settings: { useGlobalSettings: true, overrides: {} },
    uiPreferences: {
      rememberPanZoom: true,
      rememberSidebarState: true,
      rememberExpandedState: false,
    },
  };
  if (Object.keys(subHexMaps).length) data.subHexMaps = subHexMaps;
  return data;
}

/** A real, importable Windrose MapData with the full subHexMaps nesting. */
export function toMapData(fx: Fixture = buildFixture()): MapData {
  return docToMapData(fx, fx.root);
}
