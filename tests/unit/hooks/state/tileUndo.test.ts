// @vitest-environment happy-dom
/**
 * Tile placement undo (live check A5 side finding): a tile stamp or a brush
 * stroke written the way TilePlacementLayer writes it, through the real
 * useDataHandlers.handleTilesChange into the real useLayerHistory, must leave
 * exactly one undo step that removes it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useCallback, useState } from 'preact/hooks';

import type { MapData } from '../../../../types/core/map.types';
import type { MapDataUpdater } from '../../../../types/hooks/mapData.types';
import type { TileAssignment } from '../../../../types/tiles/tile.types';

import { useLayerHistory } from '../../../../src/hooks/state/useLayerHistory';
import { useDataHandlers } from '../../../../src/hooks/state/useDataHandlers';
import { createNewMap } from '../../../../src/persistence/fileOperations';
import { getActiveLayer, promoteToStrata } from '../../../../src/persistence/layerAccessor';

interface Mounted {
  map: () => MapData;
  history: () => ReturnType<typeof useLayerHistory>;
  tiles: (t: TileAssignment[], suppress?: boolean) => void;
}

let container: HTMLElement | null = null;

function mount(initial: MapData): Mounted {
  let map = initial;
  let history: ReturnType<typeof useLayerHistory> | null = null;
  let handlers: ReturnType<typeof useDataHandlers> | null = null;

  function Harness(): null {
    const [, force] = useState(0);
    const updateMapData = useCallback<MapDataUpdater>((u) => {
      map = typeof u === 'function' ? (u(map) ?? map) : u;
      force((n: number) => n + 1);
    }, []);
    history = useLayerHistory({ mapData: map, updateMapData, isLoading: false, levelKey: null });
    handlers = useDataHandlers({
      mapData: map,
      updateMapData,
      addToHistory: history.addToHistory,
      isApplyingHistory: history.isApplyingHistory
    });
    return null;
  }

  container = document.createElement('div');
  act(() => { render(h(Harness, null), container as HTMLElement); });
  return {
    map: () => map,
    history: () => history as ReturnType<typeof useLayerHistory>,
    // Each pointer event is its own act(): a render lands between writes, as live.
    tiles: (t, suppress = false) => { act(() => { (handlers as ReturnType<typeof useDataHandlers>).handleTilesChange(t, suppress); }); }
  };
}

const tile = (col: number, row: number): TileAssignment => ({ col, row, tilesetId: 'ts', tileId: 't1' });

/** One brush stroke as TilePlacementLayer runs it: live writes, then the commit of the stroke ref. */
function stroke(m: Mounted, cells: Array<[number, number]>): void {
  let strokeTiles = [...(getActiveLayer(m.map()).tiles ?? [])];
  for (const [c, r] of cells) {
    strokeTiles = [...strokeTiles, tile(c, r)];
    m.tiles(strokeTiles, true);
  }
  m.tiles(strokeTiles, false);
}

afterEach(() => {
  if (container) render(null, container);
  container = null;
});

const maps: Array<[string, () => MapData]> = [
  ['simple map (first tile promotes to strata)', () => createNewMap('Map', 'hex')],
  ['strata map', () => promoteToStrata(createNewMap('Map', 'hex'))],
];

describe.each(maps)('tile placement undo on a %s', (_label, make) => {
  it('one stamp is one undo step that removes it', () => {
    const m = mount(make());
    m.tiles([tile(1, 1)]);
    expect(getActiveLayer(m.map()).tiles).toHaveLength(1);
    expect(m.history().canUndo).toBe(true);

    let changed = false;
    act(() => { changed = m.history().handleUndo(); });
    expect(changed).toBe(true);
    expect(getActiveLayer(m.map()).tiles ?? []).toHaveLength(0);
  });

  it('a brush stroke over several cells is one undo step', () => {
    const m = mount(make());
    stroke(m, [[1, 1], [2, 1], [3, 1]]);
    expect(getActiveLayer(m.map()).tiles).toHaveLength(3);
    expect(m.history().canUndo).toBe(true);

    act(() => { m.history().handleUndo(); });
    expect(getActiveLayer(m.map()).tiles ?? []).toHaveLength(0);
    expect(m.history().canUndo).toBe(false);
  });

  it('a single-click stroke (down + up, one cell) is one undo step', () => {
    const m = mount(make());
    stroke(m, [[4, 4]]);
    act(() => { m.history().handleUndo(); });
    expect(getActiveLayer(m.map()).tiles ?? []).toHaveLength(0);
  });

  it('eight paced clicks give eight undo steps', () => {
    const m = mount(make());
    for (let i = 0; i < 8; i++) stroke(m, [[i, 0]]);
    expect(getActiveLayer(m.map()).tiles).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      let changed = false;
      act(() => { changed = m.history().handleUndo(); });
      expect(changed).toBe(true);
    }
    expect(getActiveLayer(m.map()).tiles ?? []).toHaveLength(0);
  });
});

describe('region label drag (fix-beacon-undo follow-up)', () => {
  it('a label drag of several moves is one undo step', () => {
    let map = createNewMap('Map', 'hex');
    const region = { id: 'r1', name: 'R', hexes: [{ x: 0, y: 0 }], color: '#f00' } as unknown as NonNullable<MapData['regions']>[number];
    map = { ...map, regions: [region] };
    const got: { history: ReturnType<typeof useLayerHistory> | null; handlers: ReturnType<typeof useDataHandlers> | null } = { history: null, handlers: null };
    function Harness(): null {
      const [, force] = useState(0);
      const updateMapData = useCallback<MapDataUpdater>((u) => {
        map = typeof u === 'function' ? (u(map) ?? map) : u;
        force((n: number) => n + 1);
      }, []);
      const history = useLayerHistory({ mapData: map, updateMapData, isLoading: false, levelKey: null });
      got.history = history;
      got.handlers = useDataHandlers({ mapData: map, updateMapData, addToHistory: history.addToHistory, isApplyingHistory: history.isApplyingHistory });
      return null;
    }
    container = document.createElement('div');
    act(() => { render(h(Harness, null), container as HTMLElement); });
    const H = (): ReturnType<typeof useDataHandlers> => got.handlers as ReturnType<typeof useDataHandlers>;
    const at = (x: number): NonNullable<MapData['regions']> => [{ ...region, labelPosition: { x, y: 0 } }];

    // As useRegionTools: live moves suppressed, the drop commits the last regions.
    act(() => { H().handleRegionsChange(at(10), true); });
    act(() => { H().handleRegionsChange(at(20), true); });
    act(() => { H().handleRegionsChange(at(30), true); });
    act(() => { H().handleRegionsChange(map.regions ?? [], false); });
    expect(map.regions?.[0].labelPosition).toEqual({ x: 30, y: 0 });

    act(() => { (got.history as ReturnType<typeof useLayerHistory>).handleUndo(); });
    expect(map.regions?.[0].labelPosition).toBeUndefined();
    expect((got.history as ReturnType<typeof useLayerHistory>).canUndo).toBe(false);
  });
});
