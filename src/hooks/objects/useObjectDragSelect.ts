/**
 * useObjectDragSelect.ts
 *
 * Object selection + drag logic. These MUST stay together because
 * handleObjectSelection writes longPressTimerRef on mousedown and
 * handleObjectDragging reads it on the next mousemove frame.
 * Extracted from useObjectInteractions.ts.
 */

import type { MapObject, ObjectAlignment } from '#types/objects/object.types';
import type { ToolId } from '#types/tools/tool.types';
import type {
  ResizeCorner,
  ObjectDragStart,
} from '#types/hooks/objectInteractions.types';

import { useCallback, useRef } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { calculateEdgeAlignment, removeObjectFromHex } from '../../objects/objectOperations';
import { getClickedObjectInCell, getObjectsInCell, assignSlot, classicHitRung } from '../../objects/hexSlotPositioner';
import { pickLadderObject } from '../../objects/ladderHitTest';
import { rungFogPredicate } from '../canvas/rungFog';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { isCellFoggedIndexed } from '../../geometry/fog/foggedCellIndex';


















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
  handleObjectSelection: (clientX: number, clientY: number, gridX: number, gridY: number, isTouchActive?: boolean) => boolean;
  handleObjectDragging: (e: PointerEvent | MouseEvent | TouchEvent) => boolean;
  stopObjectDragging: () => boolean;
} {
  const { mapData, geometry, screenToWorld, getClientCoords, instanceId, canvasRef, ladder, getActiveLevel, screenToLevelCell, viewController } = useMapState();

  const edgeSnapModeRef = useRef(edgeSnapMode);
  edgeSnapModeRef.current = edgeSnapMode;
  const { getObjectAtPosition, updateObject, onObjectsChange, clearTransient } = useMapOperations();
  const { selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, dragStart, setDragStart, isResizeMode, setIsResizeMode } = useMapSelection();

  const longPressTimerRef = useRef<number | null>(null);
  const dragInitialStateRef = useRef<MapObject[] | null>(null);

  const handleObjectSelection = useCallback((
    clientX: number,
    clientY: number,
    gridX: number,
    gridY: number,
    isTouchActive?: boolean
  ): boolean => {
    if (currentTool !== 'select') {
      return false;
    }
    if (mapData == null || geometry == null) return false;

    if (selectedItem?.type === 'object' && isResizeMode) {
      const selectedObject = getActiveLayer(mapData).objects?.find((obj: MapObject) => obj.id === selectedItem.id);
      if (selectedObject != null) {
        const corner = getClickedCorner(clientX, clientY, selectedObject);
        if (corner != null) {
          beginResize(corner, [...(getActiveLayer(mapData).objects ?? [])], { x: clientX, y: clientY, gridX, gridY, object: { ...selectedObject } });
          return true;
        }
      }
    }

    let object: MapObject | null = null;
    // The cell the drag is measured in: level 0 as given, or, under the ladder,
    // the picked object's own home rung (its position is a cell on that rung).
    let cellX = gridX;
    let cellY = gridY;
    if (ladder !== null) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords) {
        const zoom = viewController?.getLive().zoom ?? mapData.viewState?.zoom ?? 1;
        object = pickLadderObject(getActiveLayer(mapData).objects ?? [], worldCoords.worldX, worldCoords.worldY, {
          ladder, level: getActiveLevel(), zoom, orientation: mapData.orientation ?? 'flat'
        });
      }
      if (object != null) {
        const cell = screenToLevelCell(clientX, clientY, object.homeLevel ?? 0);
        if (cell) { cellX = cell.x; cellY = cell.y; }
      }
    } else if (geometry?.type === 'hex') {
      // A `lod` map off the ladder view draws rung 0 only: scope the index match to it.
      const rung = classicHitRung(mapData);
      const cellObjects = getObjectsInCell(getActiveLayer(mapData).objects ?? [], gridX, gridY, rung);

      if (cellObjects.length > 1) {
        const worldCoords = screenToWorld(clientX, clientY);
        if (worldCoords && geometry.hexToWorld != null) {
          const { worldX: hexCenterX, worldY: hexCenterY } = geometry.hexToWorld(gridX, gridY);
          const hexWidth = (geometry.hexSize ?? 1) * 2;
          const clickOffsetX = (worldCoords.worldX - hexCenterX) / hexWidth;
          const clickOffsetY = (worldCoords.worldY - hexCenterY) / hexWidth;

          object = getClickedObjectInCell(
            getActiveLayer(mapData).objects ?? [],
            gridX,
            gridY,
            clickOffsetX,
            clickOffsetY,
            mapData.orientation ?? 'flat',
            rung
          );
        }
      } else if (cellObjects.length === 1) {
        object = cellObjects[0];
      }
    } else {
      object = getObjectAtPosition(getActiveLayer(mapData).objects ?? [], gridX, gridY, classicHitRung(mapData));
    }

    if (object != null) {
      const activeLayer = getActiveLayer(mapData);
      // Fog is level-0 cell data: a deep object is fogged at its root ancestor,
      // exactly as the renderer hides it (rungFog).
      if (activeLayer.fogOfWar?.enabled === true) {
        const home = object.homeLevel ?? 0;
        const fogged = ladder !== null && home > 0 ? rungFogPredicate(ladder, home, isCellFoggedIndexed) : isCellFoggedIndexed;
        const objOffset = geometry.toOffsetCoords(object.position.x, object.position.y);
        if (fogged(activeLayer, objOffset.col, objOffset.row)) {
          object = null;
        }
      }
    }

    if (object != null) {
      const isAlreadySelected = selectedItem?.type === 'object' && selectedItem.id === object.id;

      if (isAlreadySelected) {
        if (longPressTimerRef.current != null) {
          window.clearTimeout(longPressTimerRef.current);
        }

        if (mapData.mapType !== 'hex' && isTouchActive !== false) {
          longPressTimerRef.current = window.setTimeout(() => {
            setEdgeSnapMode(!edgeSnapModeRef.current);

            navigator.vibrate?.(50);

            longPressTimerRef.current = null;
          }, 500);
        }

        dragInitialStateRef.current = [...getActiveLayer(mapData).objects];
        setIsDraggingSelection(true);
        const offsetX = cellX - object.position.x;
        const offsetY = cellY - object.position.y;
        const worldCoords = object.freeform === true ? screenToWorld(clientX, clientY) : null;
        setDragStart({ x: clientX, y: clientY, gridX: cellX, gridY: cellY, offsetX, offsetY, worldX: worldCoords?.worldX, worldY: worldCoords?.worldY });
        setIsResizeMode(false);
      } else {
        setSelectedItem({ type: 'object', id: object.id, data: object });
        setIsResizeMode(false);

        dragInitialStateRef.current = [...getActiveLayer(mapData).objects];
        setIsDraggingSelection(true);
        const offsetX = cellX - object.position.x;
        const offsetY = cellY - object.position.y;
        const worldCoords = object.freeform === true ? screenToWorld(clientX, clientY) : null;
        setDragStart({
          x: clientX,
          y: clientY,
          gridX: cellX,
          gridY: cellY,
          offsetX,
          offsetY,
          objectId: object.id,
          worldX: worldCoords?.worldX,
          worldY: worldCoords?.worldY
        });

        if (longPressTimerRef.current != null) {
          window.clearTimeout(longPressTimerRef.current);
        }

        if (mapData.mapType !== 'hex' && isTouchActive !== false) {
          longPressTimerRef.current = window.setTimeout(() => {
            setEdgeSnapMode(true);

            navigator.vibrate?.(50);

            longPressTimerRef.current = null;
          }, 500);
        }
      }

      return true;
    }

    return false;
  }, [currentTool, selectedItem, isResizeMode, mapData, geometry,
    getObjectAtPosition, setSelectedItem, setIsDraggingSelection, setDragStart, screenToWorld, getClickedCorner, beginResize,
    setEdgeSnapMode, setIsResizeMode, ladder, getActiveLevel, screenToLevelCell, viewController
  ]);

  const handleObjectDragging = useCallback((e: PointerEvent | MouseEvent | TouchEvent): boolean => {
    if (mapData == null || geometry == null) return false;
    const isDraggingObject = selectedItem?.type === 'object' || (dragStart?.objectId != null && dragStart.objectId !== '');
    if (!isDraggingSelection || !isDraggingObject || !dragStart) {
      return false;
    }

    const objectId = selectedItem?.id ?? dragStart.objectId;

    const { clientX, clientY } = getClientCoords(e);

    if (longPressTimerRef.current != null) {
      const dx = clientX - dragStart.x;
      const dy = clientY - dragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 5) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    e.preventDefault();
    e.stopPropagation();

    const currentObject = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === objectId);
    // A dragged object moves on its own home rung: cells resolve there, and the
    // cell centres come from that rung's geometry (level 0 is screenToGrid).
    const home = currentObject?.homeLevel ?? 0;
    const cellGeometry = ladder !== null && home > 0 ? ladder.geometryForLevel(home) : geometry;

    // Alt+Shift drag inversion: temporarily flip snap behavior
    const isInverted = altKeyPressedRef.current && shiftKeyPressedRef.current;
    if (isInverted && currentObject != null) {
      if (dragStart.wasInverted !== true) {
        setDragStart({ ...dragStart, wasInverted: true, originalFreeform: currentObject.freeform === true });
      }

      const wasOriginallyGrid = dragStart.wasInverted === true
        ? dragStart.originalFreeform === false
        : currentObject.freeform !== true;

      if (wasOriginallyGrid) {
        const worldCoords = screenToWorld(clientX, clientY);
        if (!worldCoords) return true;

        let baseWorldX: number, baseWorldY: number;
        if (currentObject.worldPosition) {
          baseWorldX = currentObject.worldPosition.x;
          baseWorldY = currentObject.worldPosition.y;
        } else {
          const cellCenter = cellGeometry.getCellCenter(currentObject.position.x, currentObject.position.y);
          baseWorldX = cellCenter.worldX;
          baseWorldY = cellCenter.worldY;
        }

        if (dragStart.worldX != null && dragStart.worldY != null) {
          const deltaWorldX = worldCoords.worldX - dragStart.worldX;
          const deltaWorldY = worldCoords.worldY - dragStart.worldY;
          baseWorldX = baseWorldX + deltaWorldX;
          baseWorldY = baseWorldY + deltaWorldY;
        }

        const nearestGrid = screenToLevelCell(clientX, clientY, home);
        if (objectId == null) return true;
        const updatedObjects = updateObject(
          getActiveLayer(mapData).objects,
          objectId,
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
        const coords = screenToLevelCell(clientX, clientY, home);
        if (!coords) return true;

        const offsetX = dragStart.offsetX ?? 0;
        const offsetY = dragStart.offsetY ?? 0;
        const targetX = coords.x - offsetX;
        const targetY = coords.y - offsetY;

        const cellCenter = cellGeometry.getCellCenter(targetX, targetY);

        if (objectId == null) return true;
        const updatedObjects = updateObject(
          getActiveLayer(mapData).objects,
          objectId,
          {
            position: { x: targetX, y: targetY },
            worldPosition: { x: cellCenter.worldX, y: cellCenter.worldY }
          }
        );
        onObjectsChange(updatedObjects, true);
        setDragStart({ ...dragStart, x: clientX, y: clientY, gridX: coords.x, gridY: coords.y, wasInverted: true, originalFreeform: true });
        return true;
      }
    }

    if (dragStart.wasInverted === true && !isInverted) {
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

    if (currentObject?.freeform === true && currentObject.worldPosition != null && dragStart.worldX != null && dragStart.worldY != null) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (!worldCoords) return true;

      const deltaWorldX = worldCoords.worldX - dragStart.worldX;
      const deltaWorldY = worldCoords.worldY - dragStart.worldY;

      const newWorldX = currentObject.worldPosition.x + deltaWorldX;
      const newWorldY = currentObject.worldPosition.y + deltaWorldY;

      const nearestGrid = screenToLevelCell(clientX, clientY, home);

      if (objectId == null) return true;
      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        objectId,
        {
          worldPosition: { x: newWorldX, y: newWorldY },
          ...(nearestGrid != null ? { position: { x: nearestGrid.x, y: nearestGrid.y } } : {})
        }
      );
      onObjectsChange(updatedObjects, true);

      setDragStart({ ...dragStart, x: clientX, y: clientY, worldX: worldCoords.worldX, worldY: worldCoords.worldY });
      return true;
    }

    const coords = screenToLevelCell(clientX, clientY, home);
    if (!coords) return true;

    const { x, y } = coords;

    const offsetX = dragStart.offsetX ?? 0;
    const offsetY = dragStart.offsetY ?? 0;
    const targetX = x - offsetX;
    const targetY = y - offsetY;

    if (x !== dragStart.gridX || y !== dragStart.gridY) {
      if (!currentObject) return true;

      const isMovingWithinSameCell = currentObject.position.x === targetX && currentObject.position.y === targetY;

      if (objectId == null) return true;

      if (mapData.mapType === 'hex' && !isMovingWithinSameCell) {
        const targetCellObjects = getObjectsInCell(getActiveLayer(mapData).objects, targetX, targetY, home);

        if (targetCellObjects.length >= 4) {
          return true;
        }

        const targetSlots = targetCellObjects.map((o: MapObject) => o.slot ?? 0);
        const newSlot = assignSlot(targetSlots);

        let updatedObjects = removeObjectFromHex(getActiveLayer(mapData).objects, objectId);

        updatedObjects = [...updatedObjects, {
          ...currentObject,
          position: { x: targetX, y: targetY },
          slot: newSlot
        }];

        onObjectsChange(updatedObjects, true);

        setDragStart({ x: clientX, y: clientY, gridX: x, gridY: y, offsetX, offsetY, objectId });
        const movedObject = updatedObjects.find((obj: MapObject) => obj.id === objectId);
        if (movedObject != null) {
          setSelectedItem({
            type: 'object',
            id: objectId,
            data: movedObject
          });
        }
      } else {
        const existingObj = getObjectAtPosition(getActiveLayer(mapData).objects, targetX, targetY, home);

        if (!existingObj || existingObj.id === objectId) {
          let alignment: ObjectAlignment = 'center';
          if (edgeSnapMode) {
            const worldCoords = screenToWorld(clientX, clientY);
            if (worldCoords && geometry?.worldToGrid != null) {
              const fractionalX = worldCoords.worldX / (mapData.gridSize ?? geometry.cellSize);
              const fractionalY = worldCoords.worldY / (mapData.gridSize ?? geometry.cellSize);
              alignment = calculateEdgeAlignment(fractionalX, fractionalY, targetX, targetY);
            }
          }

          const updatedObjects = updateObject(
            getActiveLayer(mapData).objects,
            objectId,
            { position: { x: targetX, y: targetY }, alignment }
          );
          onObjectsChange(updatedObjects, true);

          setDragStart({ x: clientX, y: clientY, gridX: x, gridY: y, offsetX, offsetY, objectId });
          const updatedObject = updatedObjects.find((obj: MapObject) => obj.id === objectId);
          if (updatedObject != null) {
            setSelectedItem({
              type: 'object',
              id: objectId,
              data: updatedObject
            });
          }
        }
      }
    }
    return true;
  }, [isDraggingSelection, selectedItem, dragStart, mapData, edgeSnapMode, geometry, ladder,
    getClientCoords, screenToLevelCell, screenToWorld, updateObject, onObjectsChange, setDragStart, setSelectedItem, getObjectAtPosition, altKeyPressedRef, shiftKeyPressedRef]);

  const stopObjectDragging = useCallback((): boolean => {
    if (mapData == null || geometry == null) return false;
    const isDraggingObject = selectedItem?.type === 'object' || (dragStart?.objectId != null && dragStart.objectId !== '');
    if (isDraggingSelection && isDraggingObject) {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      // Clean up drag inversion
      if (dragStart?.wasInverted === true) {
        const objectId = selectedItem?.id ?? dragStart.objectId;
        const currentObject = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === objectId);
        if (currentObject != null && objectId != null && objectId !== '') {
          if (dragStart.originalFreeform === false) {
            // Was grid, Alt+Shift dragged to freeform → keep as freeform permanently
          } else if (dragStart.originalFreeform === true) {
            // Was freeform, inverted to grid → keep freeform, snap worldPosition to final cell center
            const cellCenter = geometry.getCellCenter(currentObject.position.x, currentObject.position.y);
            const updatedObjects = updateObject(
              getActiveLayer(mapData).objects,
              objectId,
              { worldPosition: { x: cellCenter.worldX, y: cellCenter.worldY } }
            );
            onObjectsChange(updatedObjects, true);
          }
        }
      }

      setIsDraggingSelection(false);
      setDragStart(null);

      if (dragInitialStateRef.current !== null) {
        onObjectsChange(getActiveLayer(mapData).objects, false);

        const fogObjectId = selectedItem?.id ?? dragStart?.objectId;
        if (fogObjectId != null && fogObjectId !== '') {
          const initialObj = dragInitialStateRef.current.find((o: MapObject) => o.id === fogObjectId);
          const currentObj = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === fogObjectId);
          if (initialObj && currentObj && currentObj.isPlayer === true && currentObj.lightEnabled === true && currentObj.lightRadius != null) {
            const moved = initialObj.position.x !== currentObj.position.x
              || initialObj.position.y !== currentObj.position.y
              || initialObj.worldPosition?.x !== currentObj.worldPosition?.x
              || initialObj.worldPosition?.y !== currentObj.worldPosition?.y;
            if (moved) {
              // Popout-safe: dispatch on the document that owns this canvas.
              (canvasRef.current?.ownerDocument ?? activeDocument).dispatchEvent(new CustomEvent('windrose:player-fog-clear', {
                detail: { objectId: fogObjectId, instanceId: instanceId ?? undefined }
              }));
            }
          }
        }

        dragInitialStateRef.current = null;
      } else {
        // No commit: drop any live-move pin so the next unrelated commit cannot absorb it.
        clearTransient?.();
      }

      // Refresh selectedItem.data so toolbar reflects current freeform state
      if (selectedItem?.type === 'object') {
        const freshObject = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === selectedItem.id);
        if (freshObject) {
          setSelectedItem({ type: 'object', id: selectedItem.id, data: freshObject });
        }
      }

      return true;
    }
    return false;
  }, [isDraggingSelection, selectedItem, dragStart, setIsDraggingSelection, setDragStart, onObjectsChange, mapData, geometry, updateObject, setSelectedItem, instanceId, canvasRef, clearTransient]);

  return { handleObjectSelection, handleObjectDragging, stopObjectDragging };
}

export { useObjectDragSelect };