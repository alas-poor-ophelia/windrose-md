/**
 * TilePlacementLayer.tsx
 *
 * Interaction layer for placing tile images on hex or grid maps. Behavior is
 * driven by the armed placement subtool from the drawer ribbon: paint
 * (grid-snap with brush size), stamp/scatter (freeform), fill (flood fill,
 * also Shift+click), while brush/line are owned by other layers. Bresenham
 * interpolation fills gaps during fast drag strokes.
 *
 * Lattice ladder: a gesture latches the active rung at pointerdown. A deep
 * gesture (rung >= 1) resolves cells on that rung's own lattice, stamps
 * `homeLevel` on what it places, and only ever replaces/erases tiles homed on
 * the same rung (rung cells of different levels share index space). Deep
 * gestures pass the same depth-authoring gate as cell paint.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { TileAssignment, TileRotation, TileLayerRole, TilesetDef, TileMetadataStore } from '#types/tiles/tile.types';
import type { TileSubtoolId } from '#types/tiles/tile.types';

import { Notice } from 'obsidian';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { assertNever } from '../../utils/assertNever';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { useApp } from '../../context/AppContext';
import { getActiveLayer, getActiveBoardLayers } from '../../persistence/layerAccessor';
import { preloadImage } from '../../assets/imageOperations';
import { resolveTileEntry } from '../../assets/tilesetOperations';
import { useTileMetadata } from '../../hooks/state/useTileMetadata';
import type { ResolvedTileRender } from '../../assets/tileRenderResolution';
import { resolveTileRender, EDGE_BLEND_FEATHER } from '../../assets/tileRenderResolution';
import { cellsCoveredByAssignment } from '../../assets/tileFootprint';
import {
  getBrushCells, bresenhamLine, floodFillCells, buildWallBarrier, FLOOD_FILL_LIMIT,
  homeLevelFields, tilesOnRung, tileRung, withTilePlaced, withTilesErasedAt, withFillRegionCleared
} from '../../drawing/tilePlacementOps';
import { guardDepthWrite, elementBytes } from '../../persistence/depthAuthoring';
import { authoredCells } from '../../persistence/layerAccessor';
import { depthRefusalMessage } from '../../drawing/depthCellOps';
import { scatterSpacing, makeScatterDrop } from '../../drawing/scatterBrush';
import { solidWallPolylines } from '../../geometry/renderers/wallPathRenderer';

/**
 * Grid-only paint-time render resolution for the selected tile. The blend
 * choice is captured onto region placements at paint time — an explicit 0
 * pins hard edges even if the tile later gains a metadata feather, so
 * toggling blend never restyles already-painted cells.
 */
function resolvePaintTimeRender(
  isGrid: boolean,
  entry: { vaultPath?: string } | undefined,
  tileset: TilesetDef | undefined,
  paintEdgeBlend: boolean,
  tileMetadata: TileMetadataStore
): { resolved: ResolvedTileRender | undefined; feather: number | undefined } {
  const meta = isGrid && entry?.vaultPath != null && entry.vaultPath !== '' ? tileMetadata[entry.vaultPath] : undefined;
  const resolved = isGrid ? resolveTileRender(undefined, meta, tileset) : undefined;
  const feather = resolved?.renderMode === 'region'
    ? (paintEdgeBlend ? EDGE_BLEND_FEATHER : (resolved.edgeFeather > 0 ? 0 : undefined))
    : undefined;
  return { resolved, feather };
}

// ===========================================
// Component
// ===========================================

export interface TilePlacementLayerProps {
  currentTool: ToolId;
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  tileRotation: number;
  tileFlipH: boolean;
  tileFitMode: 'fill' | 'contain' | 'auto';
  /** Armed placement subtool from the drawer ribbon (null = no tile selected). */
  activeSubtool: TileSubtoolId | null;
  tileScale: number;
  brushSize: number;
  /** Edge blend for region tiles, captured onto each placement at paint time. */
  paintEdgeBlend: boolean;
  tileDepth: TileLayerRole;
  onTilesChange: (tiles: TileAssignment[], suppressHistory?: boolean) => void;
}


