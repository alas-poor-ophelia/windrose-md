// @vitest-environment happy-dom
/**
 * useLayerHistory (DATA-06): diff-based per-layer undo.
 * - undo on layer 1 does not revert a Beacon placed on layer 2 afterwards
 * - fog operations enter history and can be undone; undoing a paint keeps a later reveal
 * - history is per sub-hex level: undo only affects the open level, and a
 *   level change (including a trim fallback to an ancestor) clears it
 * - ladder rungs (`levels`) are one diffed layer field: deep strokes, erase to
 *   empty, the first-write `lod` stamp and the cross-rung camera move
 *   (MERGE-01 / MERGE-02 / TEST-01)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useCallback, useState } from 'preact/hooks';

import type { MapData, FogOfWar, PartyPin, LadderConfig } from '../../../../types/core/map.types';
import type { Cell } from '../../../../types/core/cell.types';
import type { MapDataUpdater } from '../../../../types/hooks/mapData.types';
import type { LayerHistorySnapshot } from '../../../../types/hooks/layerHistory.types';

import { useLayerHistory } from '../../../../src/hooks/state/useLayerHistory';
import { createNewMap } from '../../../../src/persistence/fileOperations';
import { addLayer, getActiveLayer, getLayerById, updateActiveLayer, setLevelCells, authoredCells } from '../../../../src/persistence/layerAccessor';
import { snapshotLevelsOf, lodStampForCommit, viewStateAtRung, type ParkedLodStamp } from '../../../../src/hooks/state/layerHistoryOps';
import { ladderParamsFor, getMaxZoom } from '../../../../src/core/lodFlags';
import { chooseLevel } from '../../../../src/geometry/core/lattice';

type Hook = ReturnType<typeof useLayerHistory>;

const cell = (x: number): Cell => ({ x, y: 0, color: '#fff' }) as unknown as Cell;
const pin = (id: string): PartyPin => ({ id, position: { x: 1, y: 1 }, label: id, color: '#f00', range: 1, rangeStyle: 'circle' }) as unknown as PartyPin;
const fog = (cols: number[]): FogOfWar => ({ enabled: true, foggedCells: cols.map(col => ({ col, row: 0 })) }) as unknown as FogOfWar;

/** What useDataHandlers hands to addToHistory: the post-edit snapshot. */
function snapshot(map: MapData, overrides: Partial<LayerHistorySnapshot> = {}): LayerHistorySnapshot {
  const l = getActiveLayer(map);
  return {
    cells: l.cells, curves: l.curves, name: map.name ?? '', objects: l.objects, textLabels: l.textLabels,
    edges: l.edges, tiles: l.tiles ?? [], wallPaths: l.wallPaths ?? [], terrainStrokes: l.terrainStrokes ?? [],
    regions: map.regions ?? [], outlines: map.outlines ?? [], shapeOverlays: map.shapeOverlays ?? [],
    fogOfWar: l.fogOfWar, partyPins: map.partyPins ?? [], savedRoutes: map.savedRoutes ?? [],
    ...overrides
  };
}

interface Mounted {
  hook: () => Hook;
  map: () => MapData;
  store: Map<string, MapData>;
  update: MapDataUpdater;
  setLevel: (key: string | null) => void;
}

let container: HTMLElement | null = null;

function mount(levels: Record<string, MapData>, initialLevel: string | null = null): Mounted {
  const store = new Map<string, MapData>(Object.entries(levels));
  const ROOT = '<root>';
  let hookValue: Hook | null = null;
  let update: MapDataUpdater = () => undefined;
  let setLevel: (key: string | null) => void = () => undefined;
  let currentLevel = initialLevel;

  function Harness(): null {
    const [level, setLevelState] = useState<string | null>(initialLevel);
    const [, force] = useState(0);
    currentLevel = level;
    // Like activeUpdateMapData: every write is a functional update of the live level.
    const updateMapData = useCallback<MapDataUpdater>((u) => {
      const key = currentLevel ?? ROOT;
      const prev = store.get(key);
      if (prev == null) return;
      store.set(key, typeof u === 'function' ? u(prev) : u);
      force((n: number) => n + 1);
    }, []);
    update = updateMapData;
    setLevel = setLevelState;
    hookValue = useLayerHistory({
      mapData: store.get(level ?? ROOT) ?? null,
      updateMapData,
      isLoading: false,
      levelKey: level
    });
    return null;
  }

  container = document.createElement('div');
  act(() => { render(h(Harness, null), container as HTMLElement); });
  return {
    hook: () => hookValue as Hook,
    map: () => store.get(currentLevel ?? ROOT) as MapData,
    store,
    update: (u, o) => { act(() => { update(u, o); }); },
    setLevel: (k) => { act(() => { setLevel(k); }); }
  };
}

