/**
 * useObjectPlacement.ts
 *
 * Object placement on click (grid-snapped and freeform).
 * Extracted from useObjectInteractions.ts.
 */

import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { ToolId } from '#types/tools/tool.types';
import type { MapStateContextValue, MapOperationsContextValue } from '#types/contexts/context.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { useMapState } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateContextValue;
};

const { useMapOperations } = await requireModuleByName("MapContext.tsx") as {
  useMapOperations: () => MapOperationsContextValue;
};

const { calculateEdgeAlignment, placeObject, placeObjectFreeform, canPlaceObjectAt } = await requireModuleByName("objectOperations.ts") as {
  calculateEdgeAlignment: (fractionalX: number, fractionalY: number, gridX: number, gridY: number) => string;
  placeObject: (objects: MapObject[], type: string, x: number, y: number, options: { mapType: string; alignment?: string }) => { success: boolean; objects: MapObject[] };
  placeObjectFreeform: (objects: MapObject[], type: string, worldX: number, worldY: number, nearestGridPos: { x: number; y: number }, mapType: string) => { success: boolean; objects: MapObject[]; object?: MapObject };
  canPlaceObjectAt: (objects: MapObject[], x: number, y: number, mapType: string) => boolean;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

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

  const handleObjectPlacement = dc.useCallback((
    gridX: number,
    gridY: number,
    clientX: number,
    clientY: number
  ): boolean => {
    if (currentTool !== 'addObject' || !selectedObjectType) {
      return false;
    }

    if (geometry && geometry.isWithinBounds) {
      if (!geometry.isWithinBounds(gridX, gridY)) {
        return true;
      }
    }

    const mapType = mapData!.mapType || 'grid';

    // Freeform placement: Alt+Shift or sidebar toggle places at exact world coordinates
    const useFreeformPlacement = (altKeyPressedRef.current && shiftKeyPressedRef.current)
                                || (freeformPlacementModeRef?.current ?? false);
    if (useFreeformPlacement && clientX !== undefined && clientY !== undefined) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (!worldCoords) return true;

      const result = placeObjectFreeform(
        getActiveLayer(mapData!).objects || [],
        selectedObjectType,
        worldCoords.worldX,
        worldCoords.worldY,
        { x: gridX, y: gridY },
        mapType
      );
      if (result.success) {
        onObjectsChange(result.objects);
      }
      return true;
    }

    if (!canPlaceObjectAt(getActiveLayer(mapData!).objects || [], gridX, gridY, mapType)) {
      return true;
    }

    let alignment = 'center';
    if (mapType === 'grid' && edgeSnapMode && clientX !== undefined && clientY !== undefined) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords && geometry) {
        const cellSize = mapData!.gridSize || geometry.cellSize;
        const fractionalX = worldCoords.worldX / cellSize;
        const fractionalY = worldCoords.worldY / cellSize;
        alignment = calculateEdgeAlignment(fractionalX, fractionalY, gridX, gridY);
      }
    }

    const result = placeObject(
      getActiveLayer(mapData!).objects || [],
      selectedObjectType,
      gridX,
      gridY,
      { mapType, alignment }
    );

    if (result.success) {
      onObjectsChange(result.objects);
    }
    return true;
  }, [currentTool, selectedObjectType, mapData, geometry, edgeSnapMode, onObjectsChange, screenToWorld]);

  return { handleObjectPlacement };
}

return { useObjectPlacement };
