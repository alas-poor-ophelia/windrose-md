/**
 * useNotePinInteraction.js
 * 
 * Custom hook for managing Note Pin interactions:
 * - Placement of Note Pin objects (click → place → modal → confirm/cancel)
 * - Note link management for all objects
 * - Modal state management
 * - Note Pin special behavior (inseparable from note)
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { getActiveLayer } = await requireModuleByName("layerAccessor.js");

/**
 * Hook for managing note pin interactions
 * @param {string} currentTool - Current active tool
 * @param {string} selectedObjectType - Currently selected object type
 */
const useNotePinInteraction = (
  currentTool,
  selectedObjectType
) => {
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
    showNoteLinkModal,
    setShowNoteLinkModal,
    pendingNotePinId,
    setPendingNotePinId,
    editingNoteObjectId,
    setEditingNoteObjectId
  } = useMapSelection();
  
  // Track if we just saved (to prevent race condition with cancel)
  const justSavedRef = dc.useRef(false);
  
  /**
   * Handle Note Pin placement - places pin and opens modal
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {boolean} - True if placement was handled
   */
  const handleNotePinPlacement = (gridX, gridY) => {
    if (currentTool !== 'addObject' || selectedObjectType !== 'note_pin') {
      return false;
    }
    
    // Check if position is occupied
    const existingObj = getObjectAtPosition(getActiveLayer(mapData).objects || [], gridX, gridY);
    if (existingObj) {
      return true; // Handled but blocked
    }
    
    // Place the Note Pin object (without linkedNote initially)
    const newObjects = addObject(getActiveLayer(mapData).objects || [], 'note_pin', gridX, gridY);
    
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
   * @param {string|null} notePath - Full vault path to note, or null to remove
   */
  const handleNoteLinkSave = (notePath) => {
    if (!mapData) return;
    
    // Mark that we're saving (not canceling)
    justSavedRef.current = true;
    
    let updatedObjects;
    
    // Determine which object we're working with
    const objectId = pendingNotePinId || editingNoteObjectId;
    if (!objectId) return;
    
    const object = getActiveLayer(mapData).objects?.find(obj => obj.id === objectId);
    if (!object) return;
    
    const isNotePin = object.type === 'note_pin';
    
    // Handle based on object type and whether note is being added or removed
    if (!notePath || !notePath.trim()) {
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
  const handleNoteLinkCancel = () => {
    // If we just saved, don't remove the object (modal calls both onSave and onClose)
    if (justSavedRef.current) {
      justSavedRef.current = false; // Reset for next time
      return;
    }
    
    if (pendingNotePinId && mapData) {
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
   * @param {string} objectId - ID of object to edit note link for
   */
  const handleEditNoteLink = (objectId) => {
    if (!objectId) return;
    
    // Reset save flag for new interaction
    justSavedRef.current = false;
    
    setEditingNoteObjectId(objectId);
    setShowNoteLinkModal(true);
  };
  
  return {
    // Handlers
    handleNotePinPlacement,
    handleNoteLinkSave,
    handleNoteLinkCancel,
    handleEditNoteLink
  };
};

return { useNotePinInteraction };