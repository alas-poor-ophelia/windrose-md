/**
 * The ladder element pass (ladderElementPass.ts): one band decision shared by
 * the draw pass and the selection chrome, viewport culling, and draw parity
 * with the inline pass it replaced (plain getObjectsInCell, no cull).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { MapObject } from "#types/objects/object.types";
import type { TextLabel } from "#types/objects/note.types";
import type { RendererSelectedItem } from "#types/hooks/canvasRenderer.types";
import { createGeometry } from "../../../../src/geometry/core/createGeometry";
import { createGeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import type { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { LADDER_DEFAULTS } from "../../../../src/geometry/core/lattice";
import { makeLayer, makeMapData } from "../../helpers/fixtures";

const spies = vi.hoisted(() => ({ drawnObjects: [] as string[][], chromeObjects: [] as string[][], drawnLabels: [] as string[][], chromeLabels: [] as string[][] }));

vi.mock("../../../../src/geometry/renderers/objectRenderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/geometry/renderers/objectRenderer")>();
  return {
    ...actual,
    renderObjects: (...args: Parameters<typeof actual.renderObjects>) => {
      spies.drawnObjects.push(args[0].objects.map((o) => o.id));
      actual.renderObjects(...args);
    },
  };
});
vi.mock("../../../../src/geometry/renderers/textLabelRenderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/geometry/renderers/textLabelRenderer")>();
  return {
    ...actual,
    renderTextLabels: (...args: Parameters<typeof actual.renderTextLabels>) => {
      spies.drawnLabels.push(args[0].map((l) => l.id));
      actual.renderTextLabels(...args);
    },
  };
});
vi.mock("../../../../src/geometry/renderers/selectionRenderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/geometry/renderers/selectionRenderer")>();
  return {
    ...actual,
    renderObjectSelections: (...args: Parameters<typeof actual.renderObjectSelections>) => {
      spies.chromeObjects.push(args[0].map((it) => it.id));
      actual.renderObjectSelections(...args);
    },
    renderTextLabelSelections: (...args: Parameters<typeof actual.renderTextLabelSelections>) => {
      const ids = new Set(args[1].map((l) => l.id));
      spies.chromeLabels.push(args[0].filter((it) => it.type === "text" && ids.has(it.id)).map((it) => it.id));
      actual.renderTextLabelSelections(...args);
    },
  };
});

import { bandedMembersByRung, renderLadderElements, renderLadderSelectionChrome } from "../../../../src/geometry/renderers/ladderElementPass";
import type { LadderElementFrame } from "../../../../src/geometry/renderers/ladderElementPass";
import { renderObjects } from "../../../../src/geometry/renderers/objectRenderer";
import { objectRenderDeps } from "../../../../src/geometry/renderers/staticPasses";
import { groupByDepth, groupVisibleAt, objectRenderedPx, OBJECT_FLOOR_PX, scaledSizeForRung, elementScale } from "../../../../src/geometry/renderers/elementBands";
import { fogDepsForRung } from "../../../../src/geometry/fog/rungFog";

/** A 2D context that records every call and property write. */
function recordingCtx(log: string[]): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};
  return new Proxy(state, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        log.push(prop + "(" + args.map((a) => (typeof a === "number" ? Math.round(a * 1000) / 1000 : typeof a === "string" ? a : typeof a)).join(",") + ")");
        if (prop === "measureText") return { width: 10 };
        return undefined;
      };
    },
    set(target, prop, value) {
      if (typeof prop === "string") { log.push(prop + "=" + String(value)); target[prop] = value; }
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const obj = (id: string, x: number, y: number, extra: Partial<MapObject> = {}): MapObject =>
  ({ id, type: "entrance", position: { x, y }, size: { width: 1, height: 1 }, ...extra }) as MapObject;
const label = (id: string, x: number, y: number, extra: Partial<TextLabel> = {}): TextLabel =>
  ({ id, position: { x, y }, content: id, fontSize: 16, fontFace: "sans-serif", color: "#ffffff", ...extra }) as TextLabel;

function setup(objects: MapObject[], textLabels: TextLabel[] = [], northDirection = 0) {
  const mapData = makeMapData({
    mapType: "hex", hexSize: 40, orientation: "flat", northDirection,
    hexBounds: { maxCol: 1000, maxRow: 1000 },
    viewState: { zoom: 1, center: { x: 0, y: 0 } },
    lod: { m: LADDER_DEFAULTS.m, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel },
    layers: [makeLayer({ objects, textLabels } as never)],
  } as never);
  const geometry = createGeometry(mapData) as HexGeometry;
  const ladder = createGeometryLadder(geometry, { ...LADDER_DEFAULTS });
  const layer = mapData.layers[0];
  const log: string[] = [];
  const frame: LadderElementFrame = { ctx: recordingCtx(log), offsetX: 400, offsetY: 300, zoom: 1, width: 800, height: 600, northDirection };
  return { mapData, geometry, ladder, layer, frame, log };
}

const ALL_VISIBLE = { grid: true, objects: true, textLabels: true };

beforeEach(() => {
  spies.drawnObjects.length = 0;
  spies.chromeObjects.length = 0;
  spies.drawnLabels.length = 0;
  spies.chromeLabels.length = 0;
});

describe("ladderElementPass", () => {
  it("draw and selection passes use the same banded set", () => {
    const objects = [
      obj("root-a", 0, 0),
      obj("root-b", 0, 0), // shares the hex: slot layout
      obj("speck", 1, 0, { size: { width: 0.1, height: 0.1 } }), // under the floor
      obj("pinned-away", 1, 1, { visibleLevels: [2] }), // explicit set excludes rung 0
      obj("deep-pop", 2, 0, { homeLevel: 3, depthMode: "pop" }), // band starts at rung 2
      obj("home-1", 0, 1, { homeLevel: 1 }), // band includes rung 0
    ];
    const labels = [label("L-root", 10, 10), label("L-away", 20, 20, { visibleLevels: [3] })];
    const { ladder, layer, frame, mapData, geometry } = setup(objects, labels);
    const banded = bandedMembersByRung(ladder, layer, 0, frame.zoom);
    const selected: RendererSelectedItem[] = [
      ...objects.map((o) => ({ type: "object", id: o.id }) as RendererSelectedItem),
      ...labels.map((l) => ({ type: "text", id: l.id }) as RendererSelectedItem),
    ];

    renderLadderElements(frame, banded, ladder, mapData, layer, geometry, ALL_VISIBLE);
    renderLadderSelectionChrome(frame, banded, selected, layer, geometry, 40, ALL_VISIBLE, false, "flat");

    const drawn = spies.drawnObjects.flat().sort();
    expect(drawn).toEqual(["home-1", "root-a", "root-b"]);
    expect(spies.chromeObjects.flat().sort()).toEqual(drawn);
    expect(spies.drawnLabels.flat()).toEqual(["L-root"]);
    expect(spies.chromeLabels.flat()).toEqual(["L-root"]);
  });

  it("culls objects and labels outside the view, keeps everything near it", () => {
    const objects = [obj("here", 0, 0), obj("edge", 9, 0), obj("far", 400, 0), obj("far-free", 0, 0, { freeform: true, worldPosition: { x: -90000, y: 0 } } as Partial<MapObject>)];
    const labels = [label("L-here", 0, 0), label("L-far", 50000, 50000)];
    const { ladder, layer, frame, mapData, geometry } = setup(objects, labels);
    renderLadderElements(frame, bandedMembersByRung(ladder, layer, 0, 1), ladder, mapData, layer, geometry, ALL_VISIBLE);
    expect(spies.drawnObjects.flat().sort()).toEqual(["edge", "here"]);
    expect(spies.drawnLabels.flat()).toEqual(["L-here"]);
  });

  it("a rotated view keeps a corner object the unrotated rect would cull", () => {
    // Just past the right edge in pre-rotation space, inside the half-diagonal square.
    const corner = [obj("corner", 10, 0)];
    const flat = setup(corner);
    renderLadderElements(flat.frame, bandedMembersByRung(flat.ladder, flat.layer, 0, 1), flat.ladder, flat.mapData, flat.layer, flat.geometry, ALL_VISIBLE);
    expect(spies.drawnObjects.flat()).toEqual([]);
    const turned = setup(corner, [], 45);
    renderLadderElements(turned.frame, bandedMembersByRung(turned.ladder, turned.layer, 0, 1), turned.ladder, turned.mapData, turned.layer, turned.geometry, ALL_VISIBLE);
    expect(spies.drawnObjects.flat()).toEqual(["corner"]);
  });

  it("draws exactly what the previous inline pass drew (on-screen objects, indexed slots)", () => {
    const objects = [obj("a", 0, 0), obj("b", 0, 0), obj("c", 0, 0, { slot: 2 }), obj("d", 1, 0, { homeLevel: 1 }), obj("e", 2, 1, { linkedNote: "n.md" })];
    const before = setup(objects);
    // The pre-extraction pass: every banded member, the plain O(n) cell filter.
    const deps = objectRenderDeps(before.mapData);
    for (const group of groupByDepth(before.layer.objects)) {
      if (!groupVisibleAt(group, 0, "object")) continue;
      const members = group.members.filter((o) => objectRenderedPx(before.ladder, group.home, 1, o.size?.width ?? 1, group.mode) >= OBJECT_FLOOR_PX);
      if (members.length === 0) continue;
      renderObjects(
        { ...before.layer, objects: members },
        { ctx: before.frame.ctx, offsetX: 400, offsetY: 300, zoom: 1, scaledSize: scaledSizeForRung(before.ladder, group.home, 1), elementScale: elementScale(before.ladder, group.home, 1, group.mode), slotObjects: before.layer.objects },
        before.ladder.geometryForLevel(group.home), true, "flat", fogDepsForRung(before.ladder, group.home, deps)
      );
    }
    const after = setup(objects);
    renderLadderElements(after.frame, bandedMembersByRung(after.ladder, after.layer, 0, 1), after.ladder, after.mapData, after.layer, after.geometry, ALL_VISIBLE);
    expect(before.log.length).toBeGreaterThan(0);
    expect(after.log).toEqual(before.log);
  });
});