/** Emulates a useDataHandlers write: push the snapshot inside the functional update. */
function paint(m: Mounted, cells: Cell[]): void {
  m.update((prev: MapData) => {
    const next = updateActiveLayer(prev, { cells });
    m.hook().addToHistory(snapshot(next));
    return next;
  });
}

function act0(fn: () => void): void {
  act(() => { fn(); });
}

afterEach(() => {
  if (container) render(null, container);
  container = null;
});

describe('useLayerHistory diff-based undo (DATA-06)', () => {
  it('undo on layer 1 does not revert a Beacon placed on layer 2 afterwards', () => {
    const base = createNewMap('Map', 'hex');
    const layer1 = base.activeLayerId;
    const withTwo = addLayer(base);
    const layer2 = withTwo.activeLayerId;
    const m = mount({ '<root>': { ...withTwo, activeLayerId: layer1 } });

    paint(m, [cell(1)]);
    expect(m.hook().canUndo).toBe(true);

    act0(() => m.hook().handleLayerSelect(layer2));
    const pins = [pin('beacon-1')];
    m.update((prev: MapData) => {
      const next = { ...prev, partyPins: pins };
      m.hook().addToHistory(snapshot(next));
      return next;
    });

    act0(() => m.hook().handleLayerSelect(layer1));
    act0(() => m.hook().handleUndo());

    expect(getLayerById(m.map(), layer1)?.cells).toEqual([]);
    expect(m.map().partyPins).toBe(pins);

    // Redo on layer 1 restores the paint; Beacon still there.
    act0(() => m.hook().handleRedo());
    expect(getLayerById(m.map(), layer1)?.cells).toHaveLength(1);
    expect(m.map().partyPins).toBe(pins);

    // Undo on layer 2 removes the Beacon and nothing else.
    act0(() => m.hook().handleLayerSelect(layer2));
    act0(() => m.hook().handleUndo());
    expect(m.map().partyPins ?? []).toEqual([]);
    expect(getLayerById(m.map(), layer1)?.cells).toHaveLength(1);
  });

  it('records a fog reveal and can undo it', () => {
    const base = updateActiveLayer(createNewMap('Map', 'hex'), { fogOfWar: fog([1, 2, 3]) });
    const m = mount({ '<root>': base });

    m.update((prev: MapData) => {
      const next = updateActiveLayer(prev, { fogOfWar: fog([3]) });
      m.hook().recordMapChange(prev, next, { coalesceKey: 'fog' });
      return next;
    });
    expect(getActiveLayer(m.map()).fogOfWar?.foggedCells).toHaveLength(1);
    expect(m.hook().canUndo).toBe(true);

    act0(() => m.hook().handleUndo());
    expect(getActiveLayer(m.map()).fogOfWar?.foggedCells).toHaveLength(3);
  });

  it('undoing a paint does not re-fog a later reveal made outside history', () => {
    const base = updateActiveLayer(createNewMap('Map', 'grid'), { fogOfWar: fog([1, 2]) });
    const m = mount({ '<root>': base });

    paint(m, [cell(1)]);
    const revealed = fog([]);
    // A write that bypasses history entirely (and renders).
    m.update((prev: MapData) => updateActiveLayer(prev, { fogOfWar: revealed }));

    act0(() => m.hook().handleUndo());
    expect(getActiveLayer(m.map()).cells).toEqual([]);
    expect(getActiveLayer(m.map()).fogOfWar).toBe(revealed);
  });

  it('coalesces a fog brush stroke into one entry', () => {
    const base = updateActiveLayer(createNewMap('Map', 'hex'), { fogOfWar: fog([1, 2, 3]) });
    const m = mount({ '<root>': base });
    for (const remaining of [[2, 3], [3], []]) {
      m.update((prev: MapData) => {
        const next = updateActiveLayer(prev, { fogOfWar: fog(remaining) });
        m.hook().recordMapChange(prev, next, { coalesceKey: 'fog' });
        return next;
      });
    }
    act0(() => m.hook().handleUndo());
    expect(getActiveLayer(m.map()).fogOfWar?.foggedCells).toHaveLength(3);
    expect(m.hook().canUndo).toBe(false);
  });

  it('skips a no-op snapshot (reference-equality check kept)', () => {
    const m = mount({ '<root>': createNewMap('Map', 'grid') });
    act0(() => m.hook().addToHistory(snapshot(m.map())));
    expect(m.hook().canUndo).toBe(false);
  });
});

