import { describe, it, expect } from 'vitest';
import {
  rotationStepsFor,
  nextRotation,
  normalizeRotation,
  isOnRotationGrid,
  snapRotationToGrid,
  tileGeometryKind,
  FREEFORM_ROTATION_INCREMENT,
} from '../../../src/assets/tileRotation';
import { effectiveSpan } from '../../../src/assets/tileFootprint';

describe('rotationStepsFor', () => {
  it('grid + snapped is 90-degree steps', () => {
    expect(rotationStepsFor('grid', false)).toEqual([0, 90, 180, 270]);
  });

  it('hex + snapped is 60-degree steps', () => {
    expect(rotationStepsFor('hex', false)).toEqual([0, 60, 120, 180, 240, 300]);
  });

  it('freeform is 15-degree steps (24 positions) on both geometries', () => {
    const expected = Array.from({ length: 24 }, (_, i) => i * 15);
    expect(FREEFORM_ROTATION_INCREMENT).toBe(15);
    expect(rotationStepsFor('grid', true)).toEqual(expected);
    expect(rotationStepsFor('hex', true)).toEqual(expected);
  });

  it('maps mapType strings to a geometry kind (anything not hex is grid)', () => {
    expect(tileGeometryKind('hex')).toBe('hex');
    expect(tileGeometryKind('grid')).toBe('grid');
    expect(tileGeometryKind(undefined)).toBe('grid');
  });
});

describe('nextRotation', () => {
  it('a grid + snapped cycle never yields 60, in either direction', () => {
    const steps = rotationStepsFor('grid', false);
    for (const dir of [1, -1] as const) {
      let r = 0;
      const seen: number[] = [];
      for (let i = 0; i < 8; i++) {
        r = nextRotation(r, steps, dir);
        seen.push(r);
      }
      expect(seen).not.toContain(60);
      expect(new Set(seen)).toEqual(new Set([0, 90, 180, 270]));
    }
  });

  it('cycles clockwise and counter-clockwise with wraparound', () => {
    const grid = rotationStepsFor('grid', false);
    expect(nextRotation(0, grid, 1)).toBe(90);
    expect(nextRotation(270, grid, 1)).toBe(0);
    expect(nextRotation(0, grid, -1)).toBe(270);
    const hex = rotationStepsFor('hex', false);
    expect(nextRotation(300, hex, 1)).toBe(0);
    expect(nextRotation(60, hex, -1)).toBe(0);
    const free = rotationStepsFor('grid', true);
    expect(nextRotation(0, free, 1)).toBe(15);
    expect(nextRotation(0, free, -1)).toBe(345);
  });

  it('snaps from an off-grid value to the nearest step in the cycle direction', () => {
    const grid = rotationStepsFor('grid', false);
    // Legacy 60-degree tile on a grid map
    expect(nextRotation(60, grid, 1)).toBe(90);
    expect(nextRotation(60, grid, -1)).toBe(0);
    expect(nextRotation(300, grid, 1)).toBe(0);
    expect(nextRotation(300, grid, -1)).toBe(270);
    const hex = rotationStepsFor('hex', false);
    expect(nextRotation(90, hex, 1)).toBe(120);
    expect(nextRotation(90, hex, -1)).toBe(60);
    const free = rotationStepsFor('hex', true);
    expect(nextRotation(7, free, 1)).toBe(15);
    expect(nextRotation(7, free, -1)).toBe(0);
  });

  it('normalises out-of-range input before stepping', () => {
    const grid = rotationStepsFor('grid', false);
    expect(nextRotation(-90, grid, 1)).toBe(0);
    expect(nextRotation(450, grid, 1)).toBe(180);
  });
});

describe('grid helpers', () => {
  it('normalizeRotation folds into [0, 360)', () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-15)).toBe(345);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });

  it('isOnRotationGrid / snapRotationToGrid', () => {
    const grid = rotationStepsFor('grid', false);
    expect(isOnRotationGrid(60, grid)).toBe(false);
    expect(isOnRotationGrid(-90, grid)).toBe(true);
    expect(snapRotationToGrid(60, grid)).toBe(90);
    expect(snapRotationToGrid(15, grid)).toBe(0);
    expect(snapRotationToGrid(345, grid)).toBe(0);
  });
});

describe('footprint with off-grid rotations', () => {
  it('a legacy 60-degree or freeform 15-degree rotation keeps the authored span', () => {
    expect(effectiveSpan({ spanW: 2, spanH: 1, rotation: 60 })).toEqual({ spanW: 2, spanH: 1 });
    expect(effectiveSpan({ spanW: 2, spanH: 1, rotation: 15 })).toEqual({ spanW: 2, spanH: 1 });
    expect(effectiveSpan({ spanW: 2, spanH: 1, rotation: -90 })).toEqual({ spanW: 1, spanH: 2 });
  });
});
