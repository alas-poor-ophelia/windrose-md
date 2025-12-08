/**
 * ObjectLayer.jsx
 * Handles all object-related interactions:
 * - Object placement
 * - Object selection and dragging
 * - Object resizing
 * - Object color and notes
 * - Hover tooltips
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");
const { useObjectInteractions } = await requireModuleByName("useObjectInteractions.js");
const { TextInputModal } = await requireModuleByName("TextInputModal.jsx");
const { NoteLinkModal } = await requireModuleByName("NoteLinkModal.jsx");
const { SelectionToolbar } = await requireModuleByName("SelectionToolbar.jsx");
const { calculateObjectScreenPosition } = await requireModuleByName("screenPositionUtils.js");

/**
 * ObjectLayer Component
 * 
 * @param {string} currentTool - Current active tool
 * @param {string} selectedObjectType - Currently selected object type
 * @param {Function} onObjectsChange - Callback when objects change
 * @param {Array} customColors - Array of custom colors
 * @param {Function} onAddCustomColor - Callback to add custom color
 * @param {Function} onDeleteCustomColor - Callback to delete custom color
 */
const ObjectLayer = ({ 
  currentTool,
  selectedObjectType,
  onObjectsChange,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor
}) => {
  // Get shared state from Context
  const { canvasRef, containerRef, mapData, geometry, screenToGrid, screenToWorld, getClientCoords, GridGeometry } = useMapState();
  const { getObjectAtPosition, addObject, updateObject, removeObject, isAreaFree, onObjectsChange: contextOnObjectsChange } = useMapOperations();
  const { 
    selectedItem, setSelectedItem, 
    isDraggingSelection, setIsDraggingSelection, 
    dragStart, setDragStart, 
    isResizeMode, setIsResizeMode,
    hoveredObject, setHoveredObject,
    mousePosition, setMousePosition,
    showNoteLinkModal, setShowNoteLinkModal,
    editingNoteObjectId, setEditingNoteObjectId,
    showCoordinates,
    layerVisibility
  } = useMapSelection();
  
  // Object note modal state
  const [showNoteModal, setShowNoteModal] = dc.useState(false);
  const [editingObjectId, setEditingObjectId] = dc.useState(null);
  
  // Object color picker state
  const [showObjectColorPicker, setShowObjectColorPicker] = dc.useState(false);
  
  // Handle object scale change from slider
  const handleScaleChange = dc.useCallback((newScale) => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData?.objects) return;
    
    const updatedObjects = updateObject(mapData.objects, selectedItem.id, { scale: newScale });
    contextOnObjectsChange(updatedObjects);
    
    // Update selected item data
    const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
    if (updatedObject) {
      setSelectedItem({ ...selectedItem, data: updatedObject });
    }
  }, [selectedItem, mapData, updateObject, contextOnObjectsChange, setSelectedItem]);
  
  // Note link modal state is now from MapSelectionContext (shared with NotePinLayer)
  
  // Use object interactions hook (optimized - gets most values from Context)
  const {
    isResizing,
    resizeCorner,
    objectColorBtnRef,
    pendingObjectCustomColorRef,
    edgeSnapMode,
    setEdgeSnapMode,
    longPressTimerRef,
    handleObjectPlacement,
    handleObjectSelection,
    handleObjectDragging,
    handleObjectResizing,
    handleObjectWheel,
    handleHoverUpdate,
    stopObjectDragging,
    stopObjectResizing,
    handleObjectKeyDown,
    handleObjectRotation,
    handleObjectDeletion,
    handleObjectDuplicate,
    handleNoteSubmit,
    handleObjectColorSelect,
    handleObjectColorReset,
    getClickedCorner
  } = useObjectInteractions(
    currentTool,
    selectedObjectType,
    onAddCustomColor,
    customColors
  );
  
  // Register object handlers with EventHandlerContext for event coordination
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  // Register object handlers when they change
  dc.useEffect(() => {
    registerHandlers('object', {
      // Placement and selection
      handleObjectPlacement,
      handleObjectSelection,
      // Dragging and resizing
      handleObjectDragging,
      handleObjectResizing,
      stopObjectDragging,
      stopObjectResizing,
      // Hover updates
      handleHoverUpdate,
      // Wheel for scaling
      handleObjectWheel,
      // Keyboard handling
      handleObjectKeyDown,
      // State for coordination
      isResizing,
      resizeCorner,
      edgeSnapMode,
      setEdgeSnapMode
    });
    
    return () => unregisterHandlers('object');
  }, [
    registerHandlers, unregisterHandlers,
    handleObjectPlacement, handleObjectSelection,
    handleObjectDragging, handleObjectResizing,
    stopObjectDragging, stopObjectResizing,
    handleHoverUpdate, handleObjectWheel, handleObjectKeyDown,
    isResizing, resizeCorner,
    edgeSnapMode, setEdgeSnapMode
  ]);
  
  // Handle opening note modal
  const handleNoteButtonClick = (e) => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();
      
      // Clear any drag state before opening modal (prevents stuck cursor bug)
      if (isDraggingSelection) {
        setIsDraggingSelection(false);
        setDragStart(null);
      }
      
      setEditingObjectId(selectedItem.id);
      setShowNoteModal(true);
    }
  };
  
  // Handle resize button click
  const handleResizeButtonClick = (e) => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();
      setIsResizeMode(true);
    }
  };
  
  // Handle note modal submit
  const handleNoteModalSubmit = (content) => {
    handleNoteSubmit(content, editingObjectId);
    setShowNoteModal(false);
    setEditingObjectId(null);
  };
  
  // Handle note modal cancel
  const handleNoteCancel = () => {
    setShowNoteModal(false);
    setEditingObjectId(null);
  };
  
  // Handle object color picker button click
  const handleObjectColorButtonClick = (e) => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();
      setShowObjectColorPicker(!showObjectColorPicker);
    }
  };
  
  // Handle object color picker close
  const handleObjectColorPickerClose = () => {
    setShowObjectColorPicker(false);
  };
  
  // Handle object color reset (wrapper)
  const handleObjectColorResetWrapper = () => {
    handleObjectColorReset(setShowObjectColorPicker);
  };
  
  // Handle edit note link button click
  const handleEditNoteLink = (objectId) => {
    // Clear any drag state before opening modal (prevents stuck cursor bug)
    if (isDraggingSelection) {
      setIsDraggingSelection(false);
      setDragStart(null);
    }
    
    setEditingNoteObjectId(objectId);
    setShowNoteLinkModal(true);
  };
  
  // Handle note link save
  const handleNoteLinkSave = (notePath) => {
    if (!mapData || !editingNoteObjectId) return;
    
    const updatedObjects = mapData.objects.map(obj => {
      if (obj.id === editingNoteObjectId) {
        return { ...obj, linkedNote: notePath };
      }
      return obj;
    });
    
    onObjectsChange(updatedObjects);
    
    // Update selectedItem if this is the currently selected object
    if (selectedItem?.type === 'object' && selectedItem.id === editingNoteObjectId) {
      const updatedObject = updatedObjects.find(obj => obj.id === editingNoteObjectId);
      if (updatedObject) {
        setSelectedItem({ ...selectedItem, data: updatedObject });
      }
    }
    
    setShowNoteLinkModal(false);
    setEditingNoteObjectId(null);
  };
  
  // Handle note link cancel
  const handleNoteLinkCancel = () => {
    setShowNoteLinkModal(false);
    setEditingNoteObjectId(null);
  };
  
  // Close object color picker when clicking outside
  dc.useEffect(() => {
    if (showObjectColorPicker) {
      const handleClickOutside = (e) => {
        const pickerElement = e.target.closest('.dmt-color-picker');
        const buttonElement = e.target.closest('.dmt-object-color-button');
        
        if (!pickerElement && !buttonElement) {
          if (pendingObjectCustomColorRef.current && onAddCustomColor) {
            onAddCustomColor(pendingObjectCustomColorRef.current);
            handleObjectColorSelect(pendingObjectCustomColorRef.current);
            pendingObjectCustomColorRef.current = null;
          }
          
          handleObjectColorPickerClose();
        }
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [showObjectColorPicker]);
  
  // Hide object UI when coordinate overlay is visible or objects layer is hidden
  if (showCoordinates || !layerVisibility.objects) {
    return null;
  }
  
  // Calculate positions for cardinal direction indicators
  const getCardinalIndicatorPositions = (selectedObject) => {
    if (!selectedObject || !canvasRef.current || !containerRef.current || !mapData) {
      return null;
    }
    
    const screenPos = calculateObjectScreenPosition(
      selectedObject, 
      canvasRef.current, 
      mapData, 
      geometry
    );
    
    if (!screenPos) return null;
    
    const { screenX, screenY, objectWidth, objectHeight } = screenPos;
    const indicatorSize = 12; // Size of arrow indicators
    const gap = 6; // Gap between object edge and indicator
    
    // screenX/screenY are the CENTER of the object
    // Position arrows just outside the object bounds
    return {
      north: { 
        x: screenX - indicatorSize/2, 
        y: screenY - objectHeight/2 - gap - indicatorSize 
      },
      south: { 
        x: screenX - indicatorSize/2, 
        y: screenY + objectHeight/2 + gap 
      },
      east: { 
        x: screenX + objectWidth/2 + gap, 
        y: screenY - indicatorSize/2 
      },
      west: { 
        x: screenX - objectWidth/2 - gap - indicatorSize, 
        y: screenY - indicatorSize/2 
      }
    };
  };
  
  const selectedObject = selectedItem?.type === 'object' && mapData?.objects 
    ? mapData.objects.find(obj => obj.id === selectedItem.id)
    : null;
  
  const indicatorPositions = edgeSnapMode && selectedObject && mapData?.mapType !== 'hex'
    ? getCardinalIndicatorPositions(selectedObject)
    : null;
  
  // Render object-specific UI
  return (
    <>
      {/* Edge Snap Mode Indicators - positioned directly like SelectionToolbar */}
      {edgeSnapMode && selectedItem?.type === 'object' && indicatorPositions && (
        <>
          {/* North indicator */}
          <div 
            className="dmt-edge-snap-indicator north"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.north.x}px`,
              top: `${indicatorPositions.north.y}px`,
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
          {/* South indicator */}
          <div 
            className="dmt-edge-snap-indicator south"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.south.x}px`,
              top: `${indicatorPositions.south.y}px`,
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
          {/* East indicator */}
          <div 
            className="dmt-edge-snap-indicator east"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.east.x}px`,
              top: `${indicatorPositions.east.y}px`,
              width: 0,
              height: 0,
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderLeft: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
          {/* West indicator */}
          <div 
            className="dmt-edge-snap-indicator west"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.west.x}px`,
              top: `${indicatorPositions.west.y}px`,
              width: 0,
              height: 0,
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderRight: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
        </>
      )}
      
      {/* Selection Toolbar for objects - only render when an object is selected and not dragging */}
      {selectedItem?.type === 'object' && !isDraggingSelection && (
        <SelectionToolbar
          selectedItem={selectedItem}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          geometry={geometry}
          
          // Object handlers
          onRotate={handleObjectRotation}
          onDuplicate={handleObjectDuplicate}
          onLabel={handleNoteButtonClick}
          onLinkNote={() => handleEditNoteLink(selectedItem?.id)}
          onColorClick={handleObjectColorButtonClick}
          onResize={handleResizeButtonClick}
          onDelete={handleObjectDeletion}
          onScaleChange={handleScaleChange}
          
          // State
          isResizeMode={isResizeMode}
          showColorPicker={showObjectColorPicker}
          
          // Color picker props
          currentColor={selectedItem?.data?.color}
          onColorSelect={handleObjectColorSelect}
          onColorPickerClose={handleObjectColorPickerClose}
          onColorReset={handleObjectColorResetWrapper}
          customColors={customColors}
          onAddCustomColor={onAddCustomColor}
          onDeleteCustomColor={onDeleteCustomColor}
          pendingCustomColorRef={pendingObjectCustomColorRef}
          colorButtonRef={objectColorBtnRef}
        />
      )}
      
      {/* Object note modal */}
      {showNoteModal && editingObjectId && mapData && (
        <TextInputModal
          onSubmit={handleNoteModalSubmit}
          onCancel={handleNoteCancel}
          title={`Note for ${mapData.objects.find(obj => obj.id === editingObjectId)?.label || 'Object'}`}
          placeholder="Add a custom note..."
          initialValue={mapData.objects.find(obj => obj.id === editingObjectId)?.customTooltip || ''}
        />
      )}
      
      {/* Note Link Modal */}
      {showNoteLinkModal && mapData && (
        <NoteLinkModal
          isOpen={showNoteLinkModal}
          onClose={handleNoteLinkCancel}
          onSave={handleNoteLinkSave}
          currentNotePath={
            editingNoteObjectId
              ? mapData.objects?.find(obj => obj.id === editingNoteObjectId)?.linkedNote || null
              : null
          }
          objectType={
            editingNoteObjectId
              ? mapData.objects?.find(obj => obj.id === editingNoteObjectId)?.type || null
              : null
          }
        />
      )}
      
      {/* Hover tooltips for objects */}
      {hoveredObject && mousePosition && hoveredObject.type !== 'note_pin' && (
        <div 
          className="dmt-object-tooltip"
          style={{
            position: 'absolute',
            left: mousePosition.x + 20,
            top: mousePosition.y + 25,
            pointerEvents: 'none',
            zIndex: 1000
          }}
        >
          {hoveredObject.customTooltip 
            ? `${hoveredObject.label} - ${hoveredObject.customTooltip}`
            : hoveredObject.label
          }
        </div>
      )}
    </>
  );
};

// Datacore export
return { ObjectLayer };