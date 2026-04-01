/**
 * useObjectDragSelect.ts
 *
 * Object selection + drag logic. These MUST stay together because
 * handleObjectSelection writes longPressTimerRef on mousedown and
 * handleObjectDragging reads it on the next mousemove frame.
 * Extracted from useObjectInteractions.ts.
 */

import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { ToolId } from '#types/tools/tool.types';
import type {
  ResizeCorner,
  ObjectDragStart,
} from '#types/hooks/objectInteractions.types';
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

const { calculateEdgeAlignment, removeObjectFromHex } = await requireModuleByName("objectOperations.ts") as {
  calculateEdgeAlignment: (fractionalX: number, fractionalY: number, gridX: number, gridY: number) => string;
  removeObjectFromHex: (objects: MapObject[], id: string) => MapObject[];
};

const { getClickedObjectInCell, getObjectsInCell, assignSlot } = await requireModuleByName("hexSlotPositioner.ts") as {
  getClickedObjectInCell: (objects: MapObject[], x: number, y: number, offsetX: number, offsetY: number, orientation: string) => MapObject | null;
  getObjectsInCell: (objects: MapObject[], x: number, y: number) => MapObject[];
  assignSlot: (occupiedSlots: number[]) => number;
};

const { HexGeometry } = await requireModuleByName("HexGeometry.ts") as {
  HexGeometry: new (...args: unknown[]) => IGeometry;
};

const { getActiveLayer, isCellFogged } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
  isCellFogged: (layer: MapLayer, col: number, row: number) => boolean;
};

