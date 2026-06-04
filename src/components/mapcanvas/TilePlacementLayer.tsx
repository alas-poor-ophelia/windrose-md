/**
 * TilePlacementLayer.tsx
 *
 * Interaction layer for placing tile images on hex or grid maps.
 * Click or drag with the tilePaint tool to assign tiles to cells.
 * Supports drag-painting (holding pointer down while moving across cells).
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { TileAssignment, TileRotation } from '#types/tiles/tile.types';

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';
import { getActiveLayer } from '../../persistence/layerAccessor';




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
  onTilesChange
}: TilePlacementLayerProps): VNode | null => {
  const { mapData, geometry, screenToGrid, screenToWorld } = useMapState();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const isTileTool = currentTool === 'tilePaint';
  const hasTileSelected = selectedTilesetId != null && selectedTilesetId !== '' && selectedTileId != null && selectedTileId !== '';

  const paintedInStrokeRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);
  const strokeInitialTilesRef = useRef<TileAssignment[] | null>(null);

  const placeTileAtCell = useCallback((col: number, row: number) => {
    if (!mapData || selectedTilesetId == null || selectedTilesetId === '' || selectedTileId == null || selectedTileId === '') return;

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles || [];
    const key = `${col},${row}`;

    if (paintedInStrokeRef.current.has(key)) return;
    paintedInStrokeRef.current.add(key);

    const targetPlacement = tileLayer === 'base' ? 'fill' : 'overlay';
    const existingIdx = currentTiles.findIndex(
      (t: TileAssignment) => t.col === col && t.row === row && (t.placement || 'fill') === targetPlacement
    );

    const newTile: TileAssignment = {
      col, row,
      tilesetId: selectedTilesetId,
      tileId: selectedTileId,
      rotation: (tileRotation || undefined) as TileRotation | undefined,
      flipH: tileFlipH || undefined,
      placement: targetPlacement === 'fill' ? undefined : targetPlacement,
      fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
      scale: tileScale !== 1 ? tileScale : undefined,
    };

    let newTiles: TileAssignment[];
    if (existingIdx >= 0) {
      newTiles = [...currentTiles];
      newTiles[existingIdx] = newTile;
    } else {
      newTiles = [...currentTiles, newTile];
    }

    const isBatchedStroke = strokeInitialTilesRef.current !== null;
    onTilesChange(newTiles, isBatchedStroke);
  }, [mapData, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileLayer, tileFitMode, tileScale, onTilesChange]);

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

  const eraseTileAtCell = useCallback((col: number, row: number) => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles || [];
    const key = `${col},${row}`;

    if (paintedInStrokeRef.current.has(key)) return;
    paintedInStrokeRef.current.add(key);

    const isBatchedStroke = strokeInitialTilesRef.current !== null;

    // Prefer removing overlay first, then fill
    const overlayIdx = currentTiles.findIndex(
      (t: TileAssignment) => t.col === col && t.row === row && t.placement === 'overlay'
    );
    if (overlayIdx >= 0) {
      const newTiles = currentTiles.filter((_: TileAssignment, i: number) => i !== overlayIdx);
      onTilesChange(newTiles, isBatchedStroke);
      return;
    }

    const newTiles = currentTiles.filter(
      (t: TileAssignment) => !(t.col === col && t.row === row)
    );

    if (newTiles.length !== currentTiles.length) {
      onTilesChange(newTiles, isBatchedStroke);
    }
  }, [mapData, onTilesChange]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!isTileTool || !geometry || geometry.type !== 'hex') return;

    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return;

    if (stampMode && hasTileSelected) {
      const worldCoords = screenToWorld(e.clientX, e.clientY);
      if (worldCoords) {
        placeStampAtWorld(worldCoords.worldX, worldCoords.worldY, coords.x, coords.y);
      }
      return;
    }

    isDraggingRef.current = true;
    paintedInStrokeRef.current = new Set();

    const activeLayer = getActiveLayer(mapData);
    strokeInitialTilesRef.current = [...(activeLayer.tiles || [])];

    if (hasTileSelected) {
      placeTileAtCell(coords.x, coords.y);
    } else {
      eraseTileAtCell(coords.x, coords.y);
    }
  }, [isTileTool, geometry, screenToGrid, screenToWorld, hasTileSelected, stampMode, placeTileAtCell, placeStampAtWorld, eraseTileAtCell]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDraggingRef.current || !isTileTool || !geometry || geometry.type !== 'hex') return;
    if (stampMode) return;

    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return;

    if (hasTileSelected) {
      placeTileAtCell(coords.x, coords.y);
    } else {
      eraseTileAtCell(coords.x, coords.y);
    }
  }, [isTileTool, geometry, screenToGrid, hasTileSelected, stampMode, placeTileAtCell, eraseTileAtCell]);

  const handlePointerUp = useCallback(() => {
    if (strokeInitialTilesRef.current !== null && mapData) {
      const activeLayer = getActiveLayer(mapData);
      onTilesChange(activeLayer.tiles || [], false);
      strokeInitialTilesRef.current = null;
    }
    isDraggingRef.current = false;
    paintedInStrokeRef.current = new Set();
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
