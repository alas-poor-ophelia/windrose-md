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
import { makeLayer, makeMapData } from "../../helpers/fixtures";

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
});
