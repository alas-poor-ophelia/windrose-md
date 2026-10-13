/**
 * Pure pieces of the hooks extracted from ObjectLayer (windrose-mn1.61):
 * context-menu target selection, drag-measurement math, multi-selection edits.
 */

import { describe, it, expect, vi } from 'vitest';
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { MapData } from '#types/core/map.types';
import type { SelectedItem } from '#types/contexts/context.types';
import { resolveContextMenuTarget } from '../../../../src/hooks/objects/useObjectContextMenu';
import { computeMeasureDistance } from '../../../../src/hooks/objects/useDragMeasurement';
import { rotateSelection, duplicateSelection, deleteSelection } from '../../../../src/hooks/objects/useMultiSelectionActions';
import { formatDistance, getEffectiveDistanceSettings } from '../../../../src/drawing/distanceOperations';
import { rotateByIncrement } from '../../../../src/drawing/rotationOperations';

function obj(id: string, x: number, y: number, extra: Partial<MapObject> = {}): MapObject {
  return { id, type: 'chest', position: { x, y }, size: { width: 1, height: 1 }, ...extra };
}

function label(id: string, x: number, y: number, rotation?: number): TextLabel {
  return { id, position: { x, y }, content: id, fontSize: 16, fontFace: 'sans', color: '#ffffff', rotation } as TextLabel;
}

function mapWith(objects: MapObject[]): MapData {
  return {
    activeLayerId: 'layer_001',
    layers: [{ id: 'layer_001', objects, textLabels: [] }]
  } as unknown as MapData;
}

const objItem = (o: MapObject): SelectedItem => ({ type: 'object', id: o.id, data: o });
const textItem = (l: TextLabel): SelectedItem => ({ type: 'text', id: l.id, data: l });

describe('resolveContextMenuTarget', () => {
  const a = obj('a', 2, 3);
  const getObjectAtPosition = (objects: MapObject[], x: number, y: number): MapObject | null =>
    objects.find(o => o.position.x === x && o.position.y === y) ?? null;
  const base = {
    mapData: mapWith([a]),
    hasGeometry: true,
    screenToGrid: () => ({ x: 2, y: 3 }),
    getObjectAtPosition,
    selectedItems: [] as SelectedItem[]
  };

  it('claims a right-click on an unselected object', () => {
    expect(resolveContextMenuTarget(base, 10, 10)).toBe(a);
  });

  it('leaves an already-selected object to the selection overlay', () => {
    expect(resolveContextMenuTarget({ ...base, selectedItems: [objItem(a)] }, 10, 10)).toBeNull();
  });

  it('claims an unselected object even while something else is selected', () => {
    const b = obj('b', 0, 0);
    expect(resolveContextMenuTarget({ ...base, selectedItems: [objItem(b)] }, 10, 10)).toBe(a);
  });

  it('ignores clicks on empty cells, off-grid, or without map/geometry', () => {
    expect(resolveContextMenuTarget({ ...base, screenToGrid: () => ({ x: 9, y: 9 }) }, 0, 0)).toBeNull();
    expect(resolveContextMenuTarget({ ...base, screenToGrid: () => null }, 0, 0)).toBeNull();
    expect(resolveContextMenuTarget({ ...base, mapData: null }, 0, 0)).toBeNull();
    expect(resolveContextMenuTarget({ ...base, hasGeometry: false }, 0, 0)).toBeNull();
  });
});

describe('computeMeasureDistance', () => {
  it('returns null when the object has not moved', () => {
    const geometry = { getCellDistance: vi.fn(() => 0) };
    expect(computeMeasureDistance({ x: 1, y: 1 }, { x: 1, y: 1 }, geometry, 'grid', {}, null)).toBeNull();
    expect(geometry.getCellDistance).not.toHaveBeenCalled();
  });

  it.each(['grid', 'hex'] as const)('formats the cell distance with the effective %s settings', (mapType) => {
    const geometry = { getCellDistance: vi.fn(() => 3) };
    const result = computeMeasureDistance({ x: 0, y: 0 }, { x: 3, y: 1 }, geometry, mapType, {}, null);
    const s = getEffectiveDistanceSettings(mapType, {}, null);
    expect(geometry.getCellDistance).toHaveBeenCalledWith(0, 0, 3, 1, { diagonalRule: s.gridDiagonalRule });
    expect(result).toBe(formatDistance(3, s.distancePerCell, s.distanceUnit, s.displayFormat));
  });
});

describe('multi-selection edits', () => {
  it('rotateSelection advances objects and labels and reports updates', () => {
    const a = obj('a', 0, 0);
    const t = label('t', 10, 10, 90);
    const result = rotateSelection({ objects: [a, obj('z', 5, 5)], textLabels: [t] }, [objItem(a), textItem(t)]);
    expect(result.objects[0].rotation).toBe(rotateByIncrement(0));
    expect(result.objects[1].rotation).toBeUndefined();
    expect(result.textLabels[0].rotation).toBe(rotateByIncrement(90));
    expect(result.updates).toEqual([{ id: 'a', rotation: rotateByIncrement(0) }, { id: 't', rotation: rotateByIncrement(90) }]);
  });

  it('duplicateSelection places copies on distinct free cells and shifts labels one gridSize', () => {
    const a = obj('a', 0, 0);
    const b = obj('b', 1, 0);
    const t = label('t', 10, 20);
    const result = duplicateSelection(
      { objects: [a, b], textLabels: [t] },
      [objItem(a), objItem(b), textItem(t)],
      'grid', 40, () => 'text-new'
    );
    expect(result.skippedObjects).toBe(0);
    expect(result.objects).toHaveLength(4);
    const positions = result.objects.map(o => `${o.position.x},${o.position.y}`);
    expect(new Set(positions).size).toBe(4);
    expect(result.textLabels[1]).toMatchObject({ id: 'text-new', position: { x: 50, y: 20 } });
    expect(result.newSelectedItems.map(i => i.type)).toEqual(['object', 'object', 'text']);
  });

  it('deleteSelection removes only the selected objects and labels', () => {
    const a = obj('a', 0, 0);
    const keep = obj('k', 1, 1);
    const t = label('t', 0, 0);
    const result = deleteSelection({ objects: [a, keep], textLabels: [t, label('u', 1, 1)] }, [objItem(a), textItem(t)]);
    expect(result.objects.map(o => o.id)).toEqual(['k']);
    expect(result.textLabels.map(l => l.id)).toEqual(['u']);
  });
});
