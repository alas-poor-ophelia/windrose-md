/**
 * skyClip / skyCells Unit Tests
 *
 * Cell outlines (shared edges cancel, holes wind the other way), the
 * per-area shapes (topmost region claims a cell, fog removes cells, skipped
 * areas still claim, the whole-map area takes the rest or becomes "the
 * canvas but these cells"), the screen projection and its nonzero rule,
 * and the map-side inputs (fog keys, cell corners, map cell lists).
 */

import { describe, it, expect } from "vitest";

import {
  buildSkyShapes,
  cellWinding,
  loopArea2,
  projectSkyShape,
  skyShapeToSvgPath,
  traceCellLoops,
} from "../../../src/weather/skyClip";
import type { Loop } from "../../../src/weather/skyClip";
import { collectFoggedKeys, skyCellSource } from "../../../src/weather/skyCells";
import { HexGeometry } from "../../../src/geometry/core/HexGeometry";
import { offsetToAxial } from "../../../src/geometry/core/offsetCoordinates";
import type { WeatherArea } from "#types/contexts/weather.types";
import type { Cell } from "#types/core/cell.types";

const SIZE = 10;
const grid = skyCellSource({ type: "grid", cellSize: SIZE }, null);
const gridCells = (pts: Array<[number, number]>) => pts.map(([x, y]) => ({ x, y }));

/** Nonzero winding number of the loops around a point */
function winding(loops: Loop[], px: number, py: number): number {
  let w = 0;
  for (const loop of loops) {
    const n = loop.length;
    for (let i = 0; i < n; i += 2) {
      const x0 = loop[i], y0 = loop[i + 1];
      const x1 = loop[(i + 2) % n], y1 = loop[(i + 3) % n];
      if (y0 <= py) {
        if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) w++;
      } else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) {
        w--;
      }
    }
  }
  return w;
}

const inside = (loops: Loop[], cx: number, cy: number) => winding(loops, (cx + 0.5) * SIZE, (cy + 0.5) * SIZE) !== 0;

function regionArea(id: string, cells: Array<[number, number]>, zoneId = `z-${id}`): WeatherArea {
  return { id: `region:${id}`, kind: "region", zoneId, name: id, cells: gridCells(cells), regionId: id };
}
const MAP_AREA: WeatherArea = { id: "map", kind: "map", zoneId: "z-map", name: "Whole map", cells: "all" };

describe("traceCellLoops", () => {
  it("outlines one cell as its own corners", () => {
    const loops = traceCellLoops([{ x: 0, y: 0 }], grid.cellVertices);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(8);
  });

  it("cancels shared edges: two neighbours make one loop", () => {
    const loops = traceCellLoops(gridCells([[0, 0], [1, 0]]), grid.cellVertices);
    expect(loops).toHaveLength(1);
    // 6 boundary corners (two collinear midpoints stay)
    expect(loops[0]).toHaveLength(12);
    expect(Math.abs(loopArea2(loops[0]))).toBe(2 * 2 * SIZE * SIZE);
  });

  it("winds a hole against its outer boundary, so nonzero leaves it empty", () => {
    const ring: Array<[number, number]> = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) if (x !== 1 || y !== 1) ring.push([x, y]);
    const loops = traceCellLoops(gridCells(ring), grid.cellVertices);
    expect(loops).toHaveLength(2);
    expect(Math.sign(loopArea2(loops[0]))).toBe(-Math.sign(loopArea2(loops[1])));
    expect(inside(loops, 0, 0)).toBe(true);
    expect(inside(loops, 1, 1)).toBe(false);
    expect(inside(loops, 3, 1)).toBe(false);
  });

  it("ignores duplicate cells and traces hex clusters into one loop", () => {
    const hex = new HexGeometry(16, "flat", null);
    const cells = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 }];
    const loops = traceCellLoops(cells, (q, r) => hex.getHexVertices(q, r));
    expect(loops).toHaveLength(1);
    // Three mutually adjacent hexes: 18 edges, 3 shared -> 12 boundary edges
    expect(loops[0]).toHaveLength(24);
  });

  it("returns nothing for no cells", () => {
    expect(traceCellLoops([], grid.cellVertices)).toEqual([]);
  });
});

