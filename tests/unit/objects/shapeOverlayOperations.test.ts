/**
 * shapeOverlayOperations Unit Tests
 *
 * Snapping must work through IGeometry alone, so every case is run against
 * both square-grid and hex geometry.
 */

import { describe, it, expect } from 'vitest';

import {
  snapShapeOverlayToGrid,
  snapSizeToWholeCells,
  getCellWorldSize,
  getShapeHalfExtents,
  getShapeBoundingHalfExtents,
  hitTestShapeOverlay
} from '../../../src/objects/shapeOverlayOperations';
import type { ShapeOverlay } from '../../../types/core/map.types';
import { GridGeometry } from '../../../src/geometry/core/GridGeometry';
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';

const CELL = 32;
const grid = new GridGeometry(CELL);
const hex = new HexGeometry(40, 'flat');

describe('getCellWorldSize', () => {
  it('returns the grid cell size', () => {
    expect(getCellWorldSize(grid)).toBe(CELL);
  });

  it('returns the hex size for hex geometry', () => {
    expect(getCellWorldSize(hex)).toBe(40);
  });
});

describe('snapSizeToWholeCells', () => {
  it('rounds the full extent to a whole number of cells', () => {
    // size is a half-extent: 40 -> full extent 80 -> 2.5 cells -> 3 cells -> 48
    expect(snapSizeToWholeCells(40, CELL)).toBe(48);
    // full extent 70 -> 2.1875 cells -> 2 cells -> half extent 32
    expect(snapSizeToWholeCells(35, CELL)).toBe(CELL);
    // full extent 100 -> 3.125 cells -> 3 cells -> half extent 48
    expect(snapSizeToWholeCells(50, CELL)).toBe(48);
  });

  it('never goes below one cell', () => {
    expect(snapSizeToWholeCells(0.1, CELL)).toBe(CELL / 2);
    expect(snapSizeToWholeCells(0, CELL)).toBe(CELL / 2);
  });

  it('leaves an already whole-cell extent untouched', () => {
    expect(snapSizeToWholeCells(CELL, CELL)).toBe(CELL);
    expect(snapSizeToWholeCells(CELL * 1.5, CELL)).toBe(CELL * 1.5);
  });
});

describe('snapShapeOverlayToGrid (grid geometry)', () => {
  it('moves the anchor to the containing cell corner when the extent is an even number of cells', () => {
    // size 30 -> half-extent both axes -> full extent 60 -> 1.875 cells -> 2 cells (even)
    const result = snapShapeOverlayToGrid({ worldPosition: { x: 70, y: 10 }, size: 30 }, grid);
    // even cell count anchors to the nearest grid line, not the cell centre
    expect(result.worldPosition).toEqual({ x: 64, y: 0 });
  });

  it('quantises the size so the full extent spans whole cells', () => {
    const result = snapShapeOverlayToGrid({ worldPosition: { x: 0, y: 0 }, size: 30 }, grid);
    // full extent 60 -> 1.875 cells -> 2 cells -> half extent 32
    expect(result.size).toBe(CELL);
  });

  it('keeps a minimum of one cell', () => {
    const result = snapShapeOverlayToGrid({ worldPosition: { x: 5, y: 5 }, size: 0.5 }, grid);
    expect(result.size).toBe(CELL / 2);
  });

  it('is idempotent for an already snapped shape', () => {
    const once = snapShapeOverlayToGrid({ worldPosition: { x: 123, y: 45 }, size: 77 }, grid);
    const twice = snapShapeOverlayToGrid(once, grid);
    expect(twice).toEqual(once);
  });

  it('handles negative world coordinates', () => {
    const result = snapShapeOverlayToGrid({ worldPosition: { x: -10, y: -40 }, size: 20 }, grid);
    // (-10, -40) is in cell (-1, -2); centre is (-0.5 * 32, -1.5 * 32)
    expect(result.worldPosition).toEqual({ x: -16, y: -48 });
  });

  it('does not mutate its input', () => {
    const shape = { worldPosition: { x: 70, y: 10 }, size: 30 };
    snapShapeOverlayToGrid(shape, grid);
    expect(shape).toEqual({ worldPosition: { x: 70, y: 10 }, size: 30 });
  });
});

