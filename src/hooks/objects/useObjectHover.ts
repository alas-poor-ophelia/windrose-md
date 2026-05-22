/**
 * useObjectHover.ts
 *
 * Hover state tracking for objects under the cursor.
 * Extracted from useObjectInteractions.ts.
 */

import type { MapObject } from '#types/objects/object.types';

import { useCallback } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { getClickedObjectInCell } from '../../objects/hexSlotPositioner';
import { HexGeometry } from '../../geometry/core/HexGeometry';
import { getActiveLayer, isCellFogged } from '../../persistence/layerAccessor';
















function useObjectHover(): {
  handleHoverUpdate: (e: PointerEvent | MouseEvent) => void;
} {
  const { mapData, geometry, screenToGrid, screenToWorld, getClientCoords, containerRef } = useMapState();
  const { getObjectAtPosition } = useMapOperations();
  const { setHoveredObject, setMousePosition } = useMapSelection();

  const handleHoverUpdate = useCallback((e: PointerEvent | MouseEvent): void => {
    if (mapData == null) return;
    const touchEvent = e as unknown as TouchEvent;
    if (touchEvent.touches == null) {
      const { clientX, clientY } = getClientCoords(e);
      const coords = screenToGrid(clientX, clientY);
      if (coords) {
        let obj: MapObject | null = null;

        const { x, y } = coords;

        if (mapData.mapType === 'hex' && geometry instanceof HexGeometry) {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords && geometry.gridToWorld != null && geometry.width != null) {
            const hexCenter = geometry.gridToWorld(x, y);
            const clickOffsetX = (worldCoords.worldX - hexCenter.worldX) / geometry.width;
            const clickOffsetY = (worldCoords.worldY - hexCenter.worldY) / geometry.width;

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
          if (activeLayer.fogOfWar?.enabled === true && geometry != null) {
            const objOffset = geometry.toOffsetCoords(obj.position.x, obj.position.y);
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

export { useObjectHover };