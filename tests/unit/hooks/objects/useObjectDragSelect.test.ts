/**
 * Single-drag existence gate (INT-09): a deep object dragged onto a rung cell
 * that does not exist is refused, as group drag and placement already refuse.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/core/settingsAccessor', () => ({
  getSettings: () => ({}),
  getObjectSettings: () => ({ objectOverrides: {}, customObjects: [], customCategories: [] }),
  getObjectSettingsForSet: () => null
}));

import { HexGeometry } from '../../../../src/geometry/core/HexGeometry';
import { createGeometryLadder } from '../../../../src/geometry/core/createGeometryLadder';
import { singleDragCellExists } from '../../../../src/hooks/objects/useObjectDragSelect';

const root = new HexGeometry(80, 'flat', { maxCol: 2, maxRow: 2 });
const ladder = createGeometryLadder(root, { m: 4, minCellPx: 64, maxLevel: 3 });

describe('singleDragCellExists', () => {
  it('single drag onto a non-existent deep cell snaps back', () => {
    const exists = singleDragCellExists(ladder);
    // A rung-2 cell at the origin exists; one far past the root edge does not.
    expect(ladder.existsAt(2, 0, 0)).toBe(true);
    expect(ladder.existsAt(2, 500, 500)).toBe(false);
    expect(exists(2, 0, 0)).toBe(true);
    expect(exists(2, 500, 500)).toBe(false);
  });

  it('level 0 and classic maps keep the unchecked single drag', () => {
    expect(singleDragCellExists(ladder)(0, 500, 500)).toBe(true);
    expect(singleDragCellExists(null)(2, 500, 500)).toBe(true);
  });
});