describe('snapShapeOverlayToGrid (hex geometry)', () => {
  it('moves the anchor to the centre of the hex under it', () => {
    const start = { x: 133, y: 71 };
    const cell = hex.worldToGrid(start.x, start.y);
    const centre = hex.getCellCenter(cell.x, cell.y);

    const result = snapShapeOverlayToGrid({ worldPosition: start, size: 55 }, hex);

    expect(result.worldPosition.x).toBeCloseTo(centre.worldX, 6);
    expect(result.worldPosition.y).toBeCloseTo(centre.worldY, 6);
  });

  it('quantises the size to whole hex sizes', () => {
    // full extent 110 -> 2.75 hex -> 3 hex -> half extent 60
    const result = snapShapeOverlayToGrid({ worldPosition: { x: 0, y: 0 }, size: 55 }, hex);
    expect(result.size).toBe(60);
  });

  it('keeps a minimum of one hex', () => {
    const result = snapShapeOverlayToGrid({ worldPosition: { x: 3, y: 3 }, size: 1 }, hex);
    expect(result.size).toBe(20);
  });

  it('is idempotent for an already snapped shape', () => {
    const once = snapShapeOverlayToGrid({ worldPosition: { x: -95, y: 210 }, size: 88 }, hex);
    const twice = snapShapeOverlayToGrid(once, hex);
    expect(twice.worldPosition.x).toBeCloseTo(once.worldPosition.x, 6);
    expect(twice.worldPosition.y).toBeCloseTo(once.worldPosition.y, 6);
    expect(twice.size).toBe(once.size);
  });

  it('works for pointy-top hexes too', () => {
    const pointy = new HexGeometry(40, 'pointy');
    const start = { x: 61, y: -18 };
    const cell = pointy.worldToGrid(start.x, start.y);
    const centre = pointy.getCellCenter(cell.x, cell.y);

    const result = snapShapeOverlayToGrid({ worldPosition: start, size: 41 }, pointy);

    expect(result.worldPosition.x).toBeCloseTo(centre.worldX, 6);
    expect(result.worldPosition.y).toBeCloseTo(centre.worldY, 6);
    expect(result.size).toBe(40);
  });
});

describe('getShapeHalfExtents', () => {
  it('falls back to size on both axes for a pre-2.4.0 square', () => {
    expect(getShapeHalfExtents({ size: 40 })).toEqual({ halfWidth: 40, halfHeight: 40 });
  });

  it('prefers the per-axis half-extents when present', () => {
    expect(getShapeHalfExtents({ size: 60, halfWidth: 60, halfHeight: 20 }))
      .toEqual({ halfWidth: 60, halfHeight: 20 });
  });
});

describe('snapShapeOverlayToGrid (rectangles)', () => {
  it('snaps each axis independently', () => {
    const result = snapShapeOverlayToGrid(
      // full extents 120 (3.75 cells -> 4) and 40 (1.25 cells -> 1)
      { worldPosition: { x: 0, y: 0 }, size: 60, halfWidth: 60, halfHeight: 20 },
      grid
    );
    expect(result.halfWidth).toBe(64);
    expect(result.halfHeight).toBe(16);
  });

  it('keeps size as the larger half-extent so older builds stay sane', () => {
    const result = snapShapeOverlayToGrid(
      { worldPosition: { x: 0, y: 0 }, size: 60, halfWidth: 60, halfHeight: 20 },
      grid
    );
    expect(result.size).toBe(64);
  });
});

describe('snapShapeOverlayToGrid (per-axis anchor parity)', () => {
  it('anchors a 4x2 rectangle (both axes even) to grid-line corners, not cell centres', () => {
    // halfWidth 60 -> full extent 120 -> 3.75 cells -> 4 cells (even)
    // halfHeight 30 -> full extent 60 -> 1.875 cells -> 2 cells (even)
    const result = snapShapeOverlayToGrid(
      { worldPosition: { x: 500, y: 310 }, size: 60, halfWidth: 60, halfHeight: 30 },
      grid
    );
    expect(result.worldPosition).toEqual({ x: 512, y: 320 });
    expect(result.halfWidth).toBe(64);
    expect(result.halfHeight).toBe(32);
  });

  it('anchors a 3x1 rectangle (both axes odd) to cell centres', () => {
    // halfWidth 45 -> full extent 90 -> 2.8125 cells -> 3 cells (odd)
    // halfHeight 15 -> full extent 30 -> 0.9375 cells -> 1 cell (odd)
    const result = snapShapeOverlayToGrid(
      { worldPosition: { x: 70, y: 10 }, size: 45, halfWidth: 45, halfHeight: 15 },
      grid
    );
    // (70, 10) is in cell (2, 0); centre is (2.5 * 32, 0.5 * 32)
    expect(result.worldPosition).toEqual({ x: 80, y: 16 });
    expect(result.halfWidth).toBe(48);
    expect(result.halfHeight).toBe(16);
  });

  it('anchors a 2x2 square (both axes even) to a grid-line corner', () => {
    // size 30 on both axes -> full extent 60 -> 1.875 cells -> 2 cells (even)
    const result = snapShapeOverlayToGrid({ worldPosition: { x: 70, y: 10 }, size: 30 }, grid);
    expect(result.worldPosition).toEqual({ x: 64, y: 0 });
  });

  it('snaps mixed parity per axis: even width to a grid line, odd height to a cell centre', () => {
    // halfWidth 60 -> 4 cells (even); halfHeight 15 -> 1 cell (odd)
    const result = snapShapeOverlayToGrid(
      { worldPosition: { x: 500, y: 10 }, size: 60, halfWidth: 60, halfHeight: 15 },
      grid
    );
    // x snaps to the grid line at round(500/32)*32 = 512
    // y snaps to the centre of the cell containing y=10, i.e. cell 0 -> 16
    expect(result.worldPosition).toEqual({ x: 512, y: 16 });
  });

  it('leaves hex anchoring unchanged (always the containing hex centre) regardless of cell-count parity', () => {
    const start = { x: 133, y: 71 };
    const cell = hex.worldToGrid(start.x, start.y);
    const centre = hex.getCellCenter(cell.x, cell.y);
    // full extent 110 -> 2.75 hex -> 3 hex (odd)
    const odd = snapShapeOverlayToGrid({ worldPosition: start, size: 55 }, hex);
    expect(odd.worldPosition.x).toBeCloseTo(centre.worldX, 6);
    expect(odd.worldPosition.y).toBeCloseTo(centre.worldY, 6);
    // full extent 80 -> 2 hex (even) -- still anchors to the hex centre, no grid-line concept on hex
    const even = snapShapeOverlayToGrid({ worldPosition: start, size: 40 }, hex);
    expect(even.worldPosition.x).toBeCloseTo(centre.worldX, 6);
    expect(even.worldPosition.y).toBeCloseTo(centre.worldY, 6);
  });
});

