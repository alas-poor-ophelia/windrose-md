/**
 * MapSelectionContext.js
 * Shared selection state for coordinating between layers
 * Allows multiple layers (ObjectLayer, TextLayer) to share selection state
 */

const MapSelectionContext = dc.createContext(null);

/**
 * Hook to access shared selection state
 * @returns {Object} Selection state and setters
 * @throws {Error} If used outside MapSelectionProvider
 */
function useMapSelection() {
  const context = dc.useContext(MapSelectionContext);
  if (!context) {
    throw new Error('useMapSelection must be used within MapSelectionProvider');
  }
  return context;
}

/**
 * Provider component for shared selection state
 * Wraps children and provides selection coordination via Context
 */
const MapSelectionProvider = ({ children, layerVisibility }) => {
  const [selectedItem, setSelectedItem] = dc.useState(null);
  const [isDraggingSelection, setIsDraggingSelection] = dc.useState(false);
  const [dragStart, setDragStart] = dc.useState(null);
  const [isResizeMode, setIsResizeMode] = dc.useState(false);
  
  // Hover state (shared between layers for tooltips)
  const [hoveredObject, setHoveredObject] = dc.useState(null);
  const [mousePosition, setMousePosition] = dc.useState(null);
  
  // Note pin modal state (shared for note_pin placement flow)
  const [showNoteLinkModal, setShowNoteLinkModal] = dc.useState(false);
  const [pendingNotePinId, setPendingNotePinId] = dc.useState(null);
  const [editingNoteObjectId, setEditingNoteObjectId] = dc.useState(null);
  
  // Coordinate overlay state (for hex maps - toggled by holding 'C' key)
  const [showCoordinates, setShowCoordinates] = dc.useState(false);
  
  // Use the layerVisibility prop directly, with fallback
  const effectiveLayerVisibility = layerVisibility || {
    objects: true,
    textLabels: true,
    hexCoordinates: true
  };
  
  // Create context value
  const value = {
    selectedItem,
    setSelectedItem,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    isResizeMode,
    setIsResizeMode,
    hoveredObject,
    setHoveredObject,
    mousePosition,
    setMousePosition,
    showNoteLinkModal,
    setShowNoteLinkModal,
    pendingNotePinId,
    setPendingNotePinId,
    editingNoteObjectId,
    setEditingNoteObjectId,
    showCoordinates,
    setShowCoordinates,
    layerVisibility: effectiveLayerVisibility
  };
  
  return (
    <MapSelectionContext.Provider value={value}>
      {children}
    </MapSelectionContext.Provider>
  );
};

return { MapSelectionProvider, useMapSelection };