/**
 * TilePlacementLayer.tsx
 *
 * Interaction layer for placing tile images on hex or grid maps. Behavior is
 * driven by the armed placement subtool from the drawer ribbon: paint
 * (grid-snap with brush size), stamp/scatter (freeform), fill (flood fill,
 * also Shift+click), while brush/line are owned by other layers. Bresenham
 * interpolation fills gaps during fast drag strokes.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { TileAssignment, TileRotation, TileLayerRole, TilesetDef } from '#types/tiles/tile.types';
import type { TileSubtoolId } from '../../assets/tileForm';

import { useCallback, useRef } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { useApp } from '../../context/AppContext';
import { getActiveLayer, getActiveBoardLayers } from '../../persistence/layerAccessor';
import { preloadImage } from '../../assets/imageOperations';
import { resolveTileEntry } from '../../assets/tilesetOperations';
import { getTileMetadataForRender } from '../../persistence/tileMetadata';
import type { ResolvedTileRender } from '../../assets/tileRenderResolution';
import { resolveTileRender, EDGE_BLEND_FEATHER } from '../../assets/tileRenderResolution';
import { cellsCoveredByAssignment, assignmentsOverlap } from '../../assets/tileFootprint';
import { getBrushCells, bresenhamLine, floodFillCells } from '../../drawing/tilePlacementOps';
import { scatterSpacing, makeScatterDrop } from '../../drawing/scatterBrush';

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
  paintEdgeBlend: boolean
): { resolved: ResolvedTileRender | undefined; feather: number | undefined } {
  const meta = isGrid && entry?.vaultPath != null && entry.vaultPath !== '' ? getTileMetadataForRender()[entry.vaultPath] : undefined;
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
  tileLayer: 'base' | 'overlay';
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

const TilePlacementLayer = ({
  currentTool,
  selectedTilesetId,
  selectedTileId,
  tileRotation,
  tileFlipH,
  tileLayer,
  tileFitMode,
  activeSubtool,
  tileScale,
  brushSize,
  paintEdgeBlend,
  tileDepth,
  onTilesChange
}: TilePlacementLayerProps): VNode | null => {
  const { mapData, geometry, screenToGrid, screenToWorld } = useMapState();
  const app = useApp();

  const isTileTool = currentTool === 'tilePaint';
  const hasTileSelected = selectedTilesetId != null && selectedTilesetId !== '' && selectedTileId != null && selectedTileId !== '';

  const paintedInStrokeRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);
  // Live tile array for the current stroke; null when no stroke is active.
  // Handlers read/write this instead of the mapData closure so a stroke stays
  // self-consistent even when pointer events outrun Preact's re-render (the
  // stale closure would otherwise commit pre-stroke tiles, erasing the stroke).
  const strokeTilesRef = useRef<TileAssignment[] | null>(null);
  const lastGridPosRef = useRef<{ col: number; row: number } | null>(null);
  const scatterLastDropRef = useRef<{ x: number; y: number } | null>(null);

  const placeTilesInBrush = useCallback((col: number, row: number) => {
    if (!mapData || selectedTilesetId == null || selectedTilesetId === '' || selectedTileId == null || selectedTileId === '') return;

    // Ensure the selected tile image is cached for rendering
    const ts = mapData.tilesets?.find(t => t.id === selectedTilesetId);
    const entry = resolveTileEntry(ts, selectedTileId);
    if (entry?.vaultPath != null && entry.vaultPath !== '') void preloadImage(app, entry.vaultPath);

    let currentTiles = strokeTilesRef.current ?? getActiveLayer(mapData).tiles ?? [];
    let changed = false;

    const targetPlacement = tileLayer === 'base' ? 'fill' : 'overlay';

    // Snapshot the tile's detected footprint (grid only) onto the placement so it
    // stays stable if the metadata later changes. A prop with span > 1 ignores
    // brush size and places a single footprint at the anchor. Resolution goes
    // through resolveTileRender so region tiles never carry a span (a seamless
    // texture's footprint would make each placement swallow its neighbours).
    const { resolved, feather } = resolvePaintTimeRender(geometry?.type === 'grid', entry, ts, paintEdgeBlend);
    const spanW = resolved != null && resolved.spanW > 1 ? resolved.spanW : undefined;
    const spanH = resolved != null && resolved.spanH > 1 ? resolved.spanH : undefined;
    const hasFootprint = spanW != null || spanH != null;

    const cells = hasFootprint ? [{ col, row }] : getBrushCells(col, row, brushSize);

    for (const cell of cells) {
      const anchorKey = `${cell.col},${cell.row}`;
      if (paintedInStrokeRef.current.has(anchorKey)) continue;

      const newTile: TileAssignment = {
        col: cell.col, row: cell.row,
        tilesetId: selectedTilesetId,
        tileId: selectedTileId,
        rotation: (tileRotation || undefined) as TileRotation | undefined,
        flipH: tileFlipH || undefined,
        placement: targetPlacement === 'fill' ? undefined : targetPlacement,
        depth: tileDepth === 'ground' ? undefined : tileDepth,
        fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
        scale: tileScale !== 1 ? tileScale : undefined,
        spanW,
        spanH,
        feather,
      };

      // Mark every covered cell painted (stops a drag re-placing the same prop)
      // and remove any same-tier tile whose footprint overlaps this one.
      for (const c of cellsCoveredByAssignment(newTile)) {
        paintedInStrokeRef.current.add(`${c.col},${c.row}`);
      }
      const remaining = currentTiles.filter(
        (t: TileAssignment) => (t.placement ?? 'fill') !== targetPlacement || !assignmentsOverlap(t, newTile)
      );
      currentTiles = [...remaining, newTile];
      changed = true;
    }

    if (changed) {
      const isBatchedStroke = strokeTilesRef.current !== null;
      if (isBatchedStroke) strokeTilesRef.current = currentTiles;
      onTilesChange(currentTiles, isBatchedStroke);
    }
  }, [mapData, geometry, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileLayer, tileFitMode, tileScale, brushSize, paintEdgeBlend, tileDepth, onTilesChange, app]);

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
    // covers; freeform stamps still erase by their drop cell.
    const newTiles = currentTiles.filter((t: TileAssignment) =>
      t.freeform === true
        ? !keysToErase.has(`${t.col},${t.row}`)
        : !cellsCoveredByAssignment(t).some(c => keysToErase.has(`${c.col},${c.row}`))
    );

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

    const { feather } = resolvePaintTimeRender(geometry?.type === 'grid', entry, ts, paintEdgeBlend);

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles ?? [];

    // Structure-stratum tiles on the active board bound the fill even from
    // other strata (a wall footprint stops a ground-layer flood). The active
    // layer is excluded — its own tiles already act as region boundaries.
    const blockedCells = new Set<string>();
    for (const layer of getActiveBoardLayers(mapData)) {
      if (layer.id === activeLayer.id || layer.tileRole !== 'structure') continue;
      for (const t of layer.tiles ?? []) {
        if (t.freeform === true) continue;
        for (const c of cellsCoveredByAssignment(t)) blockedCells.add(`${c.col},${c.row}`);
      }
    }

    const mapWidth = mapData.dimensions?.width ?? 50;
    const mapHeight = mapData.dimensions?.height ?? 50;
    const fillCells = floodFillCells(currentTiles, col, row, mapWidth, mapHeight, {
      blockedCells,
      // Bounded geometries (hex) clamp the fill to their real bounds, which
      // the rectangular width/height margin cannot express.
      inBounds: geometry != null && geometry.isBounded()
        ? (c, r) => geometry.isWithinBounds(c, r)
        : undefined,
    });
    if (fillCells.length === 0) return;

    const targetPlacement = tileLayer === 'base' ? 'fill' : 'overlay';
    const fillKeys = new Set(fillCells.map(c => `${c.col},${c.row}`));

    const newTiles = currentTiles.filter((t: TileAssignment) => {
      if ((t.placement ?? 'fill') !== targetPlacement) return true;
      return t.freeform === true
        ? !fillKeys.has(`${t.col},${t.row}`)
        : !cellsCoveredByAssignment(t).some(c => fillKeys.has(`${c.col},${c.row}`));
    });

    for (const cell of fillCells) {
      newTiles.push({
        col: cell.col, row: cell.row,
        tilesetId: selectedTilesetId,
        tileId: selectedTileId,
        rotation: (tileRotation || undefined) as TileRotation | undefined,
        flipH: tileFlipH || undefined,
        placement: targetPlacement === 'fill' ? undefined : targetPlacement,
        depth: tileDepth === 'ground' ? undefined : tileDepth,
        fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
        feather,
      });
    }

    onTilesChange(newTiles);
  }, [app, mapData, geometry, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileLayer, tileFitMode, paintEdgeBlend, tileDepth, onTilesChange]);

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
      rotation: (rotation || undefined) as TileRotation | undefined,
      flipH: flipH || undefined,
      placement: 'overlay',
      fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
      scale: scale !== 1 ? scale : undefined,
      freeform: true,
      worldX,
      worldY,
    };

    // Scatter strokes batch into one history entry (same pattern as the grid brush).
    const isBatchedStroke = strokeTilesRef.current !== null;
    const nextTiles = [...currentTiles, newTile];
    if (isBatchedStroke) strokeTilesRef.current = nextTiles;
    onTilesChange(nextTiles, isBatchedStroke);
  }, [app, mapData, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileFitMode, tileScale, onTilesChange]);

  // Scatter: drop a jittered stamp when the pointer has traveled far enough
  // in world space since the previous drop.
  const scatterAdvance = useCallback((worldX: number, worldY: number, col: number, row: number) => {
    if (!geometry) return;
    const last = scatterLastDropRef.current;
    const spacing = scatterSpacing(geometry.cellSize, tileScale);
    if (last != null && Math.hypot(worldX - last.x, worldY - last.y) < spacing) return;
    scatterLastDropRef.current = { x: worldX, y: worldY };
    const drop = makeScatterDrop(worldX, worldY, {
      cellSize: geometry.cellSize,
      tileScale,
      isHex: geometry.type === 'hex',
      rng: Math.random,
    });
    placeStampAtWorld(drop.worldX, drop.worldY, col, row, {
      rotation: drop.rotation,
      flipH: drop.flipH,
      scale: drop.scale,
    });
  }, [geometry, tileScale, placeStampAtWorld]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!isTileTool || !geometry) return;

    const coords = screenToGrid(e.clientX, e.clientY);
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
          scatterAdvance(worldCoords.worldX, worldCoords.worldY, coords.x, coords.y);
          return;
        }
        case 'brush':
          // World-space terrain brush: TerrainBrushLayer owns this subtool.
          return;
        case 'line':
          // 'line' arms the wall tool, so tilePaint never sees these events.
          return;
        default:
          break; // 'paint' (and autotile until built) → grid brush stroke below
      }
    }

    isDraggingRef.current = true;
    paintedInStrokeRef.current = new Set();
    lastGridPosRef.current = { col: coords.x, row: coords.y };

    const activeLayer = getActiveLayer(mapData);
    strokeTilesRef.current = [...(activeLayer.tiles ?? [])];

    if (hasTileSelected) {
      placeTilesInBrush(coords.x, coords.y);
    } else {
      eraseTilesInBrush(coords.x, coords.y);
    }
  }, [isTileTool, geometry, screenToGrid, screenToWorld, hasTileSelected, activeSubtool, placeTilesInBrush, eraseTilesInBrush, placeStampAtWorld, scatterAdvance, floodFillAtCell, mapData]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    // Only the paint/erase grid stroke sets isDraggingRef; the click-only
    // subtools (stamp/fill/scatter-for-now) return from pointerdown early.
    if (!isDraggingRef.current || !isTileTool || !geometry) return;

    const coords = screenToGrid(e.clientX, e.clientY);
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
  }, [isTileTool, geometry, screenToGrid, screenToWorld, hasTileSelected, activeSubtool, placeTilesInBrush, eraseTilesInBrush, scatterAdvance]);

  const handlePointerUp = useCallback(() => {
    if (strokeTilesRef.current !== null) {
      // Commit the history entry from the stroke ref, NOT the mapData closure:
      // pointerup can fire before Preact re-renders from the stroke's state
      // updates, and the stale closure would commit pre-stroke tiles.
      onTilesChange(strokeTilesRef.current, false);
      strokeTilesRef.current = null;
    }
    isDraggingRef.current = false;
    paintedInStrokeRef.current = new Set();
    lastGridPosRef.current = null;
    scatterLastDropRef.current = null;
  }, [onTilesChange]);

  useLayerHandlers('tilePlacement', isTileTool
    ? { handlePointerDown, handlePointerMove, handlePointerUp }
    : {});

  return null;
};

export { TilePlacementLayer };
