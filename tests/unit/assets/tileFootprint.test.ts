import { describe, it, expect } from 'vitest';
import {
  effectiveSpan,
  cellsCoveredByAssignment,
  assignmentCoversCell,
  assignmentsOverlap,
  findAssignmentAt,
} from '../../../src/assets/tileFootprint';
import type { TileAssignment } from '../../../types/tiles/tile.types';

function tile(p: Partial<TileAssignment> & { col: number; row: number }): TileAssignment {
  return { tilesetId: 'ts', tileId: 't', ...p } as TileAssignment;
}

describe('effectiveSpan', () => {
  it('defaults missing/invalid spans to 1 and rounds/caps', () => {
    expect(effectiveSpan({})).toEqual({ spanW: 1, spanH: 1 });
    expect(effectiveSpan({ spanW: 0, spanH: -3 })).toEqual({ spanW: 1, spanH: 1 });
    expect(effectiveSpan({ spanW: 2.6, spanH: 999 })).toEqual({ spanW: 3, spanH: 16 });
  });

  it('swaps width/height for 90 and 270 degrees', () => {
    expect(effectiveSpan({ spanW: 2, spanH: 3, rotation: 90 })).toEqual({ spanW: 3, spanH: 2 });
    expect(effectiveSpan({ spanW: 2, spanH: 3, rotation: 270 })).toEqual({ spanW: 3, spanH: 2 });
  });

  it('does not swap for 0 / 180 / hex steps', () => {
    expect(effectiveSpan({ spanW: 2, spanH: 3, rotation: 0 })).toEqual({ spanW: 2, spanH: 3 });
    expect(effectiveSpan({ spanW: 2, spanH: 3, rotation: 180 })).toEqual({ spanW: 2, spanH: 3 });
    expect(effectiveSpan({ spanW: 2, spanH: 3, rotation: 60 })).toEqual({ spanW: 2, spanH: 3 });
  });

  it('normalizes negative/over-360 rotations before checking', () => {
    expect(effectiveSpan({ spanW: 2, spanH: 3, rotation: -90 as never })).toEqual({ spanW: 3, spanH: 2 });
    expect(effectiveSpan({ spanW: 2, spanH: 3, rotation: 450 as never })).toEqual({ spanW: 3, spanH: 2 });
  });
});

describe('cellsCoveredByAssignment', () => {
  it('returns the single anchor cell for a 1x1 tile', () => {
    expect(cellsCoveredByAssignment(tile({ col: 4, row: 5 }))).toEqual([{ col: 4, row: 5 }]);
  });

  it('covers a rectangle extending right/down from the anchor', () => {
    const cells = cellsCoveredByAssignment(tile({ col: 1, row: 1, spanW: 2, spanH: 2 }));
    expect(cells).toEqual([
      { col: 1, row: 1 }, { col: 2, row: 1 },
      { col: 1, row: 2 }, { col: 2, row: 2 },
    ]);
  });

  it('honors the rotation swap', () => {
    const cells = cellsCoveredByAssignment(tile({ col: 0, row: 0, spanW: 3, spanH: 1, rotation: 90 }));
    // 3x1 rotated 90 -> 1x3
    expect(cells).toEqual([{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }]);
  });

  it('returns no cells for freeform stamps', () => {
    expect(cellsCoveredByAssignment(tile({ col: 0, row: 0, freeform: true, worldX: 1, worldY: 1 }))).toEqual([]);
  });
});

describe('assignmentCoversCell', () => {
  const big = tile({ col: 3, row: 3, spanW: 2, spanH: 3 });
  it('is true for anchor and interior cells', () => {
    expect(assignmentCoversCell(big, 3, 3)).toBe(true);
    expect(assignmentCoversCell(big, 4, 5)).toBe(true);
  });
  it('is false just outside the footprint', () => {
    expect(assignmentCoversCell(big, 5, 3)).toBe(false); // col past span
    expect(assignmentCoversCell(big, 3, 6)).toBe(false); // row past span
    expect(assignmentCoversCell(big, 2, 3)).toBe(false); // left of anchor
  });
});

describe('assignmentsOverlap', () => {
  it('detects overlap of two footprints', () => {
    const a = tile({ col: 0, row: 0, spanW: 2, spanH: 2 });
    const b = tile({ col: 1, row: 1, spanW: 2, spanH: 2 });
    expect(assignmentsOverlap(a, b)).toBe(true);
  });
  it('returns false for adjacent, non-overlapping footprints', () => {
    const a = tile({ col: 0, row: 0, spanW: 2, spanH: 2 });
    const b = tile({ col: 2, row: 0, spanW: 2, spanH: 2 });
    expect(assignmentsOverlap(a, b)).toBe(false);
  });
});

describe('findAssignmentAt', () => {
  it('finds the topmost (last-placed) tile covering a cell', () => {
    const tiles = [
      tile({ col: 0, row: 0, spanW: 3, spanH: 3, tileId: 'under' }),
      tile({ col: 1, row: 1, tileId: 'over' }),
    ];
    expect(findAssignmentAt(tiles, 1, 1)?.tileId).toBe('over');
    expect(findAssignmentAt(tiles, 0, 0)?.tileId).toBe('under');
  });

  it('filters by placement tier', () => {
    const tiles = [
      tile({ col: 0, row: 0, spanW: 2, spanH: 2, placement: 'fill', tileId: 'fill' }),
      tile({ col: 0, row: 0, placement: 'overlay', tileId: 'overlay' }),
    ];
    expect(findAssignmentAt(tiles, 1, 1, { placement: 'fill' })?.tileId).toBe('fill');
    expect(findAssignmentAt(tiles, 1, 1, { placement: 'overlay' })).toBeUndefined();
  });

  it('returns undefined when no footprint covers the cell', () => {
    expect(findAssignmentAt([tile({ col: 0, row: 0 })], 5, 5)).toBeUndefined();
  });
});