describe('useLayerHistory per sub-hex level', () => {
  it('undo inside a sub-hex only affects that level', () => {
    const root = createNewMap('Root', 'hex');
    const child = createNewMap('Child', 'hex');
    const m = mount({ '<root>': root, 'A': child });

    paint(m, [cell(9)]); // root edit
    const rootAfterPaint = m.store.get('<root>');

    m.setLevel('A');
    expect(m.hook().canUndo).toBe(false);
    paint(m, [cell(1)]);
    act0(() => m.hook().handleUndo());
    expect(getActiveLayer(m.store.get('A') as MapData).cells).toEqual([]);
    // A second undo has nothing to apply: the root entry never crosses levels.
    act0(() => m.hook().handleUndo());
    expect(m.store.get('<root>')).toBe(rootAfterPaint);
    expect(getActiveLayer(m.store.get('A') as MapData).cells).toEqual([]);
  });

  it('a trim fallback to the ancestor clears the dead level history before any undo', () => {
    const root = createNewMap('Root', 'hex');
    const child = createNewMap('Child', 'hex');
    const m = mount({ '<root>': root, 'A': child }, 'A');
    paint(m, [cell(1)]);
    expect(m.hook().canUndo).toBe(true);

    m.store.delete('A');
    m.setLevel(null);
    expect(m.hook().canUndo).toBe(false);
    act0(() => m.hook().handleUndo());
    expect(m.store.get('<root>')).toBe(root);
  });
});

