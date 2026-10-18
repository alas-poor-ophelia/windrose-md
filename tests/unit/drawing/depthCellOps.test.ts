/**
 * depthCellOps: next rung content after paint / erase at depth, the per-level
 * hit-test, and erase-at-depth isolation (design section 19 item 4).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const notices = vi.hoisted(() => ({ messages: [] as string[] }));
vi.mock("obsidian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("obsidian")>();
  return { ...actual, Notice: class { constructor(message: string) { notices.messages.push(message); } } };
});

import type { Cell, HexCell } from "../../../types/core/cell.types";
import type { MapLayer } from "../../../types/core/map.types";
import {
  withCellPainted, withCellErased, withCellsPainted, withCellsErased,
  levelCellAtWorld, depthRefusalMessage, showDepthRefusal, resetDepthRefusalNotices,
  drawnObjectAt, removeDrawnObjectsInRect
} from "../../../src/drawing/depthCellOps";
import { createGeometryLadder } from "../../../src/geometry/core/createGeometryLadder";
import { HexGeometry } from "../../../src/geometry/core/HexGeometry";
import { authoredCells, setLevelCells } from "../../../src/persistence/layerAccessor";

const cell = (q: number, r: number, color = "#111111", opacity = 1): HexCell => ({ q, r, color, opacity });

describe("withCellPainted", () => {
  it("appends a new cell", () => {
    const cells: Cell[] = [cell(0, 0)];
    expect(withCellPainted(cells, 1, 2, "#222222", 0.5)).toEqual([cell(0, 0), cell(1, 2, "#222222", 0.5)]);
  });

  it("recolours an existing cell without growing the rung", () => {
    const cells: Cell[] = [cell(0, 0), cell(1, 1)];
    const next = withCellPainted(cells, 1, 1, "#ff0000", 1);
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual(cell(1, 1, "#ff0000"));
    expect(cells[1]).toEqual(cell(1, 1));
  });

  it("returns the same reference when nothing changes", () => {
    const cells: Cell[] = [cell(3, -1)];
    expect(withCellPainted(cells, 3, -1, "#111111", 1)).toBe(cells);
  });
});

describe("withCellErased", () => {
  it("removes only the target cell", () => {
    const cells: Cell[] = [cell(0, 0), cell(1, 0), cell(2, 0)];
    expect(withCellErased(cells, 1, 0)).toEqual([cell(0, 0), cell(2, 0)]);
  });

  it("returns the same reference when the cell is not authored", () => {
    const cells: Cell[] = [cell(0, 0)];
    expect(withCellErased(cells, 5, 5)).toBe(cells);
  });
});

describe("withCellsPainted / withCellsErased (shape tools)", () => {
  it("paints a batch, deduplicating coordinates", () => {
    const next = withCellsPainted([cell(0, 0)], [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }], "#abcdef", 1);
    expect(next).toEqual([cell(0, 0, "#abcdef"), cell(1, 0, "#abcdef")]);
  });

  it("is a same-reference no-op when every cell already matches", () => {
    const cells: Cell[] = [cell(0, 0)];
    expect(withCellsPainted(cells, [{ x: 0, y: 0 }], "#111111", 1)).toBe(cells);
    expect(withCellsPainted(cells, [], "#000000", 1)).toBe(cells);
  });

  it("erases a batch and is a no-op when nothing matches", () => {
    const cells: Cell[] = [cell(0, 0), cell(1, 0), cell(2, 0)];
    expect(withCellsErased(cells, [{ x: 0, y: 0 }, { x: 2, y: 0 }])).toEqual([cell(1, 0)]);
    expect(withCellsErased(cells, [{ x: 9, y: 9 }])).toBe(cells);
  });
});

describe("erase at depth touches only the rung (section 19 item 4)", () => {
  it("leaves layer.cells, other rungs and every other layer array untouched", () => {
    const base = {
      id: "L1", name: "Layer", order: 0, visible: true,
      cells: [cell(0, 0)], curves: [], objects: [], textLabels: [], edges: []
    } as unknown as MapLayer;
    const mapData = { layers: [base], activeLayerId: "L1" } as unknown as Parameters<typeof setLevelCells>[0];
    const withRungs = setLevelCells(setLevelCells(mapData, "L1", 1, [cell(4, 4)]), "L1", 2, [cell(0, 0), cell(7, 7)]);
    const layer = withRungs.layers[0];

    const nextRung = withCellErased(authoredCells(layer, 2), 0, 0);
    const erased = setLevelCells(withRungs, "L1", 2, nextRung).layers[0];

    expect(authoredCells(erased, 2)).toEqual([cell(7, 7)]);
    expect(erased.cells).toBe(layer.cells);
    expect(authoredCells(erased, 1)).toBe(authoredCells(layer, 1));
    expect(erased.objects).toBe(layer.objects);
    expect(erased.curves).toBe(layer.curves);
    expect(erased.textLabels).toBe(layer.textLabels);
  });
});

describe("levelCellAtWorld", () => {
  const root = new HexGeometry(80, "flat", { maxCol: 10, maxRow: 10 });
  const ladder = createGeometryLadder(root, { m: 4, minCellPx: 32, maxLevel: 3 });
  const points: Array<[number, number]> = [[0, 0], [37.5, -12.25], [410, 233], [-95, 612.5]];

  it("equals the root geometry (screenToGrid's answer) at level 0", () => {
    for (const [wx, wy] of points) {
      expect(levelCellAtWorld(ladder, root, 0, wx, wy)).toEqual(root.worldToGrid(wx, wy));
      expect(levelCellAtWorld(null, root, 2, wx, wy)).toEqual(root.worldToGrid(wx, wy));
    }
  });

  it("uses the rung's geometry above level 0", () => {
    for (const [wx, wy] of points) {
      expect(levelCellAtWorld(ladder, root, 2, wx, wy)).toEqual(ladder.geometryForLevel(2).worldToGrid(wx, wy));
    }
  });
});

describe("depthRefusalMessage", () => {
  it("names the budget refusal in sentence case", () => {
    expect(depthRefusalMessage("over-budget")).toBe("Cannot edit this level: over the map's size budget.");
    expect(depthRefusalMessage("too-many-cells")).toMatch(/^Cannot edit this level: /);
    expect(depthRefusalMessage("unknown-layer")).toMatch(/^Cannot edit this level: /);
  });
});

describe("showDepthRefusal", () => {
  beforeEach(() => { notices.messages.length = 0; resetDepthRefusalNotices(); });

  it("shows one Notice per reason inside the dedupe window", () => {
    showDepthRefusal("over-budget", 1000);
    showDepthRefusal("over-budget", 2000);
    showDepthRefusal("quarantined", 2100);
    expect(notices.messages).toHaveLength(2);
  });

  it("shows the reason again after the window", () => {
    showDepthRefusal("over-budget", 1000);
    showDepthRefusal("over-budget", 9000);
    expect(notices.messages).toHaveLength(2);
  });
});

describe("level-0 erase of drawn objects (INT-08)", () => {
  const root = new HexGeometry(80, "flat", null);
  const ladder = createGeometryLadder(root, { m: 4, minCellPx: 64, maxLevel: 3 });
  const mapData = { orientation: "flat", viewState: { zoom: 1 } } as never;
  const home0 = { id: "a", position: { x: 2, y: 2 }, size: { width: 1, height: 1 }, type: "x" } as never;
  const home1 = { id: "b", position: { x: 9, y: 9 }, size: { width: 1, height: 1 }, type: "x", homeLevel: 1 } as never;
  const home3 = { id: "c", position: { x: 3, y: 3 }, size: { width: 1, height: 1 }, type: "x", homeLevel: 3 } as never;

  it("removes drawn objects in the rectangle and keeps undrawn ones", () => {
    const all = [home0, home1, home3];
    const out = removeDrawnObjectsInRect(all, ladder, mapData, -1e6, -1e6, 1e6, 1e6);
    const ids = out.map((o: { id: string }) => o.id);
    expect(ids).not.toContain("a");
    expect(ids).not.toContain("b"); // home 1 is drawn one rung above its home
    expect(ids).toContain("c"); // homed three rungs down: not drawn at level 0
  });

  it("drawnObjectAt finds nothing in empty space", () => {
    expect(drawnObjectAt([home0], ladder, mapData, -5000, -5000)).toBeNull();
  });
});