describe("buildSkyShapes", () => {
  it("gives a cell to the topmost region and drops fogged cells", () => {
    const areas = [regionArea("top", [[0, 0], [1, 0]]), regionArea("low", [[1, 0], [2, 0], [3, 0]])];
    const shapes = buildSkyShapes({ areas, fogged: new Set(["3,0"]), cellVertices: grid.cellVertices, mapCells: null });
    expect(shapes.map(s => s.id)).toEqual(["region:top", "region:low"]);
    const low = shapes[1].loops;
    expect(inside(low, 1, 0)).toBe(false);
    expect(inside(low, 2, 0)).toBe(true);
    expect(inside(low, 3, 0)).toBe(false);
  });

  it("skips excluded areas but keeps their cells claimed", () => {
    const areas = [regionArea("calm", [[0, 0]]), MAP_AREA];
    const mapCells = () => gridCells([[0, 0], [1, 0]]);
    const shapes = buildSkyShapes({
      areas, fogged: null, cellVertices: grid.cellVertices, mapCells, include: a => a.kind === "map",
    });
    expect(shapes.map(s => s.id)).toEqual(["map"]);
    expect(shapes[0].mode).toBe("cells");
    expect(inside(shapes[0].loops, 0, 0)).toBe(false);
    expect(inside(shapes[0].loops, 1, 0)).toBe(true);
  });

  it("makes an unbounded whole-map area 'everywhere but' the regions and the fog", () => {
    const areas = [regionArea("r", [[0, 0]]), MAP_AREA];
    const shapes = buildSkyShapes({ areas, fogged: new Set(["5,5"]), cellVertices: grid.cellVertices, mapCells: null });
    const map = shapes.find(s => s.id === "map");
    expect(map?.mode).toBe("everywhereBut");
    const screen = projectSkyShape(map!, (x, y) => ({ x, y }), 100, 100, cellWinding(grid.cellVertices));
    expect(screen?.bounds).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(inside(screen!.loops, 0, 0)).toBe(false);
    expect(inside(screen!.loops, 5, 5)).toBe(false);
    expect(inside(screen!.loops, 3, 3)).toBe(true);
  });

  it("falls back to 'everywhere but' when the map has too many cells to trace", () => {
    function* huge() { for (let i = 0; i < 50000; i++) yield { x: i, y: 0 }; }
    const shapes = buildSkyShapes({ areas: [MAP_AREA], fogged: null, cellVertices: grid.cellVertices, mapCells: huge });
    expect(shapes[0].mode).toBe("everywhereBut");
  });
});

describe("projectSkyShape", () => {
  const shape = buildSkyShapes({ areas: [regionArea("r", [[0, 0], [1, 0]])], fogged: null, cellVertices: grid.cellVertices, mapCells: null })[0];

  it("projects loops and their bounding box through the transform", () => {
    const screen = projectSkyShape(shape, (x, y) => ({ x: x * 2 + 5, y: y * 2 + 7 }), 200, 200, 1);
    expect(screen?.bounds).toEqual({ x: 5, y: 7, w: 40, h: 20 });
  });

  it("returns null for a shape entirely off screen", () => {
    expect(projectSkyShape(shape, (x, y) => ({ x: x + 500, y }), 200, 200, 1)).toBeNull();
  });

  it("winds the canvas rectangle against the cells for either cell winding", () => {
    for (const w of [1, -1] as const) {
      const empty = { ...shape, mode: "everywhereBut" as const, loops: [] };
      const rect = projectSkyShape(empty, (x, y) => ({ x, y }), 10, 10, w)!.loops[0];
      expect(Math.sign(loopArea2(rect))).toBe(-w);
    }
  });
});

describe("skyShapeToSvgPath", () => {
  it("writes closed subpaths, with a far rectangle for 'everywhere but'", () => {
    const cellShape = buildSkyShapes({ areas: [regionArea("r", [[0, 0]])], fogged: null, cellVertices: grid.cellVertices, mapCells: null })[0];
    expect(skyShapeToSvgPath(cellShape, 1)).toMatch(/^M[-\d. ]+(L[-\d. ]+){3}Z$/);
    const everywhere = { ...cellShape, mode: "everywhereBut" as const };
    expect(skyShapeToSvgPath(everywhere, 1).match(/Z/g)).toHaveLength(2);
  });
});

describe("skyCells", () => {
  it("collects fogged cells only when fog is enabled, converting hex offsets to axial", () => {
    const fog = { enabled: true, foggedCells: [{ col: 3, row: 2 }], texture: null };
    expect(collectFoggedKeys({ ...fog, enabled: false }, "hex", "flat")).toBeNull();
    expect(collectFoggedKeys(null, "grid", "flat")).toBeNull();
    expect([...collectFoggedKeys(fog, "grid", "flat")!]).toEqual(["3,2"]);
    const { q, r } = offsetToAxial(3, 2, "flat");
    expect([...collectFoggedKeys(fog, "hex", "flat")!]).toEqual([`${q},${r}`]);
  });

  it("lists a rectangular hex map's every cell, else the painted cells", () => {
    const hex = new HexGeometry(16, "pointy", { maxCol: 4, maxRow: 3 });
    const bounded = skyCellSource(hex, { maxCol: 4, maxRow: 3 });
    expect([...bounded.mapCells!()]).toHaveLength(12);
    const painted: Cell[] = [{ q: 1, r: 2, color: "#000" }];
    expect([...skyCellSource(hex, null, painted).mapCells!()]).toEqual([{ x: 1, y: 2 }]);
    expect(skyCellSource(hex, null).mapCells).toBeNull();
  });

  it("uses painted grid cells, in a consistent winding", () => {
    const painted: Cell[] = [{ x: 2, y: 3, color: "#000" }];
    const source = skyCellSource({ type: "grid", cellSize: 8 }, null, painted);
    expect([...source.mapCells!()]).toEqual([{ x: 2, y: 3 }]);
    expect(source.cellVertices(1, 1)[0]).toEqual({ worldX: 8, worldY: 8 });
    expect(cellWinding(source.cellVertices)).toBe(1);
  });

  it("lists a radial hex map's cells", () => {
    const hex = new HexGeometry(16, "flat", { maxCol: 0, maxRow: 0, maxRing: 1 });
    const source = skyCellSource(hex, { maxCol: 0, maxRow: 0, maxRing: 1 });
    expect([...source.mapCells!()]).toHaveLength(7);
  });
});
