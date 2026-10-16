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
function saveRemove(snapshot: MapData, live: MapData): MapData {
  let saved: MapData | null = null;
  const { handleSettingsSave } = usePanelState({
    mapData: snapshot,
    updateMapData: (d) => { saved = typeof d === 'function' ? d(live) : d; }
  });
  handleSettingsSave({ useGlobalSettings: true, overrides: {} }, {} as UIPreferences, null, null, null, false, { kind: 'remove' });
  if (!saved) throw new Error('updateMapData not called');
  return saved;
}

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
});
