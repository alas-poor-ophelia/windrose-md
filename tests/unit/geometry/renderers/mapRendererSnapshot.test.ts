/**
 * Call-sequence snapshot of the full map render (renderCanvas).
 *
 * Guards the wave-8 move of the pure renderer out of useCanvasRenderer.ts
 * into src/geometry/renderers/: the recorded 2D-context call sequence for a
 * small grid map and a small rotated hex map must stay byte-identical.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type { MapData } from "#types/core/map.types";
import type { RendererTheme } from "#types/hooks/canvasRenderer.types";
import { renderCanvas } from "../../../../src/hooks/canvas/useCanvasRenderer";
import { createGeometry } from "../../../../src/geometry/core/createGeometry";
import { createGeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { LADDER_DEFAULTS } from "../../../../src/geometry/core/lattice";
import { makeLayer, makeMapData } from "../../helpers/fixtures";

// The lattice-ladder capability, switchable per test (TEST-05 flag on/off oracle).
const flags = vi.hoisted(() => ({ lodLadder: false }));
vi.mock("../../../../src/core/settingsAccessor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/core/settingsAccessor")>();
  return { ...actual, getSettings: () => ({ ...actual.getSettings(), lodLadder: flags.lodLadder }) };
});

type Log = string[];

function fmt(v: unknown): string {
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  if (typeof v === "string") return JSON.stringify(v);
  if (v == null) return String(v);
  if (typeof v === "object" && "__tag" in v) return String((v as { __tag: string }).__tag);
  if (Array.isArray(v)) return `[${v.map(fmt).join(",")}]`;
  return typeof v;
}

/** A 2D context that records every method call and property write. */
function recordingCanvas(tag: string, width: number, height: number, log: Log): HTMLCanvasElement {
  const canvas: Record<string, unknown> = { width, height, __tag: tag };
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop === "canvas") return canvas;
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        log.push(`${tag}.${prop}(${args.map(fmt).join(", ")})`);
        if (prop === "measureText") return { width: 10 };
        if (prop.startsWith("create")) return { __tag: `${prop}#`, addColorStop: () => undefined };
        if (prop === "getImageData") return { data: new Uint8ClampedArray(4) };
        return undefined;
      };
    },
    set(target, prop, value) {
      if (typeof prop === "string") {
        log.push(`${tag}.${prop}=${fmt(value)}`);
        target[prop] = value;
      }
      return true;
    },
  });
  canvas.getContext = () => ctx;
  return canvas as unknown as HTMLCanvasElement;
}

/** Path2D stand-in (node has none): records path ops into the active log. */
let pathLog: Log = [];
let pathSeq = 0;
class RecordingPath2D {
  readonly __tag: string;
  constructor() {
    this.__tag = `path${pathSeq++}`;
    const tag = this.__tag;
    return new Proxy(this, {
      get(target, prop) {
        if (prop === "__tag") return tag;
        if (typeof prop !== "string") return undefined;
        return (...args: unknown[]) => {
          pathLog.push(`${tag}.${prop}(${args.map(fmt).join(", ")})`);
        };
      },
    });
  }
}

const THEME: RendererTheme = {
  grid: { background: "#101010", lines: "#333333", lineWidth: 1 },
  cells: { border: "#aa8800", borderWidth: 2 },
};

function gridFixture(): MapData {
  return makeMapData({
    mapType: "grid",
    gridSize: 32,
    northDirection: 0,
    dimensions: { width: 20, height: 20 },
    viewState: { zoom: 1, center: { x: 5, y: 5 } },
    layers: [makeLayer({
      cells: [
        { x: 3, y: 3, color: "#ff0000" },
        { x: 4, y: 3, color: "#ff0000" },
        { x: 4, y: 4, color: "#00ff00", opacity: 0.5 },
        { x: 500, y: 500, color: "#0000ff" },
      ],
      edges: [{ x: 3, y: 3, side: "right", color: "#ffffff" }],
    } as never)],
  } as never);
}

