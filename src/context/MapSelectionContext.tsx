/**
 * MapSelectionContext.tsx
 * Shared selection state for coordinating between layers
 * Allows multiple layers (ObjectLayer, TextLayer) to share selection state
 *
 * Supports both single and multi-selection:
 * - Single selection: click on object/text label
 * - Multi-selection: area select tool (two-click rectangle)
 */

// Types — imported from canonical location
import type {
  SelectedItem,
  AreaSelectPosition,
  DragStartPosition,
  GroupDragOffset,
  LayerVisibility,
  MousePosition,
  HoveredObject,
  ItemUpdate,
  GroupDragInitialState,
  MapSelectionContextValue
} from '#types/contexts/context.types';

import type { ComponentChildren, FunctionComponent } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useRef, useState } from 'preact/hooks';

// ===========================================
// Context
// ===========================================

const MapSelectionContext = createContext<MapSelectionContextValue | null>(null);

/**
 * Hook to access shared selection state
 * @returns Selection state and setters
 * @throws If used outside MapSelectionProvider
 */
function useMapSelection(): MapSelectionContextValue {
  const context = useContext(MapSelectionContext);
  if (!context) {
    throw new Error('useMapSelection must be used within MapSelectionProvider');
  }
  return context;
}

// ===========================================
// Provider Props
// ===========================================

interface MapSelectionProviderProps {
  children: ComponentChildren;
  layerVisibility?: Partial<LayerVisibility>;
}

/**
 * Provider component for shared selection state
 * Wraps children and provides selection coordination via Context
 */
const MapSelectionProvider: FunctionComponent<MapSelectionProviderProps> = ({ children, layerVisibility }) => {
  // ============================================================================
  // SELECTION STATE (refactored for multi-select support)
  // ============================================================================

  // Primary selection state - array of selected items
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  // Area select tool state - first corner position for two-click selection
  const [areaSelectStart, setAreaSelectStart] = useState<AreaSelectPosition | null>(null);

  // ============================================================================
  // SELECTION HELPERS
  // ============================================================================

  /**
   * Select a single item (clears any existing selection)
   */
  const selectItem = useCallback((item: SelectedItem | null): void => {
    if (item) {
      setSelectedItems([item]);
    } else {
      setSelectedItems([]);
    }
  }, []);

  /**
   * Select multiple items (replaces existing selection)
   */
  const selectMultiple = useCallback((items: SelectedItem[] | null): void => {
    setSelectedItems(items || []);
  }, []);

  /**
   * Add item to current selection
   */
  const addToSelection = useCallback((item: SelectedItem | null): void => {
    if (!item) return;
    setSelectedItems(prev => {
      // Don't add duplicates
      if (prev.some(i => i.id === item.id)) return prev;
      return [...prev, item];
    });
  }, []);

  /**
   * Remove item from current selection
   */
  const removeFromSelection = useCallback((id: string): void => {
    setSelectedItems(prev => prev.filter(item => item.id !== id));
  }, []);

  /**
   * Clear all selection
   */
  const clearSelection = useCallback((): void => {
    setSelectedItems([]);
  }, []);

  /**
   * Check if an item is selected
   */
  const isSelected = useCallback((id: string): boolean => {
    return selectedItems.some(item => item.id === id);
  }, [selectedItems]);

  /**
   * Update the data for selected items (used during drag to keep selection in sync)
   */
  const updateSelectedItemsData = useCallback((updates: ItemUpdate[]): void => {
    if (updates.length === 0) return;

    const updateMap = new Map(updates.map(u => [u.id, u]));

    setSelectedItems(prev => prev.map(item => {
      const update = updateMap.get(item.id);
      if (update) {
        return {
          ...item,
          data: { ...item.data, ...update } as typeof item.data
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
   */
  const setSelectedItem = useCallback((item: SelectedItem | null): void => {
    selectItem(item);
  }, [selectItem]);

  // ============================================================================
  // DRAG STATE (extended for group drag)
  // ============================================================================

  const [isDraggingSelection, setIsDraggingSelection] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<DragStartPosition | null>(null);
  const [isResizeMode, setIsResizeMode] = useState<boolean>(false);

  // Group drag: ref to store offsets for all selected items during multi-select drag
  const groupDragOffsetsRef = useRef<Map<string, GroupDragOffset>>(new Map());

  // Initial state ref for batch history (stores objects and textLabels before drag)
  const groupDragInitialStateRef = useRef<GroupDragInitialState | null>(null);

  // Computed: are we dragging a multi-selection?
  const isGroupDragging = isDraggingSelection && hasMultiSelection;

  // ============================================================================
  // HOVER STATE
  // ============================================================================

  const [hoveredObject, setHoveredObject] = useState<HoveredObject | null>(null);
  const [mousePosition, setMousePosition] = useState<MousePosition | null>(null);

  // ============================================================================
  // NOTE PIN MODAL STATE
  // ============================================================================

  const [showNoteLinkModal, setShowNoteLinkModal] = useState<boolean>(false);
  const [pendingNotePinId, setPendingNotePinId] = useState<string | null>(null);
  const [editingNoteObjectId, setEditingNoteObjectId] = useState<string | null>(null);

  // ============================================================================
  // COORDINATE OVERLAY STATE
  // ============================================================================

  const [showCoordinates, setShowCoordinates] = useState<boolean>(false);

  // ============================================================================
  // LAYER VISIBILITY
  // ============================================================================

  const effectiveLayerVisibility: LayerVisibility = {
    grid: true,
    objects: true,
    textLabels: true,
    hexCoordinates: true,
    ...layerVisibility
  };

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: MapSelectionContextValue = {
    // Multi-select state
    selectedItems,
    setSelectedItems,
    hasMultiSelection,
    selectionCount,

    // Selection helpers
    selectItem,
    selectMultiple,
    addToSelection,
    removeFromSelection,
    clearSelection,
    isSelected,
    updateSelectedItemsData,

    // Area select state
    areaSelectStart,
    setAreaSelectStart,

    // Backward compatibility
    selectedItem,
    setSelectedItem,

    // Drag state
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    isResizeMode,
    setIsResizeMode,

    // Group drag state
    groupDragOffsetsRef,
    groupDragInitialStateRef,
    isGroupDragging,

    // Hover state
    hoveredObject,
    setHoveredObject,
    mousePosition,
    setMousePosition,

    // Note pin modal state
    showNoteLinkModal,
    setShowNoteLinkModal,
    pendingNotePinId,
    setPendingNotePinId,
    editingNoteObjectId,
    setEditingNoteObjectId,

    // Coordinate overlay state
    showCoordinates,
    setShowCoordinates,

    // Layer visibility
    layerVisibility: effectiveLayerVisibility
  };

  return (
    <MapSelectionContext.Provider value={value}>
      {children}
    </MapSelectionContext.Provider>
  );
};

export { MapSelectionProvider, useMapSelection };