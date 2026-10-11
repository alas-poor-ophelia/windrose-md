/**
 * Undo sees ladder rungs (design 06 s5, s19 items 3 and 10): snapshots carry
 * `levels` by reference, restore writes the whole record back (or strips it),
 * and the dedupe comparator keeps stringify for classic snapshots while
 * comparing rungs by reference once `levels` is present.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/core/settingsAccessor', () => ({ getSettings: () => ({}) }));
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
import { viewStateForRung, stampedLodOf, undoLodStamp, redoLodStamp } from '../../../../src/hooks/state/layerHistoryOps';

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

describe('lod stamp travels with the first deep write (kgc.15)', () => {
  const LOD = { m: 4, minCellPx: 64, maxLevel: 3 };

  it('stampedLodOf records the block only when the write added it', () => {
    const classic = mapWith(layer());
    const stamped: MapData = { ...classic, lod: LOD };
    expect(stampedLodOf(classic, stamped)).toEqual({ lodStamped: LOD });
    expect(stampedLodOf(stamped, stamped)).toEqual({});
    expect(stampedLodOf(classic, classic)).toEqual({});
  });

  it('undo leaving the stamping entry strips lod; leaving any other entry keeps it', () => {
    const stamped: MapData = { ...mapWith(layer()), lod: LOD };
    const stampingEntry = snap(layer(), { lodStamped: LOD });
    const plainEntry = snap(layer());
    const classicAgain = undoLodStamp(stamped, stampingEntry);
    expect('lod' in classicAgain).toBe(false);
    expect(undoLodStamp(stamped, plainEntry)).toBe(stamped);
    expect(undoLodStamp(stamped, null)).toBe(stamped);
    expect(undoLodStamp(classicAgain, stampingEntry)).toBe(classicAgain);
  });

  it('redo onto the stamping entry puts the block back; onto any other entry changes nothing', () => {
    const classic = mapWith(layer());
    const stampingEntry = snap(layer(), { lodStamped: LOD });
    expect(redoLodStamp(classic, stampingEntry).lod).toEqual(LOD);
    expect(redoLodStamp(classic, snap(layer()))).toBe(classic);
    const already: MapData = { ...classic, lod: LOD };
    expect(redoLodStamp(already, stampingEntry)).toBe(already);
  });

  it('a classic snapshot carries no lodStamped key and still dedupes by stringify', () => {
    const s = snap(layer());
    expect('lodStamped' in s).toBe(false);
    expect(layerHistorySnapshotsEqual(s, snap(layer()))).toBe(true);
  });
});

describe('viewStateForRung: cross-rung undo moves the camera to the rung the change lives on', () => {
  const ladderMap = (zoom: number): MapData => ({
    schemaVersion: 2,
    mapType: 'hex',
    hexSize: 80,
    orientation: 'flat',
    activeLayerId: 'l1',
    layerPanelVisible: false,
    layers: [],
    lod: { m: 4, minCellPx: 64, maxLevel: 3 },
    viewState: { zoom, center: { x: 10, y: 20 } },
  } as unknown as MapData);

  it('returns null for a root-level or undefined entry', () => {
    expect(viewStateForRung(ladderMap(1), 0)).toBeNull();
    expect(viewStateForRung(ladderMap(1), undefined)).toBeNull();
  });

  it('returns null when the rung is already active', () => {
    // crossings at 0.4, 1.6, 6.4, 25.6: zoom 8 is inside level 2's band
    expect(viewStateForRung(ladderMap(8), 2)).toBeNull();
  });

  it('moves to the middle of the rung band, keeping the centre', () => {
    const view = viewStateForRung(ladderMap(1), 2);
    expect(view).not.toBeNull();
    if (view === null) return;
    expect(view.center).toEqual({ x: 10, y: 20 });
    expect(view.zoom).toBeCloseTo(6.4 * 2, 9);
    expect(view.zoom).toBeGreaterThanOrEqual(6.4);
    expect(view.zoom).toBeLessThan(25.6);
  });

  it('returns null on a classic map (no lod, flag off) and for a rung past maxLevel', () => {
    const classic = { ...ladderMap(1), lod: undefined } as unknown as MapData;
    expect(viewStateForRung(classic, 2)).toBeNull();
    expect(viewStateForRung(ladderMap(1), 4)).toBeNull();
  });
});
