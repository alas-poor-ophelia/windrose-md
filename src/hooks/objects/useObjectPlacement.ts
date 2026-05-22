/**
 * useObjectPlacement.ts
 *
 * Object placement on click (grid-snapped and freeform).
 * Extracted from useObjectInteractions.ts.
 */

import type { ToolId } from '#types/tools/tool.types';

import { useCallback } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useMapOperations } from '../../context/MapContext';
import { calculateEdgeAlignment, placeObject, placeObjectFreeform, canPlaceObjectAt } from '../../objects/objectOperations';
import { getActiveLayer } from '../../persistence/layerAccessor';












function useObjectPlacement(
  currentTool: ToolId,
  selectedObjectType: string | null,
  altKeyPressedRef: { current: boolean },
  shiftKeyPressedRef: { current: boolean },
  edgeSnapMode: boolean,
  freeformPlacementModeRef?: { current: boolean }
): {
  handleObjectPlacement: (gridX: number, gridY: number, clientX: number, clientY: number) => boolean;
} {
  const { mapData, geometry, screenToWorld } = useMapState();
  const { onObjectsChange } = useMapOperations();

  const handleObjectPlacement = useCallback((
    gridX: number,
    gridY: number,
    clientX: number,
    clientY: number
  ): boolean => {
    if (currentTool !== 'addObject' || selectedObjectType == null || selectedObjectType === '') {
      return false;
    }

    if (!geometry.isWithinBounds(gridX, gridY)) {
      return true;
    }

    const mapType = mapData.mapType || 'grid';

    // Freeform placement: Alt+Shift or sidebar toggle places at exact world coordinates
    const useFreeformPlacement = (altKeyPressedRef.current && shiftKeyPressedRef.current)
                                || (freeformPlacementModeRef?.current ?? false);
    if (useFreeformPlacement && clientX !== undefined && clientY !== undefined) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (!worldCoords) return true;

      const result = placeObjectFreeform(
        getActiveLayer(mapData).objects,
        selectedObjectType,
        worldCoords.worldX,
        worldCoords.worldY,
        { x: gridX, y: gridY },
        mapType,
        mapData.objectSetId
      );
      if (result.success) {
        onObjectsChange(result.objects);
      }
      return true;
    }

    if (!canPlaceObjectAt(getActiveLayer(mapData).objects, gridX, gridY, mapType)) {
      return true;
    }

    let alignment = 'center';
    if (mapType === 'grid' && edgeSnapMode && clientX !== undefined && clientY !== undefined) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords) {
        const cellSize = mapData.gridSize ?? geometry.cellSize;
        const fractionalX = worldCoords.worldX / cellSize;
        const fractionalY = worldCoords.worldY / cellSize;
        alignment = calculateEdgeAlignment(fractionalX, fractionalY, gridX, gridY);
      }
    }

    const result = placeObject(
      getActiveLayer(mapData).objects,
      selectedObjectType,
      gridX,
      gridY,
      { mapType, alignment: alignment as import('#types/objects/object.types').ObjectAlignment, objectSetId: mapData.objectSetId }
    );

    if (result.success) {
      onObjectsChange(result.objects);
    }
    return true;
  }, [currentTool, selectedObjectType, mapData, geometry, edgeSnapMode, onObjectsChange, screenToWorld]);

  return { handleObjectPlacement };
}

export { useObjectPlacement };