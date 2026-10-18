/**
 * Undo sees ladder rungs (design 06 s5, s19 items 3 and 10): snapshots carry
 * `levels` by reference, and restore writes the whole record back (or strips
 * it, also for the EMPTY_LEVELS sentinel). Recording, dedupe and erase-to-empty
 * are covered against the real hook in useLayerHistory.test.ts (MERGE-02).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/core/settingsAccessor', () => ({ getSettings: () => ({}) }));
import type { MapData, MapLayer } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { LayerHistorySnapshot } from '#types/hooks/layerHistory.types';
import {
  EMPTY_LEVELS,
  snapshotLevelsOf,
  applySnapshotLevels,
} from '../../../../src/hooks/state/layerHistoryOps';
import { setLevelCells, authoredCells } from '../../../../src/persistence/layerAccessor';
import { viewStateForRung, stampedLodOf, lodStampForCommit, undoLodStamp, redoLodStamp } from '../../../../src/hooks/state/layerHistoryOps';

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

    const restored = applySnapshotLevels(layer(), s);
    expect(restored.levels).toBe(withRung.levels);
    expect(authoredCells(restored, 2)).toEqual([cell(16, 0)]);
  });

  it('(2) a classic snapshot has no levels key and restoring it strips levels', () => {
    const s = snap(layer());
    expect('levels' in s).toBe(false);
    expect(JSON.stringify(s)).not.toContain('levels');

    const deep = activeOf(setLevelCells(mapWith(layer()), 'L1', 2, [cell(16, 0)]));
    expect('levels' in applySnapshotLevels(deep, s)).toBe(false);
  });

  it('restoring the EMPTY_LEVELS sentinel strips the key and never writes the sentinel', () => {
    const deep = activeOf(setLevelCells(mapWith(layer()), 'L1', 2, [cell(16, 0)]));
    const stripped = applySnapshotLevels(deep, { levels: EMPTY_LEVELS });
    expect('levels' in stripped).toBe(false);
    const classic = layer();
    expect(applySnapshotLevels(classic, { levels: EMPTY_LEVELS })).toBe(classic);
    expect(Object.isFrozen(EMPTY_LEVELS)).toBe(true);
  });

  it('classic restore onto a classic layer returns the same layer', () => {
    const l = layer();
    expect(applySnapshotLevels(l, snap(l))).toBe(l);
  });

  it('(7) level is carried but ignored on restore: the whole record comes back', () => {
    let m = setLevelCells(mapWith(layer()), 'L1', 1, [cell(4, 0)]);
    m = setLevelCells(m, 'L1', 2, [cell(16, 0)]);
    const s = snap(activeOf(m), { level: 1 });
    expect(s.level).toBe(1);

    const restored = applySnapshotLevels(layer(), s);
    expect(authoredCells(restored, 1)).toEqual([cell(4, 0)]);
    expect(authoredCells(restored, 2)).toEqual([cell(16, 0)]);
    expect('level' in restored).toBe(false);
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

  it('a classic snapshot carries no lodStamped key', () => {
    expect('lodStamped' in snap(layer())).toBe(false);
  });

  it('undo of the stamping entry keeps a lod edited after the stamp', () => {
    const stampingEntry = snap(layer(), { lodStamped: LOD });
    // A settings save after the stamp (not a history entry) changed minCellPx.
    const edited: MapData = { ...mapWith(layer()), lod: { ...LOD, minCellPx: 96 } };
    expect(undoLodStamp(edited, stampingEntry)).toBe(edited);
    // Equal by value (a fresh object) still lifts.
    const sameValue: MapData = { ...mapWith(layer()), lod: { ...LOD } };
    expect('lod' in undoLodStamp(sameValue, stampingEntry)).toBe(false);
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

describe('stale lod stamp (Codex review, blocking)', () => {
  const LOD = { m: 4, minCellPx: 64, maxLevel: 3 };
  const homedObject = { id: 'o1', type: 'chest', position: { x: 1, y: 1 }, homeLevel: 2 } as unknown as MapLayer['objects'][number];

  it('undo leaving a lodStamped entry keeps lod while authored rungs remain (no levels-without-lod)', () => {
    // A cancelled L2 stroke left rung cells; an unrelated label entry carries the stamp.
    const restoredTo: MapData = { ...mapWith(layer({ levels: { 2: [cell(3, 3)] } })), lod: LOD };
    const labelEntry = snap(layer(), { lodStamped: LOD });
    expect(undoLodStamp(restoredTo, labelEntry)).toBe(restoredTo);
  });

  it('undo keeps lod while a homed element remains', () => {
    const restoredTo: MapData = { ...mapWith(layer({ objects: [homedObject] })), lod: LOD };
    expect(undoLodStamp(restoredTo, snap(layer(), { lodStamped: LOD }))).toBe(restoredTo);
  });

  it('undo keeps lod while ANOTHER layer holds depth content', () => {
    const other = layer({ id: 'L2', levels: { 1: [cell(2, 2)] } });
    const base = mapWith(layer());
    const restoredTo: MapData = { ...base, layers: [...base.layers, other], lod: LOD };
    expect(undoLodStamp(restoredTo, snap(layer(), { lodStamped: LOD }))).toBe(restoredTo);
  });

  it('undo strips lod when no depth content remains', () => {
    const restoredTo: MapData = { ...mapWith(layer({ levels: {} })), lod: LOD };
    expect('lod' in undoLodStamp(restoredTo, snap(layer(), { lodStamped: LOD }))).toBe(false);
  });

  describe('lodStampForCommit (parked stamp is claimed only by its own channel)', () => {
    const classic = mapWith(layer());
    const stamped: MapData = { ...classic, lod: LOD };

    it('a suppressed tick that stamps parks under its channel and records nothing', () => {
      const out = lodStampForCommit(null, classic, stamped, true, 'level:2');
      expect(out).toEqual({ parked: { channel: 'level:2', lod: LOD }, stamp: {} });
    });

    it('the same channel commit claims the parked stamp and clears the park', () => {
      const out = lodStampForCommit({ channel: 'level:2', lod: LOD }, stamped, stamped, false, 'level:2');
      expect(out).toEqual({ parked: null, stamp: { lodStamped: LOD } });
    });

    it('a cancelled stroke: an unrelated commit (text label) drops the park and carries no stamp', () => {
      const out = lodStampForCommit({ channel: 'level:2', lod: LOD }, stamped, stamped, false, 'textLabels');
      expect(out).toEqual({ parked: null, stamp: {} });
      // A different rung is a different channel too.
      expect(lodStampForCommit({ channel: 'level:2', lod: LOD }, stamped, stamped, false, 'level:3').stamp).toEqual({});
    });

    it('a commit that stamps itself records its own stamp', () => {
      const out = lodStampForCommit({ channel: 'tiles', lod: LOD }, classic, stamped, false, 'objects');
      expect(out).toEqual({ parked: null, stamp: { lodStamped: LOD } });
    });

    it('a non-stamping suppressed tick keeps an existing park', () => {
      const parked = { channel: 'tiles', lod: LOD };
      expect(lodStampForCommit(parked, stamped, stamped, true, 'tiles').parked).toBe(parked);
    });
  });
});
