/**
 * Depth refusal at the tool call sites (TEST-02). The gate itself is covered by
 * depthAuthoring.test.ts; these tests prove the consumers (paint, erase, shape
 * fill and clear) honour a refusal: no write reaches the rung writer (so no
 * history entry and no mapData change), the level-0 handlers are not used as a
 * fallback, and the user is told once. preact/hooks is replaced by a minimal
 * runtime that keeps refs between renders.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const runtime = vi.hoisted(() => ({ refs: [] as Array<{ current: unknown }>, index: 0 }));
vi.mock('preact/hooks', () => ({
  useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, () => {}],
  useRef: (init: unknown) => {
    const i = runtime.index++;
    runtime.refs[i] ??= { current: init };
    return runtime.refs[i];
  },
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useEffect: () => {},
}));

const notices = vi.hoisted(() => ({ messages: [] as string[] }));
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  return { ...actual, Notice: class { constructor(message: string) { notices.messages.push(message); } } };
});

const getSettings = vi.hoisted(() => vi.fn(() => ({} as Record<string, unknown>)));
vi.mock('../../../../src/core/settingsAccessor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/core/settingsAccessor')>();
  return { ...actual, getSettings };
});

import type { MapData } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import { HexGeometry } from '../../../../src/geometry/core/HexGeometry';
import { createGeometryLadder } from '../../../../src/geometry/core/createGeometryLadder';
import { createNewMap } from '../../../../src/persistence/fileOperations';
import { setLevelCells } from '../../../../src/persistence/layerAccessor';
import { MAX_CELLS_PER_DEPTH_OP } from '../../../../src/persistence/depthAuthoring';
import { usePaintTool } from '../../../../src/hooks/drawing/usePaintTool';
import { useShapeTools } from '../../../../src/hooks/drawing/useShapeTools';
import { resetDepthRefusalNotices } from '../../../../src/drawing/depthCellOps';

const LOD = { m: 4, minCellPx: 64, maxLevel: 3 };
const LEVEL = 2;
const root = new HexGeometry(80, 'flat', null);
const ladder = createGeometryLadder(root, { ...LOD });

const cell = (q: number, r: number): Cell => ({ q, r, color: '#4a7c59' } as unknown as Cell);

const healthyMap = (): MapData => ({ ...createNewMap('Depth', 'hex'), lod: { ...LOD } });
/** An unknown subdivision: quarantined, so every deep write is refused and the bytes stay put. */
const quarantinedMap = (): MapData => ({ ...healthyMap(), lod: { m: 7, minCellPx: 64, maxLevel: 3 } });
const withRung = (map: MapData, cells: Cell[]): MapData => setLevelCells(map, map.layers[0].id, LEVEL, cells);

function spies() {
  return {
    onCellsChange: vi.fn(), onCurvesChange: vi.fn(), onObjectsChange: vi.fn(), onTextLabelsChange: vi.fn(),
    onEdgesChange: vi.fn(), onTilesChange: vi.fn(), onLevelCellsChange: vi.fn(() => null),
  };
}

function paint(tool: 'draw' | 'erase', mapData: MapData, s: ReturnType<typeof spies>, deepCell: { x: number; y: number } | null) {
  runtime.index = 0;
  return usePaintTool({
    currentTool: tool, mapData, geometry: root as never, selectedColor: '#4a7c59', selectedOpacity: 1,
    canvasRef: { current: null } as never, screenToGrid: () => ({ x: 0, y: 0 }), screenToWorld: () => ({ x: 0, y: 0 }),
    getClientCoords: () => ({ clientX: 0, clientY: 0 }),
    getTextLabelAtPosition: () => null, removeTextLabel: (l: unknown) => l, getObjectAtPosition: () => null,
    ladder, getEditLevel: () => LEVEL, screenToLevelCell: () => deepCell,
    ...s,
  } as never);
}

function shapes(mapData: MapData, s: ReturnType<typeof spies>) {
  runtime.index = 0;
  return useShapeTools({
    currentTool: 'rectangle', selectedColor: '#4a7c59', selectedOpacity: 1,
    previewSettings: { touchEnabled: false } as never,
    mapData, geometry: root as never, screenToWorld: () => ({ x: 0, y: 0 }), getClientCoords: () => ({ clientX: 0, clientY: 0 }),
    removeObjectsInRectangle: (o: never) => o,
    ladder, getEditLevel: () => LEVEL, screenToLevelCell: () => ({ x: 0, y: 0 }),
    ...s,
  } as never);
}

