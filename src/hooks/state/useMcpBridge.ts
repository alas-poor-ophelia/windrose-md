/**
 * useMcpBridge.ts
 *
 * Registers this map instance on window.__windrose.mcpInstances so the MCP
 * server and E2E harness can read live state and drive operations (paint,
 * tiles, objects, walls/gaps, viewport, drawers).
 *
 * Registration happens ONCE per mount (and again only if the key or readiness
 * changes). The entry's snapshot fields are getters and its ops read the latest
 * params through a ref refreshed every render (the useLayerHandlers latest-ref
 * pattern), so mapData commits never rebuild the registration.
 *
 * Key priority: mcpKey (explicit, used by full-pane ItemViews) > notePath
 * (block mode). Two blocks sharing one key: the first mounted keeps the plain
 * key (so lookups by note path keep working); later ones are listed under
 * `${key}#${instanceId}`. Every entry also carries its own `instanceId`.
 */

import { useEffect, useRef } from 'preact/hooks';
import type { MapData } from '#types/core/map.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { ToolId } from '#types/tools/tool.types';
import type { Cell } from '#types/core/cell.types';
import type { TileAssignment, TileRotation, TileLayerRole, TileForm } from '#types/tiles/tile.types';
import type { MapObject } from '#types/objects/object.types';
import type { WindroseWallGapDebug, WindroseRawGap, WindroseMcpInstance, WindroseMcpOps } from '#types/core/global.types';
import { getActiveLayer, getActiveBoardLayers } from '../../persistence/layerAccessor';
import { getDataFilePath } from '../../core/settingsAccessor';
import { setCell as accessorSetCell, removeCell as accessorRemoveCell, cellToPoint } from '../../geometry/core/cellAccessor';
import { assignmentsOverlap } from '../../assets/tileFootprint';
import { resolveTileEntry } from '../../assets/tilesetOperations';
import { deriveTileForm } from '../../assets/tileForm';
import { getTileMetadataForRender } from '../../persistence/tileMetadata';
import { computeGapSpans, seatedLeafSize } from '../../geometry/renderers/wallPathRenderer';
import { buildGapFlatten, clampGapToSegment, pointAtLength } from '../../drawing/wallGapOperations';
import { placeObject as opsPlaceObject } from '../../objects/objectOperations';
import { getResolvedObjectTypes } from '../../objects/objectTypeResolver';

/**
 * Everything the bridge closes over. Handler types are the minimal call
 * shapes the ops actually use — the component's richer implementations
 * satisfy them contravariantly.
 */
interface UseMcpBridgeParams {
  mapData: MapData | null | undefined;
  mapId: string;
  mapName: string;
  notePath: string;
  mcpKey: string | undefined;
  fullPane: boolean;
  geometry: ExtendedGeometry | null | undefined;
  currentTool: string;
  selectedColor: string;
  selectedOpacity: number;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: string;
  isExpanded: boolean;
  availableTilesets: NonNullable<MapData['tilesets']>;
  setCurrentTool: (tool: ToolId) => void;
  setSelectedColor: (color: string) => void;
  handleOpacityChange: (opacity: number) => void;
  handleCellsChange: (cells: Cell[]) => void;
  wrappedHandleUndo: () => void;
  handleRedo: () => void;
  handleLayerSelect: (layerId: string) => void;
  forceSave: () => unknown;
  handleViewStateChange: (viewState: { center: { x: number; y: number }; zoom: number }) => void;
  handleTileSelect: (tilesetId: string, tileId: string) => void;
  setSelectedTileForm: (form: TileForm) => void;
  handleTilesChange: (tiles: TileAssignment[]) => void;
  handleObjectsChange: (objects: MapObject[]) => void;
  selectPane: (pane: 'tiles' | 'objects') => void;
  setTileBrowserCollapsed: (collapsed: boolean) => void;
  setRailOpenId: (id: string | null) => void;
  getCachedImage: (vaultPath: string) => HTMLImageElement | null;
}

let instanceCounter = 0;

/** Mounted instances per base key, in mount order (first = owns the plain key). */
const mountsByKey = new Map<string, Array<{ id: string; entry: WindroseMcpInstance }>>();

function registryKey(baseKey: string, index: number, id: string): string {
  return index === 0 ? baseKey : `${baseKey}#${id}`;
}

function currentKeys(baseKey: string): string[] {
  return (mountsByKey.get(baseKey) ?? []).map((m, i) => registryKey(baseKey, i, m.id));
}

