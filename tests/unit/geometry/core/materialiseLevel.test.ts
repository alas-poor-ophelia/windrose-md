/**
 * Phase 1 level materialiser.
 *
 * Design: .claude/lod-rd/06-integration-design.md section 3.2 ("Materialise, do not
 * resolve lazily — dilated by one ring").
 *  - every emitted fine cell carries its level-0 ancestor's plain fill colour
 *  - the rect is dilated by one whole level-L cell, so the neighbour ring of a cell
 *    on the rect edge exists and no boundary cell gets a phantom border
 *  - existsAt is the only existence gate; unfilled and segmented ancestors are skipped
 *  - the memo keys on the cells array identity plus (level, epoch, rect)
 *
 * Both orientations and both bounds kinds (rectangular and radial) run every check.
 */

import { describe, it, expect } from "vitest";

import { createGeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { cellKey } from "../../../../src/geometry/core/lattice";
import { materialiseLevelLayer } from "../../../../src/geometry/core/materialiseLevel";

import type { GeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import type { WorldRect } from "../../../../src/geometry/core/materialiseLevel";
import type { Cell, HexCell } from "#types/core/cell.types";
import type { MapLayer } from "#types/core/map.types";

const HEX_SIZE = 80;
const ORIENTATIONS: Array<"flat" | "pointy"> = ["flat", "pointy"];
const COLORS = ["#112233", "#445566", "#778899"];

/** An in-bounds cell that is deliberately left without a fill. */
const BLANK_COLOR = "";
/** A coloured cell placed far outside the bounds; nothing may ever inherit from it. */
const OUT_OF_BOUNDS = { q: 40, r: 40, color: "#ff0000" };

interface Fixture {
  name: string;
  root: HexGeometry;
  ladder: GeometryLadder;
  layer: MapLayer;
  /** Coloured, in-bounds root cells keyed "q,r". */
  fills: Map<string, string>;
  /** In-bounds root cell with no fill. */
  blank: HexCell;
  /** A coloured, in-bounds root cell to hang the dilation test off. */
  anchor: HexCell;
}

function makeLayer(cells: Cell[]): MapLayer {
  return {
    id: "layer-1",
    name: "Ground",
    order: 0,
    visible: true,
    cells,
    curves: [{ id: "curve-1" } as unknown as MapLayer["curves"][number]],
    edges: [{ id: "edge-1" } as unknown as MapLayer["edges"][number]],
    objects: [{ id: "object-1" } as unknown as MapLayer["objects"][number]],
    textLabels: [{ id: "label-1" } as unknown as MapLayer["textLabels"][number]],
    fogOfWar: {} as unknown as MapLayer["fogOfWar"],
    tiles: [{ id: "tile-1" } as unknown as NonNullable<MapLayer["tiles"]>[number]],
    wallPaths: [{ id: "wall-1" } as unknown as NonNullable<MapLayer["wallPaths"]>[number]],
    terrainStrokes: [{ id: "stroke-1" } as unknown as NonNullable<MapLayer["terrainStrokes"]>[number]]
  };
}

function inBoundsCells(root: HexGeometry): Array<{ q: number; r: number }> {
  const found: Array<{ q: number; r: number }> = [];
  for (let q = -10; q <= 14; q++) {
    for (let r = -10; r <= 14; r++) {
      if (root.isWithinBounds(q, r)) found.push({ q, r });
    }
  }
  return found;
}

function makeFixture(name: string, root: HexGeometry): Fixture {
  const coords = inBoundsCells(root);
  expect(coords.length).toBeGreaterThan(6);
  // The blank sits in the middle of the list, the anchor at the start: both interior.
  const blankIndex = Math.floor(coords.length / 2);
  const cells: HexCell[] = coords.map((c, i) => ({
    q: c.q,
    r: c.r,
    color: i === blankIndex ? BLANK_COLOR : COLORS[i % COLORS.length]
  }));
  cells.push({ ...OUT_OF_BOUNDS });

  const fills = new Map<string, string>();
  for (const cell of cells) {
    if (cell.color.length === 0) continue;
    if (root.isWithinBounds(cell.q, cell.r) === false) continue;
    fills.set(cellKey(cell.q, cell.r), cell.color);
  }

  return {
    name,
    root,
    ladder: createGeometryLadder(root),
    layer: makeLayer(cells),
    fills,
    blank: cells[blankIndex],
    anchor: cells[0]
  };
}

function fixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const orientation of ORIENTATIONS) {
    out.push(makeFixture(`${orientation}/rectangular`, new HexGeometry(HEX_SIZE, orientation, { maxCol: 6, maxRow: 5 })));
    out.push(
      makeFixture(`${orientation}/radial`, new HexGeometry(HEX_SIZE, orientation, { maxCol: 0, maxRow: 0, maxRing: 2 }))
    );
  }
  return out;
}