const event = {} as PointerEvent;

describe('depth refusal at the call sites', () => {
  beforeEach(() => {
    runtime.refs = [];
    notices.messages.length = 0;
    resetDepthRefusalNotices();
    getSettings.mockReset();
    getSettings.mockReturnValue({ lodLadder: true });
  });

  describe.each(['draw', 'erase'] as const)('%s tool', (tool) => {
    it('a quarantined map refuses the press: no write, no level-0 fallback, one notice', () => {
      const map = quarantinedMap();
      const s = spies();
      const t = paint(tool, map, s, { x: 1, y: 1 });
      t.startDrawing(event);
      t.stopDrawing();
      expect(s.onLevelCellsChange).not.toHaveBeenCalled();
      expect(s.onCellsChange).not.toHaveBeenCalled();
      expect(notices.messages).toHaveLength(1);
      expect(map.layers[0].cells).toEqual([]);
    });
  });

  it('an over-cap tick mid-stroke is refused: the rung writer is never called', () => {
    // Pointerdown on a healthy, empty rung (baseline = 0 cells); no cell under the first press.
    const s = spies();
    const down = paint('draw', healthyMap(), s, null);
    down.startDrawing(event);
    // The next render sees a rung already past the per-op cap relative to the stroke baseline.
    const crowded = withRung(healthyMap(), Array.from({ length: MAX_CELLS_PER_DEPTH_OP + 1 }, (_, i) => cell(i, 0)));
    const move = paint('draw', crowded, s, { x: 0, y: 5 });
    move.toggleCell({ x: 0, y: 5 }, true);
    expect(s.onLevelCellsChange).not.toHaveBeenCalled();
    expect(s.onCellsChange).not.toHaveBeenCalled();
    expect(notices.messages).toHaveLength(1);
    // The refusal latches: further ticks of the same stroke stay silent.
    move.toggleCell({ x: 1, y: 5 }, true);
    expect(s.onLevelCellsChange).not.toHaveBeenCalled();
    expect(notices.messages).toHaveLength(1);
  });

  it('control: a healthy deep stroke reaches the rung writer', () => {
    const s = spies();
    const t = paint('draw', healthyMap(), s, { x: 1, y: 1 });
    t.startDrawing(event);
    expect(s.onLevelCellsChange).toHaveBeenCalledTimes(1);
    expect(s.onCellsChange).not.toHaveBeenCalled();
    expect(notices.messages).toHaveLength(0);
  });

  describe('shape tools', () => {
    it('fillRectangle on a quarantined map is refused', () => {
      const s = spies();
      shapes(quarantinedMap(), s).fillRectangle(0, 0, 3, 3, LEVEL);
      expect(s.onLevelCellsChange).not.toHaveBeenCalled();
      expect(s.onCellsChange).not.toHaveBeenCalled();
      expect(notices.messages).toHaveLength(1);
    });

    it('clearRectangle on a quarantined map that holds rung cells is refused', () => {
      const map = { ...withRung(healthyMap(), [cell(0, 0), cell(1, 0)]), lod: { m: 7, minCellPx: 64, maxLevel: 3 } };
      const s = spies();
      shapes(map, s).clearRectangle(-2, -2, 5, 5, LEVEL);
      expect(s.onLevelCellsChange).not.toHaveBeenCalled();
      expect(s.onObjectsChange).not.toHaveBeenCalled();
      expect(notices.messages).toHaveLength(1);
    });

    it('an over-cap fillRectangle is refused', () => {
      const s = spies();
      shapes(healthyMap(), s).fillRectangle(0, 0, 100, 100, LEVEL);
      expect(s.onLevelCellsChange).not.toHaveBeenCalled();
      expect(notices.messages).toHaveLength(1);
    });

    it('control: a small fillRectangle on a healthy map writes once', () => {
      const s = spies();
      shapes(healthyMap(), s).fillRectangle(0, 0, 3, 3, LEVEL);
      expect(s.onLevelCellsChange).toHaveBeenCalledTimes(1);
      expect(notices.messages).toHaveLength(0);
    });
  });
});
