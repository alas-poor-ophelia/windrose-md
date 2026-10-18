/**
 * skyClip.ts
 *
 * Pure geometry for the weather layers: which cells each weather area
 * covers (bound regions topmost first, the map-level area taking every
 * other cell, fogged cells removed) as WORLD-space outline loops, and the
 * projection of those loops to screen backing pixels for the Sky's canvas
 * clip.
 *
 * Outlines, not per-cell polygons: the cells' edges are added as directed
 * edges and every edge shared by two included cells cancels, so what is
 * left is the union's boundary (holes come out with the opposite winding).
 * A nonzero fill of the loops equals a fill of the cells, with far fewer
 * vertices to clip against per frame.
 *
 * World loops depend only on the areas, the fog and the geometry, so the
 * layer recomputes them on those changes; the screen projection is redone
 * on a viewport change (a handful of boundary vertices) and never per
 * animation frame.
 */

import type { WeatherArea } from '#types/contexts/weather.types';

interface CellXY {
  x: number;
  y: number;
}

interface WorldXY {
  worldX: number;
  worldY: number;
}

/** A flat [x0, y0, x1, y1, ...] closed loop */
type Loop = number[];

/**
 * How an area's shape is expressed:
 * - `cells`: fill the loops (the area's own cells).
 * - `everywhereBut`: the whole canvas minus the loops (an unbounded map's
 *   whole-map area: everything except other areas' and fogged cells).
 */
type SkyShapeMode = 'cells' | 'everywhereBut';

interface SkyShape {
  /** The weather area's id (stable across frames) */
  id: string;
  zoneId: string;
  kind: WeatherArea['kind'];
  mode: SkyShapeMode;
  /** World-space loops */
  loops: Loop[];
}

interface SkyShapeInput {
  /** Store areas: regions topmost first, then the map-level area */
  areas: readonly WeatherArea[];
  /** Fogged cells as "x,y" keys in the areas' cell coordinates (axial on hex), or null */
  fogged: ReadonlySet<string> | null;
  /** A cell's corners in world px, in a consistent winding for every cell */
  cellVertices: (x: number, y: number) => WorldXY[];
  /**
   * Every cell of a bounded map, or null for an unbounded map (the
   * whole-map area then becomes "everywhere but").
   */
  mapCells: (() => Iterable<CellXY>) | null;
  /**
   * Whether an area needs a shape at all (calm, clear weather does not).
   * Areas that are skipped still claim their cells from the whole-map area.
   */
  include?: (area: WeatherArea) => boolean;
}

/** Bounded maps larger than this fall back to "everywhere but" for the whole-map area */
const MAX_MAP_CELLS = 40000;

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Twice the signed area of a flat loop (positive = clockwise on a y-down screen) */
function loopArea2(loop: Loop): number {
  let sum = 0;
  const n = loop.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    sum += loop[i] * loop[j + 1] - loop[j] * loop[i + 1];
  }
  return sum;
}

/** +1 or -1: the winding of a cell polygon from `cellVertices` */
function cellWinding(cellVertices: (x: number, y: number) => WorldXY[]): 1 | -1 {
  const loop: Loop = [];
  for (const v of cellVertices(0, 0)) loop.push(v.worldX, v.worldY);
  return loopArea2(loop) >= 0 ? 1 : -1;
}

/**
 * The boundary loops of a set of cells. Shared edges cancel; the leftover
 * directed edges chain into closed loops (outer boundaries keep the cells'
 * winding, holes run the other way).
 */
function traceCellLoops(cells: Iterable<CellXY>, cellVertices: (x: number, y: number) => WorldXY[]): Loop[] {
  const vertexIndex = new Map<string, number>();
  const coords: number[] = [];
  const vertexId = (v: WorldXY): number => {
    // Neighbouring cells compute the same corner with float noise; a
    // hundredth of a world px is far below any visible difference
    const key = `${Math.round(v.worldX * 100)},${Math.round(v.worldY * 100)}`;
    let id = vertexIndex.get(key);
    if (id === undefined) {
      id = coords.length / 2;
      vertexIndex.set(key, id);
      coords.push(v.worldX, v.worldY);
    }
    return id;
  };

  const edges = new Set<string>();
  const seen = new Set<string>();
  for (const cell of cells) {
    const key = cellKey(cell.x, cell.y);
    if (seen.has(key)) continue;
    seen.add(key);
    const vertices = cellVertices(cell.x, cell.y);
    const n = vertices.length;
    if (n < 3) continue;
    const ids = vertices.map(vertexId);
    for (let i = 0; i < n; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % n];
      const reverse = `${b}>${a}`;
      if (edges.has(reverse)) edges.delete(reverse);
      else edges.add(`${a}>${b}`);
    }
  }

  // Outgoing edges per vertex; at a pinch vertex any pairing still sums to
  // the right winding, so the first free edge is taken
  const outgoing = new Map<number, number[]>();
  for (const edge of edges) {
    const sep = edge.indexOf('>');
    const a = Number(edge.slice(0, sep));
    const b = Number(edge.slice(sep + 1));
    let list = outgoing.get(a);
    if (list === undefined) {
      list = [];
      outgoing.set(a, list);
    }
    list.push(b);
  }

  const loops: Loop[] = [];
  for (const [start, list] of outgoing) {
    while (list.length > 0) {
      const loop: Loop = [];
      let current = start;
      let guard = edges.size + 1;
      while (guard-- > 0) {
        loop.push(coords[current * 2], coords[current * 2 + 1]);
        const nextList = outgoing.get(current);
        const next = nextList?.pop();
        if (next === undefined) break;
        current = next;
        if (current === start) break;
      }
      if (loop.length >= 6) loops.push(loop);
    }
  }
  return loops;
}

