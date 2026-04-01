/**
 * useObjectHover.ts
 *
 * Hover state tracking for objects under the cursor.
 * Extracted from useObjectInteractions.ts.
 */

import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { MapStateContextValue, MapOperationsContextValue, MapSelectionContextValue } from '#types/contexts/context.types';

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

const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx") as {
  useMapSelection: () => MapSelectionContextValue;
};

const { getClickedObjectInCell } = await requireModuleByName("hexSlotPositioner.ts") as {
  getClickedObjectInCell: (objects: MapObject[], x: number, y: number, offsetX: number, offsetY: number, orientation: string) => MapObject | null;
};

const { HexGeometry } = await requireModuleByName("HexGeometry.ts") as {
  HexGeometry: new (...args: unknown[]) => IGeometry;
};

const { getActiveLayer, isCellFogged } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
  isCellFogged: (layer: MapLayer, col: number, row: number) => boolean;
};

function useObjectHover(): {
  handleHoverUpdate: (e: PointerEvent | MouseEvent) => void;
} {
  const { mapData, geometry, screenToGrid, screenToWorld, getClientCoords, containerRef } = useMapState();
  const { getObjectAtPosition } = useMapOperations();
  const { setHoveredObject, setMousePosition } = useMapSelection();

  const handleHoverUpdate = dc.useCallback((e: PointerEvent | MouseEvent): void => {
    const touchEvent = e as unknown as TouchEvent;
    if (!touchEvent.touches && mapData && getActiveLayer(mapData).objects) {
      const { clientX, clientY } = getClientCoords(e);
      const coords = screenToGrid(clientX, clientY);
      if (coords) {
        let obj: MapObject | null = null;

        const { x, y } = coords;

        if (mapData.mapType === 'hex' && geometry instanceof HexGeometry) {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords) {
            const hexCenter = geometry.gridToWorld!(x, y);
            const clickOffsetX = (worldCoords.worldX - hexCenter.worldX) / geometry.width!;
            const clickOffsetY = (worldCoords.worldY - hexCenter.worldY) / geometry.width!;

            obj = getClickedObjectInCell(
              getActiveLayer(mapData).objects,
              x, y,
              clickOffsetX, clickOffsetY,
              mapData.orientation || 'flat'
            );
          }
        }

        if (!obj) {
          obj = getObjectAtPosition(getActiveLayer(mapData).objects, x, y);
        }

        if (obj) {
          const activeLayer = getActiveLayer(mapData);
          if (activeLayer.fogOfWar?.enabled) {
            const objOffset = geometry!.toOffsetCoords(obj.position.x, obj.position.y);
            if (isCellFogged(activeLayer, objOffset.col, objOffset.row)) {
              obj = null;
            }
          }
        }

        setHoveredObject(obj);

        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const relativeX = clientX - rect.left;
          const relativeY = clientY - rect.top;
          setMousePosition({ x: relativeX, y: relativeY });
        }
      } else {
        setHoveredObject(null);
      }
    }
  }, [mapData, geometry, getClientCoords, screenToGrid, screenToWorld, getObjectAtPosition, setHoveredObject, setMousePosition, containerRef]
  );

  return { handleHoverUpdate };
}

return { useObjectHover };
