/**
 * MapSelectionContext.jsx
 * Shared selection state for coordinating between layers
 * Allows multiple layers (ObjectLayer, TextLayer) to share selection state
 * 
 * Supports both single and multi-selection:
 * - Single selection: click on object/text label
 * - Multi-selection: area select tool (two-click rectangle)
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
  // ============================================================================
  // SELECTION STATE (refactored for multi-select support)
  // ============================================================================
  
  // Primary selection state - array of selected items
  // Each item: { type: 'object' | 'text', id: string, data: object }
  const [selectedItems, setSelectedItems] = dc.useState([]);
  
  // Area select tool state - first corner position for two-click selection
  // { worldX, worldY } when first corner placed, null otherwise
  const [areaSelectStart, setAreaSelectStart] = dc.useState(null);
  
  // ============================================================================
  // SELECTION HELPERS
  // ============================================================================
  
  /**
   * Select a single item (clears any existing selection)
   * @param {Object} item - { type: 'object' | 'text', id: string, data: object }
   */
  const selectItem = dc.useCallback((item) => {
    if (item) {
      setSelectedItems([item]);
    } else {
      setSelectedItems([]);
    }
  }, []);
  
  /**
   * Select multiple items (replaces existing selection)
   * @param {Array} items - Array of { type, id, data } objects
   */
  const selectMultiple = dc.useCallback((items) => {
    setSelectedItems(items || []);
  }, []);
  
  /**
   * Add item to current selection
   * @param {Object} item - { type: 'object' | 'text', id: string, data: object }
   */
  const addToSelection = dc.useCallback((item) => {
    if (!item) return;
    setSelectedItems(prev => {
      // Don't add duplicates
      if (prev.some(i => i.id === item.id)) return prev;
      return [...prev, item];
    });
  }, []);
  
  /**
   * Remove item from current selection
   * @param {string} id - Item ID to remove
   */
  const removeFromSelection = dc.useCallback((id) => {
    setSelectedItems(prev => prev.filter(item => item.id !== id));
  }, []);
  
  /**
   * Clear all selection
   */
  const clearSelection = dc.useCallback(() => {
    setSelectedItems([]);
  }, []);
  
  /**
   * Check if an item is selected
   * @param {string} id - Item ID to check
   * @returns {boolean}
   */
  const isSelected = dc.useCallback((id) => {
    return selectedItems.some(item => item.id === id);
  }, [selectedItems]);
  
  /**
   * Update the data for selected items (used during drag to keep selection in sync)
   * @param {Array} updates - Array of { id, ...newData } objects
   */
  const updateSelectedItemsData = dc.useCallback((updates) => {
    if (!updates || updates.length === 0) return;
    
    const updateMap = new Map(updates.map(u => [u.id, u]));
    
    setSelectedItems(prev => prev.map(item => {
      const update = updateMap.get(item.id);
      if (update) {
        return {
          ...item,
          data: { ...item.data, ...update }
        };
      }
      return item;
    }));
  }, []);
  
  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================
  
  // Backward compatibility: single selected item (null if 0 or 2+ selected)
  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : null;
  
  // Multi-selection flag
  const hasMultiSelection = selectedItems.length > 1;
  
  // Selection count
  const selectionCount = selectedItems.length;
  
  // ============================================================================
  // BACKWARD COMPATIBILITY - setSelectedItem wrapper
  // ============================================================================
  
  /**
   * Backward-compatible setter that wraps selectItem
   * @param {Object|null} item - Single item or null to clear
   */
  const setSelectedItem = dc.useCallback((item) => {
    selectItem(item);
  }, [selectItem]);
  
  // ============================================================================
  // DRAG STATE (extended for group drag)
  // ============================================================================
  
  const [isDraggingSelection, setIsDraggingSelection] = dc.useState(false);
  const [dragStart, setDragStart] = dc.useState(null);
  const [isResizeMode, setIsResizeMode] = dc.useState(false);
  
  // Group drag: ref to store offsets for all selected items during multi-select drag
  // Map<id, { type: 'object'|'text', gridOffsetX, gridOffsetY, worldOffsetX, worldOffsetY }>
  const groupDragOffsetsRef = dc.useRef(new Map());
  
  // Initial state ref for batch history (stores objects and textLabels before drag)
  const groupDragInitialStateRef = dc.useRef(null);
  
  // Computed: are we dragging a multi-selection?
  const isGroupDragging = isDraggingSelection && hasMultiSelection;
  
  // ============================================================================
  // HOVER STATE (unchanged)
  // ============================================================================
  
  const [hoveredObject, setHoveredObject] = dc.useState(null);
  const [mousePosition, setMousePosition] = dc.useState(null);
  
  // ============================================================================
  // NOTE PIN MODAL STATE (unchanged)
  // ============================================================================
  
  const [showNoteLinkModal, setShowNoteLinkModal] = dc.useState(false);
  const [pendingNotePinId, setPendingNotePinId] = dc.useState(null);
  const [editingNoteObjectId, setEditingNoteObjectId] = dc.useState(null);
  
  // ============================================================================
  // COORDINATE OVERLAY STATE (unchanged)
  // ============================================================================
  
  const [showCoordinates, setShowCoordinates] = dc.useState(false);
  
  // ============================================================================
  // LAYER VISIBILITY (unchanged)
  // ============================================================================
  
  const effectiveLayerVisibility = layerVisibility || {
    objects: true,
    textLabels: true,
    hexCoordinates: true
  };
  
  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================
  
  const value = {
    // Multi-select state (new)
    selectedItems,
    setSelectedItems,
    hasMultiSelection,
    selectionCount,
    
    // Selection helpers (new)
    selectItem,
    selectMultiple,
    addToSelection,
    removeFromSelection,
    clearSelection,
    isSelected,
    updateSelectedItemsData,
    
    // Area select state (new)
    areaSelectStart,
    setAreaSelectStart,
    
    // Backward compatibility (existing API)
    selectedItem,
    setSelectedItem,
    
    // Drag state (extended for group drag)
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    isResizeMode,
    setIsResizeMode,
    
    // Group drag state (new)
    groupDragOffsetsRef,
    groupDragInitialStateRef,
    isGroupDragging,
    
    // Hover state (unchanged)
    hoveredObject,
    setHoveredObject,
    mousePosition,
    setMousePosition,
    
    // Note pin modal state (unchanged)
    showNoteLinkModal,
    setShowNoteLinkModal,
    pendingNotePinId,
    setPendingNotePinId,
    editingNoteObjectId,
    setEditingNoteObjectId,
    
    // Coordinate overlay state (unchanged)
    showCoordinates,
    setShowCoordinates,
    
    // Layer visibility (unchanged)
    layerVisibility: effectiveLayerVisibility
  };
  
  return (
    <MapSelectionContext.Provider value={value}>
      {children}
    </MapSelectionContext.Provider>
  );
};

return { MapSelectionProvider, useMapSelection };