/** World rect around a root cell, two root cells wide on each side. */
function rectAroundRootCell(fixture: Fixture, q: number, r: number): WorldRect {
  const { worldX, worldY } = fixture.root.hexToWorld(q, r);
  const span = HEX_SIZE * 2;
  return { x0: worldX - span, y0: worldY - span, x1: worldX + span, y1: worldY + span };
}

/** The centre child of a root cell, `level` rungs down. */
function centreChild(fixture: Fixture, level: number, q: number, r: number): { q: number; r: number } {
  let out = { q, r };
  for (let i = 0; i < level; i++) {
    out = fixture.ladder.ladder.parentToChild(out.q, out.r);
  }
  return out;
}

function asHexCells(cells: Cell[]): HexCell[] {
  return cells as HexCell[];
}

describe("materialiseLevelLayer", () => {
  for (const fixture of fixtures()) {
    describe(fixture.name, () => {
      it("inherits every emitted colour from an in-layer root ancestor", () => {
        for (const level of [1, 2]) {
          const rect = rectAroundRootCell(fixture, fixture.anchor.q, fixture.anchor.r);
          const { layer, stats } = materialiseLevelLayer(fixture.layer, fixture.ladder, level, rect, 1);
          expect(stats.cells).toBeGreaterThan(0);
          expect(stats.enumerated).toBeGreaterThanOrEqual(stats.cells);
          for (const cell of asHexCells(layer.cells)) {
            const ancestor = fixture.ladder.ladder.ancestorAt(level, cell.q, cell.r);
            const expected = fixture.fills.get(cellKey(ancestor.q, ancestor.r));
            expect(expected).toBeDefined();
            expect(cell.color).toBe(expected);
          }
        }
      });

      it("emits cells whose centres lie in the dilated rect, matching hexToWorld", () => {
        const level = 1;
        const rect = rectAroundRootCell(fixture, fixture.anchor.q, fixture.anchor.r);
        const pad = 2 * fixture.ladder.cellSizeAt(level);
        const { layer } = materialiseLevelLayer(fixture.layer, fixture.ladder, level, rect, 1);
        const levelGeometry = fixture.ladder.geometryForLevel(level);
        for (const cell of asHexCells(layer.cells)) {
          const { worldX, worldY } = levelGeometry.hexToWorld(cell.q, cell.r);
          expect(worldX).toBeGreaterThanOrEqual(rect.x0 - pad);
          expect(worldX).toBeLessThanOrEqual(rect.x1 + pad);
          expect(worldY).toBeGreaterThanOrEqual(rect.y0 - pad);
          expect(worldY).toBeLessThanOrEqual(rect.y1 + pad);
        }
      });

      it("dilation: a rect collapsed onto one cell centre still yields its whole neighbour ring", () => {
        for (const level of [1, 2]) {
          const child = centreChild(fixture, level, fixture.anchor.q, fixture.anchor.r);
          const { worldX, worldY } = fixture.ladder.geometryForLevel(level).hexToWorld(child.q, child.r);
          const rect: WorldRect = { x0: worldX, y0: worldY, x1: worldX, y1: worldY };
          const { layer } = materialiseLevelLayer(fixture.layer, fixture.ladder, level, rect, 1);
          const keys = new Set(asHexCells(layer.cells).map((c) => cellKey(c.q, c.r)));
          const ring = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, -1],
            [-1, 1]
          ];
          expect(keys.has(cellKey(child.q, child.r))).toBe(true);
          for (const [dq, dr] of ring) {
            expect(keys.has(cellKey(child.q + dq, child.r + dr))).toBe(true);
          }
          expect(keys.size).toBeGreaterThanOrEqual(7);
        }
      });

      it("skips cells whose ancestor is out of bounds or has no fill", () => {
        const level = 1;
        const rect = rectAroundRootCell(fixture, fixture.blank.q, fixture.blank.r);
        const { layer } = materialiseLevelLayer(fixture.layer, fixture.ladder, level, rect, 1);
        const blankKey = cellKey(fixture.blank.q, fixture.blank.r);
        for (const cell of asHexCells(layer.cells)) {
          const ancestor = fixture.ladder.ladder.ancestorAt(level, cell.q, cell.r);
          expect(fixture.root.isWithinBounds(ancestor.q, ancestor.r)).toBe(true);
          expect(cellKey(ancestor.q, ancestor.r)).not.toBe(blankKey);
        }

        // The out-of-bounds coloured root cell is never inherited, even right on top of it.
        const farRect = rectAroundRootCell(fixture, OUT_OF_BOUNDS.q, OUT_OF_BOUNDS.r);
        const far = materialiseLevelLayer(fixture.layer, fixture.ladder, level, farRect, 1);
        expect(far.stats.enumerated).toBeGreaterThan(0);
        expect(far.stats.cells).toBe(0);
      });

      it("level 2 emits roughly m^2 times the cells of level 1 over the same rect", () => {
        const rect = rectAroundRootCell(fixture, fixture.anchor.q, fixture.anchor.r);
        const one = materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, 1);
        const two = materialiseLevelLayer(fixture.layer, fixture.ladder, 2, rect, 1);
        expect(one.stats.cells).toBeGreaterThan(0);
        const ratio = two.stats.cells / one.stats.cells;
        expect(ratio).toBeGreaterThan(12);
        expect(ratio).toBeLessThan(20);
      });
    });
  }

  describe("synthetic layer shape", () => {
    const fixture = makeFixture("flat/rectangular", new HexGeometry(HEX_SIZE, "flat", { maxCol: 6, maxRow: 5 }));

    it("keeps identity and empties every non-cell collection", () => {
      const rect = rectAroundRootCell(fixture, fixture.anchor.q, fixture.anchor.r);
      const { layer } = materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, 1);

      expect(layer.id).toBe(fixture.layer.id);
      expect(layer.name).toBe(fixture.layer.name);
      expect(layer.visible).toBe(fixture.layer.visible);
      expect(layer.order).toBe(fixture.layer.order);

      expect(layer.curves).toEqual([]);
      expect(layer.edges).toEqual([]);
      expect(layer.objects).toEqual([]);
      expect(layer.textLabels).toEqual([]);
      expect(layer.tiles).toEqual([]);
      expect(layer.wallPaths).toEqual([]);
      expect(layer.terrainStrokes).toEqual([]);
      expect(layer.fogOfWar).toBeNull();

      // The source layer is untouched.
      expect(fixture.layer.curves.length).toBe(1);
      expect(fixture.layer.cells.length).toBeGreaterThan(0);
    });

    it("rejects level 0 and below, and non-integer levels", () => {
      const rect = rectAroundRootCell(fixture, fixture.anchor.q, fixture.anchor.r);
      expect(() => materialiseLevelLayer(fixture.layer, fixture.ladder, 0, rect, 1)).toThrow(RangeError);
      expect(() => materialiseLevelLayer(fixture.layer, fixture.ladder, -1, rect, 1)).toThrow(RangeError);
      expect(() => materialiseLevelLayer(fixture.layer, fixture.ladder, 1.5, rect, 1)).toThrow(RangeError);
    });
  });

  describe("memo", () => {
    it("returns the same layer object for identical inputs and reports why it missed", () => {
      const fixture = makeFixture("memo", new HexGeometry(HEX_SIZE, "flat", { maxCol: 6, maxRow: 5 }));
      const rect = rectAroundRootCell(fixture, fixture.anchor.q, fixture.anchor.r);

      const first = materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, 1);
      expect(first.stats.missReason).toBe("no-entry");

      const second = materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, 1);
      expect(second.stats.missReason).toBe("hit");
      expect(second.layer).toBe(first.layer);
      expect(second.stats.cells).toBe(first.stats.cells);
      expect(second.stats.enumerated).toBe(0);

      const newEpoch = materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, 2);
      expect(newEpoch.stats.missReason).toBe("key-changed");
      expect(newEpoch.layer).not.toBe(first.layer);
      expect(newEpoch.stats.cells).toBe(first.stats.cells);

      const newLevel = materialiseLevelLayer(fixture.layer, fixture.ladder, 2, rect, 1);
      expect(newLevel.stats.missReason).toBe("key-changed");

      // A cell edit replaces the cells array, which is what the memo keys on.
      const edited: MapLayer = { ...fixture.layer, cells: [...fixture.layer.cells] };
      const afterEdit = materialiseLevelLayer(edited, fixture.ladder, 1, rect, 1);
      expect(afterEdit.stats.missReason).toBe("no-entry");
      expect(afterEdit.layer).not.toBe(first.layer);

      // A re-spread layer that keeps the same cells array still hits.
      const cosmetic: MapLayer = { ...fixture.layer };
      const afterCosmetic = materialiseLevelLayer(cosmetic, fixture.ladder, 1, rect, 1);
      expect(afterCosmetic.stats.missReason).toBe("hit");
      expect(afterCosmetic.layer).toBe(first.layer);
    });

    it("misses when the ladder changes over the same cells and rect: fills never survive a bounds change", () => {
      const fixture = makeFixture("memo-ladder", new HexGeometry(HEX_SIZE, "flat", { maxCol: 6, maxRow: 5 }));
      const rect = rectAroundRootCell(fixture, fixture.anchor.q, fixture.anchor.r);
      const wide = materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, 1);
      expect(wide.stats.missReason).toBe("no-entry");

      // Same cells array, same rect, same epoch: only the ladder (its root bounds) differs.
      const shrunk = createGeometryLadder(new HexGeometry(HEX_SIZE, "flat", { maxCol: 2, maxRow: 2 }));
      const narrow = materialiseLevelLayer(fixture.layer, shrunk, 1, rect, 1);
      expect(narrow.stats.missReason).toBe("no-entry");
      expect(narrow.layer).not.toBe(wide.layer);
      expect(narrow.stats.cells).toBeLessThan(wide.stats.cells);

      // Each ladder keeps its own memo; returning to the first one still hits.
      expect(materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, 1).stats.missReason).toBe("hit");
      expect(materialiseLevelLayer(fixture.layer, shrunk, 1, rect, 1).stats.missReason).toBe("hit");
    });

    it("keeps at most four entries per cells array, dropping the oldest", () => {
      const fixture = makeFixture("evict", new HexGeometry(HEX_SIZE, "flat", { maxCol: 6, maxRow: 5 }));
      const rect = rectAroundRootCell(fixture, fixture.anchor.q, fixture.anchor.r);

      const first = materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, 1);
      for (const epoch of [2, 3, 4, 5]) {
        materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, epoch);
      }

      // Epoch 1 was pushed out; epoch 5 is still resident.
      const evicted = materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, 1);
      expect(evicted.stats.missReason).toBe("key-changed");
      expect(evicted.layer).not.toBe(first.layer);

      const resident = materialiseLevelLayer(fixture.layer, fixture.ladder, 1, rect, 5);
      expect(resident.stats.missReason).toBe("hit");
    });
  });
});
