/**
 * usePanelState settings save: the ladder `remove` patch is decided against
 * the modal's snapshot, so it is re-checked against the live map inside the
 * updater (PX-07). preact/hooks is stubbed; handleSettingsSave is plain code.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('preact/hooks', () => ({
  useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, () => {}],
  useMemo: (fn: () => unknown) => fn(),
  useEffect: () => {},
}));

import { usePanelState } from '../../../../src/hooks/state/usePanelState';

import type { MapData, MapLayer } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { UIPreferences } from '#types/index';
import type { LadderPatch } from '../../../../src/core/lodFlags';

const LOD = { m: 4, minCellPx: 64, maxLevel: 3 };

const layer = (over: Partial<MapLayer> = {}): MapLayer => ({
  id: 'L1', name: '1', order: 0, visible: true,
  cells: [], curves: [], edges: [], objects: [], textLabels: [], fogOfWar: null,
  ...over,
} as MapLayer);

const hexMap = (l: MapLayer): MapData => ({
  schemaVersion: 2, mapType: 'hex', activeLayerId: l.id, layerPanelVisible: false, layers: [l], lod: LOD,
} as unknown as MapData);

/** Open the modal on `snapshot`, but let the save land on `live`. */
function save(snapshot: MapData, live: MapData, patch: LadderPatch): MapData {
  let saved: MapData | null = null;
  const { handleSettingsSave } = usePanelState({
    mapData: snapshot,
    updateMapData: (d) => { saved = typeof d === 'function' ? d(live) : d; }
  });
  handleSettingsSave({ useGlobalSettings: true, overrides: {} }, {} as UIPreferences, null, null, null, false, null, patch);
  if (!saved) throw new Error('updateMapData not called');
  return saved;
}

const saveRemove = (snapshot: MapData, live: MapData): MapData => save(snapshot, live, { kind: 'remove' });

describe('usePanelState ladder patch (PX-07)', () => {
  it('remove strips lod from a map without depth content', () => {
    const m = hexMap(layer());
    expect('lod' in saveRemove(m, m)).toBe(false);
  });

  it('remove patch is refused when rungs appeared after the modal opened', () => {
    const snapshot = hexMap(layer());
    const live = hexMap(layer({ levels: { 1: [{ q: 2, r: 0, color: '#fff' } as unknown as Cell] } }));
    const saved = saveRemove(snapshot, live);
    expect(saved.lod).toEqual(LOD);
    expect(saved.layers[0].levels).toBe(live.layers[0].levels);
  });

  const rungCell = { q: 2, r: 0, color: '#fff' } as unknown as Cell;

  it('stale set with a different m keeps the stored m', () => {
    // The modal opened on a map with no rungs; rungs 1 and 3 appeared since.
    const snapshot = hexMap(layer());
    const live = hexMap(layer({ levels: { 1: [rungCell], 3: [rungCell] } }));
    const saved = save(snapshot, live, { kind: 'set', lod: { m: 3, minCellPx: 48, maxLevel: 2 } });
    expect(saved.lod).toEqual({ m: 4, minCellPx: 48, maxLevel: 3 });
    expect(saved.layers[0].levels).toBe(live.layers[0].levels);
  });

  it('stale set with a different m keeps the stored m when only a homed object is deep', () => {
    const snapshot = hexMap(layer());
    const deepObject = { id: 'o', type: 'entrance', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, homeLevel: 2 };
    const live = hexMap(layer({ objects: [deepObject] as unknown as MapLayer['objects'] }));
    const saved = save(snapshot, live, { kind: 'set', lod: { m: 3, minCellPx: 48, maxLevel: 3 } });
    expect(saved.lod).toEqual({ m: 4, minCellPx: 48, maxLevel: 3 });
  });

  it('set without live depth content applies as given', () => {
    const m = hexMap(layer());
    expect(save(m, m, { kind: 'set', lod: { m: 3, minCellPx: 48, maxLevel: 2 } }).lod).toEqual({ m: 3, minCellPx: 48, maxLevel: 2 });
  });

  it('set on a quarantined map does not un-quarantine', () => {
    // Rungs without a lod block: quarantined 'levels-without-lod'.
    const { lod: _lod, ...quarantined } = hexMap(layer({ levels: { 1: [rungCell] } }));
    void _lod;
    const live = quarantined as MapData;
    const saved = save(live, live, { kind: 'set', lod: { m: 4, minCellPx: 64, maxLevel: 3 } });
    expect(saved.lod).toBeUndefined();
    expect(saved.layers[0].levels).toBe(live.layers[0].levels);
  });
});