/** Rewrite window.__windrose.mcpInstances entries for one base key from mountsByKey. */
function syncRegistry(baseKey: string, previous: string[]): void {
  const reg = window.__windrose?.mcpInstances;
  if (reg == null) return;
  for (const k of previous) delete reg[k];
  const list = mountsByKey.get(baseKey) ?? [];
  list.forEach((m, i) => { reg[registryKey(baseKey, i, m.id)] = m.entry; });
}

/** Register an instance; returns the unregister function. Exported for tests. */
function registerMcpInstance(baseKey: string, id: string, entry: WindroseMcpInstance): () => void {
  if (window.__windrose == null) return () => undefined;
  window.__windrose.mcpInstances ??= {};
  const before = currentKeys(baseKey);
  const list = mountsByKey.get(baseKey) ?? [];
  list.push({ id, entry });
  mountsByKey.set(baseKey, list);
  syncRegistry(baseKey, before);
  return () => {
    const prev = currentKeys(baseKey);
    const next = (mountsByKey.get(baseKey) ?? []).filter((m) => m.id !== id);
    if (next.length === 0) mountsByKey.delete(baseKey);
    else mountsByKey.set(baseKey, next);
    syncRegistry(baseKey, prev);
  };
}

/** Params with the non-null map data and geometry the ops require. */
interface BridgeSnapshot extends UseMcpBridgeParams {
  mapData: MapData;
  geometry: ExtendedGeometry;
}

