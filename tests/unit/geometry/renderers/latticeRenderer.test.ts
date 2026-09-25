/**
 * latticeRenderer Unit Tests
 *
 * Design: .claude/lod-rd/06-integration-design.md section 3.3.
 *  - the enumerator's axial -> world mapping IS HexGeometry.hexToWorld, both orientations
 *  - EDGE_NEI is proven from getHexVertices' corner order, not assumed
 *  - edge ownership: every interior edge stroked exactly once, silhouette closed
 *  - the 3 px moire floor
 *  - the footprint clip: none deep inside an unbounded map, exactly one at an edge, cached
 *  - drawLadderLattice = two district passes under one clip + the active level solid
 */

import { describe, it, expect, vi } from "vitest";

import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { createGeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import type { GeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import {
  createLatticeClipCache,
  forEachCellInWorldRect,
  strokeLattice,
  withMapClip,
  drawLadderLattice
} from "../../../../src/geometry/renderers/latticeRenderer";
import type { LatticeView } from "../../../../src/geometry/renderers/latticeRenderer";

// Path2D does not exist in node. Install a recording stub BEFORE the module under test is
// imported (vi.hoisted runs above the import block) so `new Path2D()` resolves.
const pathStats = vi.hoisted(() => {
  const stats = { constructed: 0 };
  class Path2DStub {
    ops: string[] = [];
    constructor() {
      stats.constructed += 1;
    }
    moveTo(x: number, y: number): void {
      this.ops.push(`moveTo:${x},${y}`);
    }
    lineTo(x: number, y: number): void {
      this.ops.push(`lineTo:${x},${y}`);
    }
    closePath(): void {
      this.ops.push("closePath");
    }
  }
  (globalThis as unknown as { Path2D: unknown }).Path2D = Path2DStub;
  return stats;
});

const ORIENTATIONS: ReadonlyArray<"flat" | "pointy"> = ["flat", "pointy"];
const HEX_SIZE = 80;

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

interface StrokePass {
  alpha: number;
  lineWidth: number;
  colour: string;
  segments: number;
}

interface RecordingCtx {
  ctx: CanvasRenderingContext2D;
  calls: string[];
  segments: Segment[];
  passes: StrokePass[];
}

function createRecordingCtx(): RecordingCtx {
  const calls: string[] = [];
  const segments: Segment[] = [];
  const passes: StrokePass[] = [];
  let penX = 0;
  let penY = 0;
  let passStart = 0;

  const stub = {
    globalAlpha: 1,
    strokeStyle: "" as string,
    lineWidth: 1,
    save(): void {
      calls.push("save");
    },
    restore(): void {
      calls.push("restore");
    },
    beginPath(): void {
      calls.push("beginPath");
      passStart = segments.length;
    },
    moveTo(x: number, y: number): void {
      calls.push("moveTo");
      penX = x;
      penY = y;
    },
    lineTo(x: number, y: number): void {
      calls.push("lineTo");
      segments.push({ ax: penX, ay: penY, bx: x, by: y });
      penX = x;
      penY = y;
    },
    stroke(): void {
      calls.push("stroke");
      passes.push({
        alpha: stub.globalAlpha,
        lineWidth: stub.lineWidth,
        colour: stub.strokeStyle,
        segments: segments.length - passStart
      });
    },
    clip(): void {
      calls.push("clip");
    },
    translate(): void {
      calls.push("translate");
    },
    scale(): void {
      calls.push("scale");
    },
    getTransform(): unknown {
      calls.push("getTransform");
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    },
    setTransform(): void {
      calls.push("setTransform");
    }
  };

  return { ctx: stub as unknown as CanvasRenderingContext2D, calls, segments, passes };
}

/** Quantise to 1e-6, folding -0 into 0 so mirrored endpoints key identically. */
function q6(n: number): string {
  const v = Math.round(n * 1e6) / 1e6;
  return (v === 0 ? 0 : v).toFixed(6);
}

/** An unordered endpoint pair. */
function segKey(s: Segment): string {
  const a = `${q6(s.ax)},${q6(s.ay)}`;
  const b = `${q6(s.bx)},${q6(s.by)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function rectRoot(orientation: "flat" | "pointy"): HexGeometry {
  return new HexGeometry(HEX_SIZE, orientation, { maxCol: 8, maxRow: 6 });
}

function radialRoot(orientation: "flat" | "pointy"): HexGeometry {
  return new HexGeometry(HEX_SIZE, orientation, { maxCol: 0, maxRow: 0, maxRing: 3 });
}

const ROOT_KINDS: ReadonlyArray<{ name: string; make: (o: "flat" | "pointy") => HexGeometry }> = [
  { name: "rect 8x6", make: rectRoot },
  { name: "radial ring 3", make: radialRoot }
];

/** A view wide enough that the whole test map plus a margin sits inside the world rect. */
const WHOLE_MAP_VIEW: LatticeView = {
  offsetX: 500,
  offsetY: 500,
  zoom: 1,
  width: 2400,
  height: 2400
};

function viewWorldRect(view: LatticeView): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: -view.offsetX / view.zoom,
    y0: -view.offsetY / view.zoom,
    x1: (view.width - view.offsetX) / view.zoom,
    y1: (view.height - view.offsetY) / view.zoom
  };
}

/**
 * Every edge of every existing level-0 cell, deduped: interior edges (shared by two cells)
 * plus the map silhouette. Endpoints are built the way the renderer builds them so the
 * comparison is about edge OWNERSHIP, not about float association order.
 */
function expectedEdgeKeys(ladder: GeometryLadder, view: LatticeView): Set<string> {
  const corners = ladder.root.getHexVertices(0, 0);
  const rect = viewWorldRect(view);
  const keys = new Set<string>();
  forEachCellInWorldRect(
    ladder.root.orientation,
    ladder.cellSizeAt(0),
    rect.x0,
    rect.y0,
    rect.x1,
    rect.y1,
    (cq, cr, wx, wy) => {
      if (!ladder.existsAt(0, cq, cr)) return;
      const sx = view.offsetX + wx * view.zoom;
      const sy = view.offsetY + wy * view.zoom;
      for (let k = 0; k < 6; k++) {
        const a = corners[k];
        const b = corners[(k + 1) % 6];
        keys.add(
          segKey({
            ax: sx + a.worldX * view.zoom,
            ay: sy + a.worldY * view.zoom,
            bx: sx + b.worldX * view.zoom,
            by: sy + b.worldY * view.zoom
          })
        );
      }
    }
  );
  return keys;
}

describe("latticeRenderer: enumerator", () => {
  it.each(ORIENTATIONS)("%s: cell centres match HexGeometry.hexToWorld", (orientation) => {
    const geometry = new HexGeometry(HEX_SIZE, orientation, null);
    let checked = 0;
    forEachCellInWorldRect(orientation, HEX_SIZE, -400, -400, 400, 400, (cq, cr, wx, wy) => {
      const expected = geometry.hexToWorld(cq, cr);
      expect(wx).toBeCloseTo(expected.worldX, 9);
      expect(wy).toBeCloseTo(expected.worldY, 9);
      checked += 1;
    });
    expect(checked).toBeGreaterThan(20);
  });

  it.each(ORIENTATIONS)("%s: does not enumerate cells far outside the rect", (orientation) => {
    const rect = { x0: 0, y0: 0, x1: 240, y1: 240 };
    const slack = 2 * HEX_SIZE * 2;
    let count = 0;
    forEachCellInWorldRect(
      orientation,
      HEX_SIZE,
      rect.x0,
      rect.y0,
      rect.x1,
      rect.y1,
      (_q, _r, wx, wy) => {
        count += 1;
        expect(wx).toBeGreaterThanOrEqual(rect.x0 - slack);
        expect(wx).toBeLessThanOrEqual(rect.x1 + slack);
        expect(wy).toBeGreaterThanOrEqual(rect.y0 - slack);
        expect(wy).toBeLessThanOrEqual(rect.y1 + slack);
      }
    );
    // 240x240 world px at hexSize 80 is a handful of cells plus a one-cell pad ring.
    expect(count).toBeGreaterThan(4);
    expect(count).toBeLessThan(60);
  });
});

describe("latticeRenderer: EDGE_NEI", () => {
  it.each(ORIENTATIONS)("%s: edge k faces the neighbour that shares its endpoints", (orientation) => {
    const geometry = new HexGeometry(HEX_SIZE, orientation, null);
    const expectedTable: ReadonlyArray<readonly [number, number]> =
      orientation === "pointy"
        ? [
            [0, 1],
            [-1, 1],
            [-1, 0],
            [0, -1],
            [1, -1],
            [1, 0]
          ]
        : [
            [1, 0],
            [0, 1],
            [-1, 1],
            [-1, 0],
            [0, -1],
            [1, -1]
          ];
    const ring: ReadonlyArray<readonly [number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1]
    ];

    for (const [cq, cr] of [
      [0, 0],
      [3, -2],
      [-1, 4]
    ] as ReadonlyArray<readonly [number, number]>) {
      const own = geometry.getHexVertices(cq, cr);
      for (let k = 0; k < 6; k++) {
        const a = own[k];
        const b = own[(k + 1) % 6];
        const wanted = new Set([
          `${q6(a.worldX)},${q6(a.worldY)}`,
          `${q6(b.worldX)},${q6(b.worldY)}`
        ]);
        const matches = ring.filter(([dq, dr]) => {
          const theirs = geometry.getHexVertices(cq + dq, cr + dr);
          const have = new Set(theirs.map((v) => `${q6(v.worldX)},${q6(v.worldY)}`));
          return [...wanted].every((key) => have.has(key));
        });
        expect(matches).toHaveLength(1);
        expect(matches[0]).toEqual(expectedTable[k]);
      }
    }
  });
});

describe("latticeRenderer: strokeLattice edge ownership", () => {
  for (const orientation of ORIENTATIONS) {
    for (const kind of ROOT_KINDS) {
      it(`${orientation} / ${kind.name}: every edge stroked exactly once, silhouette closed`, () => {
        const ladder = createGeometryLadder(kind.make(orientation));
        const rec = createRecordingCtx();
        strokeLattice(rec.ctx, ladder, 0, WHOLE_MAP_VIEW, {
          alpha: 1,
          width: 1,
          colour: "#000"
        });

        const keys = rec.segments.map(segKey);
        const unique = new Set(keys);
        const duplicates = keys.length - unique.size;
        expect(duplicates).toBe(0);

        const expected = expectedEdgeKeys(ladder, WHOLE_MAP_VIEW);
        expect(expected.size).toBeGreaterThan(20);
        // every interior AND boundary edge of the drawn map is present, and nothing else
        expect([...expected].filter((k) => !unique.has(k))).toEqual([]);
        expect([...unique].filter((k) => !expected.has(k))).toEqual([]);
        expect(rec.passes).toHaveLength(1);
      });
    }
  }

  it.each(ORIENTATIONS)("%s: strokes nothing below the 3 px moire floor", (orientation) => {
    const ladder = createGeometryLadder(rectRoot(orientation));
    const rec = createRecordingCtx();
    // 2 * 80 * 0.01 = 1.6 px, under the floor
    strokeLattice(
      rec.ctx,
      ladder,
      0,
      { offsetX: 0, offsetY: 0, zoom: 0.01, width: 1200, height: 800 },
      { alpha: 1, width: 1, colour: "#000" }
    );
    expect(rec.segments).toEqual([]);
    expect(rec.calls).toEqual([]);
  });
});

describe("latticeRenderer: withMapClip", () => {
  const edgeView: LatticeView = {
    offsetX: 150,
    offsetY: 150,
    zoom: 1,
    width: 300,
    height: 300
  };

  it.each(ORIENTATIONS)("%s: no clip deep inside an unbounded map", (orientation) => {
    const ladder = createGeometryLadder(new HexGeometry(HEX_SIZE, orientation, null));
    const rec = createRecordingCtx();
    let ran = 0;
    withMapClip(rec.ctx, ladder, 0, edgeView, 0, createLatticeClipCache(), () => {
      ran += 1;
    });
    expect(ran).toBe(1);
    expect(rec.calls).not.toContain("clip");
    expect(rec.calls).not.toContain("save");
  });

  it.each(ORIENTATIONS)("%s: exactly one clip at a bounded map's edge, cached on reuse", (orientation) => {
    const ladder = createGeometryLadder(rectRoot(orientation));
    const cache = createLatticeClipCache();
    const rec = createRecordingCtx();

    const before = pathStats.constructed;
    withMapClip(rec.ctx, ladder, 0, edgeView, 0, cache, () => undefined);
    expect(rec.calls.filter((c) => c === "clip")).toHaveLength(1);
    expect(pathStats.constructed).toBe(before + 1);
    // world-space clip, then the base transform handed straight back
    expect(rec.calls).toEqual([
      "save",
      "getTransform",
      "translate",
      "scale",
      "clip",
      "setTransform",
      "restore"
    ]);

    const firstEntry = cache.entry;
    expect(firstEntry).not.toBeNull();

    const rec2 = createRecordingCtx();
    withMapClip(rec2.ctx, ladder, 0, edgeView, 0, cache, () => undefined);
    expect(rec2.calls.filter((c) => c === "clip")).toHaveLength(1);
    // reused: no new Path2D, same cache entry object
    expect(pathStats.constructed).toBe(before + 1);
    expect(cache.entry).toBe(firstEntry);

    // a bumped epoch invalidates it
    withMapClip(rec2.ctx, ladder, 0, edgeView, 1, cache, () => undefined);
    expect(pathStats.constructed).toBe(before + 2);
  });
});

describe("latticeRenderer: drawLadderLattice", () => {
  it.each(ORIENTATIONS)("%s: at the root there is no district pass and no clip: nothing coarser than level 0 is ever stroked", (orientation) => {
    const ladder = createGeometryLadder(rectRoot(orientation));
    const rec = createRecordingCtx();
    drawLadderLattice(
      rec.ctx,
      ladder,
      0,
      { offsetX: 150, offsetY: 150, zoom: 1, width: 300, height: 300 },
      0,
      createLatticeClipCache(),
      { active: "rgba(8,11,16,0.55)", district: "rgba(232,216,168,0.9)" }
    );
    expect(rec.passes).toHaveLength(1);
    expect(rec.passes[0].alpha).toBe(1);
    expect(rec.calls.filter((c) => c === "clip")).toHaveLength(0);
  });

  it.each(ORIENTATIONS)("%s: at level 1 only the root is a district rung", (orientation) => {
    const ladder = createGeometryLadder(rectRoot(orientation));
    const rec = createRecordingCtx();
    drawLadderLattice(
      rec.ctx,
      ladder,
      1,
      { offsetX: 150, offsetY: 150, zoom: 1, width: 300, height: 300 },
      0,
      createLatticeClipCache(),
      { active: "rgba(8,11,16,0.55)", district: "rgba(232,216,168,0.9)" }
    );
    expect(rec.passes).toHaveLength(2);
    expect(rec.passes[0].alpha).toBeCloseTo(0.42, 10);
    expect(rec.passes[1].alpha).toBe(1);
  });

  it.each(ORIENTATIONS)("%s: two district passes under one clip, then the active level", (orientation) => {
    const ladder = createGeometryLadder(rectRoot(orientation));
    const rec = createRecordingCtx();
    drawLadderLattice(
      rec.ctx,
      ladder,
      2,
      { offsetX: 150, offsetY: 150, zoom: 1, width: 300, height: 300 },
      0,
      createLatticeClipCache(),
      { active: "rgba(8,11,16,0.55)", district: "rgba(232,216,168,0.9)" }
    );

    expect(rec.passes).toHaveLength(3);
    expect(rec.passes[0].alpha).toBeCloseTo(0.3, 10);
    expect(rec.passes[0].lineWidth).toBeCloseTo(3, 10);
    expect(rec.passes[0].colour).toBe("rgba(232,216,168,0.9)");
    expect(rec.passes[1].alpha).toBeCloseTo(0.42, 10);
    expect(rec.passes[1].lineWidth).toBeCloseTo(2.2, 10);
    expect(rec.passes[1].colour).toBe("rgba(232,216,168,0.9)");
    expect(rec.passes[2].alpha).toBe(1);
    expect(rec.passes[2].lineWidth).toBe(1);
    expect(rec.passes[2].colour).toBe("rgba(8,11,16,0.55)");
    for (const pass of rec.passes) expect(pass.segments).toBeGreaterThan(0);

    // one clip for the whole frame, and it closes before the active pass starts
    const clips = rec.calls.filter((c) => c === "clip");
    expect(clips).toHaveLength(1);
    const clipAt = rec.calls.indexOf("clip");
    const strokeIndices = rec.calls.reduce<number[]>((acc, call, i) => {
      if (call === "stroke") acc.push(i);
      return acc;
    }, []);
    expect(strokeIndices).toHaveLength(3);
    expect(clipAt).toBeLessThan(strokeIndices[0]);
    // between the last district pass and the active pass: the pass's own restore plus the
    // clip scope's restore, i.e. the active level is stroked unclipped
    const between = rec.calls.slice(strokeIndices[1], strokeIndices[2]);
    expect(between.filter((c) => c === "restore")).toHaveLength(2);
    expect(between.indexOf("save")).toBeGreaterThan(between.lastIndexOf("restore"));
  });
});