describe('parallax wave-7 hardening', () => {
  it('finding 2: a dead entry (field replaced outside history) is dropped, not spent; the next entry applies in the same keypress', () => {
    const m = mount({ '<root>': createNewMap('Map', 'grid') });
    paint(m, [cell(1)]);
    const pins = [pin('beacon-1')];
    m.update((prev: MapData) => {
      const next = { ...prev, partyPins: pins };
      m.hook().addToHistory(snapshot(next));
      return next;
    });
    // A non-history writer replaces the Beacon array.
    const replaced = [pin('beacon-2')];
    m.update((prev: MapData) => ({ ...prev, partyPins: replaced }));

    let applied = false;
    act0(() => { applied = m.hook().handleUndo(); });
    // The Beacon entry could not apply: dropped; the paint entry applied instead.
    expect(applied).toBe(true);
    expect(getActiveLayer(m.map()).cells).toEqual([]);
    expect(m.map().partyPins).toBe(replaced);
    expect(m.hook().canUndo).toBe(false);
    expect(m.hook().canRedo).toBe(true);

    // The paint redo pair is intact.
    act0(() => { applied = m.hook().handleRedo(); });
    expect(applied).toBe(true);
    expect(getActiveLayer(m.map()).cells).toHaveLength(1);
    expect(m.hook().canRedo).toBe(false);
  });

  it('finding 2: when nothing can apply, the stack empties and undo reports no change', () => {
    const m = mount({ '<root>': createNewMap('Map', 'grid') });
    paint(m, [cell(1)]);
    const replaced = [cell(5)];
    m.update((prev: MapData) => updateActiveLayer(prev, { cells: replaced }));
    const before = m.map();

    let applied = true;
    act0(() => { applied = m.hook().handleUndo(); });
    expect(applied).toBe(false);
    expect(m.map()).toBe(before);
    expect(m.hook().canUndo).toBe(false);
    expect(m.hook().canRedo).toBe(false);
  });

  it('finding 2: the same holds for redo', () => {
    const m = mount({ '<root>': createNewMap('Map', 'grid') });
    paint(m, [cell(1)]);
    act0(() => m.hook().handleUndo());
    expect(m.hook().canRedo).toBe(true);
    m.update((prev: MapData) => updateActiveLayer(prev, { cells: [cell(7)] }));
    let applied = true;
    act0(() => { applied = m.hook().handleRedo(); });
    expect(applied).toBe(false);
    expect(getActiveLayer(m.map()).cells).toHaveLength(1);
    expect(m.hook().canRedo).toBe(false);
  });

  it('finding 7: root history survives a dive into a sub-hex and back', () => {
    const m = mount({ '<root>': createNewMap('Root', 'hex'), 'A': createNewMap('Child', 'hex') });
    paint(m, [cell(9)]);
    m.setLevel('A');
    expect(m.hook().canUndo).toBe(false);
    paint(m, [cell(1)]);
    m.setLevel(null);
    expect(m.hook().canUndo).toBe(true);
    act0(() => m.hook().handleUndo());
    expect(getActiveLayer(m.store.get('<root>') as MapData).cells).toEqual([]);
    // The sub-hex level's history was dropped on exit.
    m.setLevel('A');
    expect(m.hook().canUndo).toBe(false);
  });

  it('finding 8: fog coalescing does not merge across a layer round trip', () => {
    const base = updateActiveLayer(createNewMap('Map', 'hex'), { fogOfWar: fog([1, 2, 3]) });
    const layer1 = base.activeLayerId;
    const withTwo = addLayer(base);
    const layer2 = withTwo.activeLayerId;
    const m = mount({ '<root>': { ...withTwo, activeLayerId: layer1 } });
    const reveal = (remaining: number[]): void => m.update((prev: MapData) => {
      const next = updateActiveLayer(prev, { fogOfWar: fog(remaining) });
      m.hook().recordMapChange(prev, next, { coalesceKey: 'fog' });
      return next;
    });

    reveal([2, 3]);
    act0(() => m.hook().handleLayerSelect(layer2));
    act0(() => m.hook().handleLayerSelect(layer1));
    reveal([3]);

    act0(() => m.hook().handleUndo());
    expect(getActiveLayer(m.map()).fogOfWar?.foggedCells).toHaveLength(2);
    expect(m.hook().canUndo).toBe(true);
  });
});

/**
 * Emulates useDataHandlers.handlePartyPinsChange: the Beacon drag writes every
 * move with suppressHistory (a transient addToHistory) and commits once at drop.
 */
function writePins(m: Mounted, partyPins: PartyPin[], suppressHistory: boolean): void {
  m.update((prev: MapData) => {
    m.hook().addToHistory(snapshot(prev, { partyPins }), { transient: suppressHistory });
    return { ...prev, partyPins };
  });
}

const at = (p: PartyPin, x: number, y: number): PartyPin => ({ ...p, position: { x, y } }) as PartyPin;

describe('live drags commit as one undo step (live check U2)', () => {
  it('paint, then drag a Beacon: the first undo moves the Beacon back, the second removes the paint', () => {
    const base = createNewMap('Map', 'hex');
    const beacon = pin('b');
    const m = mount({ '<root>': { ...base, partyPins: [beacon] } });

    paint(m, [cell(1)]);
    // Drag: two live moves, each rendered, then the drop commit (a new array,
    // as usePartyPinInteraction.stopPartyPinDrag builds with movePartyPin).
    writePins(m, [at(beacon, 2, 1)], true);
    writePins(m, [at(beacon, 3, 1)], true);
    writePins(m, [at(beacon, 3, 1)], false);
    expect(m.map().partyPins?.[0].position).toEqual({ x: 3, y: 1 });

    let changed = false;
    act0(() => { changed = m.hook().handleUndo(); });
    expect(changed).toBe(true);
    expect(m.map().partyPins?.[0].position).toEqual({ x: 1, y: 1 });
    expect(getActiveLayer(m.map()).cells).toHaveLength(1);

    act0(() => { m.hook().handleUndo(); });
    expect(getActiveLayer(m.map()).cells).toHaveLength(0);

    act0(() => { m.hook().handleRedo(); });
    act0(() => { m.hook().handleRedo(); });
    expect(m.map().partyPins?.[0].position).toEqual({ x: 3, y: 1 });
  });

  it('an object-style drop that commits the rendered array itself is still recorded', () => {
    const base = createNewMap('Map', 'hex');
    const beacon = pin('b');
    const m = mount({ '<root>': { ...base, partyPins: [beacon] } });

    writePins(m, [at(beacon, 2, 1)], true);
    // useObjectDragSelect.stopObjectDragging commits getActiveLayer(mapData).objects:
    // the very reference the last live move rendered.
    writePins(m, m.map().partyPins ?? [], false);

    act0(() => { m.hook().handleUndo(); });
    expect(m.map().partyPins?.[0].position).toEqual({ x: 1, y: 1 });
  });
});


