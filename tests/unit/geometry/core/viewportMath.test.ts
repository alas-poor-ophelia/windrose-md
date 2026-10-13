import { describe, it, expect } from 'vitest';
import {
  viewCenterScale,
  calculateViewportOffset,
  clientToCanvasPx,
  canvasPxToWorld,
  worldToCanvasPx,
  clientToWorld,
  screenDeltaToCenterUnits,
  anchoredZoomCenter,
  rotateAboutCanvasCenter,
  unrotateCanvasPx,
  applyNorthRotation,
} from '../../../../src/geometry/core/viewportMath';
import type { ViewGeometry, CanvasLike, ViewBasis } from '../../../../src/geometry/core/viewportMath';
import { GridGeometry } from '../../../../src/geometry/core/GridGeometry';
import { HexGeometry } from '../../../../src/geometry/core/HexGeometry';

type Desc = Extract<ViewGeometry, { cellSize: number }>;
const GRID: Desc = { type: 'grid', cellSize: 32 };
const HEX: Desc = { type: 'hex', cellSize: 40 };

/** Canvas whose 1200x800 buffer is displayed at cssW x cssH CSS px at (left, top). */
function fakeCanvas(cssW: number, cssH: number, left = 10, top = 20): CanvasLike {
  return {
    width: 1200,
    height: 800,
    getBoundingClientRect: () => ({ left, top, width: cssW, height: cssH }),
  };
}

/**
 * Oracle: the known-good screenToWorld body from useCanvasInteraction before
 * this module existed (CSS scale, unrotate about the buffer centre, offset).
 */
function legacyScreenToWorld(
  geometry: Desc, canvas: CanvasLike, clientX: number, clientY: number,
  view: ViewBasis, northDirection: number
): { worldX: number; worldY: number } {
  const rect = canvas.getBoundingClientRect();
  let x = (clientX - rect.left) * (canvas.width / rect.width);
  let y = (clientY - rect.top) * (canvas.height / rect.height);
  const { zoom, center } = view;
  const s = geometry.type === 'grid' ? geometry.cellSize * zoom : zoom;
  const offsetX = canvas.width / 2 - center.x * s;
  const offsetY = canvas.height / 2 - center.y * s;
  if (northDirection !== 0) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    x -= cx; y -= cy;
    const a = (-northDirection * Math.PI) / 180;
    const rx = x * Math.cos(a) - y * Math.sin(a);
    const ry = x * Math.sin(a) + y * Math.cos(a);
    x = rx + cx; y = ry + cy;
  }
  return { worldX: (x - offsetX) / zoom, worldY: (y - offsetY) / zoom };
}

const CASES = [
  { name: 'grid', g: GRID, view: { zoom: 1.5, center: { x: 12.5, y: 7.25 } } },
  { name: 'hex', g: HEX, view: { zoom: 0.8, center: { x: 410, y: -120 } } },
];
const ROTATIONS = [0, 90, 37, 180, 270];
const CANVASES = [fakeCanvas(1200, 800), fakeCanvas(600, 400), fakeCanvas(900, 650, 0, 0)];