/**
 * World-space shapes of the weather areas. Each cell belongs to the first
 * area (in store order, regions topmost first) that lists it; the whole-map
 * area takes the rest. Fogged cells belong to no shape.
 */
function buildSkyShapes(input: SkyShapeInput): SkyShape[] {
  const { areas, fogged, cellVertices, mapCells, include } = input;
  const claimed = new Set<string>();
  const shapes: SkyShape[] = [];

  for (const area of areas) {
    if (area.cells === 'all') continue;
    const cells: CellXY[] = [];
    for (const cell of area.cells) {
      const key = cellKey(cell.x, cell.y);
      if (claimed.has(key)) continue;
      claimed.add(key);
      if (fogged?.has(key) !== true) cells.push(cell);
    }
    if (include != null && !include(area)) continue;
    const loops = traceCellLoops(cells, cellVertices);
    if (loops.length > 0) shapes.push({ id: area.id, zoneId: area.zoneId, kind: area.kind, mode: 'cells', loops });
  }

  const mapArea = areas.find(area => area.cells === 'all');
  if (mapArea != null && (include == null || include(mapArea))) {
    const all = mapCells?.() ?? null;
    let cells: CellXY[] | null = null;
    if (all != null) {
      cells = [];
      for (const cell of all) {
        if (cells.length > MAX_MAP_CELLS) {
          cells = null;
          break;
        }
        const key = cellKey(cell.x, cell.y);
        if (!claimed.has(key) && fogged?.has(key) !== true) cells.push(cell);
      }
    }
    if (cells != null) {
      const loops = traceCellLoops(cells, cellVertices);
      if (loops.length > 0) shapes.push({ id: mapArea.id, zoneId: mapArea.zoneId, kind: mapArea.kind, mode: 'cells', loops });
    } else {
      const excluded: CellXY[] = [];
      const add = (key: string): void => {
        const comma = key.indexOf(',');
        excluded.push({ x: Number(key.slice(0, comma)), y: Number(key.slice(comma + 1)) });
      };
      for (const key of claimed) add(key);
      if (fogged != null) for (const key of fogged) if (!claimed.has(key)) add(key);
      shapes.push({
        id: mapArea.id, zoneId: mapArea.zoneId, kind: mapArea.kind, mode: 'everywhereBut',
        loops: traceCellLoops(excluded, cellVertices),
      });
    }
  }
  return shapes;
}

interface ScreenShape {
  /** Screen backing-px loops, ready for moveTo/lineTo/closePath under a nonzero fill */
  loops: Loop[];
  bounds: { x: number; y: number; w: number; h: number };
}

/**
 * Project a world shape to screen backing pixels. `everywhereBut` shapes
 * get a canvas rectangle wound against the cells, so the excluded cells'
 * outer loops cancel it to zero under nonzero; their bounds are the canvas.
 * Returns null when nothing remains on screen.
 */
function projectSkyShape(
  shape: SkyShape,
  worldToBuffer: (worldX: number, worldY: number) => { x: number; y: number },
  width: number,
  height: number,
  winding: 1 | -1
): ScreenShape | null {
  const loops: Loop[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (shape.mode === 'everywhereBut') {
    // Clockwise on screen is +1; run against the cells' winding
    loops.push(winding === 1 ? [0, 0, 0, height, width, height, width, 0] : [0, 0, width, 0, width, height, 0, height]);
  }
  for (const loop of shape.loops) {
    const out: Loop = new Array<number>(loop.length);
    for (let i = 0; i < loop.length; i += 2) {
      const p = worldToBuffer(loop[i], loop[i + 1]);
      out[i] = p.x;
      out[i + 1] = p.y;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    loops.push(out);
  }
  if (shape.mode === 'everywhereBut') {
    return { loops, bounds: { x: 0, y: 0, w: width, h: height } };
  }
  if (loops.length === 0 || maxX <= 0 || maxY <= 0 || minX >= width || minY >= height) return null;
  return { loops, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

/** Loops as an SVG path `d` (nonzero fill) */
function loopsToSvgPath(loops: readonly Loop[]): string {
  const parts: string[] = [];
  for (const loop of loops) {
    let d = `M${loop[0]} ${loop[1]}`;
    for (let i = 2; i < loop.length; i += 2) d += `L${loop[i]} ${loop[i + 1]}`;
    parts.push(d + 'Z');
  }
  return parts.join('');
}

/**
 * World-space SVG path for a shape. An `everywhereBut` shape gets a
 * rectangle far beyond any reachable view, wound against the cells.
 */
function skyShapeToSvgPath(shape: SkyShape, winding: 1 | -1): string {
  if (shape.mode === 'cells') return loopsToSvgPath(shape.loops);
  const r = 1e7;
  const rect: Loop = winding === 1 ? [-r, -r, -r, r, r, r, r, -r] : [-r, -r, r, -r, r, r, -r, r];
  return loopsToSvgPath([rect, ...shape.loops]);
}

export { buildSkyShapes, cellWinding, loopArea2, projectSkyShape, skyShapeToSvgPath, traceCellLoops };
export type { Loop, ScreenShape, SkyShape, SkyShapeInput };
