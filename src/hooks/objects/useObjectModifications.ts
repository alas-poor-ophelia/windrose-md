/**
 * useObjectModifications.ts
 *
 * Object mutation handlers: wheel scaling, note editing, color,
 * rotation, deletion, and duplication.
 * Extracted from useObjectInteractions.ts (Phase 4.2).
 */

import type { MapObject } from '#types/objects/object.types';

import { useCallback } from 'preact/hooks';
import { getNextRotation } from '../../drawing/rotationOperations';
import { canPlaceObjectAt, generateObjectId } from '../../objects/objectOperations';
import { assignSlot } from '../../objects/hexSlotPositioner';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { useMapState } from '../../context/MapContext';
import { useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';


















const useObjectModifications = (): {
  handleObjectWheel: (e: WheelEvent) => boolean;
  handleNoteSubmit: (content: string, editingObjectId: string) => void;
  handleObjectColorSelect: (color: string) => void;
  handleObjectColorReset: (setShowObjectColorPicker: (show: boolean) => void) => void;
  handleObjectRotation: () => void;
  handleObjectDeletion: () => void;
  handleObjectDuplicate: () => void;
} => {
  const { mapData, screenToGrid } = useMapState();
  const { updateObject, removeObject, onObjectsChange } = useMapOperations();
  const { selectedItem, setSelectedItem } = useMapSelection();

  const handleObjectWheel = useCallback((e: WheelEvent): boolean => {
    if (selectedItem?.type !== 'object' || !mapData) {
      return false;
    }

    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return false;

    const { x, y } = coords;
    const selectedObject = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!selectedObject) return false;

    const isOverObject = x >= selectedObject.position.x &&
                     x < selectedObject.position.x + (selectedObject.size?.width || 1) &&
                     y >= selectedObject.position.y &&
                     y < selectedObject.position.y + (selectedObject.size?.height || 1);

    if (!isOverObject) return false;

    e.preventDefault();

    const currentScale = selectedObject.scale ?? 1.0;
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.25, Math.min(1.3, currentScale + delta));

    if (newScale !== currentScale) {
      const updatedObjects = updateObject(getActiveLayer(mapData).objects, selectedItem.id, { scale: newScale });
      onObjectsChange(updatedObjects);
    }

    return true;
  }, [selectedItem, mapData, screenToGrid, updateObject, onObjectsChange]);

  const handleNoteSubmit = useCallback((content: string, editingObjectId: string): void => {
    if (editingObjectId && mapData) {
      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        editingObjectId,
        { customTooltip: content && content.trim() ? content.trim() : undefined }
      );
      onObjectsChange(updatedObjects);
    }
  }, [mapData, onObjectsChange, updateObject]
  );

  const handleObjectColorSelect = useCallback((color: string): void => {
    if (selectedItem?.type === 'object' && mapData) {
      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        selectedItem.id,
        { color: color }
      );
      onObjectsChange(updatedObjects);
      const updatedObj = updatedObjects.find((o: MapObject) => o.id === selectedItem.id);
      if (updatedObj) setSelectedItem({ ...selectedItem, data: updatedObj });
    }
  }, [selectedItem, mapData, updateObject, onObjectsChange, setSelectedItem]
  );

  const handleObjectColorReset = useCallback((setShowObjectColorPicker: (show: boolean) => void): void => {
    handleObjectColorSelect('#ffffff');
    setShowObjectColorPicker(false);
  }, [handleObjectColorSelect]);

  const handleObjectRotation = useCallback((): void => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }

    const currentObject = getActiveLayer(mapData).objects?.find((obj: MapObject) => obj.id === selectedItem.id);
    const currentRotation = currentObject?.rotation ?? 0;
    const nextRotation = getNextRotation(currentRotation);

    const updatedObjects = updateObject(
      getActiveLayer(mapData).objects,
      selectedItem.id,
      { rotation: nextRotation }
    );
    onObjectsChange(updatedObjects);
  }, [selectedItem, mapData, updateObject, onObjectsChange]);

  const handleObjectDeletion = useCallback((): void => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }

    const updatedObjects = removeObject(getActiveLayer(mapData).objects, selectedItem.id);
    onObjectsChange(updatedObjects);
    setSelectedItem(null);
  }, [selectedItem, mapData, removeObject, onObjectsChange, setSelectedItem]);

  const handleObjectDuplicate = useCallback((): void => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }

    const sourceObject = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!sourceObject) return;

    const { mapType } = mapData;
    const { x: sourceX, y: sourceY } = sourceObject.position;

    // Hex-axial 6 directions vs Cartesian 4 directions
    const directions = mapType === 'hex'
      ? [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
      : [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let targetX = sourceX;
    let targetY = sourceY;
    let found = false;

    // Check immediate neighbors first
    for (const [dx, dy] of directions) {
      if (canPlaceObjectAt(getActiveLayer(mapData).objects, sourceX + dx, sourceY + dy, mapType)) {
        targetX = sourceX + dx;
        targetY = sourceY + dy;
        found = true;
        break;
      }
    }

    // Expanding ring search if immediate neighbors are full
    if (!found) {
      for (let ring = 2; ring <= 10 && !found; ring++) {
        for (let dx = -ring; dx <= ring && !found; dx++) {
          for (let dy = -ring; dy <= ring && !found; dy++) {
            if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
              const checkX = sourceX + dx;
              const checkY = sourceY + dy;

              if (canPlaceObjectAt(getActiveLayer(mapData).objects, checkX, checkY, mapType)) {
                targetX = checkX;
                targetY = checkY;
                found = true;
              }
            }
          }
        }
      }
    }

    if (!found) {
      console.warn('No empty space found for duplicate');
      return;
    }

    const newObject: MapObject = {
      ...sourceObject,
      id: generateObjectId(),
      position: { x: targetX, y: targetY }
    };

    if (mapType === 'hex') {
      const occupiedSlots = getActiveLayer(mapData).objects
        .filter((obj: MapObject) => obj.position.x === targetX && obj.position.y === targetY)
        .map((obj: MapObject) => obj.slot)
        .filter((s: number | undefined): s is number => s !== undefined);
      newObject.slot = assignSlot(occupiedSlots);
    }

    const updatedObjects = [...getActiveLayer(mapData).objects, newObject];
    onObjectsChange(updatedObjects);

    setSelectedItem({
      type: 'object',
      id: newObject.id
    });
  }, [selectedItem, mapData, onObjectsChange, setSelectedItem]);

  return {
    handleObjectWheel,
    handleNoteSubmit,
    handleObjectColorSelect,
    handleObjectColorReset,
    handleObjectRotation,
    handleObjectDeletion,
    handleObjectDuplicate
  };
};

export { useObjectModifications };