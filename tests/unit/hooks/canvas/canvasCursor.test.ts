/**
 * canvasCursor Unit Tests (REACT-04)
 *
 * The per-map cursor store writes the tool class plus at most one transient
 * interaction class to its canvas element, and releases Space/pan on blur.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createCanvasCursorStore,
  drawingCursorFor,
  toolCursorClass
} from "../../../../src/hooks/canvas/canvasCursor";

const STATE_CLASSES = [
  "windrose-canvas-space-grab",
  "windrose-canvas-panning",
  "windrose-canvas-drawing",
  "windrose-canvas-rectangle-active",
  "windrose-canvas-circle-active",
  "windrose-canvas-cleararea-active"
];

function makeEl(): HTMLElement {
  return { className: "" } as unknown as HTMLElement;
}

function stateClassesOn(el: HTMLElement): string[] {
  return el.className.split(" ").filter((c) => STATE_CLASSES.includes(c));
}

describe("createCanvasCursorStore", () => {
  it("writes the tool class with no transient class by default", () => {
    const store = createCanvasCursorStore();
    const el = makeEl();
    store.attach(el);
    store.setBase("windrose-canvas-select");
    expect(el.className).toBe("windrose-canvas-select");
    expect(store.getStateClass()).toBeNull();
  });

  it("applies exactly one transient class at a time, by priority", () => {
    const store = createCanvasCursorStore();
    const el = makeEl();
    store.attach(el);
    store.setBase("windrose-canvas-rectangle");

    store.setDrawing("rectangle-active");
    expect(stateClassesOn(el)).toEqual(["windrose-canvas-rectangle-active"]);

    // Space alone (pointer elsewhere) does not grab.
    store.setSpaceHeld(true);
    expect(stateClassesOn(el)).toEqual(["windrose-canvas-rectangle-active"]);

    store.setPointerOver(true);
    expect(stateClassesOn(el)).toEqual(["windrose-canvas-space-grab"]);

    store.setPanning(true);
    expect(stateClassesOn(el)).toEqual(["windrose-canvas-panning"]);
    expect(el.className.startsWith("windrose-canvas-rectangle ")).toBe(true);

    store.setPanning(false);
    store.setSpaceHeld(false);
    expect(stateClassesOn(el)).toEqual(["windrose-canvas-rectangle-active"]);

    store.setDrawing(null);
    expect(el.className).toBe("windrose-canvas-rectangle");
  });

  it("releases space-grab and panning on blur but keeps the drawing state", () => {
    const store = createCanvasCursorStore();
    const el = makeEl();
    store.attach(el);
    store.setDrawing("drawing");
    store.setPointerOver(true);
    store.setSpaceHeld(true);
    store.setPanning(true);
    expect(store.getStateClass()).toBe("windrose-canvas-panning");

    store.releaseTransient();
    expect(store.getStateClass()).toBe("windrose-canvas-drawing");
    expect(stateClassesOn(el)).toEqual(["windrose-canvas-drawing"]);
  });

  it("keeps the transient class across a tool-class change", () => {
    const store = createCanvasCursorStore();
    const el = makeEl();
    store.attach(el);
    store.setPanning(true);
    store.setBase("windrose-canvas-erase");
    expect(el.className).toBe("windrose-canvas-erase windrose-canvas-panning");
  });

  it("notifies subscribers only when the transient class changes", () => {
    const store = createCanvasCursorStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setPanning(true);
    store.setSpaceHeld(true);
    store.setPanning(false);
    expect(listener.mock.calls).toEqual([["windrose-canvas-panning"], [null]]);
    unsubscribe();
    store.setPanning(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps two maps independent", () => {
    const a = createCanvasCursorStore();
    const b = createCanvasCursorStore();
    const elA = makeEl();
    const elB = makeEl();
    a.attach(elA);
    b.attach(elB);
    a.setPanning(true);
    expect(stateClassesOn(elA)).toEqual(["windrose-canvas-panning"]);
    expect(stateClassesOn(elB)).toEqual([]);
  });
});

describe("drawingCursorFor", () => {
  it("maps shape starts and draw strokes; erasing has no transient cursor", () => {
    expect(drawingCursorFor("rectangle", false, true, false)).toBe("rectangle-active");
    expect(drawingCursorFor("circle", false, false, true)).toBe("circle-active");
    expect(drawingCursorFor("clearArea", false, true, false)).toBe("cleararea-active");
    expect(drawingCursorFor("draw", true, false, false)).toBe("drawing");
    expect(drawingCursorFor("erase", true, false, false)).toBeNull();
    expect(drawingCursorFor("rectangle", false, false, false)).toBeNull();
  });
});

describe("toolCursorClass", () => {
  it("gives the erase tool its own (crosshair) class and selection drags the move class", () => {
    expect(toolCursorClass("erase", false, false)).toBe("windrose-canvas-erase");
    expect(toolCursorClass("select", true, false)).toBe("windrose-canvas-selecting");
    expect(toolCursorClass("addObject", false, false)).toBe("windrose-canvas");
  });
});
