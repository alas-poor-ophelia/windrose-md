/**
 * exportOperations — kgc.40: when the export size cap pulls a deep export down
 * to level 0, the classic draw pass must not receive deep elements (it would
 * paint them at level-0 positions).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { App } from "obsidian";

import type { MapData } from "#types/core/map.types";
import type { MapObject } from "#types/objects/object.types";

const rendered: MapData[] = [];
const renderCalls: Array<Record<string, unknown>> = [];
vi.mock("../../../src/hooks/canvas/useCanvasRenderer", () => ({
  renderCanvas: (_c: unknown, _f: unknown, mapData: MapData, _g: unknown, _s: unknown, options: Record<string, unknown>) => {
    rendered.push(mapData);
    renderCalls.push(options);
  },
}));
vi.mock("../../../src/core/settingsAccessor", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveTheme: () => ({}),
}));

const { saveMapImageToVault } = await import("../../../src/persistence/exportOperations");
const { HexGeometry } = await import("../../../src/geometry/core/HexGeometry");
const { LADDER_DEFAULTS } = await import("../../../src/geometry/core/lattice");
const { makeLayer, makeMapData } = await import("../helpers/fixtures");

const fakeCanvas = () => ({
  width: 0,
  height: 0,
  getContext: () => ({ drawImage: () => {} }),
  toBlob: (cb: (b: Blob) => void) => cb(new Blob([])),
});

const app = {
  vault: { getAbstractFileByPath: () => null, createBinary: async () => {}, modifyBinary: async () => {} },
} as unknown as App;

const obj = (id: string, x: number, y: number, homeLevel?: number): MapObject =>
  ({ id, type: "entrance", position: { x, y }, size: { width: 1, height: 1 }, ...(homeLevel !== undefined ? { homeLevel } : {}) } as unknown as MapObject);

describe("export pulled to level 0 by the size cap (kgc.40)", () => {
  beforeEach(() => {
    rendered.length = 0;
    renderCalls.length = 0;
    (globalThis as Record<string, unknown>).activeWindow = { createEl: fakeCanvas };
  });
  afterEach(() => { delete (globalThis as Record<string, unknown>).activeWindow; });

  it("draws only the root object, not the homeLevel-2 one", async () => {
    const bounds = { maxCol: 400, maxRow: 400 };
    // Two far-apart root cells make the frame too large for a deep zoom: the
    // side cap clamps the zoom to 1, which activates level 0.
    const layer = makeLayer({
      cells: [{ q: 0, r: 0, color: "#fff" }, { q: 399, r: 399, color: "#fff" }] as never,
      objects: [obj("root", 3, 3), obj("deep", 40, 40, 2)],
    });
    const mapData = makeMapData({
      mapType: "hex", hexSize: 40, hexBounds: bounds, layers: [layer],
      lod: { m: LADDER_DEFAULTS.m, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel },
    } as Partial<MapData>);
    const geometry = new HexGeometry(40, "flat", bounds);

    const result = await saveMapImageToVault(app, mapData, geometry as never, { layers: [{ id: "layer-1", opacity: 1 }], visibility: null } as never, "out.png");
    expect(result).toEqual({ success: true, path: "out.png" });
    expect(renderCalls).toHaveLength(1);
    expect(renderCalls[0].ladder).toBeUndefined(); // classic path, level 0
    expect(rendered[0].layers[0].objects.map(o => o.id)).toEqual(["root"]);
    // The input map is untouched.
    expect(mapData.layers[0].objects).toHaveLength(2);
  });

  it("a ladder map whose only content is a root object with visibleLevels [1] still exports that object (no depth content, so no ladder and no level-0 filter)", async () => {
    const bounds = { maxCol: 20, maxRow: 20 };
    const rungOnly = { ...obj("rung-only", 3, 3), visibleLevels: [1] } as unknown as MapObject;
    const layer = makeLayer({ cells: [] as never, objects: [rungOnly] });
    const mapData = makeMapData({
      mapType: "hex", hexSize: 40, hexBounds: bounds, layers: [layer],
      lod: { m: LADDER_DEFAULTS.m, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel },
    } as Partial<MapData>);
    const geometry = new HexGeometry(40, "flat", bounds);

    const result = await saveMapImageToVault(app, mapData, geometry as never, { layers: [{ id: "layer-1", opacity: 1 }], visibility: null } as never, "out.png");
    expect(result).toEqual({ success: true, path: "out.png" });
    expect(renderCalls).toHaveLength(1);
    expect(renderCalls[0].ladder).toBeUndefined();
    expect(rendered[0].layers[0].objects.map(o => o.id)).toEqual(["rung-only"]);
  });
});