describe('viewportMath', () => {
  it('viewCenterScale: cell units on grid, world px on hex', () => {
    expect(viewCenterScale(GRID, 2)).toBe(64);
    expect(viewCenterScale(HEX, 2)).toBe(2);
  });

  it('calculateViewportOffset centres the view centre on the canvas', () => {
    expect(calculateViewportOffset(GRID, { x: 10, y: 5 }, { width: 800, height: 600 }, 1))
      .toEqual({ offsetX: 400 - 320, offsetY: 300 - 160 });
    expect(calculateViewportOffset(HEX, { x: 100, y: 50 }, { width: 800, height: 600 }, 2))
      .toEqual({ offsetX: 200, offsetY: 200 });
  });

  it('getViewCenterScale on real geometries matches the module rule', () => {
    const grid = new GridGeometry(32);
    const hex = new HexGeometry(40, 'flat');
    expect(grid.getViewCenterScale(1.5)).toBe(viewCenterScale({ type: 'grid', cellSize: 32 }, 1.5));
    expect(hex.getViewCenterScale(1.5)).toBe(1.5);
  });

  it('clientToCanvasPx honours CSS scaling', () => {
    expect(clientToCanvasPx(fakeCanvas(600, 400), 310, 220)).toEqual({ x: 600, y: 400 });
  });

  for (const c of CASES) {
    for (const north of ROTATIONS) {
      for (const canvas of CANVASES) {
        const label = `${c.name} north=${north} css=${canvas.getBoundingClientRect().width}`;
        it(`clientToWorld matches the legacy screenToWorld (${label})`, () => {
          for (const [cx, cy] of [[10, 20], [333, 141], [590, 410], [-50, 900]]) {
            const got = clientToWorld(c.g, canvas, cx, cy, c.view, north);
            const want = legacyScreenToWorld(c.g, canvas, cx, cy, c.view, north);
            expect(got.worldX).toBeCloseTo(want.worldX, 9);
            expect(got.worldY).toBeCloseTo(want.worldY, 9);
          }
        });

        it(`anchoredZoomCenter keeps the anchor world point fixed (${label})`, () => {
          const size = { width: canvas.width, height: canvas.height };
          const anchor = clientToCanvasPx(canvas, 333, 141);
          const before = canvasPxToWorld(c.g, anchor.x, anchor.y, size, c.view, north);
          const newZoom = c.view.zoom * 1.7;
          const center = anchoredZoomCenter(c.g, anchor, size, c.view, newZoom, north);
          const after = canvasPxToWorld(c.g, anchor.x, anchor.y, size, { zoom: newZoom, center }, north);
          expect(after.worldX).toBeCloseTo(before.worldX, 8);
          expect(after.worldY).toBeCloseTo(before.worldY, 8);
        });
      }

      it(`worldToCanvasPx inverts canvasPxToWorld (${c.name} north=${north})`, () => {
        const size = { width: 1200, height: 800 };
        const w = canvasPxToWorld(c.g, 123, 456, size, c.view, north);
        const p = worldToCanvasPx(c.g, w.worldX, w.worldY, size, c.view, north);
        expect(p.x).toBeCloseTo(123, 9);
        expect(p.y).toBeCloseTo(456, 9);
      });

      it(`screenDeltaToCenterUnits keeps the grabbed point under the cursor (${c.name} north=${north})`, () => {
        const size = { width: 1200, height: 800 };
        const grabbed = canvasPxToWorld(c.g, 500, 300, size, c.view, north);
        const d = screenDeltaToCenterUnits(c.g, 40, -25, c.view.zoom, north);
        const moved = { zoom: c.view.zoom, center: { x: c.view.center.x - d.x, y: c.view.center.y - d.y } };
        const now = canvasPxToWorld(c.g, 540, 275, size, moved, north);
        expect(now.worldX).toBeCloseTo(grabbed.worldX, 9);
        expect(now.worldY).toBeCloseTo(grabbed.worldY, 9);
      });
    }
  }

  it('legacy (unscaled, unrotated) anchored zoom is reproduced exactly', () => {
    // Pre-fix applyAnchoredZoom was correct only when CSS size == buffer size and north == 0.
    const canvas = fakeCanvas(1200, 800);
    const view = { zoom: 1, center: { x: 10, y: 6 } };
    const mouse = { x: 333 - 10, y: 141 - 20 };
    const oldS = 32 * 1;
    const newS = 32 * 2;
    const offX = 600 - view.center.x * oldS;
    const offY = 400 - view.center.y * oldS;
    const wx = (mouse.x - offX) / oldS;
    const wy = (mouse.y - offY) / oldS;
    const want = { x: (600 - (mouse.x - wx * newS)) / newS, y: (400 - (mouse.y - wy * newS)) / newS };
    const got = anchoredZoomCenter(GRID, clientToCanvasPx(canvas, 333, 141), { width: 1200, height: 800 }, view, 2, 0);
    expect(got.x).toBeCloseTo(want.x, 9);
    expect(got.y).toBeCloseTo(want.y, 9);
  });

  it('rotate then unrotate is identity', () => {
    const size = { width: 640, height: 480 };
    const r = rotateAboutCanvasCenter(100, 50, size, 63);
    const back = unrotateCanvasPx(r.x, r.y, size, 63);
    expect(back.x).toBeCloseTo(100, 9);
    expect(back.y).toBeCloseTo(50, 9);
  });

  it('applyNorthRotation is a no-op at 0 and rotates about the centre otherwise', () => {
    const calls: string[] = [];
    const ctx = {
      translate: (x: number, y: number): void => { calls.push(`t ${x} ${y}`); },
      rotate: (a: number): void => { calls.push(`r ${a.toFixed(4)}`); },
    };
    applyNorthRotation(ctx, 200, 100, 0);
    expect(calls).toEqual([]);
    applyNorthRotation(ctx, 200, 100, 90);
    expect(calls).toEqual(['t 100 50', `r ${(Math.PI / 2).toFixed(4)}`, 't -100 -50']);
  });
});
