/**
 * useNotePinInteraction.ts
 *
 * Custom hook for managing Note Pin interactions:
 * - Placement of Note Pin objects (click → place → modal → confirm/cancel)
 * - Note link management for all objects
 * - Modal state management
 * - Note Pin special behavior (inseparable from note)
 */

// Type-only imports
import type { ToolId } from '#types/tools/tool.types';
import type { ObjectTypeId, MapObject } from '#types/objects/object.types';
import type {
  UseNotePinInteractionResult,
  JustSavedRef,
} from '#types/hooks/notePinInteraction.types';

import { useRef } from 'preact/hooks';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { getActiveLayer } from '../../persistence/layerAccessor';

/**
 * Hook for managing note pin interactions
 */
const useNotePinInteraction = (
  currentTool: ToolId,
  selectedObjectType: ObjectTypeId | null
): UseNotePinInteractionResult => {
  // Get all required state and operations from Context
  const { mapData } = useMapState();

  const {
    onObjectsChange,
    getObjectAtPosition,
    addObject,
    updateObject,
    removeObject
  } = useMapOperations();

  const {
    setShowNoteLinkModal,
    pendingNotePinId,
    setPendingNotePinId,
    editingNoteObjectId,
    setEditingNoteObjectId
  } = useMapSelection();

  // Track if we just saved (to prevent race condition with cancel)
  const justSavedRef = useRef<boolean>(false) as JustSavedRef;

  /**
   * Handle Note Pin placement - places pin and opens modal
   */
  const handleNotePinPlacement = (gridX: number, gridY: number): boolean => {
    if (currentTool === 'addNote') {
      // addNote tool directly places note pins without needing sidebar selection
    } else if (currentTool !== 'addObject' || selectedObjectType !== 'note_pin') {
      return false;
    }

    if (!mapData) return false;

    // Check if position is occupied
    const existingObj = getObjectAtPosition(getActiveLayer(mapData).objects, gridX, gridY);
    if (existingObj) {
      return true; // Handled but blocked
    }

    // Place the Note Pin object (without linkedNote initially)
    const newObjects = (addObject as unknown as (objects: MapObject[], typeId: string, x: number, y: number, mapType: string, objectSetId?: string | null) => MapObject[])(getActiveLayer(mapData).objects, 'note_pin', gridX, gridY, mapData.mapType ?? 'grid', mapData.objectSetId);

    // Find the newly created pin
    const newPin = newObjects[newObjects.length - 1];

    // Reset save flag for new interaction
    justSavedRef.current = false;

    // Store its ID and open modal
    setPendingNotePinId(newPin.id);
    setShowNoteLinkModal(true);

    // Update map with new pin
    onObjectsChange(newObjects);

    return true;
  };

  /**
   * Handle note link save from modal
   * Special behavior for Note Pins vs regular objects
   */
  const handleNoteLinkSave = (notePath: string | null): void => {
    if (!mapData) return;

    // Mark that we're saving (not canceling)
    justSavedRef.current = true;

    let updatedObjects: MapObject[];

    // Determine which object we're working with
    const objectId = pendingNotePinId ?? editingNoteObjectId;
    if (objectId == null || objectId === '') return;

    const object = getActiveLayer(mapData).objects?.find(obj => obj.id === objectId);
    if (!object) return;

    const isNotePin = object.type === 'note_pin';

    // Handle based on object type and whether note is being added or removed
    if (notePath == null || notePath.trim() === '') {
      // Removing note link
      if (isNotePin) {
        // Note Pins are inseparable from notes - remove the entire pin
        updatedObjects = removeObject(getActiveLayer(mapData).objects, objectId);
      } else {
        // Regular objects - just clear the linkedNote field
        updatedObjects = updateObject(getActiveLayer(mapData).objects, objectId, { linkedNote: null });
      }
    } else {
      // Adding/updating note link
      updatedObjects = updateObject(getActiveLayer(mapData).objects, objectId, { linkedNote: notePath });
    }

    onObjectsChange(updatedObjects);

    // Close modal and clear state
    setShowNoteLinkModal(false);
    setPendingNotePinId(null);
    setEditingNoteObjectId(null);
  };

  /**
   * Handle note link modal cancellation
   * If canceling a pending Note Pin, remove it entirely
   */
  const handleNoteLinkCancel = (): void => {
    // If we just saved, don't remove the object (modal calls both onSave and onClose)
    if (justSavedRef.current) {
      justSavedRef.current = false; // Reset for next time
      return;
    }

    if (pendingNotePinId != null && pendingNotePinId !== '' && mapData != null) {
      // Remove the pending Note Pin since user canceled
      const updatedObjects = removeObject(getActiveLayer(mapData).objects, pendingNotePinId);
      onObjectsChange(updatedObjects);
    }

    // Close modal and clear state
    setShowNoteLinkModal(false);
    setPendingNotePinId(null);
    setEditingNoteObjectId(null);
  };

  /**
   * Handle edit note link button click for existing objects
   */
  const handleEditNoteLink = (objectId: string): void => {
    if (!objectId) return;

    // Reset save flag for new interaction
    justSavedRef.current = false;

    setEditingNoteObjectId(objectId);
    setShowNoteLinkModal(true);
  };

  return {
    handleNotePinPlacement,
    handleNoteLinkSave,
    handleNoteLinkCancel,
    handleEditNoteLink
  };
};

export { useNotePinInteraction };