// ---------------------------------------------------------------------------
// Ladder rungs
// ---------------------------------------------------------------------------

const LOD: LadderConfig = { m: 4, minCellPx: 64, maxLevel: 3 };
const hexCell = (q: number): Cell => ({ q, r: 0, color: '#4a7c59' }) as unknown as Cell;

/**
 * Emulates useDataHandlers.handleLevelCellsChange: write the rung (stamping
 * `lod` on the first deep write, as depthAuthoring.withLod does), then push
 * the written layer's snapshot with `levels`, `level` and the stamp.
 */
function makeDeepWriter(m: Mounted): (level: number, cells: Cell[], suppress?: boolean) => void {
  let parked: ParkedLodStamp = null;
  return (level, cells, suppress = false) => {
    m.update((prev: MapData) => {
      let next = setLevelCells(prev, prev.activeLayerId, level, cells);
      if (next.lod === undefined && cells.length > 0) next = { ...next, lod: LOD };
      const out = lodStampForCommit(parked, prev, next, suppress, `level:${level}`);
      parked = out.parked;
      const written = getActiveLayer(next);
      m.hook().addToHistory(
        snapshot(next, { ...snapshotLevelsOf(written), level, ...out.stamp }),
        { transient: suppress }
      );
      return next;
    });
  };
}

/** Level-0 paint through the full snapshot builder shape (carries `levels`). */
function paintRoot(m: Mounted, cells: Cell[]): void {
  m.update((prev: MapData) => {
    const next = updateActiveLayer(prev, { cells });
    m.hook().addToHistory(snapshot(next, snapshotLevelsOf(getActiveLayer(next))));
    return next;
  });
}

const levelsOf = (m: Mounted): MapData['layers'][number]['levels'] => getActiveLayer(m.map()).levels;

