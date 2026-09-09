/**
 * shapeOverlayOperations Unit Tests
 *
 * Snapping must work through IGeometry alone, so every case is run against
 * both square-grid and hex geometry.
 */

import { describe, it, expect } from 'vitest';

import { snapShapeOverlayToGrid, snapSizeToWholeCells, getCellWorldSize } from '../../../src/objects/shapeOverlayOperations';
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
  it('moves the anchor to the containing cell centre', () => {
    const result = snapShapeOverlayToGrid({ worldPosition: { x: 70, y: 10 }, size: 30 }, grid);
    // (70, 10) is in cell (2, 0); centre is (2.5 * 32, 0.5 * 32)
    expect(result.worldPosition).toEqual({ x: 80, y: 16 });
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
