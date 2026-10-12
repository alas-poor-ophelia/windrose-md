/**
 * kgc.23 (b): fog of war is level-0 cell data, so an object homed on a finer
 * rung must be fogged by its ROOT ANCESTOR hex. The object renderer asks
 * `isCellFogged` with the home rung's offset coords; `fogDepsForRung` maps them.
 *
 * Fixture cells are chosen by lattice ancestry (`ancestorAt`), never by "the rung
 * hex under the root centre": ownership is not containment of the centre.
 */
import { describe, it, expect } from "vitest";

import { createGeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { fogDepsForRung, rungFogPredicate } from "../../../../src/hooks/canvas/rungFog";
import type { MapLayer } from "#types/core/map.types";

const layer = {} as MapLayer;

function foggedAt(root: HexGeometry, cells: Array<{ q: number; r: number }>): (l: MapLayer, col: number, row: number) => boolean {
  const keys = new Set(cells.map(({ q, r }) => {
    const o = root.toOffsetCoords(q, r);
    return `${o.col},${o.row}`;
  }));
  return (_l, col, row) => keys.has(`${col},${row}`);
}

/** Every rung-`level` cell in a window whose root ancestor is (Q, R). */
function descendantsOf(ladder: ReturnType<typeof createGeometryLadder>, level: number, Q: number, R: number): Array<{ q: number; r: number }> {
  const out: Array<{ q: number; r: number }> = [];
  const span = 6 * ladder.ladder.m ** level;
  for (let q = -span; q <= span; q++) {
    for (let r = -span; r <= span; r++) {
      const a = ladder.ladder.ancestorAt(level, q, r);
      if (a.q === Q && a.r === R) out.push({ q, r });
    }
  }
  return out;
}

describe.each(["flat", "pointy"] as const)("rung fog (%s)", (orientation) => {
  const root = new HexGeometry(80, orientation, null);
  const ladder = createGeometryLadder(root);
  const rung2 = ladder.geometryForLevel(2);
  const inside = descendantsOf(ladder, 2, 1, 0);

  it("fixture: rung-2 cells owned by root (1,0) exist and map back to it", () => {
    expect(inside.length).toBeGreaterThan(1);
    for (const { q, r } of inside) expect(ladder.ladder.ancestorAt(2, q, r)).toEqual({ q: 1, r: 0 });
  });

  it("fog at root (1,0) hides every rung-2 object under it", () => {
    const fogged = rungFogPredicate(ladder, 2, foggedAt(root, [{ q: 1, r: 0 }]));
    for (const { q, r } of inside) {
      const o = rung2.toOffsetCoords(q, r);
      expect(fogged(layer, o.col, o.row)).toBe(true);
    }
  });

  it("fog elsewhere does not hide it", () => {
    const fogged = rungFogPredicate(ladder, 2, foggedAt(root, [{ q: 0, r: 0 }, { q: 2, r: -1 }, { q: -1, r: 1 }]));
    for (const { q, r } of inside) {
      const o = rung2.toOffsetCoords(q, r);
      expect(fogged(layer, o.col, o.row)).toBe(false);
    }
  });

  it("level 0 deps pass through untouched; district rungs stay unfogged", () => {
    const always = (_l: MapLayer, _c: number, _r: number): boolean => true;
    const deps = { isCellFogged: always, other: 1 };
    expect(fogDepsForRung(ladder, 0, deps)).toBe(deps);
    expect(fogDepsForRung(ladder, -1, deps).isCellFogged(layer, 0, 0)).toBe(false);
    expect(fogDepsForRung(ladder, 2, deps).other).toBe(1);
  });
});
