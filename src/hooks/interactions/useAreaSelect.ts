/**
 * useAreaSelect.ts
 *
 * Custom hook for managing area selection tool:
 * - Two-click rectangle selection (matching other area tools)
 * - First click places start corner marker
 * - Second click completes selection of all items in rectangle
 */

// Type-only imports
import type { ToolId } from '#types/tools/tool.types';
import type { Point, WorldCoords } from '#types/core/geometry.types';
import type { UseAreaSelectResult } from '#types/hooks/areaSelect.types';
import { useCallback, useState } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { getItemsInWorldRect } from '../../objects/multiSelectOperations';









/**
 * Hook for managing area selection tool
 *
 * @param currentTool - Current active tool
 * @returns Area select handlers and state
 */
const useAreaSelect = (currentTool: ToolId): UseAreaSelectResult => {
  const {
    canvasRef,
    mapData,
    geometry,
    screenToWorld,
    screenToGrid,
    getClientCoords
  } = useMapState();

  const {
    areaSelectStart,
    setAreaSelectStart,
    selectMultiple,
    clearSelection
  } = useMapSelection();

  const [areaSelectHoverPosition, setAreaSelectHoverPosition] = useState<Point | null>(null);

  const isAreaSelectTool = currentTool === 'areaSelect';

  const updateAreaSelectHover = useCallback((gridX: number, gridY: number): void => {
    if (areaSelectStart) {
      setAreaSelectHoverPosition({ x: gridX, y: gridY });
    }
  }, [areaSelectStart]);

  /**
   * Handle click for area select tool
   * First click: Set start corner
   * Second click: Complete selection
   */
  const handleAreaSelectClick = useCallback(
    (e: PointerEvent | MouseEvent | TouchEvent): boolean => {
      if (!isAreaSelectTool || !mapData || !geometry) {
        return false;
      }

      const { clientX, clientY } = getClientCoords(e);
      const worldCoords = screenToWorld(clientX, clientY);
      const gridCoords = screenToGrid(clientX, clientY);

      if (!worldCoords || !gridCoords) {
        return false;
      }

      if (!areaSelectStart) {
        clearSelection();

        setAreaSelectStart({
          worldX: worldCoords.worldX,
          worldY: worldCoords.worldY,
          x: gridCoords.x,
          y: gridCoords.y
        });
        return true;
      }

      const corner1: WorldCoords = {
        worldX: areaSelectStart.worldX,
        worldY: areaSelectStart.worldY
      };
      const corner2: WorldCoords = {
        worldX: worldCoords.worldX,
        worldY: worldCoords.worldY
      };

      // Get canvas context for text measurement
      const ctx = canvasRef.current?.getContext('2d') ?? null;

      const items = getItemsInWorldRect(mapData, corner1, corner2, geometry, ctx);

      if (items.length > 0) {
        selectMultiple(items);
      } else {
        clearSelection();
      }

      setAreaSelectStart(null);
      setAreaSelectHoverPosition(null);

      return true;
    },
    [
      isAreaSelectTool,
      mapData,
      geometry,
      areaSelectStart,
      getClientCoords,
      screenToWorld,
      screenToGrid,
      canvasRef,
      setAreaSelectStart,
      selectMultiple,
      clearSelection
    ]
  );

  /**
   * Cancel area selection (e.g., on tool change or Escape)
   */
  const cancelAreaSelect = useCallback((): void => {
    if (areaSelectStart) {
      setAreaSelectStart(null);
      setAreaSelectHoverPosition(null);
    }
  }, [areaSelectStart, setAreaSelectStart]);

  /**
   * Check if area selection is in progress (first corner placed)
   */
  const isAreaSelecting = !!areaSelectStart;

  return {
    // State
    areaSelectStart,
    isAreaSelecting,
    areaSelectHoverPosition,

    // Handlers
    handleAreaSelectClick,
    cancelAreaSelect,
    updateAreaSelectHover
  };
};

export { useAreaSelect };