describe('hitTestShapeOverlay', () => {
  const rect = (over: Partial<ShapeOverlay> = {}): ShapeOverlay => ({
    id: 'shape-1',
    shape: 'square',
    worldPosition: { x: 100, y: 100 },
    size: 60,
    halfWidth: 60,
    halfHeight: 20,
    color: '#ffffff',
    opacity: 0.5,
    freeform: true,
    visible: true,
    ...over
  });

  it('uses per-axis half-extents when unrotated', () => {
    expect(hitTestShapeOverlay(rect(), 155, 100)).toBe(true);   // inside the long axis
    expect(hitTestShapeOverlay(rect(), 165, 100)).toBe(false);  // past the long axis
    expect(hitTestShapeOverlay(rect(), 100, 115)).toBe(true);   // inside the short axis
    expect(hitTestShapeOverlay(rect(), 100, 125)).toBe(false);  // past the short axis
  });

  it('swaps the axes at 90 degrees', () => {
    const rotated = rect({ rotation: 90 });
    expect(hitTestShapeOverlay(rotated, 155, 100)).toBe(false);
    expect(hitTestShapeOverlay(rotated, 100, 155)).toBe(true);
    expect(hitTestShapeOverlay(rotated, 115, 100)).toBe(true);
    expect(hitTestShapeOverlay(rotated, 125, 100)).toBe(false);
  });

  it('hits along the rotated long axis at 45 degrees', () => {
    const rotated = rect({ rotation: 45 });
    // 50 world units along the rotated long axis is still inside (< 60)
    const d = 50 / Math.SQRT2;
    expect(hitTestShapeOverlay(rotated, 100 + d, 100 + d)).toBe(true);
    // the same distance along the unrotated long axis now falls outside
    expect(hitTestShapeOverlay(rotated, 150, 100)).toBe(false);
  });

  it('ignores rotation for circles', () => {
    const circle = rect({ shape: 'circle', size: 30, rotation: 45 });
    expect(hitTestShapeOverlay(circle, 125, 100)).toBe(true);
    expect(hitTestShapeOverlay(circle, 135, 100)).toBe(false);
  });

  it('treats a legacy square with no half-extents as size on both axes', () => {
    const legacy = rect({ halfWidth: undefined, halfHeight: undefined });
    expect(hitTestShapeOverlay(legacy, 155, 155)).toBe(true);
    expect(hitTestShapeOverlay(legacy, 165, 100)).toBe(false);
  });
});

describe('getShapeBoundingHalfExtents', () => {
  it('returns the half-extents unchanged when unrotated', () => {
    expect(getShapeBoundingHalfExtents({ shape: 'square', size: 60, halfWidth: 60, halfHeight: 20 }))
      .toEqual({ halfWidth: 60, halfHeight: 20 });
  });

  it('swaps them at 90 degrees', () => {
    const b = getShapeBoundingHalfExtents({ shape: 'square', size: 60, halfWidth: 60, halfHeight: 20, rotation: 90 });
    expect(b.halfWidth).toBeCloseTo(20, 6);
    expect(b.halfHeight).toBeCloseTo(60, 6);
  });

  it('grows the box at 45 degrees', () => {
    const b = getShapeBoundingHalfExtents({ shape: 'square', size: 60, halfWidth: 60, halfHeight: 20, rotation: 45 });
    expect(b.halfWidth).toBeCloseTo(80 / Math.SQRT2, 6);
    expect(b.halfHeight).toBeCloseTo(80 / Math.SQRT2, 6);
  });

  it('folds in the extra (north) rotation', () => {
    const b = getShapeBoundingHalfExtents({ shape: 'square', size: 60, halfWidth: 60, halfHeight: 20, rotation: 45 }, 45);
    expect(b.halfWidth).toBeCloseTo(20, 6);
    expect(b.halfHeight).toBeCloseTo(60, 6);
  });

  it('never grows a circle, whatever the rotation', () => {
    const b = getShapeBoundingHalfExtents({ shape: 'circle', size: 30, rotation: 45 }, 90);
    expect(b).toEqual({ halfWidth: 30, halfHeight: 30 });
  });
});
