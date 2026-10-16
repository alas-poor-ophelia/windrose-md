/**
 * The migrated callers of viewportMath agree with the module's inverse
 * (canvasPxToWorld) on grid and hex, rotated and unrotated.
 */
import { describe, it, expect } from 'vitest';
import { canvasPxToWorld } from '../../../../src/geometry/core/viewportMath';
import { GridGeometry } from '../../../../src/geometry/core/GridGeometry';
import { HexGeometry } from '../../../../src/geometry/core/HexGeometry';
import { cellToScreen } from '../../../../src/drawing/cellToScreenConverter';
import { calculateObjectScreenPosition } from '../../../../src/objects/screenPositionUtils';
import type { MapData } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';

const SIZE = { width: 1000, height: 700 };
const grid = new GridGeometry(32);
const hex = new HexGeometry(40, 'flat');

const CASES = [
  { name: 'grid', g: grid, view: { zoom: 1.25, center: { x: 9.5, y: 4 } } },
  { name: 'hex', g: hex, view: { zoom: 0.9, center: { x: 220, y: 80 } } },
];

describe('viewportMath callers', () => {
  for (const c of CASES) {
    for (const north of [0, 90, 33]) {
      it(`cellToScreen lands on the cell centre (${c.name} north=${north})`, () => {
        const p = cellToScreen(3, 2, c.g, { viewState: c.view, northDirection: north }, SIZE.width, SIZE.height, true);
        const w = canvasPxToWorld(c.g, p.x, p.y, SIZE, c.view, north);
        const center = c.g.getCellCenter(3, 2);
        expect(w.worldX).toBeCloseTo(center.worldX, 9);
        expect(w.worldY).toBeCloseTo(center.worldY, 9);
      });

      it(`calculateObjectScreenPosition (freeform) maps back to the object's world point (${c.name} north=${north})`, () => {
        // Buffer 1000x700 shown at half size: CSS px = buffer px * 0.5.
        const canvas = {
          width: SIZE.width,
          height: SIZE.height,
          parentElement: null,
          getBoundingClientRect: () => ({ left: 0, top: 0, width: SIZE.width / 2, height: SIZE.height / 2 }),
        } as unknown as HTMLCanvasElement;
        const container = { current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } as unknown as HTMLElement };
        const mapData = {
          gridSize: 32, hexSize: 40, mapType: c.name, northDirection: north, viewState: c.view,
        } as unknown as MapData;
        const obj = {
          id: 'o', type: 'x', position: { x: 0, y: 0 }, freeform: true, worldPosition: { x: 150, y: 90 },
        } as unknown as MapObject;
        const r = calculateObjectScreenPosition(obj, canvas, mapData, c.g, container);
        expect(r).not.toBeNull();
        if (r == null) return;
        const w = canvasPxToWorld(c.g, r.screenX * 2, r.screenY * 2, SIZE, c.view, north);
        expect(w.worldX).toBeCloseTo(150, 9);
        expect(w.worldY).toBeCloseTo(90, 9);
      });
    }
  }
});
