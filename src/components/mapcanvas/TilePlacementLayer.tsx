/**
 * TilePlacementLayer.tsx
 *
 * Interaction layer for placing hex tile images.
 * Click or drag with the tilePaint tool to assign tiles to hex cells.
 * Supports drag-painting (holding pointer down while moving across hexes).
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { HexTileAssignment, TileRotation } from '#types/tiles/tile.types';

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
  onTilesChange: (tiles: HexTileAssignment[], suppressHistory?: boolean) => void;
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
  const hasTileSelected = !!(selectedTilesetId && selectedTileId);

  const paintedInStrokeRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);
  const strokeInitialTilesRef = useRef<HexTileAssignment[] | null>(null);

  const placeTileAtHex = useCallback((q: number, r: number) => {
    if (!mapData || !selectedTilesetId || !selectedTileId) return;

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles || [];
    const key = `${q},${r}`;

    if (paintedInStrokeRef.current.has(key)) return;
    paintedInStrokeRef.current.add(key);

    // Replace existing tile at same hex and same layer, or add new
    const targetLayer = tileLayer || 'base';
    const existingIdx = currentTiles.findIndex(
      (t: HexTileAssignment) => t.q === q && t.r === r && (t.layer || 'base') === targetLayer
    );

    const newTile: HexTileAssignment = {
      q, r,
      tilesetId: selectedTilesetId,
      tileId: selectedTileId,
      rotation: (tileRotation || undefined) as TileRotation | undefined,
      flipH: tileFlipH || undefined,
      layer: targetLayer === 'base' ? undefined : targetLayer,
      fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
      scale: tileScale !== 1 ? tileScale : undefined,
    };

    let newTiles: HexTileAssignment[];
    if (existingIdx >= 0) {
      newTiles = [...currentTiles];
      newTiles[existingIdx] = newTile;
    } else {
      newTiles = [...currentTiles, newTile];
    }

    const isBatchedStroke = strokeInitialTilesRef.current !== null;
    onTilesChange(newTiles, isBatchedStroke);
  }, [mapData, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileLayer, tileFitMode, tileScale, onTilesChange]);

  const placeStampAtWorld = useCallback((worldX: number, worldY: number, q: number, r: number) => {
    if (!mapData || !selectedTilesetId || !selectedTileId) return;

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles || [];

    const newTile: HexTileAssignment = {
      q, r,
      tilesetId: selectedTilesetId,
      tileId: selectedTileId,
      rotation: (tileRotation || undefined) as TileRotation | undefined,
      flipH: tileFlipH || undefined,
      layer: 'overlay',
      fitMode: tileFitMode === 'auto' ? undefined : tileFitMode,
      scale: tileScale !== 1 ? tileScale : undefined,
      freeform: true,
      worldX,
      worldY,
    };

    onTilesChange([...currentTiles, newTile]);
  }, [mapData, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, tileFitMode, tileScale, onTilesChange]);

  const eraseTileAtHex = useCallback((q: number, r: number) => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles || [];
    const key = `${q},${r}`;

    if (paintedInStrokeRef.current.has(key)) return;
    paintedInStrokeRef.current.add(key);

    const isBatchedStroke = strokeInitialTilesRef.current !== null;

    // Prefer removing overlay first, then base
    const overlayIdx = currentTiles.findIndex(
      (t: HexTileAssignment) => t.q === q && t.r === r && t.layer === 'overlay'
    );
    if (overlayIdx >= 0) {
      const newTiles = currentTiles.filter((_: HexTileAssignment, i: number) => i !== overlayIdx);
      onTilesChange(newTiles, isBatchedStroke);
      return;
    }

    const newTiles = currentTiles.filter(
      (t: HexTileAssignment) => !(t.q === q && t.r === r)
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
      // Stamp mode: place at exact world position (click only, no drag)
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
      placeTileAtHex(coords.x, coords.y);
    } else {
      eraseTileAtHex(coords.x, coords.y);
    }
  }, [isTileTool, geometry, screenToGrid, screenToWorld, hasTileSelected, stampMode, placeTileAtHex, placeStampAtWorld, eraseTileAtHex]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDraggingRef.current || !isTileTool || !geometry || geometry.type !== 'hex') return;
    if (stampMode) return; // No drag-painting in stamp mode

    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return;

    if (hasTileSelected) {
      placeTileAtHex(coords.x, coords.y);
    } else {
      eraseTileAtHex(coords.x, coords.y);
    }
  }, [isTileTool, geometry, screenToGrid, hasTileSelected, stampMode, placeTileAtHex, eraseTileAtHex]);

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