function useMcpBridge(params: UseMcpBridgeParams): void {
  const { mapData, notePath, mcpKey, geometry } = params;

  // Latest-ref: refreshed every render. Holds the last non-null mapData and
  // geometry so ops stay safe if either is briefly absent.
  const latestRef = useRef<BridgeSnapshot | null>(null);
  const renderedAtRef = useRef(Date.now());
  if (mapData != null && geometry != null) {
    latestRef.current = { ...params, mapData, geometry };
    renderedAtRef.current = Date.now();
  }
  const idRef = useRef<string | null>(null);
  idRef.current ??= `mcp-${++instanceCounter}`;

  const key = (mcpKey !== undefined && mcpKey !== '') ? mcpKey : notePath;
  const ready = mapData != null && geometry != null;

  useEffect(() => {
    const instanceId = idRef.current;
    if (instanceId == null || !ready || key === '') return undefined;
    const S = (): BridgeSnapshot => {
      const cur = latestRef.current;
      if (cur == null) throw new Error('Windrose MCP bridge: no map data');
      return cur;
    };

    const ops: WindroseMcpOps = {
      setTool: (toolId: string) => S().setCurrentTool(toolId as ToolId),
      setColor: (color: string) => S().setSelectedColor(color),
      setOpacity: (opacity: number) => S().handleOpacityChange(opacity),
      paintCell: (x: number, y: number, color?: string, opacity?: number): boolean => {
        const { mapData, geometry } = S();
        const activeLayer = getActiveLayer(mapData);
        if (activeLayer == null) return false;
        const c = color ?? S().selectedColor;
        const o = opacity ?? S().selectedOpacity;
        const newCells = accessorSetCell(activeLayer.cells, { x, y }, c, o, geometry);
        S().handleCellsChange(newCells);
        return true;
      },
      paintCells: (cells: Array<{ x: number; y: number; color?: string; opacity?: number }>): number => {
        const { mapData, geometry } = S();
        const activeLayer = getActiveLayer(mapData);
        if (activeLayer == null) return 0;
        let currentCells = activeLayer.cells;
        for (const cell of cells) {
          const c = cell.color ?? S().selectedColor;
          const o = cell.opacity ?? S().selectedOpacity;
          currentCells = accessorSetCell(currentCells, { x: cell.x, y: cell.y }, c, o, geometry);
        }
        S().handleCellsChange(currentCells);
        return cells.length;
      },
      eraseCell: (x: number, y: number): boolean => {
        const { mapData, geometry } = S();
        const activeLayer = getActiveLayer(mapData);
        if (activeLayer == null) return false;
        const newCells = accessorRemoveCell(activeLayer.cells, { x, y }, geometry);
        S().handleCellsChange(newCells);
        return true;
      },
      getCells: (bbox?: { x0: number; y0: number; x1: number; y1: number }): Array<{ x: number; y: number; color: string; opacity: number }> => {
        const { mapData } = S();
        const activeLayer = getActiveLayer(mapData);
        if (activeLayer == null) return [];
        const mapped = activeLayer.cells.map((cell: Cell) => ({
          ...cellToPoint(cell),
          color: cell.color,
          opacity: cell.opacity ?? 1,
        }));
        if (bbox == null) return mapped;
        const xLo = Math.min(bbox.x0, bbox.x1);
        const xHi = Math.max(bbox.x0, bbox.x1);
        const yLo = Math.min(bbox.y0, bbox.y1);
        const yHi = Math.max(bbox.y0, bbox.y1);
        return mapped.filter(c => c.x >= xLo && c.x <= xHi && c.y >= yLo && c.y <= yHi);
      },
      undo: (): boolean => { S().wrappedHandleUndo(); return S().canUndo; },
      redo: (): boolean => { S().handleRedo(); return S().canRedo; },
      selectLayer: (layerId: string) => S().handleLayerSelect(layerId),
      forceSave: () => { void S().forceSave(); },
      setViewport: (x: number, y: number, zoom?: number): { ok: boolean; viewState: { x: number; y: number; zoom: number } } => {
        const { mapData } = S();
        const nextZoom = zoom ?? mapData.viewState?.zoom ?? 1;
        S().handleViewStateChange({ center: { x, y }, zoom: nextZoom });
        return { ok: true, viewState: { x, y, zoom: nextZoom } };
      },
      listTiles: (): Array<{ tilesetId: string; tilesetName: string; tileCount: number; tiles: Array<{ id: string; vaultPath: string }> }> =>
        S().availableTilesets.map(ts => ({
          tilesetId: ts.id,
          tilesetName: ts.name,
          tileCount: ts.tiles.length,
          tiles: ts.tiles.map(t => ({ id: t.id, vaultPath: t.vaultPath })),
        })),
      selectTile: (tilesetId: string, tileId: string): { ok: boolean; note?: string; availableTilesetIds?: string[] } => {
        const ts = S().availableTilesets.find(t => t.id === tilesetId);
        const tile = resolveTileEntry(ts, tileId);
        if (ts == null || tile == null) {
          return { ok: false, availableTilesetIds: S().availableTilesets.map(t => t.id) };
        }
        S().handleTileSelect(tilesetId, tile.id);
        S().setCurrentTool('tilePaint');
        return { ok: true, note: 'subtool defaults to single-stamp when selected programmatically' };
      },
      // Form-aware arming (mirrors a drawer pick, unlike selectTile which
      // always forces tilePaint). Sets selection + derived FORM so the
      // wall/opening coupling effect routes the tool: a wall/path strip
      // (form 'line') and a portal (form 'opening') both auto-arm the wall
      // tool; every other form falls back to tilePaint. This is the path
      // E2E uses to arm structure assets without driving the depth-band DOM.
      armTile: (tilesetId: string, tileId: string): { ok: boolean; form?: TileForm; availableTilesetIds?: string[] } => {
        const ts = S().availableTilesets.find(t => t.id === tilesetId);
        const tile = resolveTileEntry(ts, tileId);
        if (ts == null || tile == null) {
          return { ok: false, availableTilesetIds: S().availableTilesets.map(t => t.id) };
        }
        const meta = tile.vaultPath != null ? getTileMetadataForRender()[tile.vaultPath] : undefined;
        const form = deriveTileForm(meta, ts);
        S().handleTileSelect(tilesetId, tile.id);
        S().setSelectedTileForm(form);
        if (form !== 'line' && form !== 'opening') S().setCurrentTool('tilePaint');
        return { ok: true, form };
      },
      // Non-mutating form probe. The tile-metadata store (ddSourceType) loads
      // async on mount into a non-reactive singleton, so E2E arming must wait
      // until this resolves to the expected form before calling armTile —
      // otherwise a structure asset derives 'cell' and mis-routes to tilePaint.
      deriveForm: (tilesetId: string, tileId: string): TileForm | null => {
        const ts = S().availableTilesets.find(t => t.id === tilesetId);
        const tile = resolveTileEntry(ts, tileId);
        if (ts == null || tile == null) return null;
        const meta = tile.vaultPath != null ? getTileMetadataForRender()[tile.vaultPath] : undefined;
        return deriveTileForm(meta, ts);
      },
      placeTile: (a: { col: number; row: number; tilesetId: string; tileId: string; rotation?: number; depth?: string; scale?: number }): { ok: boolean; tileCount: number; error?: string } => {
        const { mapData } = S();
        const activeLayer = getActiveLayer(mapData);
        if (activeLayer == null) return { ok: false, tileCount: 0, error: 'No active layer' };
        const ts = S().availableTilesets.find(t => t.id === a.tilesetId);
        const tile = resolveTileEntry(ts, a.tileId);
        if (ts == null || tile == null) {
          return { ok: false, tileCount: activeLayer.tiles?.length ?? 0, error: `Unknown tile ${a.tilesetId}/${a.tileId}` };
        }
        const newTile: TileAssignment = {
          col: a.col,
          row: a.row,
          tilesetId: a.tilesetId,
          tileId: tile.id,
          rotation: (a.rotation != null && a.rotation !== 0 ? a.rotation : undefined) as TileRotation | undefined,
          depth: (a.depth != null && a.depth !== 'ground' ? a.depth : undefined) as TileLayerRole | undefined,
          scale: a.scale != null && a.scale !== 1 ? a.scale : undefined,
          spanW: 1,
          spanH: 1,
        };
        const targetPlacement = newTile.placement ?? 'fill';
        const current = activeLayer.tiles ?? [];
        const remaining = current.filter(
          (t: TileAssignment) => (t.placement ?? 'fill') !== targetPlacement || !assignmentsOverlap(t, newTile)
        );
        const nextTiles = [...remaining, newTile];
        S().handleTilesChange(nextTiles);
        return { ok: true, tileCount: nextTiles.length };
      },
      listObjectTypes: (): Array<{ id: string; label: string; category: string }> =>
        getResolvedObjectTypes(S().mapData.mapType ?? 'grid', S().mapData.objectSetId)
          .map(t => ({ id: t.id, label: t.label, category: t.category })),
      listObjects: (): Array<{ id: string; type: string; x: number; y: number; label?: string }> => {
        const { mapData } = S();
        const activeLayer = getActiveLayer(mapData);
        if (activeLayer == null) return [];
        return activeLayer.objects.map(o => ({
          id: o.id,
          type: o.type,
          x: o.position.x,
          y: o.position.y,
          label: o.label,
        }));
      },
      placeObject: (typeId: string, x: number, y: number): { ok: boolean; objectId?: string; error?: string } => {
        const { mapData } = S();
        const activeLayer = getActiveLayer(mapData);
        if (activeLayer == null) return { ok: false, error: 'No active layer' };
        const result = opsPlaceObject(activeLayer.objects, typeId, x, y, {
          mapType: mapData.mapType ?? 'grid',
          objectSetId: mapData.objectSetId,
        });
        if (!result.success) return { ok: false, error: result.error };
        S().handleObjectsChange(result.objects);
        return { ok: true, objectId: result.object?.id };
      },
      openDrawer: (pane: 'tiles' | 'objects' | 'layers' | 'colors' | 'regions' | 'view' | null): { ok: boolean; note?: string } => {
        if (pane === 'tiles' || pane === 'objects') {
          S().selectPane(pane);
          S().setTileBrowserCollapsed(false);
          return { ok: true, note: 'selecting a pane also switches the active tool (Tiles→tilePaint, Objects→addObject)' };
        }
        if (S().fullPane) {
          return { ok: false, note: 'edge-rail panels (layers/colors/regions/view) only exist in block mode, not full-pane' };
        }
        S().setRailOpenId(pane);
        return { ok: true };
      },
      // Structured gap-geometry read for E2E (openings, §10/G-F9) — asserts
      // computed skip intervals + seated-art transforms per wall directly,
      // reserving pixel sampling (canvas dump) for a single smoke test.
      // Scoped to the active board's wall paths, mirroring the fill barrier.
      debugWallGaps: (): WindroseWallGapDebug[] => {
        const { mapData, geometry } = S();
        if (geometry == null) return [];
        const cellSize = geometry.cellSize;
        const out: WindroseWallGapDebug[] = [];
        for (const layer of getActiveBoardLayers(mapData)) {
          for (const wp of layer.wallPaths ?? []) {
            if (wp.gaps == null || wp.gaps.length === 0) continue;
            const flat = buildGapFlatten(wp);
            if (flat.points.length < 2) continue;
            const skips = computeGapSpans(wp, flat, cellSize);
            const wallWidthScale = wp.widthScale > 0 ? wp.widthScale : 1;
            const gaps = wp.gaps.map(gap => {
              const span = clampGapToSegment(gap, flat, cellSize);
              let seated: { x: number; y: number; angle: number; w: number; h: number } | null = null;
              if (gap.tile != null) {
                const ts = S().availableTilesets.find(t => t.id === gap.tile?.tilesetId);
                const entry = resolveTileEntry(ts, gap.tile.tileId);
                const img = entry?.vaultPath != null ? S().getCachedImage(entry.vaultPath) : null;
                if (img != null && img.naturalWidth > 0) {
                  const { x, y, angle } = pointAtLength(flat, span.centerLen);
                  const { w, h } = seatedLeafSize(span.widthWorld, img.naturalWidth, img.naturalHeight, wallWidthScale, gap.tile.heightScale);
                  seated = { x, y, angle: angle + (gap.tile.rotation ?? 0), w, h };
                }
              }
              return {
                gapId: gap.id,
                seg: gap.seg,
                hasTile: gap.tile != null,
                span: { lo: span.lo, hi: span.hi, widthWorld: span.widthWorld },
                seated,
              };
            });
            out.push({ wallId: wp.id, kind: wp.kind, totalLength: flat.totalLength, skips, gaps });
          }
        }
        return out;
      },
      // Raw active-board wall/gap fields for E2E assertions, read from the LIVE
      // in-memory map (not the persisted file). The E2E data file is shared
      // across the sequential Obsidian instances, so a lagging autosave from a
      // prior test can pollute a file read; this live read is instance-scoped
      // and race-immune. Returns the wall count plus per-gap fields the
      // placement/editing suites assert on.
      readWallGaps: (): { walls: number; gaps: WindroseRawGap[] } => {
        const { mapData } = S();
        let walls = 0;
        const gaps: WindroseRawGap[] = [];
        for (const layer of getActiveBoardLayers(mapData)) {
          for (const wp of layer.wallPaths ?? []) {
            walls += 1;
            for (const g of wp.gaps ?? []) {
              gaps.push({
                wallId: wp.id,
                seg: g.seg,
                t: g.t,
                widthCells: g.widthCells,
                widthLocked: g.widthLocked === true,
                bound: g.tile != null,
                flip: g.tile?.flip === true,
              });
            }
          }
        }
        return { walls, gaps };
      },
    };

    const entry: WindroseMcpInstance = {
      get mapId() { return S().mapId; },
      get mapName() { const q = S(); return q.mapData.name ?? q.mapName; },
      get mapType() { return S().mapData.mapType ?? 'grid'; },
      get viewState() {
        const vs = S().mapData.viewState;
        return { x: vs?.center?.x ?? vs?.offsetX ?? 0, y: vs?.center?.y ?? vs?.offsetY ?? 0, zoom: vs?.zoom ?? 1 };
      },
      get activeLayerId() { return getActiveLayer(S().mapData)?.id ?? ''; },
      get layerCount() { return S().mapData.layers.length; },
      get layerIds() { return S().mapData.layers.map((l) => l.id); },
      get currentTool() { return S().currentTool; },
      get selectedColor() { return S().selectedColor; },
      get selectedOpacity() { return S().selectedOpacity; },
      get canUndo() { return S().canUndo; },
      get canRedo() { return S().canRedo; },
      get saveStatus() { return S().saveStatus; },
      get isExpanded() { return S().isExpanded; },
      get dataFilePath() { return getDataFilePath(); },
      get notePath() { return S().notePath; },
      get timestamp() { return renderedAtRef.current; },
      get cellCount() { return getActiveLayer(S().mapData)?.cells.length ?? 0; },
      get layerCellCounts() { return Object.fromEntries(S().mapData.layers.map((l) => [l.id, l.cells.length])); },
      get objectCount() { return S().mapData.layers.reduce((n, l) => n + l.objects.length, 0); },
      get wallPathCount() { return S().mapData.layers.reduce((n, l) => n + (l.wallPaths?.length ?? 0), 0); },
      get textLabelCount() { return S().mapData.layers.reduce((n, l) => n + l.textLabels.length, 0); },
      get context() { return S().fullPane ? 'fullPane' : 'block'; },
      instanceId,
      ops,
    };

    return registerMcpInstance(key, instanceId, entry);
  }, [key, ready]);
}

export { useMcpBridge, registerMcpInstance };
export type { UseMcpBridgeParams };