describe('ladder rungs in history (MERGE-01, MERGE-02, TEST-01)', () => {
  it('ladder: erasing the last rung to empty is undoable', () => {
    const m = mount({ '<root>': createNewMap('Map', 'hex') });
    const write = makeDeepWriter(m);

    write(2, [hexCell(16)]);
    const painted = levelsOf(m);
    expect(authoredCells(getActiveLayer(m.map()), 2)).toEqual([hexCell(16)]);
    expect(m.map().lod).toEqual(LOD);

    write(2, []);
    expect('levels' in getActiveLayer(m.map())).toBe(false);
    expect(m.map().lod).toEqual(LOD);
    expect(m.hook().canUndo).toBe(true);

    // Undo the erase: the cells come back.
    let changed = false;
    act0(() => { changed = m.hook().handleUndo(); });
    expect(changed).toBe(true);
    expect(levelsOf(m)).toBe(painted);
    expect(m.map().lod).toEqual(LOD);
    expect(m.hook().canUndo).toBe(true);

    // Undo the paint (the stamping entry): classic again, nothing skipped.
    act0(() => { changed = m.hook().handleUndo(); });
    expect(changed).toBe(true);
    expect('levels' in getActiveLayer(m.map())).toBe(false);
    expect('lod' in m.map()).toBe(false);
    expect(m.hook().canUndo).toBe(false);

    act0(() => { m.hook().handleRedo(); });
    expect(levelsOf(m)).toBe(painted);
    expect(m.map().lod).toEqual(LOD);

    act0(() => { m.hook().handleRedo(); });
    expect('levels' in getActiveLayer(m.map())).toBe(false);
    expect(m.map().lod).toEqual(LOD);
    expect(m.hook().canRedo).toBe(false);
  });

  it('erase-to-inherit (rung shrinks) records, and a no-op deep write records nothing', () => {
    const m = mount({ '<root>': createNewMap('Map', 'hex') });
    const write = makeDeepWriter(m);
    const two = [hexCell(16), hexCell(17)];
    write(2, two);
    const full = levelsOf(m);

    write(2, two); // same array reference: setLevelCells returns the same map
    write(2, [hexCell(16)]);
    act0(() => { m.hook().handleUndo(); });
    expect(levelsOf(m)).toBe(full);
    // The no-op left no entry between: the next undo is the first paint.
    act0(() => { m.hook().handleUndo(); });
    expect('levels' in getActiveLayer(m.map())).toBe(false);
    expect(m.hook().canUndo).toBe(false);
  });

  it('a level-0 paint on a ladder layer does not record a rung change', () => {
    const m = mount({ '<root>': createNewMap('Map', 'hex') });
    const write = makeDeepWriter(m);
    write(1, [hexCell(4)]);
    const rungs = levelsOf(m);
    paintRoot(m, [cell(1)]);
    act0(() => { m.hook().handleUndo(); });
    expect(getActiveLayer(m.map()).cells).toEqual([]);
    expect(levelsOf(m)).toBe(rungs);
  });

  it('deep stroke records one entry', () => {
    const m = mount({ '<root>': createNewMap('Map', 'hex') });
    const write = makeDeepWriter(m);
    // Suppressed ticks (the first one stamps lod and parks it), then the
    // pointerup commit re-writes the same rung contents.
    write(1, [hexCell(4)], true);
    write(1, [hexCell(4), hexCell(5)], true);
    const stroke = authoredCells(getActiveLayer(m.map()), 1);
    write(1, stroke, false);
    expect(m.hook().canUndo).toBe(true);

    act0(() => { m.hook().handleUndo(); });
    expect('levels' in getActiveLayer(m.map())).toBe(false);
    expect('lod' in m.map()).toBe(false);
    expect(m.hook().canUndo).toBe(false);
  });

  it('undo strips a first-stamp lod, redo re-stamps it', () => {
    const m = mount({ '<root>': createNewMap('Map', 'hex') });
    const write = makeDeepWriter(m);
    write(1, [hexCell(4)]);
    write(1, [hexCell(4), hexCell(5)]);
    expect(m.map().lod).toEqual(LOD);

    act0(() => { m.hook().handleUndo(); });
    expect(m.map().lod).toEqual(LOD); // a non-stamping entry keeps it
    act0(() => { m.hook().handleUndo(); });
    expect('lod' in m.map()).toBe(false);

    act0(() => { m.hook().handleRedo(); });
    expect(m.map().lod).toEqual(LOD);
    expect(authoredCells(getActiveLayer(m.map()), 1)).toEqual([hexCell(4)]);
  });

  it('cross-rung undo emits the camera move, same-rung undo emits none', () => {
    const base: MapData = { ...createNewMap('Map', 'hex'), lod: LOD };
    const params = ladderParamsFor(base);
    const atRoot = viewStateAtRung({ zoom: 1, center: { x: 5, y: 7 } }, 0, params, getMaxZoom(base));
    expect(chooseLevel(atRoot.zoom, params)).toBe(0);

    // Cross-rung: authored on rung 2 while the camera sits on the root.
    const m = mount({ '<root>': { ...base, viewState: atRoot } });
    const write = makeDeepWriter(m);
    write(2, [hexCell(16)]);
    write(2, [hexCell(16), hexCell(17)]);
    act0(() => { m.hook().handleUndo(); });
    const moved = m.map().viewState;
    expect(moved).not.toBe(atRoot);
    expect(chooseLevel(moved?.zoom ?? 0, params)).toBe(2);
    expect(moved?.center).toEqual({ x: 5, y: 7 });

    // Same rung: the camera is already on rung 2; undo leaves the view alone.
    const view = m.map().viewState;
    act0(() => { m.hook().handleUndo(); });
    expect(m.map().viewState).toBe(view);
  });
});
