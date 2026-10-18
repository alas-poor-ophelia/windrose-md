/**
 * HexGeometry.drawCells: the classic per-vertex Path2D log stays exactly as it was, and the
 * string-built batch (MEM-12) is used only by rung geometries the materialiser opts in.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { createGeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import { materialiseLevelLayer } from "../../../../src/geometry/core/materialiseLevel";

import type { MapLayer } from "#types/core/map.types";

let log: string[] = [];

class RecordingPath2D {
  constructor(d?: string) {
    log.push(d === undefined ? "new Path2D()" : `new Path2D(${d})`);
  }
  moveTo(x: number, y: number): void {
    log.push(`moveTo(${x},${y})`);
  }
  lineTo(x: number, y: number): void {
    log.push(`lineTo(${x},${y})`);
  }
  closePath(): void {
    log.push("closePath()");
  }
}

function recordingCtx(): CanvasRenderingContext2D {
  return {
    set fillStyle(v: string) {
      log.push(`fillStyle=${v}`);
    },
    fill(): void {
      log.push("fill(path)");
    },
  } as unknown as CanvasRenderingContext2D;
}

const CELLS = [{ x: 0, y: 0 }, { x: 2, y: -1 }, { x: -3, y: 4 }];
const OFFSET_X = 37.25;
const OFFSET_Y = -12.5;
const ZOOM = 1.75;

beforeEach(() => {
  log = [];
  vi.stubGlobal("Path2D", RecordingPath2D);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HexGeometry.drawCells", () => {
  for (const orientation of ["flat", "pointy"] as const) {
    it(`${orientation}: classic drawCells call log unchanged`, () => {
      const geometry = new HexGeometry(40, orientation, { maxCol: 10, maxRow: 10 });
      geometry.drawCells(recordingCtx(), CELLS, OFFSET_X, OFFSET_Y, ZOOM, "#ff0000");

      // The pre-MEM-12 sequence, derived independently from the public vertex math.
      const expected: string[] = ["new Path2D()"];
      for (const cell of CELLS) {
        const screen = geometry.getHexVertices(cell.x, cell.y)
          .map((v) => geometry.worldToScreen(v.worldX, v.worldY, OFFSET_X, OFFSET_Y, ZOOM));
        expected.push(`moveTo(${screen[0].screenX},${screen[0].screenY})`);
        for (let i = 1; i < screen.length; i++) expected.push(`lineTo(${screen[i].screenX},${screen[i].screenY})`);
        expected.push("closePath()");
      }
      expected.push("fillStyle=#ff0000", "fill(path)");
      expect(log).toEqual(expected);
    });

    it(`${orientation}: batched fills build one Path2D from a string with the same vertices`, () => {
      const geometry = new HexGeometry(40, orientation, null);
      geometry.batchedFills = true;
      geometry.drawCells(recordingCtx(), CELLS, OFFSET_X, OFFSET_Y, ZOOM, "#00ff00");

      const built = log.filter((l) => l.startsWith("new Path2D("));
      expect(built).toHaveLength(1);
      expect(log.filter((l) => !l.startsWith("new Path2D("))).toEqual(["fillStyle=#00ff00", "fill(path)"]);
      expect(log.some((l) => l.startsWith("moveTo") || l.startsWith("lineTo"))).toBe(false);
      const d = built[0].slice("new Path2D(".length, -1);
      const subpaths = d.split("Z").filter((p) => p.length > 0);
      expect(subpaths).toHaveLength(CELLS.length);
      subpaths.forEach((sub, i) => {
        const nums = (sub.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
        const screen = geometry.getHexVertices(CELLS[i].x, CELLS[i].y)
          .map((v) => geometry.worldToScreen(v.worldX, v.worldY, OFFSET_X, OFFSET_Y, ZOOM));
        expect(nums).toHaveLength(12);
        screen.forEach((p, k) => {
          expect(nums[2 * k]).toBeCloseTo(p.screenX, 3);
          expect(nums[2 * k + 1]).toBeCloseTo(p.screenY, 3);
        });
      });
    });
  }

  it("the materialiser opts its rung geometry in and leaves the root alone", () => {
    const root = new HexGeometry(40, "flat", { maxCol: 4, maxRow: 4 });
    const ladder = createGeometryLadder(root);
    const layer = { id: "l", cells: [{ q: 1, r: 1, color: "#123456" }], curves: [], edges: [], objects: [], textLabels: [], tiles: [], wallPaths: [], terrainStrokes: [], fogOfWar: null } as unknown as MapLayer;
    materialiseLevelLayer(layer, ladder, 1, { x0: 0, y0: 0, x1: 200, y1: 200 }, 1);
    expect(ladder.geometryForLevel(1).batchedFills).toBe(true);
    expect(root.batchedFills).toBe(false);
    expect(ladder.geometryForLevel(0).batchedFills).toBe(false);
  });
});