function hexFixture(): MapData {
  return makeMapData({
    mapType: "hex",
    hexSize: 40,
    orientation: "flat",
    northDirection: 30,
    hexBounds: { maxCol: 10, maxRow: 10 },
    viewState: { zoom: 1.5, center: { x: 100, y: 80 } },
    layers: [makeLayer({
      cells: [
        { q: 0, r: 0, color: "#ff0000" },
        { q: 1, r: 0, color: "#ff0000" },
        { q: 2, r: -1, color: "#00ffff" },
      ],
    } as never)],
    subHexMaps: {
      "1,0": { mapData: { layers: [makeLayer({ cells: [{ q: 0, r: 0, color: "#123456" }] } as never)] } },
    },
  } as never);
}

/**
 * Classic hex map with every element kind the ladder touched: an object, a text
 * label, a tile, a fogged cell, a second layer and a sub-hex child (which keeps
 * the map classic even with the capability on).
 */
function richClassicFixture(): MapData {
  return makeMapData({
    mapType: "hex",
    hexSize: 40,
    orientation: "flat",
    northDirection: 0,
    hexBounds: { maxCol: 10, maxRow: 10 },
    viewState: { zoom: 1, center: { x: 60, y: 40 } },
    activeLayerId: "layer-1",
    layers: [
      makeLayer({
        cells: [
          { q: 0, r: 0, color: "#ff0000" },
          { q: 1, r: 0, color: "#00ff00" },
          { q: 1, r: 1, color: "#0000ff" },
        ],
        objects: [{ id: "o1", type: "entrance", position: { x: 1, y: 0 }, size: { width: 1, height: 1 } }],
        textLabels: [{ id: "t1", position: { x: 60, y: 40 }, content: "Keep", fontSize: 16, fontFace: "sans-serif", color: "#ffffff" }],
        tiles: [{ col: 0, row: 0, tilesetId: "ts", tileId: "floor" }],
        fogOfWar: { enabled: true, foggedCells: [{ col: 1, row: 1 }], texture: null },
      } as never),
      makeLayer({ id: "layer-2", name: "Layer 2", order: 1, cells: [{ q: 2, r: 0, color: "#ffff00" }] } as never),
    ],
    subHexMaps: {
      "1,0": { mapData: { layers: [makeLayer({ cells: [{ q: 0, r: 0, color: "#123456" }] } as never)] } },
    },
  } as never);
}

