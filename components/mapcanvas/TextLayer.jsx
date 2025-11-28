const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useTextLabelInteraction } = await requireModuleByName("useTextLabelInteraction.js");
const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { TextLabelEditor } = await requireModuleByName("TextLabelEditor.jsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");
const { SelectionToolbar } = await requireModuleByName("SelectionToolbar.jsx");

/**
 * TextLayer.jsx
 * Handles all text label interactions:
 * - Text label placement
 * - Text label selection and dragging
 * - Text label rotation and editing
 * - Text label UI controls (rotate button, edit button)
 * - Text label modal
 */
const TextLayer = ({
  currentTool,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor
}) => {
  // Get values needed for rendering from Context
  const { mapData, canvasRef, containerRef, geometry } = useMapState();
  const { selectedItem, showCoordinates, layerVisibility } = useMapSelection();
  
  // Use text label interaction hook (optimized - gets most values from Context)
  const {
    showTextModal,
    editingTextId,
    handleTextPlacement,
    handleTextSelection,
    handleTextDragging,
    stopTextDragging,
    handleTextKeyDown,
    handleTextSubmit,
    handleTextCancel,
    handleRotateClick,
    handleEditClick,
    handleCanvasDoubleClick,
    handleTextRotation,
    handleTextDeletion
  } = useTextLabelInteraction(
    currentTool,
    onAddCustomColor,
    customColors
  );
  
  
  // Register text handlers with EventHandlerContext for event coordination
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  // Register text label handlers when they change
  dc.useEffect(() => {
    registerHandlers('text', {
      // Placement and selection
      handleTextPlacement,
      handleTextSelection,
      // Dragging
      handleTextDragging,
      stopTextDragging,
      // Editing
      handleCanvasDoubleClick,
      handleEditClick,
      // Keyboard handling
      handleTextKeyDown
    });
    
    return () => unregisterHandlers('text');
  }, [
    registerHandlers, unregisterHandlers,
    handleTextPlacement, handleTextSelection,
    handleTextDragging, stopTextDragging,
    handleCanvasDoubleClick, handleEditClick,
    handleTextKeyDown
  ]);
  
  // Hide text UI when coordinate overlay is visible or text layer is hidden
  if (showCoordinates || !layerVisibility.textLabels) {
    return null;
  }
  
  // Render text label UI controls and modals
  return (
    <>
      {/* Selection Toolbar for text labels - only render when a text label is selected */}
      {selectedItem?.type === 'text' && (
        <SelectionToolbar
          selectedItem={selectedItem}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          geometry={geometry}
          
          // Text handlers
          onEdit={handleEditClick}
          onRotate={handleRotateClick}
          onDelete={handleTextDeletion}
          
          // Not used for text but required by component
          isResizeMode={false}
          showColorPicker={false}
        />
      )}
      
      {/* Text Label Editor Modal */}
      {showTextModal && (() => {
        let currentLabel = null;
        if (editingTextId && mapData?.textLabels) {
          currentLabel = mapData.textLabels.find(l => l.id === editingTextId);
        }
        
        return (
          <TextLabelEditor
            initialValue={currentLabel?.content || ''}
            initialFontSize={currentLabel?.fontSize || 16}
            initialFontFace={currentLabel?.fontFace || 'sans'}
            initialColor={currentLabel?.color || '#ffffff'}
            isEditing={!!editingTextId}
            customColors={customColors || []}
            onAddCustomColor={onAddCustomColor}
            onDeleteCustomColor={onDeleteCustomColor}
            onSubmit={handleTextSubmit}
            onCancel={handleTextCancel}
          />
        );
      })()}
    </>
  );
};

return { TextLayer };