// useBoardHandlers.ts - Board (floor) and strata-mode handlers for the layers
// panel (Phase 7). Structural board ops update map data directly; layer-content
// undo is unaffected (history is per-layerId).

import { useCallback } from 'preact/hooks';
import type { MapData } from '#types/index';
import type { MapDataUpdater } from '#types/hooks/mapData.types';
import type { TileLayerRole } from '#types/tiles/tile.types';
import { getBoardsOrdered, updateBoard, addBoard, setActiveBoard, removeBoard, setLayerMode, addLayer, updateActiveLayer } from '../../persistence/layerAccessor';

interface BoardHandlers {
  handleToggleStrataMode: () => void;
  handleBoardAdd: () => void;
  handleBoardSelect: (boardId: string) => void;
  handleBoardDelete: (boardId: string) => void;
  handleAddLayerToStratum: (role: TileLayerRole) => void;
  handleToggleLayerVisible: (layerId: string) => void;
  handleToggleShowBoardBelow: (boardId: string) => void;
  handleSetBoardBelowOpacity: (boardId: string, opacity: number) => void;
}

function useBoardHandlers(updateMapData: MapDataUpdater): BoardHandlers {
  const handleToggleStrataMode = useCallback((): void => {
    updateMapData((prev: MapData) => setLayerMode(prev, prev.layerMode === 'strata' ? 'simple' : 'strata'));
  }, [updateMapData]);
  const handleBoardAdd = useCallback((): void => {
    updateMapData((prev: MapData) => addBoard(prev));
  }, [updateMapData]);
  const handleBoardSelect = useCallback((boardId: string): void => {
    updateMapData((prev: MapData) => setActiveBoard(prev, boardId));
  }, [updateMapData]);
  const handleBoardDelete = useCallback((boardId: string): void => {
    updateMapData((prev: MapData) => removeBoard(prev, boardId));
  }, [updateMapData]);
  const handleAddLayerToStratum = useCallback((role: TileLayerRole): void => {
    updateMapData((prev: MapData) => updateActiveLayer(addLayer(prev), { tileRole: role }));
  }, [updateMapData]);
  const handleToggleLayerVisible = useCallback((layerId: string): void => {
    updateMapData((prev: MapData) => ({
      ...prev,
      layers: prev.layers.map(l => l.id === layerId ? { ...l, visible: l.visible === false } : l),
    }));
  }, [updateMapData]);
  const handleToggleShowBoardBelow = useCallback((boardId: string): void => {
    updateMapData((prev: MapData) => {
      const board = getBoardsOrdered(prev).find(b => b.id === boardId);
      if (!board) return prev;
      return updateBoard(prev, boardId, { showBoardBelow: board.showBoardBelow !== true });
    });
  }, [updateMapData]);
  const handleSetBoardBelowOpacity = useCallback((boardId: string, opacity: number): void => {
    const clampedOpacity = Math.max(0.1, Math.min(0.5, opacity));
    updateMapData((prev: MapData) => updateBoard(prev, boardId, { boardBelowOpacity: clampedOpacity }));
  }, [updateMapData]);

  return {
    handleToggleStrataMode, handleBoardAdd, handleBoardSelect, handleBoardDelete,
    handleAddLayerToStratum, handleToggleLayerVisible, handleToggleShowBoardBelow, handleSetBoardBelowOpacity,
  };
}

export { useBoardHandlers };
export type { BoardHandlers };
