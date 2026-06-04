/**
 * TilePlacementLayer.tsx
 *
 * Interaction layer for placing tile images on hex or grid maps.
 * Supports: pencil (grid-snap with brush size), stamp (freeform),
 * flood fill (Shift+click), and eyedropper (Alt+click).
 * Bresenham interpolation fills gaps during fast drag strokes.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { TileAssignment, TileRotation } from '#types/tiles/tile.types';

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';
import { getActiveLayer } from '../../persistence/layerAccessor';


// ===========================================
// Pure helpers
// ===========================================

function getBrushCells(col: number, row: number, brushSize: number): Array<{ col: number; row: number }> {
  if (brushSize <= 1) return [{ col, row }];
  const half = Math.floor(brushSize / 2);
  const cells: Array<{ col: number; row: number }> = [];
  for (let dr = -half; dr <= half; dr++)
    for (let dc = -half; dc <= half; dc++)
      cells.push({ col: col + dc, row: row + dr });
  return cells;
}

function bresenhamLine(x0: number, y0: number, x1: number, y1: number): Array<{ col: number; row: number }> {
  const points: Array<{ col: number; row: number }> = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0, cy = y0;
  while (true) {
    points.push({ col: cx, row: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return points;
}

const FLOOD_FILL_MAX = 10000;

function floodFillCells(
  tiles: TileAssignment[],
  startCol: number,
  startRow: number,
  mapWidth: number,
  mapHeight: number
): Array<{ col: number; row: number }> {
  const targetKey = tiles.find(t => t.col === startCol && t.row === startRow && !t.freeform);
  const targetId = targetKey ? `${targetKey.tilesetId}:${targetKey.tileId}` : '';

  const tileMap = new Map<string, string>();
  for (const t of tiles) {
    if (!t.freeform) tileMap.set(`${t.col},${t.row}`, `${t.tilesetId}:${t.tileId}`);
  }

  const visited = new Set<string>();
  const result: Array<{ col: number; row: number }> = [];
  const stack = [{ col: startCol, row: startRow }];

  while (stack.length > 0 && result.length < FLOOD_FILL_MAX) {
    const { col, row } = stack.pop()!;
    const key = `${col},${row}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (col < -mapWidth || col > mapWidth * 2 || row < -mapHeight || row > mapHeight * 2) continue;

    const cellId = tileMap.get(key) ?? '';
    if (cellId !== targetId) continue;

    result.push({ col, row });
    stack.push({ col: col + 1, row }, { col: col - 1, row }, { col, row: row + 1 }, { col, row: row - 1 });
  }
  return result;
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
  stampMode: boolean;
  tileScale: number;
  brushSize: number;
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
  stampMode,
  tileScale,
  brushSize,
  onTilesChange
}: TilePlacementLayerProps): VNode | null => {
  const { mapData, geometry, screenToGrid, screenToWorld } = useMapState();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const isTileTool = currentTool === 'tilePaint';
  const hasTileSelected = selectedTilesetId != null && selectedTilesetId !== '' && selectedTileId != null && selectedTileId !== '';

  const paintedInStrokeRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);
  const strokeInitialTilesRef = useRef<TileAssignment[] | null>(null);
  const lastGridPosRef = useRef<{ col: number; row: number } | null>(null);

  const placeTilesInBrush = useCallback((col: number, row: number) => {
    if (!mapData || selectedTilesetId == null || selectedTilesetId === '' || selectedTileId == null || selectedTileId === '') return;

    const activeLayer = getActiveLayer(mapData);
    let currentTiles = activeLayer.tiles || [];
    let changed = false;

    const targetPlacement = tileLayer === 'base' ? 'fill' : 'overlay';
    const cells = getBrushCells(col, row, brushSize);

    for (const cell of cells) {
      const key = `${cell.col},${cell.row}`;
      if (paintedInStrokeRef.current.has(key)) continue;
      paintedInStrokeRef.current.add(key);

      const existingIdx = currentTiles.findIndex(
        (t: TileAssignment) => t.col === cell.col && t.row === cell.row && (t.placement || 'fill') === targetPlacement
      );

      const newTile: TileAssignment = {
        col: cell.col, row: cell.row,
        tilesetId: selectedTilesetId,
        tileId: selectedTileId,
        rotation: (tileRotation || undefined) as TileRotation | undefined,
        flipH: tileFlipH || undefined,
        placement: targetPlacement === 'fill' ? undefined : targetPlacement,
        fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
        scale: tileScale !== 1 ? tileScale : undefined,
      };

      if (existingIdx >= 0) {
        currentTiles = [...currentTiles];
        currentTiles[existingIdx] = newTile;
      } else {
        currentTiles = [...currentTiles, newTile];
      }
      changed = true;
    }

    if (changed) {
      const isBatchedStroke = strokeInitialTilesRef.current !== null;
      onTilesChange(currentTiles, isBatchedStroke);
    }
  }, [mapData, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileLayer, tileFitMode, tileScale, brushSize, onTilesChange]);

  const eraseTilesInBrush = useCallback((col: number, row: number) => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles || [];
    const cells = getBrushCells(col, row, brushSize);
    const keysToErase = new Set<string>();

    for (const cell of cells) {
      const key = `${cell.col},${cell.row}`;
      if (paintedInStrokeRef.current.has(key)) continue;
      paintedInStrokeRef.current.add(key);
      keysToErase.add(key);
    }

    if (keysToErase.size === 0) return;

    const newTiles = currentTiles.filter(
      (t: TileAssignment) => !keysToErase.has(`${t.col},${t.row}`)
    );

    if (newTiles.length !== currentTiles.length) {
      const isBatchedStroke = strokeInitialTilesRef.current !== null;
      onTilesChange(newTiles, isBatchedStroke);
    }
  }, [mapData, brushSize, onTilesChange]);

  const floodFillAtCell = useCallback((col: number, row: number) => {
    if (!mapData || selectedTilesetId == null || selectedTilesetId === '' || selectedTileId == null || selectedTileId === '') return;

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles || [];

    const mapWidth = mapData.dimensions?.cols ?? 50;
    const mapHeight = mapData.dimensions?.rows ?? 50;
    const fillCells = floodFillCells(currentTiles, col, row, mapWidth, mapHeight);
    if (fillCells.length === 0) return;

    const targetPlacement = tileLayer === 'base' ? 'fill' : 'overlay';
    const fillKeys = new Set(fillCells.map(c => `${c.col},${c.row}`));

    let newTiles = currentTiles.filter(
      (t: TileAssignment) => !fillKeys.has(`${t.col},${t.row}`) || (t.placement || 'fill') !== targetPlacement
    );

    for (const cell of fillCells) {
      newTiles.push({
        col: cell.col, row: cell.row,
        tilesetId: selectedTilesetId,
        tileId: selectedTileId,
        rotation: (tileRotation || undefined) as TileRotation | undefined,
        flipH: tileFlipH || undefined,
        placement: targetPlacement === 'fill' ? undefined : targetPlacement,
        fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
      });
    }

    onTilesChange(newTiles);
  }, [mapData, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileLayer, tileFitMode, onTilesChange]);

  const placeStampAtWorld = useCallback((worldX: number, worldY: number, col: number, row: number) => {
    if (!mapData || selectedTilesetId == null || selectedTilesetId === '' || selectedTileId == null || selectedTileId === '') return;

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles || [];

    const newTile: TileAssignment = {
      col, row,
      tilesetId: selectedTilesetId,
      tileId: selectedTileId,
      rotation: (tileRotation || undefined) as TileRotation | undefined,
      flipH: tileFlipH || undefined,
      placement: 'overlay',
      fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
      scale: tileScale !== 1 ? tileScale : undefined,
      freeform: true,
      worldX,
      worldY,
    };

    onTilesChange([...currentTiles, newTile]);
  }, [mapData, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileFitMode, tileScale, onTilesChange]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!isTileTool || !geometry) return;

    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return;

    // Shift+click = flood fill
    if (e.shiftKey && hasTileSelected) {
      floodFillAtCell(coords.x, coords.y);
      return;
    }

    // Stamp mode: place at exact world position
    if (stampMode && hasTileSelected) {
      const worldCoords = screenToWorld(e.clientX, e.clientY);
      if (worldCoords) {
        placeStampAtWorld(worldCoords.worldX, worldCoords.worldY, coords.x, coords.y);
      }
      return;
    }

    isDraggingRef.current = true;
    paintedInStrokeRef.current = new Set();
    lastGridPosRef.current = { col: coords.x, row: coords.y };

    const activeLayer = getActiveLayer(mapData);
    strokeInitialTilesRef.current = [...(activeLayer.tiles || [])];

    if (hasTileSelected) {
      placeTilesInBrush(coords.x, coords.y);
    } else {
      eraseTilesInBrush(coords.x, coords.y);
    }
  }, [isTileTool, geometry, screenToGrid, screenToWorld, hasTileSelected, stampMode, placeTilesInBrush, eraseTilesInBrush, placeStampAtWorld, floodFillAtCell]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDraggingRef.current || !isTileTool || !geometry) return;
    if (stampMode) return;

    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return;

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
  }, [isTileTool, geometry, screenToGrid, hasTileSelected, stampMode, placeTilesInBrush, eraseTilesInBrush]);

  const handlePointerUp = useCallback(() => {
    if (strokeInitialTilesRef.current !== null && mapData) {
      const activeLayer = getActiveLayer(mapData);
      onTilesChange(activeLayer.tiles || [], false);
      strokeInitialTilesRef.current = null;
    }
    isDraggingRef.current = false;
    paintedInStrokeRef.current = new Set();
    lastGridPosRef.current = null;
  }, [mapData, onTilesChange]);

  const tileHandlersRef = useRef<Record<string, unknown> | null>(null);
  tileHandlersRef.current = isTileTool
    ? { handlePointerDown, handlePointerMove, handlePointerUp }
    : {};

  useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return tileHandlersRef.current?.[prop];
      }
    });
    registerHandlers('tilePlacement', proxy);
    return () => unregisterHandlers('tilePlacement');
  }, []);

  return null;
};

export { TilePlacementLayer };
