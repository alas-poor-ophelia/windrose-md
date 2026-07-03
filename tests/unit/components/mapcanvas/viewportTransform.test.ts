/**
 * viewportTransform Unit Tests
 *
 * Verifies the shared world→buffer viewport transform against the math the
 * overlay layers previously hand-rolled: grid vs hex offset conventions,
 * north-direction rotation about the buffer centre, and buffer→display
 * metrics.
 */

import { describe, it, expect } from "vitest";

import { createViewportTransform, getCanvasDisplayMetrics } from "../../../../src/components/mapcanvas/viewportTransform";
import { GridGeometry } from "../../../../src/geometry/core/GridGeometry";
import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";

describe("createViewportTransform", () => {
  describe("grid geometry", () => {
    const geometry = new GridGeometry(32);

    it("computes scaledSize and offsets (center is in cell units, scaled by cellSize*zoom)", () => {
      const t = createViewportTransform({
        geometry, width: 800, height: 600, zoom: 2, center: { x: 5, y: 5 }
      });
      expect(t.scaledSize).toBe(64);
      expect(t.pxOffsetX).toBe(800 / 2 - 5 * 64); // 80
      expect(t.pxOffsetY).toBe(600 / 2 - 5 * 64); // -20
    });

    it("maps the view center's world position to the buffer centre", () => {
      const t = createViewportTransform({
        geometry, width: 800, height: 600, zoom: 2, center: { x: 5, y: 5 }
      });
      // center (5,5) in cell units = world (160,160)
      const p = t.worldToBuffer(5 * 32, 5 * 32);
      expect(p.x).toBeCloseTo(400);
      expect(p.y).toBeCloseTo(300);
    });

    it("applies pan/zoom to arbitrary world points", () => {
      const t = createViewportTransform({
        geometry, width: 800, height: 600, zoom: 2, center: { x: 5, y: 5 }
      });
      const p = t.worldToBuffer(0, 0);
      expect(p.x).toBeCloseTo(t.pxOffsetX);
      expect(p.y).toBeCloseTo(t.pxOffsetY);
    });
  });

  describe("hex geometry", () => {
    const geometry = new HexGeometry(30);

    it("computes scaledSize and offsets (center is in world pixels, scaled by zoom only)", () => {
      const t = createViewportTransform({
        geometry, width: 800, height: 600, zoom: 1.5, center: { x: 100, y: 50 }
      });
      expect(t.scaledSize).toBe(45);
      expect(t.pxOffsetX).toBe(800 / 2 - 100 * 1.5); // 250
      expect(t.pxOffsetY).toBe(600 / 2 - 50 * 1.5);  // 225
    });

    it("maps the view center's world position to the buffer centre", () => {
      const t = createViewportTransform({
        geometry, width: 800, height: 600, zoom: 1.5, center: { x: 100, y: 50 }
      });
      const p = t.worldToBuffer(100, 50);
      expect(p.x).toBeCloseTo(400);
      expect(p.y).toBeCloseTo(300);
    });
  });

  describe("north-direction rotation", () => {
    const geometry = new HexGeometry(30);
    const params = {
      geometry, width: 800, height: 600, zoom: 1, center: { x: 400, y: 300 }
    };

    it("treats 0 / undefined northDirection as identity", () => {
      const plain = createViewportTransform(params);
      const zero = createViewportTransform({ ...params, northDirection: 0 });
      const p1 = plain.worldToBuffer(123, 456);
      const p2 = zero.worldToBuffer(123, 456);
      expect(p1).toEqual(p2);
    });

    it("leaves the buffer centre fixed under rotation", () => {
      const t = createViewportTransform({ ...params, northDirection: 137 });
      const p = t.worldToBuffer(400, 300); // maps to buffer centre pre-rotation
      expect(p.x).toBeCloseTo(400);
      expect(p.y).toBeCloseTo(300);
    });

    it("rotates clockwise about the buffer centre (90°: +x becomes +y)", () => {
      const t = createViewportTransform({ ...params, northDirection: 90 });
      // world (410, 300) → buffer (410, 300) pre-rotation, rel (10, 0)
      const p = t.worldToBuffer(410, 300);
      expect(p.x).toBeCloseTo(400);
      expect(p.y).toBeCloseTo(310);
    });

    it("matches the layers' previous inline rotation math at an arbitrary angle", () => {
      const northDirection = 33;
      const t = createViewportTransform({ ...params, northDirection });

      const worldX = 517;
      const worldY = 142;
      // Reference implementation (as previously copy-pasted in the layers)
      let screenX = t.pxOffsetX + worldX * 1;
      let screenY = t.pxOffsetY + worldY * 1;
      const cx = 800 / 2;
      const cy = 600 / 2;
      screenX -= cx;
      screenY -= cy;
      const angleRad = (northDirection * Math.PI) / 180;
      const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
      const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);
      screenX = rotatedX + cx;
      screenY = rotatedY + cy;

      const p = t.worldToBuffer(worldX, worldY);
      expect(p.x).toBeCloseTo(screenX);
      expect(p.y).toBeCloseTo(screenY);
    });
  });
});

describe("getCanvasDisplayMetrics", () => {
  function fakeCanvas(rect: { left: number; top: number; width: number; height: number }, buffer: { width: number; height: number }): HTMLCanvasElement {
    return {
      width: buffer.width,
      height: buffer.height,
      getBoundingClientRect: () => rect
    } as unknown as HTMLCanvasElement;
  }

  function fakeContainer(rect: { left: number; top: number; width: number; height: number }): Element {
    return { getBoundingClientRect: () => rect } as unknown as Element;
  }

  it("computes canvas offset within the container and buffer→CSS scale", () => {
    const canvas = fakeCanvas({ left: 120, top: 40, width: 400, height: 300 }, { width: 800, height: 600 });
    const container = fakeContainer({ left: 100, top: 20, width: 500, height: 400 });

    const m = getCanvasDisplayMetrics(canvas, container);
    expect(m.canvasOffsetX).toBe(20);
    expect(m.canvasOffsetY).toBe(20);
    expect(m.scaleX).toBe(0.5);
    expect(m.scaleY).toBe(0.5);
  });

  it("falls back to zero offsets when no container is provided", () => {
    const canvas = fakeCanvas({ left: 120, top: 40, width: 1600, height: 1200 }, { width: 800, height: 600 });

    const m = getCanvasDisplayMetrics(canvas, null);
    expect(m.canvasOffsetX).toBe(0);
    expect(m.canvasOffsetY).toBe(0);
    expect(m.scaleX).toBe(2);
    expect(m.scaleY).toBe(2);
  });
});
