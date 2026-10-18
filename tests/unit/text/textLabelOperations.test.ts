/**
 * textLabelOperations.test.ts
 *
 * homeLevel on creation and ladder-aware hit-testing (held size + band visibility).
 */
import { describe, it, expect } from "vitest";

import { HexGeometry } from "../../../src/geometry/core/HexGeometry";
import { createGeometryLadder } from "../../../src/geometry/core/createGeometryLadder";
import { crossingZoom } from "../../../src/geometry/core/lattice";
import { addTextLabel, getTextLabelAtPosition } from "../../../src/text/textLabelOperations";
import type { TextLabel } from "../../../src/text/textLabelOperations";

const ladder = createGeometryLadder(new HexGeometry(80, "flat", null), { m: 4, minCellPx: 64, maxLevel: 3 });

/** Canvas stub: text width is 6px per font-px per 10 chars, read from the current font. */
function makeCtx(): CanvasRenderingContext2D {
  const ctx = {
    font: "",
    measureText(text: string) {
      const px = parseFloat(/^([\d.]+)px/.exec(ctx.font)?.[1] ?? "0");
      return { width: text.length * px * 0.6 };
    }
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

function label(extra: Partial<TextLabel> = {}): TextLabel {
  return {
    id: "t1",
    content: "abcdefghij",
    position: { x: 0, y: 0 },
    rotation: 0,
    fontSize: 16,
    fontFace: "sans",
    color: "#ffffff",
    ...extra
  };
}

describe("addTextLabel homeLevel", () => {
  it("stores homeLevel when > 0", () => {
    const out = addTextLabel([], "hi", 1, 2, { homeLevel: 2 });
    expect(out[0].homeLevel).toBe(2);
  });

  it("writes no key for 0 or absent", () => {
    expect("homeLevel" in addTextLabel([], "hi", 1, 2, { homeLevel: 0 })[0]).toBe(false);
    expect("homeLevel" in addTextLabel([], "hi", 1, 2)[0]).toBe(false);
  });
});

describe("getTextLabelAtPosition", () => {
  const ctx = makeCtx();
  // Unheld box: width 96 + 8 pad -> half 52 ; height 19.2 + 4 -> half 11.6.
  const labels = [label()];

  it("classic: view absent or ladder-less is identical", () => {
    const base = getTextLabelAtPosition(labels, 50, 0, ctx);
    expect(base).toBe(labels[0]);
    expect(getTextLabelAtPosition(labels, 53, 0, ctx)).toBeNull();
    expect(getTextLabelAtPosition(labels, 50, 0, ctx, { ladder: null, zoom: 3, activeLevel: 0 })).toBe(base);
    expect(getTextLabelAtPosition(labels, 53, 0, ctx, { ladder: null, zoom: 3, activeLevel: 0 })).toBeNull();
  });

  it("ladder, persist beyond the crossing: hits only inside the held box", () => {
    const zoom = crossingZoom(1, ladder.params) * 2;
    const activeLevel = ladder.activeLevel(zoom);
    expect(activeLevel).toBeGreaterThanOrEqual(1);
    const view = { ladder, zoom, activeLevel };
    // Held: font 8 -> text width 48, half 24 + 4/zoom pad. x=10 inside, x=40 outside held (inside unheld).
    expect(getTextLabelAtPosition(labels, 10, 0, ctx, view)).toBe(labels[0]);
    expect(getTextLabelAtPosition(labels, 40, 0, ctx, view)).toBeNull();
    expect(getTextLabelAtPosition(labels, 40, 0, ctx)).toBe(labels[0]);
  });

  it("ladder, pop label at a finer active level: never hit", () => {
    const zoom = crossingZoom(1, ladder.params) * 1.1;
    const view = { ladder, zoom, activeLevel: 1 };
    const pop = [label({ depthMode: "pop" })];
    expect(getTextLabelAtPosition(pop, 0, 0, ctx, view)).toBeNull();
    expect(getTextLabelAtPosition([label()], 0, 0, ctx, view)).not.toBeNull();
  });

  it("ladder: a label under the screen floor is not hit", () => {
    const zoom = 0.2;
    const view = { ladder, zoom, activeLevel: 0 };
    expect(getTextLabelAtPosition([label({ fontSize: 8 })], 0, 0, ctx, view)).toBeNull();
  });
});