/**
 * What an ending stroke commits: its live tile array, or null when there is
 * no open stroke or the active layer changed since it started (the tiles
 * handler writes the ACTIVE layer, so committing would overwrite the new
 * layer's tiles with the old layer's; parallax-livefix 3).
 */
export function strokeCommitFor(
  strokeTiles: TileAssignment[] | null,
  strokeLayerId: string | null,
  activeLayerId: string | null
): TileAssignment[] | null {
  if (strokeTiles === null) return null;
  return strokeLayerId === activeLayerId ? strokeTiles : null;
}

/**
 * Whether a window touchend/touchcancel ends the open stroke: only when the
 * finger that started it lifted, or (identifier unknown) no touch remains.
 * A second finger landing and lifting mid-stroke leaves it open
 * (parallax-livefix 5).
 */
export function touchEndsStroke(e: TouchEvent, strokeTouchId: number | null): boolean {
  if (strokeTouchId != null) {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === strokeTouchId) return true;
    }
    return false;
  }
  return e.touches.length === 0;
}

const TilePlacementLayer = ({
  currentTool,
  selectedTilesetId,
  selectedTileId,
  tileRotation,
  tileFlipH,
  tileFitMode,
  activeSubtool,
  tileScale,
  brushSize,
  paintEdgeBlend,
  tileDepth,
  onTilesChange
}: TilePlacementLayerProps): VNode | null => {
  const { canvasRef, mapData, geometry, ladder, screenToGrid, screenToWorld, screenToLevelCell, getEditLevel } = useMapState();
  const app = useApp();
  // Subscribed, so a classification change re-renders the layer (STRUCT-A-20).
  const tileMetadata = useTileMetadata(app);

  const isTileTool = currentTool === 'tilePaint';
  const hasTileSelected = selectedTilesetId != null && selectedTilesetId !== '' && selectedTileId != null && selectedTileId !== '';
  // An armed DD portal is an opening — wall furniture the wall tool owns. The
  // side-channel routes it to currentTool 'wall' (so isTileTool is already
  // false here), but guard explicitly too, mirroring the 'line' subtool no-op.
  // Detected via metadata, not the 'opening' subtool literal (not a
  // TileSubtoolId until P3 lands — see GOTCHAS).
  const isOpeningAsset = (() => {
    if (!hasTileSelected || mapData?.tilesets == null) return false;
    const ts = mapData.tilesets.find(t => t.id === selectedTilesetId);
    const entry = ts != null ? resolveTileEntry(ts, selectedTileId ?? '') : null;
    return entry?.vaultPath != null && tileMetadata[entry.vaultPath]?.ddSourceType === 'portals';
  })();

  const paintedInStrokeRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);
  // Live tile array for the current stroke; null when no stroke is active.
  // Handlers read/write this instead of the mapData closure so a stroke stays
  // self-consistent even when pointer events outrun Preact's re-render (the
  // stale closure would otherwise commit pre-stroke tiles, erasing the stroke).
  const strokeTilesRef = useRef<TileAssignment[] | null>(null);
  // Layer the open stroke started on, and the finger that started it (touch).
  const strokeLayerIdRef = useRef<string | null>(null);
  const strokeTouchIdRef = useRef<number | null>(null);
  const activeLayerIdRef = useRef<string | null>(null);
  activeLayerIdRef.current = mapData?.activeLayerId ?? null;
  const lastGridPosRef = useRef<{ col: number; row: number } | null>(null);
  const scatterLastDropRef = useRef<{ x: number; y: number } | null>(null);
  // Ladder rung the current gesture writes to, latched at pointerdown: zoom can
  // drift mid-stroke, and a stroke must stay on one lattice (this also keeps
  // the unscoped "col,row" keys in paintedInStrokeRef unambiguous).
  const strokeLevelRef = useRef(0);
  // One refusal notice per visit to a rung the gate refuses, re-armed by an
  // accepted pointerdown.
  const depthNoticeShownRef = useRef(false);
  // Byte budget of a deep gesture (kgc.25): the map's serialised size at
  // pointerdown and the tile bytes the gesture has added since. Tiles grow the
  // map without growing the rung's cells, so they are held to the budget by
  // their own size. Null for a level-0 gesture.
  const gestureBudgetRef = useRef<{ serialisedBytes: number; addedBytes: number } | null>(null);

  /**
   * Refuse a deep tile write that would push the map past the depth byte
   * budget (one notice per gesture). `prev` is the tile list the write starts
   * from; the tiles in `next` and not in `prev` are what it adds. Level-0
   * writes are never refused here.
   */
  const refuseDeepTiles = useCallback((prev: TileAssignment[], next: TileAssignment[]): boolean => {
    const level = strokeLevelRef.current;
    if (level === 0 || !mapData) return false;
    const before = new Set(prev);
    const bytes = elementBytes(next.filter(t => !before.has(t)));
    const budget = gestureBudgetRef.current;
    const layer = getActiveLayer(mapData);
    const refusal = guardDepthWrite(mapData, layer.id, level, authoredCells(layer, level), budget !== null
      ? { serialisedBytes: budget.serialisedBytes, addedBytes: budget.addedBytes + bytes }
      : { addedBytes: bytes });
    if (refusal !== null) {
      if (!depthNoticeShownRef.current) {
        depthNoticeShownRef.current = true;
        new Notice(depthRefusalMessage(refusal));
      }
      return true;
    }
    if (budget !== null) budget.addedBytes += bytes;
    return false;
  }, [mapData]);

  /** Cell under the pointer on the latched rung (level 0 is screenToGrid exactly). */
  const cellAtLevel = useCallback((clientX: number, clientY: number, level: number) => (
    level > 0 ? screenToLevelCell(clientX, clientY, level) : screenToGrid(clientX, clientY)
  ), [screenToGrid, screenToLevelCell]);

  const placeTilesInBrush = useCallback((col: number, row: number) => {
    if (!mapData || selectedTilesetId == null || selectedTilesetId === '' || selectedTileId == null || selectedTileId === '') return;

    // Ensure the selected tile image is cached for rendering
    const ts = mapData.tilesets?.find(t => t.id === selectedTilesetId);
    const entry = resolveTileEntry(ts, selectedTileId);
    if (entry?.vaultPath != null && entry.vaultPath !== '') void preloadImage(app, entry.vaultPath);

    let currentTiles = strokeTilesRef.current ?? getActiveLayer(mapData).tiles ?? [];
    const startTiles = currentTiles;
    let changed = false;

    // Snapshot the tile's detected footprint (grid only) onto the placement so it
    // stays stable if the metadata later changes. A prop with span > 1 ignores
    // brush size and places a single footprint at the anchor. Resolution goes
    // through resolveTileRender so region tiles never carry a span (a seamless
    // texture's footprint would make each placement swallow its neighbours).
    const { resolved, feather } = resolvePaintTimeRender(geometry?.type === 'grid', entry, ts, paintEdgeBlend, tileMetadata);
    const spanW = resolved != null && resolved.spanW > 1 ? resolved.spanW : undefined;
    const spanH = resolved != null && resolved.spanH > 1 ? resolved.spanH : undefined;
    const hasFootprint = spanW != null || spanH != null;

    const cells = hasFootprint ? [{ col, row }] : getBrushCells(col, row, brushSize);
    const level = strokeLevelRef.current;

    for (const cell of cells) {
      const anchorKey = `${cell.col},${cell.row}`;
      if (paintedInStrokeRef.current.has(anchorKey)) continue;

      const newTile: TileAssignment = {
        col: cell.col, row: cell.row,
        tilesetId: selectedTilesetId,
        tileId: selectedTileId,
        rotation: (tileRotation || undefined),
        flipH: tileFlipH || undefined,
        depth: tileDepth === 'ground' ? undefined : tileDepth,
        fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
        scale: tileScale !== 1 ? tileScale : undefined,
        spanW,
        spanH,
        feather,
        ...homeLevelFields(level),
      };

      // Mark every covered cell painted (stops a drag re-placing the same prop)
      // and remove any same-rung, same-tier tile whose footprint overlaps this one.
      for (const c of cellsCoveredByAssignment(newTile)) {
        paintedInStrokeRef.current.add(`${c.col},${c.row}`);
      }
      currentTiles = withTilePlaced(currentTiles, newTile, 'fill');
      changed = true;
    }

    if (changed && !refuseDeepTiles(startTiles, currentTiles)) {
      const isBatchedStroke = strokeTilesRef.current !== null;
      if (isBatchedStroke) strokeTilesRef.current = currentTiles;
      onTilesChange(currentTiles, isBatchedStroke);
    }
  }, [mapData, geometry, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileFitMode, tileScale, brushSize, paintEdgeBlend, tileDepth, onTilesChange, app, tileMetadata, refuseDeepTiles]);

  const eraseTilesInBrush = useCallback((col: number, row: number) => {
    if (!mapData) return;

    const currentTiles = strokeTilesRef.current ?? getActiveLayer(mapData).tiles ?? [];
    const cells = getBrushCells(col, row, brushSize);
    const keysToErase = new Set<string>();

    for (const cell of cells) {
      const key = `${cell.col},${cell.row}`;
      if (paintedInStrokeRef.current.has(key)) continue;
      paintedInStrokeRef.current.add(key);
      keysToErase.add(key);
    }

    if (keysToErase.size === 0) return;

    // Footprint-aware: a snapped prop is erased if the brush touches any cell it
    // covers; freeform stamps still erase by their drop cell. Only tiles homed
    // on the stroke's rung are candidates.
    const newTiles = withTilesErasedAt(currentTiles, keysToErase, strokeLevelRef.current);

    if (newTiles.length !== currentTiles.length) {
      const isBatchedStroke = strokeTilesRef.current !== null;
      if (isBatchedStroke) strokeTilesRef.current = newTiles;
      onTilesChange(newTiles, isBatchedStroke);
    }
  }, [mapData, brushSize, onTilesChange]);

  const floodFillAtCell = useCallback((col: number, row: number) => {
    if (!mapData || selectedTilesetId == null || selectedTilesetId === '' || selectedTileId == null || selectedTileId === '') return;

    const ts = mapData.tilesets?.find(t => t.id === selectedTilesetId);
    const entry = resolveTileEntry(ts, selectedTileId);
    if (entry?.vaultPath != null && entry.vaultPath !== '') void preloadImage(app, entry.vaultPath);

    const { feather } = resolvePaintTimeRender(geometry?.type === 'grid', entry, ts, paintEdgeBlend, tileMetadata);

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles ?? [];

    // A deep fill runs on the latched rung's own lattice: its geometry for
    // centres/rounding and the ladder's existence gate for bounds. Walls stay
    // world-space polylines whose doorway spans are sized in ROOT cells (walls
    // are root-authored), so they keep the root cellSize below.
    const level = strokeLevelRef.current;
    const fillGeometry = level > 0 && ladder !== null ? ladder.geometryForLevel(level) : geometry;

    // Structure-stratum tiles on the active board bound the fill even from
    // other strata (a wall footprint stops a ground-layer flood). The active
    // layer is excluded — its own tiles already act as region boundaries.
    const blockedCells = new Set<string>();
    for (const layer of getActiveBoardLayers(mapData)) {
      if (layer.id === activeLayer.id || layer.tileRole !== 'structure') continue;
      for (const t of layer.tiles ?? []) {
        if (t.freeform === true || tileRung(t) !== level) continue;
        for (const c of cellsCoveredByAssignment(t)) blockedCells.add(`${c.col},${c.row}`);
      }
    }

    // Wall strips (kind 'wall' only — paths/roads never block) bound the fill.
    // Collected from every active-board layer so a room's own walls bound its
    // floor fill; centerline only (widthScale ignored). Each gap span is cut
    // out of its wall's polyline first — a doorway is a hole in the barrier,
    // fill leaks through it regardless of seated art (Guildmaster ruling D7,
    // §9) — so a wall is contributed as one or more solid sub-polylines.
    // Indexed once per gesture.
    const wallPolylines: Array<ReadonlyArray<readonly [number, number]>> = [];
    if (geometry != null) {
      for (const layer of getActiveBoardLayers(mapData)) {
        for (const wp of layer.wallPaths ?? []) {
          if (wp.kind !== 'wall') continue;
          for (const poly of solidWallPolylines(wp, geometry.cellSize)) {
            if (poly.length >= 2) wallPolylines.push(poly);
          }
        }
      }
    }
    const barrier = fillGeometry != null && wallPolylines.length > 0
      ? buildWallBarrier(
          wallPolylines,
          (c, r) => { const w = fillGeometry.getCellCenter(c, r); return { x: w.worldX, y: w.worldY }; },
          (wx, wy) => { const g = fillGeometry.worldToGrid(wx, wy); return { col: Math.round(g.x), row: Math.round(g.y) }; }
        )
      : null;

    // The rectangular clamp is in root cells; a deep fill is bounded by the
    // ladder's existence gate instead (and by FLOOD_FILL_LIMIT either way).
    const mapWidth = level > 0 ? Number.POSITIVE_INFINITY : (mapData.dimensions?.width ?? 50);
    const mapHeight = level > 0 ? Number.POSITIVE_INFINITY : (mapData.dimensions?.height ?? 50);
    const inBounds = level > 0 && ladder !== null
      ? (c: number, r: number): boolean => ladder.existsAt(level, c, r)
      // Bounded geometries (hex) clamp the fill to their real bounds, which
      // the rectangular width/height margin cannot express.
      : geometry != null && geometry.isBounded()
        ? (c: number, r: number): boolean => geometry.isWithinBounds(c, r)
        : undefined;
    const { cells: fillCells, aborted } = floodFillCells(tilesOnRung(currentTiles, level), col, row, mapWidth, mapHeight, {
      blockedCells,
      inBounds,
      ...(barrier != null ? { canCross: barrier.canCross } : {}),
    });
    if (aborted) {
      new Notice(`Fill region is unbounded or too large (over ${FLOOD_FILL_LIMIT} cells) — nothing placed. Enclose it with walls first.`);
      return;
    }
    if (fillCells.length === 0) return;

    const fillKeys = new Set(fillCells.map(c => `${c.col},${c.row}`));

    const newTiles = withFillRegionCleared(currentTiles, fillKeys, 'fill', level);

    for (const cell of fillCells) {
      newTiles.push({
        col: cell.col, row: cell.row,
        tilesetId: selectedTilesetId,
        tileId: selectedTileId,
        rotation: (tileRotation || undefined),
        flipH: tileFlipH || undefined,
        depth: tileDepth === 'ground' ? undefined : tileDepth,
        fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
        feather,
        ...homeLevelFields(level),
      });
    }

    // The fill result is computed first so a deep fill is held to the byte
    // budget by the tiles it actually adds (up to FLOOD_FILL_LIMIT).
    if (refuseDeepTiles(currentTiles, newTiles)) return;
    onTilesChange(newTiles);
  }, [app, mapData, geometry, ladder, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileFitMode, paintEdgeBlend, tileDepth, onTilesChange, tileMetadata, refuseDeepTiles]);

  const placeStampAtWorld = useCallback((
    worldX: number,
    worldY: number,
    col: number,
    row: number,
    overrides?: { rotation?: TileRotation; flipH?: boolean; scale?: number }
  ) => {
    if (!mapData || selectedTilesetId == null || selectedTilesetId === '' || selectedTileId == null || selectedTileId === '') return;

    const ts = mapData.tilesets?.find(t => t.id === selectedTilesetId);
    const entry = resolveTileEntry(ts, selectedTileId);
    if (entry?.vaultPath != null && entry.vaultPath !== '') void preloadImage(app, entry.vaultPath);

    const currentTiles = strokeTilesRef.current ?? getActiveLayer(mapData).tiles ?? [];

    const rotation = overrides?.rotation ?? tileRotation;
    const flipH = overrides?.flipH ?? tileFlipH;
    const scale = overrides?.scale ?? tileScale;

    const newTile: TileAssignment = {
      col, row,
      tilesetId: selectedTilesetId,
      tileId: selectedTileId,
      rotation: (rotation || undefined),
      flipH: flipH || undefined,
      placement: 'overlay',
      fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
      scale: scale !== 1 ? scale : undefined,
      freeform: true,
      worldX,
      worldY,
      ...homeLevelFields(strokeLevelRef.current),
    };

    // Scatter strokes batch into one history entry (same pattern as the grid brush).
    const isBatchedStroke = strokeTilesRef.current !== null;
    const nextTiles = [...currentTiles, newTile];
    if (refuseDeepTiles(currentTiles, nextTiles)) return;
    if (isBatchedStroke) strokeTilesRef.current = nextTiles;
    onTilesChange(nextTiles, isBatchedStroke);
  }, [app, mapData, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileFitMode, tileScale, onTilesChange, refuseDeepTiles]);

  // Scatter: drop a jittered stamp when the pointer has traveled far enough
  // in world space since the previous drop.
  const scatterAdvance = useCallback((worldX: number, worldY: number, col: number, row: number) => {
    if (!geometry) return;
    // Spacing and jitter scale with the rung the stroke paints on.
    const level = strokeLevelRef.current;
    const cellSize = level > 0 && ladder !== null ? ladder.geometryForLevel(level).cellSize : geometry.cellSize;
    const last = scatterLastDropRef.current;
    const spacing = scatterSpacing(cellSize, tileScale);
    if (last != null && Math.hypot(worldX - last.x, worldY - last.y) < spacing) return;
    scatterLastDropRef.current = { x: worldX, y: worldY };
    const drop = makeScatterDrop(worldX, worldY, {
      cellSize,
      tileScale,
      isHex: geometry.type === 'hex',
      rng: Math.random,
    });
    placeStampAtWorld(drop.worldX, drop.worldY, col, row, {
      rotation: drop.rotation,
      flipH: drop.flipH,
      scale: drop.scale,
    });
  }, [geometry, ladder, tileScale, placeStampAtWorld]);

  // End the open stroke: commit it as ONE history entry from the stroke ref,
  // NOT the mapData closure (pointerup can fire before Preact re-renders from
  // the stroke's state updates, and the stale closure would commit pre-stroke
  // tiles). Idempotent: a second call finds no open stroke.
  const { clearTransient } = useMapOperations();
  const endStroke = useCallback(() => {
    // Skipped when the active layer changed mid-stroke (see strokeCommitFor).
    const hadStroke = strokeTilesRef.current !== null;
    const commit = strokeCommitFor(strokeTilesRef.current, strokeLayerIdRef.current, activeLayerIdRef.current);
    strokeTilesRef.current = null;
    strokeLayerIdRef.current = null;
    strokeTouchIdRef.current = null;
    if (commit !== null) onTilesChange(commit, false);
    // Layer switched mid-stroke: no commit, so drop the stroke's transient baseline
    // or the next paint plus one undo would also remove the stroke's tiles.
    else if (hadStroke) clearTransient?.();
    isDraggingRef.current = false;
    paintedInStrokeRef.current = new Set();
    lastGridPosRef.current = null;
    scatterLastDropRef.current = null;
  }, [onTilesChange, clearTransient]);
  const endStrokeRef = useRef(endStroke);
  endStrokeRef.current = endStroke;

  // A stroke's live writes are history-suppressed, so a stroke whose release
  // never reaches the canvas route (released outside the canvas, a mouseup the
  // coordinator consumes first, a tool switch mid-stroke) would leave its
  // tiles on the map with no undo step (live check A5) and the brush stuck
  // down. Close it from the window too, and when the tool disarms or unmounts.
  // Listeners go on the canvas's OWN window (popout-safe), never a fallback
  // to the main one: if the ref is not set yet, retry on the next frames.
  useEffect(() => {
    if (!isTileTool) return undefined;
    const onMouseUp = (): void => { endStrokeRef.current(); };
    const onTouchEnd = (e: TouchEvent): void => {
      if (touchEndsStroke(e, strokeTouchIdRef.current)) endStrokeRef.current();
    };
    let win: Window | null = null;
    let frame: number | null = null;
    let tries = 0;
    const attach = (): void => {
      frame = null;
      const w = canvasRef.current?.ownerDocument.defaultView ?? null;
      if (w == null) {
        if (tries++ < 30) frame = window.requestAnimationFrame(attach);
        return;
      }
      win = w;
      w.addEventListener('mouseup', onMouseUp);
      w.addEventListener('touchend', onTouchEnd);
      w.addEventListener('touchcancel', onTouchEnd);
    };
    attach();
    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      if (win != null) {
        win.removeEventListener('mouseup', onMouseUp);
        win.removeEventListener('touchend', onTouchEnd);
        win.removeEventListener('touchcancel', onTouchEnd);
      }
      endStrokeRef.current();
    };
  }, [isTileTool, canvasRef]);

  // Record where the stroke started: its layer and, for touch, its finger.
  const beginStrokeSession = useCallback((e: PointerEvent): void => {
    strokeLayerIdRef.current = activeLayerIdRef.current;
    const touches = (e as unknown as Partial<TouchEvent>).changedTouches;
    strokeTouchIdRef.current = touches != null && touches.length > 0 ? touches[0].identifier : null;
  }, []);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!isTileTool || !geometry) return;
    // A stroke still open here lost its release: commit it before starting anew.
    if (strokeTilesRef.current !== null) endStroke();
    // Openings are seated by the wall tool; tilePaint never places them (mirrors
    // the 'line'/'brush' subtool no-ops below).
    if (isOpeningAsset) return;

    // Latch the rung for the whole gesture (0 on classic maps). A deep gesture
    // passes the depth-authoring gate first: flag on, ladder view, not
    // quarantined, level in range. A nested-classic map never takes deep writes.
    // The rung's current cells are passed as the "next" content, so the gate
    // adds nothing here; the byte budget is checked per write against the
    // tiles each one adds (refuseDeepTiles), from the size measured now.
    const level = ladder !== null ? getEditLevel() : 0;
    if (level > 0) {
      if (!mapData) return;
      const activeLayer = getActiveLayer(mapData);
      const refusal = guardDepthWrite(mapData, activeLayer.id, level, authoredCells(activeLayer, level));
      if (refusal !== null) {
        if (!depthNoticeShownRef.current) {
          depthNoticeShownRef.current = true;
          new Notice(depthRefusalMessage(refusal));
        }
        return;
      }
    }
    depthNoticeShownRef.current = false;
    strokeLevelRef.current = level;
    gestureBudgetRef.current = level > 0 && mapData
      ? { serialisedBytes: JSON.stringify(mapData).length, addedBytes: 0 }
      : null;

    const coords = cellAtLevel(e.clientX, e.clientY, level);
    if (!coords) return;

    // Shift+click stays as a flood-fill shortcut regardless of armed subtool.
    if (e.shiftKey && hasTileSelected) {
      floodFillAtCell(coords.x, coords.y);
      return;
    }

    if (hasTileSelected) {
      switch (activeSubtool) {
        case 'fill':
          floodFillAtCell(coords.x, coords.y);
          return;
        case 'stamp': {
          const worldCoords = screenToWorld(e.clientX, e.clientY);
          if (worldCoords) {
            placeStampAtWorld(worldCoords.worldX, worldCoords.worldY, coords.x, coords.y);
          }
          return;
        }
        case 'scatter': {
          // Scatter is a drag stroke of jittered stamps: batch the whole
          // gesture into one history entry via strokeInitialTilesRef.
          const worldCoords = screenToWorld(e.clientX, e.clientY);
          if (!worldCoords) return;
          isDraggingRef.current = true;
          scatterLastDropRef.current = null;
          const layer = getActiveLayer(mapData);
          strokeTilesRef.current = [...(layer.tiles ?? [])];
          beginStrokeSession(e);
          scatterAdvance(worldCoords.worldX, worldCoords.worldY, coords.x, coords.y);
          return;
        }
        case 'brush':
          // World-space terrain brush: TerrainBrushLayer owns this subtool.
          return;
        case 'line':
          // 'line' arms the wall tool, so tilePaint never sees these events.
          return;
        case 'paint':
        case 'autotile': // autotile until built
        case 'opening': // unreachable: openings return above
        case null: // no subtool armed = paint
          break; // grid brush stroke below
        default:
          assertNever(activeSubtool, 'tile subtool');
      }
    }

    isDraggingRef.current = true;
    paintedInStrokeRef.current = new Set();
    lastGridPosRef.current = { col: coords.x, row: coords.y };

    const activeLayer = getActiveLayer(mapData);
    strokeTilesRef.current = [...(activeLayer.tiles ?? [])];
    beginStrokeSession(e);

    if (hasTileSelected) {
      placeTilesInBrush(coords.x, coords.y);
    } else {
      eraseTilesInBrush(coords.x, coords.y);
    }
  }, [isTileTool, geometry, ladder, cellAtLevel, screenToWorld, hasTileSelected, isOpeningAsset, activeSubtool, placeTilesInBrush, eraseTilesInBrush, placeStampAtWorld, scatterAdvance, floodFillAtCell, mapData, getEditLevel, endStroke, beginStrokeSession]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    // Only the paint/erase grid stroke sets isDraggingRef; the click-only
    // subtools (stamp/fill/scatter-for-now) return from pointerdown early.
    if (!isDraggingRef.current || !isTileTool || !geometry) return;
    // The active layer changed mid-stroke: further live writes would land the
    // old layer's tiles on the new one. Close the stroke without a commit.
    if (strokeTilesRef.current !== null && strokeLayerIdRef.current !== activeLayerIdRef.current) {
      endStroke();
      return;
    }

    // The LATCHED rung, never the live one: zoom can drift mid-stroke.
    const coords = cellAtLevel(e.clientX, e.clientY, strokeLevelRef.current);
    if (!coords) return;

    // Scatter stroke: world-distance spaced jittered stamps, no cell logic.
    if (activeSubtool === 'scatter' && hasTileSelected) {
      const worldCoords = screenToWorld(e.clientX, e.clientY);
      if (worldCoords) scatterAdvance(worldCoords.worldX, worldCoords.worldY, coords.x, coords.y);
      return;
    }

    const current = { col: coords.x, row: coords.y };
    const last = lastGridPosRef.current;

    // Bresenham interpolation between last and current position
    const cellsToProcess = last && (last.col !== current.col || last.row !== current.row)
      ? bresenhamLine(last.col, last.row, current.col, current.row).slice(1)
      : [current];

    for (const cell of cellsToProcess) {
      if (hasTileSelected) {
        placeTilesInBrush(cell.col, cell.row);
      } else {
        eraseTilesInBrush(cell.col, cell.row);
      }
    }

    lastGridPosRef.current = current;
  }, [isTileTool, geometry, cellAtLevel, screenToWorld, hasTileSelected, activeSubtool, placeTilesInBrush, eraseTilesInBrush, scatterAdvance, endStroke]);

  const handlePointerUp = useCallback(() => { endStroke(); }, [endStroke]);

  useLayerHandlers(
    'tilePlacement',
    { handlePointerDown, handlePointerMove, handlePointerUp },
    { enabled: isTileTool }
  );

  return null;
};

export { TilePlacementLayer };
