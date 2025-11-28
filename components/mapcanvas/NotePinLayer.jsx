const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useNotePinInteraction } = await requireModuleByName("useNotePinInteraction.js");
const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { NoteLinkModal } = await requireModuleByName("NoteLinkModal.jsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");

/**
 * NotePinLayer.jsx
 * Handles note pin placement interactions:
 * - Places note_pin objects on click
 * - Opens note link modal for new pins
 * - Handles save/cancel for pending note pins
 * 
 * Note: Editing note links on existing objects (including note_pins) 
 * is handled by ObjectLayer via the "link note" button
 */
const NotePinLayer = ({
  currentTool,
  selectedObjectType
}) => {
  // Context values are now fetched inside useNotePinInteraction
  // We only need mapData here for rendering the modal
  
  // Get mapData and modal state for rendering
  const { mapData } = useMapState();
  const { 
    showNoteLinkModal,
    pendingNotePinId,
    showCoordinates
  } = useMapSelection();
  
  // Use note pin interaction hook (optimized - gets most values from Context)
  const {
    handleNotePinPlacement,
    handleNoteLinkSave,
    handleNoteLinkCancel,
    handleEditNoteLink
  } = useNotePinInteraction(
    currentTool,
    selectedObjectType
  );
  
  
  // Register note pin handlers with EventHandlerContext for event coordination
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  // Register note pin handlers when they change
  dc.useEffect(() => {
    registerHandlers('notePin', {
      // Placement (checks internally if selectedObjectType is note_pin)
      handleNotePinPlacement
    });
    
    return () => unregisterHandlers('notePin');
  }, [registerHandlers, unregisterHandlers, handleNotePinPlacement]);
  
  // Hide note pin UI when coordinate overlay is visible
  if (showCoordinates) {
    return null;
  }
  
  // Render note link modal ONLY for pending note pins
  // (ObjectLayer handles the modal for editing existing note links)
  return (
    <>
      {/* Note Link Modal - only for newly placed note_pin objects */}
      {showNoteLinkModal && pendingNotePinId && mapData && (
        <NoteLinkModal
          isOpen={showNoteLinkModal}
          onClose={handleNoteLinkCancel}
          onSave={handleNoteLinkSave}
          currentNotePath={
            mapData.objects?.find(obj => obj.id === pendingNotePinId)?.linkedNote || null
          }
          objectType="note_pin"
        />
      )}
    </>
  );
};

return { NotePinLayer };