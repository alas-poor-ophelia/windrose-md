/**
 * Undo sees ladder rungs (design 06 s5, s19 items 3 and 10): snapshots carry
 * `levels` by reference, restore writes the whole record back (or strips it),
 * and the dedupe comparator keeps stringify for classic snapshots while
 * comparing rungs by reference once `levels` is present.
 */

import { describe, it, expect } from 'vitest';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { LayerHistorySnapshot } from '#types/hooks/layerHistory.types';
import {
  snapshotLevelsOf,
  applySnapshotLevels,
  restoreSnapshotLevels,
  layerHistorySnapshotsEqual,
} from '../../../../src/hooks/state/layerHistoryOps';
import { setLevelCells, authoredCells } from '../../../../src/persistence/layerAccessor';

const cell = (x: number, y: number): Cell => ({ x, y, color: '#4a7c59' } as Cell);

const layer = (over: Partial<MapLayer> = {}): MapLayer => ({
  id: 'L1', name: '1', order: 0, visible: true,
  cells: [cell(0, 0)], curves: [], edges: [], objects: [], textLabels: [], fogOfWar: null,
  ...over,
});

const mapWith = (l: MapLayer): MapData => ({
  schemaVersion: 2, mapType: 'hex', activeLayerId: l.id, layerPanelVisible: false, layers: [l],
} as MapData);

/** Mirrors buildHistoryState in useLayerHistory. */
const snap = (l: MapLayer, over: Partial<LayerHistorySnapshot> = {}): LayerHistorySnapshot => ({
  cells: l.cells, curves: l.curves, name: 'm', objects: l.objects, textLabels: l.textLabels,
  edges: l.edges, regions: [], outlines: [],
  ...snapshotLevelsOf(l),
  ...over,
});

const activeOf = (m: MapData): MapLayer => m.layers[0];

describe('snapshot carries levels', () => {
  it('(1) a layer with a rung-2 cell snapshots with levels and restores it', () => {
    const withRung = activeOf(setLevelCells(mapWith(layer()), 'L1', 2, [cell(16, 0)]));
    const s = snap(withRung);
    expect(s.levels).toBe(withRung.levels);

    const restored = restoreSnapshotLevels(mapWith(layer()), s);
    expect(activeOf(restored).levels).toBe(withRung.levels);
    expect(authoredCells(activeOf(restored), 2)).toEqual([cell(16, 0)]);
  });

  it('(2) a classic snapshot has no levels key and restoring it strips levels', () => {
    const s = snap(layer());
    expect('levels' in s).toBe(false);
    expect(JSON.stringify(s)).not.toContain('levels');

    const deep = setLevelCells(mapWith(layer()), 'L1', 2, [cell(16, 0)]);
    const restored = restoreSnapshotLevels(deep, s);
    expect('levels' in activeOf(restored)).toBe(false);
  });

  it('classic restore onto a classic layer returns the same map and layer', () => {
    const m = mapWith(layer());
    expect(restoreSnapshotLevels(m, snap(layer()))).toBe(m);
    const l = layer();
    expect(applySnapshotLevels(l, snap(l))).toBe(l);
  });

  it('(7) level is carried but ignored on restore: the whole record comes back', () => {
    let m = setLevelCells(mapWith(layer()), 'L1', 1, [cell(4, 0)]);
    m = setLevelCells(m, 'L1', 2, [cell(16, 0)]);
    const s = snap(activeOf(m), { level: 1 });
    expect(s.level).toBe(1);

    const restored = activeOf(restoreSnapshotLevels(mapWith(layer()), s));
    expect(authoredCells(restored, 1)).toEqual([cell(4, 0)]);
    expect(authoredCells(restored, 2)).toEqual([cell(16, 0)]);
    expect('level' in restored).toBe(false);
  });
});

describe('layerHistorySnapshotsEqual', () => {
  const base = setLevelCells(mapWith(layer()), 'L1', 2, [cell(16, 0), cell(17, 0)]);

  it('(3) a deep paint (new rung array) is not deduped', () => {
    const after = setLevelCells(base, 'L1', 2, [cell(16, 0), cell(17, 0), cell(18, 0)]);
    expect(layerHistorySnapshotsEqual(snap(activeOf(base)), snap(activeOf(after)))).toBe(false);
  });

  it('a first deep paint on a classic layer is not deduped', () => {
    const classic = mapWith(layer());
    const after = setLevelCells(classic, 'L1', 1, [cell(4, 0)]);
    expect(layerHistorySnapshotsEqual(snap(activeOf(classic)), snap(activeOf(after)))).toBe(false);
  });

  it('(4) erase-to-inherit (rung shrinks, or rung/container removed) is not deduped', () => {
    const shrunk = setLevelCells(base, 'L1', 2, [cell(16, 0)]);
    expect(layerHistorySnapshotsEqual(snap(activeOf(base)), snap(activeOf(shrunk)))).toBe(false);
    const emptied = setLevelCells(base, 'L1', 2, []);
    expect('levels' in activeOf(emptied)).toBe(false);
    expect(layerHistorySnapshotsEqual(snap(activeOf(base)), snap(activeOf(emptied)))).toBe(false);
  });

  it('(5) a no-op (same references) is deduped, and level does not count', () => {
    const noop = setLevelCells(base, 'L1', 2, authoredCells(activeOf(base), 2));
    expect(noop).toBe(base);
    expect(layerHistorySnapshotsEqual(snap(activeOf(base)), snap(activeOf(noop), { level: 2 }))).toBe(true);
    // A shallow copy of the record with the same rung arrays is still equal.
    const copy = { ...activeOf(base), levels: { ...activeOf(base).levels } };
    expect(layerHistorySnapshotsEqual(snap(activeOf(base)), snap(copy))).toBe(true);
  });

  it('a non-level field change is still detected on the ladder path', () => {
    const l = activeOf(base);
    expect(layerHistorySnapshotsEqual(snap(l), snap(l, { name: 'renamed' }))).toBe(false);
  });

  it('(6) classic snapshots still dedupe by stringify', () => {
    const a = snap(layer());
    const b = snap(layer());
    expect(a.cells).not.toBe(b.cells);
    expect(layerHistorySnapshotsEqual(a, b)).toBe(true);
    expect(layerHistorySnapshotsEqual(a, snap(layer({ cells: [cell(1, 0)] })))).toBe(false);
  });
});