function useObjectDragSelect(
  currentTool: ToolId,
  selectedObjectType: string | null,
  altKeyPressedRef: { current: boolean },
  shiftKeyPressedRef: { current: boolean },
  edgeSnapMode: boolean,
  setEdgeSnapMode: (v: boolean) => void,
  beginResize: (corner: ResizeCorner, objects: MapObject[], dragStart: ObjectDragStart) => void,
  getClickedCorner: (clientX: number, clientY: number, object: MapObject) => ResizeCorner
): {
  handleObjectSelection: (clientX: number, clientY: number, gridX: number, gridY: number) => boolean;
  handleObjectDragging: (e: PointerEvent | MouseEvent | TouchEvent) => boolean;
  stopObjectDragging: () => boolean;
} {
  const { mapData, geometry, screenToGrid, screenToWorld, getClientCoords } = useMapState();
  const { getObjectAtPosition, updateObject, onObjectsChange } = useMapOperations();
  const { selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, dragStart, setDragStart, isResizeMode, setIsResizeMode } = useMapSelection();

  const longPressTimerRef = dc.useRef(null);
  const dragInitialStateRef = dc.useRef(null);

  const handleObjectSelection = dc.useCallback((
    clientX: number,
    clientY: number,
    gridX: number,
    gridY: number
  ): boolean => {
    if (currentTool !== 'select') {
      return false;
    }

    if (selectedItem?.type === 'object' && isResizeMode) {
      const selectedObject = getActiveLayer(mapData!).objects?.find((obj: MapObject) => obj.id === selectedItem.id);
      if (selectedObject) {
        const corner = getClickedCorner(clientX, clientY, selectedObject);
        if (corner) {
          beginResize(corner, [...(getActiveLayer(mapData!).objects || [])], { x: clientX, y: clientY, gridX, gridY, object: { ...selectedObject } });
          return true;
        }
      }
    }

    let object: MapObject | null = null;
    if (mapData!.mapType === 'hex' && geometry instanceof HexGeometry) {
      const cellObjects = getObjectsInCell(getActiveLayer(mapData!).objects || [], gridX, gridY);

      if (cellObjects.length > 1) {
        const worldCoords = screenToWorld(clientX, clientY);
        if (worldCoords && geometry.hexToWorld) {
          const { worldX: hexCenterX, worldY: hexCenterY } = geometry.hexToWorld(gridX, gridY);
          const hexWidth = geometry.hexSize! * 2;
          const clickOffsetX = (worldCoords.worldX - hexCenterX) / hexWidth;
          const clickOffsetY = (worldCoords.worldY - hexCenterY) / hexWidth;

          object = getClickedObjectInCell(
            getActiveLayer(mapData!).objects || [],
            gridX,
            gridY,
            clickOffsetX,
            clickOffsetY,
            mapData!.orientation || 'flat'
          );
        }
      } else if (cellObjects.length === 1) {
        object = cellObjects[0];
      }
    } else {
      object = getObjectAtPosition(getActiveLayer(mapData!).objects || [], gridX, gridY);
    }

    if (object) {
      const activeLayer = getActiveLayer(mapData!);
      if (activeLayer.fogOfWar?.enabled) {
        const objOffset = geometry!.toOffsetCoords(object.position.x, object.position.y);
        if (isCellFogged(activeLayer, objOffset.col, objOffset.row)) {
          object = null;
        }
      }
    }

    if (object) {
      const isAlreadySelected = selectedItem?.type === 'object' && selectedItem.id === object.id;

      if (isAlreadySelected) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }

        if (mapData!.mapType !== 'hex') {
          longPressTimerRef.current = setTimeout(() => {
            setEdgeSnapMode(prev => !prev);

            if (navigator.vibrate) {
              navigator.vibrate(50);
            }

            longPressTimerRef.current = null;
          }, 500);
        }

        dragInitialStateRef.current = [...(getActiveLayer(mapData!).objects || [])];
        setIsDraggingSelection(true);
        const offsetX = gridX - object.position.x;
        const offsetY = gridY - object.position.y;
        const worldCoords = object.freeform ? screenToWorld(clientX, clientY) : null;
        setDragStart({ x: clientX, y: clientY, gridX, gridY, offsetX, offsetY, worldX: worldCoords?.worldX, worldY: worldCoords?.worldY });
        setIsResizeMode(false);
      } else {
        setSelectedItem({ type: 'object', id: object.id, data: object });
        setIsResizeMode(false);

        dragInitialStateRef.current = [...(getActiveLayer(mapData!).objects || [])];
        setIsDraggingSelection(true);
        const offsetX = gridX - object.position.x;
        const offsetY = gridY - object.position.y;
        const worldCoords = object.freeform ? screenToWorld(clientX, clientY) : null;
        setDragStart({
          x: clientX,
          y: clientY,
          gridX,
          gridY,
          offsetX,
          offsetY,
          objectId: object.id,
          worldX: worldCoords?.worldX,
          worldY: worldCoords?.worldY
        });

        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }

        if (mapData!.mapType !== 'hex') {
          longPressTimerRef.current = setTimeout(() => {
            setEdgeSnapMode(true);

            if (navigator.vibrate) {
              navigator.vibrate(50);
            }

            longPressTimerRef.current = null;
          }, 500);
        }
      }

      return true;
    }

    return false;
  }, [currentTool, selectedObjectType, selectedItem, isResizeMode, mapData, geometry,
    getObjectAtPosition, setSelectedItem, setIsDraggingSelection, setDragStart, screenToWorld, getClickedCorner, beginResize
  ]);

  const handleObjectDragging = dc.useCallback((e: PointerEvent | MouseEvent | TouchEvent): boolean => {
    const isDraggingObject = selectedItem?.type === 'object' || dragStart?.objectId;
    if (!isDraggingSelection || !isDraggingObject || !dragStart || !mapData) {
      return false;
    }

    const objectId = selectedItem?.id || dragStart.objectId;

    const { clientX, clientY } = getClientCoords(e);

    if (longPressTimerRef.current) {
      const dx = clientX - dragStart.x;
      const dy = clientY - dragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 5) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    e.preventDefault();
    e.stopPropagation();

    const currentObject = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === objectId);

    // Alt+Shift drag inversion: temporarily flip snap behavior
    const isInverted = altKeyPressedRef.current && shiftKeyPressedRef.current;
    if (isInverted && currentObject) {
      if (!dragStart.wasInverted) {
        setDragStart({ ...dragStart, wasInverted: true, originalFreeform: !!currentObject.freeform });
      }

      const wasOriginallyGrid = dragStart.wasInverted
        ? dragStart.originalFreeform === false
        : !currentObject.freeform;

      if (wasOriginallyGrid) {
        const worldCoords = screenToWorld(clientX, clientY);
        if (!worldCoords) return true;

        let baseWorldX: number, baseWorldY: number;
        if (currentObject.worldPosition) {
          baseWorldX = currentObject.worldPosition.x;
          baseWorldY = currentObject.worldPosition.y;
        } else {
          const cellCenter = geometry?.getCellCenter
            ? (geometry as any).getCellCenter(currentObject.position.x, currentObject.position.y)
            : geometry?.gridToWorld?.(currentObject.position.x, currentObject.position.y);
          if (!cellCenter) return true;
          baseWorldX = cellCenter.worldX;
          baseWorldY = cellCenter.worldY;
        }

        if (dragStart.worldX != null && dragStart.worldY != null) {
          const deltaWorldX = worldCoords.worldX - dragStart.worldX;
          const deltaWorldY = worldCoords.worldY - dragStart.worldY;
          baseWorldX = baseWorldX + deltaWorldX;
          baseWorldY = baseWorldY + deltaWorldY;
        }

        const nearestGrid = screenToGrid(clientX, clientY);
        const updatedObjects = updateObject(
          getActiveLayer(mapData).objects,
          objectId!,
          {
            freeform: true,
            worldPosition: { x: baseWorldX, y: baseWorldY },
            ...(nearestGrid ? { position: { x: nearestGrid.x, y: nearestGrid.y } } : {})
          }
        );
        onObjectsChange(updatedObjects, true);
        setDragStart({ ...dragStart, x: clientX, y: clientY, worldX: worldCoords.worldX, worldY: worldCoords.worldY, wasInverted: true, originalFreeform: false });
        return true;
      } else {
        const coords = screenToGrid(clientX, clientY);
        if (!coords) return true;

        const offsetX = dragStart.offsetX || 0;
        const offsetY = dragStart.offsetY || 0;
        const targetX = coords.x - offsetX;
        const targetY = coords.y - offsetY;

        const cellCenter = geometry?.getCellCenter
          ? (geometry as any).getCellCenter(targetX, targetY)
          : geometry?.gridToWorld?.(targetX, targetY);

        const updatedObjects = updateObject(
          getActiveLayer(mapData).objects,
          objectId!,
          {
            position: { x: targetX, y: targetY },
            ...(cellCenter ? { worldPosition: { x: cellCenter.worldX, y: cellCenter.worldY } } : {})
          }
        );
        onObjectsChange(updatedObjects, true);
        setDragStart({ ...dragStart, x: clientX, y: clientY, gridX: coords.x, gridY: coords.y, wasInverted: true, originalFreeform: true });
        return true;
      }
    }

    if (dragStart.wasInverted && !isInverted) {
      const worldCoords = screenToWorld(clientX, clientY);
      setDragStart({
        ...dragStart,
        x: clientX,
        y: clientY,
        wasInverted: false,
        worldX: worldCoords?.worldX,
        worldY: worldCoords?.worldY
      });
      return true;
    }

    if (currentObject?.freeform && currentObject.worldPosition && dragStart.worldX != null && dragStart.worldY != null) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (!worldCoords) return true;

      const deltaWorldX = worldCoords.worldX - dragStart.worldX;
      const deltaWorldY = worldCoords.worldY - dragStart.worldY;

      const newWorldX = currentObject.worldPosition.x + deltaWorldX;
      const newWorldY = currentObject.worldPosition.y + deltaWorldY;

      const nearestGrid = screenToGrid(clientX, clientY);

      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        objectId!,
        {
          worldPosition: { x: newWorldX, y: newWorldY },
          ...(nearestGrid ? { position: { x: nearestGrid.x, y: nearestGrid.y } } : {})
        }
      );
      onObjectsChange(updatedObjects, true);

      setDragStart({ ...dragStart, x: clientX, y: clientY, worldX: worldCoords.worldX, worldY: worldCoords.worldY });
      return true;
    }

    const coords = screenToGrid(clientX, clientY);
    if (!coords) return true;

    const { x, y } = coords;

    const offsetX = dragStart.offsetX || 0;
    const offsetY = dragStart.offsetY || 0;
    const targetX = x - offsetX;
    const targetY = y - offsetY;

    if (x !== dragStart.gridX || y !== dragStart.gridY) {
      if (!currentObject) return true;

      const isMovingWithinSameCell = currentObject.position.x === targetX && currentObject.position.y === targetY;

      if (mapData.mapType === 'hex' && !isMovingWithinSameCell) {
        const targetCellObjects = getObjectsInCell(getActiveLayer(mapData).objects || [], targetX, targetY);

        if (targetCellObjects.length >= 4) {
          return true;
        }

        const targetSlots = targetCellObjects.map((o: MapObject) => o.slot ?? 0);
        const newSlot = assignSlot(targetSlots);

        let updatedObjects = removeObjectFromHex(getActiveLayer(mapData).objects, objectId!);

        updatedObjects = [...updatedObjects, {
          ...currentObject,
          position: { x: targetX, y: targetY },
          slot: newSlot
        }];

        onObjectsChange(updatedObjects, true);

        setDragStart({ x: clientX, y: clientY, gridX: x, gridY: y, offsetX, offsetY, objectId });
        const movedObject = updatedObjects.find((obj: MapObject) => obj.id === objectId);
        if (movedObject) {
          setSelectedItem({
            type: 'object',
            id: objectId!
          });
        }
      } else {
        const existingObj = getObjectAtPosition(getActiveLayer(mapData).objects || [], targetX, targetY);

        if (!existingObj || existingObj.id === objectId) {
          let alignment = 'center';
          if (edgeSnapMode) {
            const worldCoords = screenToWorld(clientX, clientY);
            if (worldCoords && geometry?.worldToGrid) {
              const fractionalX = worldCoords.worldX / (mapData.gridSize || geometry.cellSize);
              const fractionalY = worldCoords.worldY / (mapData.gridSize || geometry.cellSize);
              alignment = calculateEdgeAlignment(fractionalX, fractionalY, targetX, targetY);
            }
          }

          const updatedObjects = updateObject(
            getActiveLayer(mapData).objects,
            objectId!,
            { position: { x: targetX, y: targetY }, alignment }
          );
          onObjectsChange(updatedObjects, true);

          setDragStart({ x: clientX, y: clientY, gridX: x, gridY: y, offsetX, offsetY, objectId });
          const updatedObject = updatedObjects.find((obj: MapObject) => obj.id === objectId);
          if (updatedObject) {
            setSelectedItem({
              type: 'object',
              id: objectId!
            });
          }
        }
      }
    }
    return true;
  }, [isDraggingSelection, selectedItem, dragStart, mapData, edgeSnapMode, geometry,
    getClientCoords, screenToGrid, screenToWorld, updateObject, onObjectsChange, setDragStart, setSelectedItem, getObjectAtPosition]);

  const stopObjectDragging = dc.useCallback((): boolean => {
    const isDraggingObject = selectedItem?.type === 'object' || dragStart?.objectId;
    if (isDraggingSelection && isDraggingObject) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      // Clean up drag inversion
      if (dragStart?.wasInverted && mapData) {
        const objectId = selectedItem?.id || dragStart.objectId;
        const currentObject = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === objectId);
        if (currentObject && objectId) {
          if (dragStart.originalFreeform === false) {
            // Was grid, Alt+Shift dragged to freeform → keep as freeform permanently
          } else if (dragStart.originalFreeform === true) {
            // Was freeform, inverted to grid → keep freeform, snap worldPosition to final cell center
            const cellCenter = geometry?.getCellCenter
              ? (geometry as any).getCellCenter(currentObject.position.x, currentObject.position.y)
              : geometry?.gridToWorld?.(currentObject.position.x, currentObject.position.y);
            if (cellCenter) {
              const updatedObjects = updateObject(
                getActiveLayer(mapData).objects,
                objectId,
                { worldPosition: { x: cellCenter.worldX, y: cellCenter.worldY } }
              );
              onObjectsChange(updatedObjects, true);
            }
          }
        }
      }

      setIsDraggingSelection(false);
      setDragStart(null);

      if (dragInitialStateRef.current !== null) {
        onObjectsChange(getActiveLayer(mapData!).objects, false);
        dragInitialStateRef.current = null;
      }

      // Refresh selectedItem.data so toolbar reflects current freeform state
      if (selectedItem?.type === 'object' && mapData) {
        const freshObject = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === selectedItem.id);
        if (freshObject) {
          setSelectedItem({ type: 'object', id: selectedItem.id, data: freshObject });
        }
      }

      return true;
    }
    return false;
  }, [isDraggingSelection, selectedItem, dragStart, setIsDraggingSelection, setDragStart, onObjectsChange, mapData, geometry, updateObject, setSelectedItem]);

  return { handleObjectSelection, handleObjectDragging, stopObjectDragging };
}

return { useObjectDragSelect };
