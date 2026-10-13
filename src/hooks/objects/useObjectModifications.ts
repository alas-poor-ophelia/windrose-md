/**
 * useObjectModifications.ts
 *
 * Object mutation handlers: wheel scaling, note editing, color,
 * rotation, deletion, and duplication.
 * Extracted from useObjectInteractions.ts (Phase 4.2).
 */

import type { MapObject } from '#types/objects/object.types';

import { useCallback } from 'preact/hooks';
import { findDuplicateTarget, generateObjectId, rotateObjectInList } from '../../objects/objectOperations';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { useMapState } from '../../context/MapContext';
import { useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';

/**
 * Rotation/deletion/duplication accept an explicit target object id so the
 * right-click menu can act on the clicked object; omitted (or a toolbar
 * click's Event) they act on the current selection.
 */
const useObjectModifications = (): {
  handleObjectWheel: (e: WheelEvent) => boolean;
  handleNoteSubmit: (content: string, editingObjectId: string) => void;
  handleObjectColorSelect: (color: string) => void;
  handleObjectColorReset: (setShowObjectColorPicker: (show: boolean) => void) => void;
  handleObjectRotation: (target?: string | Event) => void;
  handleObjectDeletion: (target?: string | Event) => void;
  handleObjectDuplicate: (target?: string | Event) => void;
} => {
  const { mapData, screenToGrid } = useMapState();
  const { updateObject, removeObject, onObjectsChange } = useMapOperations();
  const { selectedItem, setSelectedItem } = useMapSelection();

  const resolveTargetId = useCallback((target?: string | Event): string | null => {
    if (typeof target === 'string' && target !== '') return target;
    return selectedItem?.type === 'object' ? selectedItem.id : null;
  }, [selectedItem]);

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

  const handleObjectRotation = useCallback((target?: string | Event): void => {
    const targetId = resolveTargetId(target);
    if (targetId == null || !mapData) {
      return;
    }

    const updatedObjects = rotateObjectInList(getActiveLayer(mapData).objects, targetId);
    onObjectsChange(updatedObjects);
  }, [resolveTargetId, mapData, onObjectsChange]);

  const handleObjectDeletion = useCallback((target?: string | Event): void => {
    const targetId = resolveTargetId(target);
    if (targetId == null || !mapData) {
      return;
    }

    const updatedObjects = removeObject(getActiveLayer(mapData).objects, targetId);
    onObjectsChange(updatedObjects);
    setSelectedItem(null);
  }, [resolveTargetId, mapData, removeObject, onObjectsChange, setSelectedItem]);

  const handleObjectDuplicate = useCallback((target?: string | Event): void => {
    const targetId = resolveTargetId(target);
    if (targetId == null || !mapData) {
      return;
    }

    const layerObjects = getActiveLayer(mapData).objects;
    const sourceObject = layerObjects.find((obj: MapObject) => obj.id === targetId);
    if (!sourceObject) return;

    const dest = findDuplicateTarget(layerObjects, sourceObject, mapData.mapType);
    if (!dest) {
      console.warn('No empty space found for duplicate');
      return;
    }

    const newObject: MapObject = {
      ...sourceObject,
      id: generateObjectId(),
      position: { x: dest.x, y: dest.y }
    };
    if (dest.slot !== undefined) newObject.slot = dest.slot;

    const updatedObjects = [...layerObjects, newObject];
    onObjectsChange(updatedObjects);

    setSelectedItem({
      type: 'object',
      id: newObject.id
    });
  }, [resolveTargetId, mapData, onObjectsChange, setSelectedItem]);

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