describe("renderCanvas call-sequence snapshot", () => {
  let offscreenLog: Log;

  beforeEach(() => {
    offscreenLog = [];
    pathLog = [];
    pathSeq = 0;
    vi.stubGlobal("Path2D", RecordingPath2D);
    vi.stubGlobal("activeDocument", { body: { classList: { contains: () => false } } });
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("activeWindow", {
      createEl: () => recordingCanvas("off", 0, 0, offscreenLog),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function render(mapData: MapData, extra: Record<string, unknown> = {}): { live: Log; off: Log; paths: Log } {
    const live: Log = [];
    const canvas = recordingCanvas("live", 400, 300, live);
    renderCanvas(canvas, null, mapData, createGeometry(mapData), [], {
      theme: THEME,
      ...extra,
    });
    return { live, off: offscreenLog, paths: pathLog };
  }

  it("grid map (unrotated, static cache path)", () => {
    const { live, off, paths } = render(gridFixture());
    expect(live.length).toBeGreaterThan(5);
    expect(live[0]).toBe('live.fillStyle="#101010"');
    expect(live.some(l => l.startsWith("live.drawImage(off"))).toBe(true);
    expect(off.length).toBeGreaterThan(20);
    expect({ live, off, paths }).toMatchSnapshot();
  });

  it("hex map (rotated, sub-hex indicator, empty-slot marker)", () => {
    const { live, off, paths } = render(hexFixture(), { adjacentEmptySlots: [{ dq: 1, dr: 0 }] });
    expect(live.some(l => l.startsWith("live.rotate("))).toBe(true);
    expect(live.some(l => l.startsWith("live.drawImage(off"))).toBe(true);
    expect(off.some(l => l.startsWith("off.arc("))).toBe(true);
    expect({ live, off, paths }).toMatchSnapshot();
  });

  it("classic hex map with object, label, tile, fog and a second layer", () => {
    const { live, off, paths } = render(richClassicFixture());
    expect([...live, ...off].some(l => l.includes("Keep"))).toBe(true);
    expect({ live, off, paths }).toMatchSnapshot();
  });

  describe("classic dormancy: capability on and off draw identical frames (TEST-05)", () => {
    const fixtures: Array<[string, () => MapData, Record<string, unknown>]> = [
      ["grid", gridFixture, {}],
      ["rotated hex", hexFixture, { adjacentEmptySlots: [{ dq: 1, dr: 0 }] }],
      ["rich hex", richClassicFixture, {}],
    ];

    afterEach(() => {
      flags.lodLadder = false;
    });

    for (const [name, make, extra] of fixtures) {
      it(`${name}: flag on equals flag off`, () => {
        flags.lodLadder = false;
        offscreenLog.length = 0;
        const off = render(make(), extra);
        const offLogs = { live: [...off.live], off: [...off.off], paths: [...off.paths] };

        flags.lodLadder = true;
        offscreenLog.length = 0;
        pathLog = [];
        pathSeq = 0;
        const on = render(make(), extra);
        expect(offLogs.live.length).toBeGreaterThan(5);
        expect({ live: on.live, off: on.off, paths: on.paths }).toEqual(offLogs);
      });
    }
  });

  // TEST-04: a ladder frame (the export path: ladder + level + bypassSurfaceCache)
  // at the deepest rung, with an object pinned to another rung and a fogged root hex.
  describe("ladder frame at depth: visibleLevels and rung fog (TEST-04)", () => {
    const LEVEL = 2;
    const LABEL_AT = { x: 60, y: 40 };

    function depthFixture(over: { pinned?: number[]; fogged?: boolean; pinnedLabel?: boolean }): MapData {
      const deepLabel = (id: string, content: string, visibleLevels?: number[]) => ({
        id, position: LABEL_AT, content, fontSize: 24, fontFace: "sans-serif", color: "#ffffff",
        homeLevel: LEVEL, depthMode: "persist", ...(visibleLevels ? { visibleLevels } : {}),
      });
      return makeMapData({
        mapType: "hex",
        hexSize: 40,
        orientation: "flat",
        northDirection: 0,
        hexBounds: { maxCol: 10, maxRow: 10 },
        viewState: { zoom: 1, center: { x: 60, y: 40 } },
        lod: { m: LADDER_DEFAULTS.m, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel },
        layers: [makeLayer({
          cells: [{ q: 0, r: 0, color: "#ff0000" }],
          textLabels: [
            deepLabel("auto", "AUTO-LABEL"),
            ...(over.pinnedLabel === false ? [] : [deepLabel("pin", "PINNED-LABEL", over.pinned ?? [1])]),
          ],
          fogOfWar: { enabled: true, foggedCells: over.fogged === true ? [{ col: 0, row: 0 }] : [], texture: null },
        } as never)],
      } as never);
    }

    function renderDepth(mapData: MapData): Log {
      const geometry = createGeometry(mapData) as HexGeometry;
      const ladder = createGeometryLadder(geometry, { ...LADDER_DEFAULTS });
      const live: Log = [];
      pathLog = [];
      pathSeq = 0;
      const canvas = recordingCanvas("live", 800, 600, live);
      renderCanvas(canvas, null, mapData, geometry, [], {
        theme: THEME, ladder, level: LEVEL, bypassSurfaceCache: true,
      });
      return live;
    }

    const textDrawn = (log: Log, text: string) => log.some(l => l.includes(JSON.stringify(text)));

    it("omits an element pinned to another rung and draws the unpinned one", () => {
      const log = renderDepth(depthFixture({ pinned: [1] }));
      expect(textDrawn(log, "AUTO-LABEL")).toBe(true);
      expect(textDrawn(log, "PINNED-LABEL")).toBe(false);
    });

    it("draws the pinned element once its set includes the render rung", () => {
      const log = renderDepth(depthFixture({ pinned: [1, LEVEL] }));
      expect(textDrawn(log, "PINNED-LABEL")).toBe(true);
    });

    it("pinned-away elements leave the frame identical to a map without them", () => {
      expect(renderDepth(depthFixture({ pinned: [1] }))).toEqual(renderDepth(depthFixture({ pinnedLabel: false })));
    });

    it("a fogged root hex changes the frame (fog applies to depth content)", () => {
      const clear = renderDepth(depthFixture({ fogged: false }));
      const fogged = renderDepth(depthFixture({ fogged: true }));
      expect(fogged).not.toEqual(clear);
    });
  });
});
