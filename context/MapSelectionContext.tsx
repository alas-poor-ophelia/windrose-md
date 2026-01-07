/**
 * MapSelectionContext.tsx
 * Shared selection state for coordinating between layers
 * Allows multiple layers (ObjectLayer, TextLayer) to share selection state
 *
 * Supports both single and multi-selection:
 * - Single selection: click on object/text label
 * - Multi-selection: area select tool (two-click rectangle)
 */

// ===========================================
// Types
// ===========================================

/** Selected item types */
export type SelectableItemType = 'object' | 'text' | 'notePin';

/** A selected item */
export interface SelectedItem {
  type: SelectableItemType;
  id: string;
  data: Record<string, unknown>;
}

/** World position for area select start */
export interface AreaSelectPosition {
  worldX: number;
  worldY: number;
}

/** Drag start position */
export interface DragStartPosition {
  x: number;
  y: number;
  worldX?: number;
  worldY?: number;
}

/** Group drag offset for a single item */
export interface GroupDragOffset {
  type: SelectableItemType;
  gridOffsetX: number;
  gridOffsetY: number;
  worldOffsetX: number;
  worldOffsetY: number;
}

/** Layer visibility settings */
export interface LayerVisibility {
  objects: boolean;
  textLabels: boolean;
  hexCoordinates: boolean;
}

/** Mouse position */
export interface MousePosition {
  x: number;
  y: number;
}

/** Hovered object info */
export interface HoveredObject {
  id: string;
  type: string;
  [key: string]: unknown;
}

/** Item update for updateSelectedItemsData */
export interface ItemUpdate {
  id: string;
  [key: string]: unknown;
}

/** Initial state for batch history during group drag */
export interface GroupDragInitialState {
  objects: unknown[];
  textLabels: unknown[];
}

/** MapSelectionContext value shape */
export interface MapSelectionContextValue {
  // Multi-select state
  selectedItems: SelectedItem[];
  setSelectedItems: React.Dispatch<React.SetStateAction<SelectedItem[]>>;
  hasMultiSelection: boolean;
  selectionCount: number;

  // Selection helpers
  selectItem: (item: SelectedItem | null) => void;
  selectMultiple: (items: SelectedItem[] | null) => void;
  addToSelection: (item: SelectedItem | null) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  updateSelectedItemsData: (updates: ItemUpdate[]) => void;

  // Area select state
  areaSelectStart: AreaSelectPosition | null;
  setAreaSelectStart: React.Dispatch<React.SetStateAction<AreaSelectPosition | null>>;

  // Backward compatibility
  selectedItem: SelectedItem | null;
  setSelectedItem: (item: SelectedItem | null) => void;

  // Drag state
  isDraggingSelection: boolean;
  setIsDraggingSelection: React.Dispatch<React.SetStateAction<boolean>>;
  dragStart: DragStartPosition | null;
  setDragStart: React.Dispatch<React.SetStateAction<DragStartPosition | null>>;
  isResizeMode: boolean;
  setIsResizeMode: React.Dispatch<React.SetStateAction<boolean>>;

  // Group drag state
  groupDragOffsetsRef: React.MutableRefObject<Map<string, GroupDragOffset>>;
  groupDragInitialStateRef: React.MutableRefObject<GroupDragInitialState | null>;
  isGroupDragging: boolean;

  // Hover state
  hoveredObject: HoveredObject | null;
  setHoveredObject: React.Dispatch<React.SetStateAction<HoveredObject | null>>;
  mousePosition: MousePosition | null;
  setMousePosition: React.Dispatch<React.SetStateAction<MousePosition | null>>;

  // Note pin modal state
  showNoteLinkModal: boolean;
  setShowNoteLinkModal: React.Dispatch<React.SetStateAction<boolean>>;
  pendingNotePinId: string | null;
  setPendingNotePinId: React.Dispatch<React.SetStateAction<string | null>>;
  editingNoteObjectId: string | null;
  setEditingNoteObjectId: React.Dispatch<React.SetStateAction<string | null>>;

  // Coordinate overlay state
  showCoordinates: boolean;
  setShowCoordinates: React.Dispatch<React.SetStateAction<boolean>>;

  // Layer visibility
  layerVisibility: LayerVisibility;
}

// ===========================================
// Context
// ===========================================

const MapSelectionContext = dc.createContext<MapSelectionContextValue | null>(null);

/**
 * Hook to access shared selection state
 * @returns Selection state and setters
 * @throws If used outside MapSelectionProvider
 */
function useMapSelection(): MapSelectionContextValue {
  const context = dc.useContext(MapSelectionContext);
  if (!context) {
    throw new Error('useMapSelection must be used within MapSelectionProvider');
  }
  return context;
}

// ===========================================
// Provider Props
// ===========================================

interface MapSelectionProviderProps {
  children: React.ReactNode;
  layerVisibility?: Partial<LayerVisibility>;
}

/**
 * Provider component for shared selection state
 * Wraps children and provides selection coordination via Context
 */
const MapSelectionProvider: React.FC<MapSelectionProviderProps> = ({ children, layerVisibility }) => {
  // ============================================================================
  // SELECTION STATE (refactored for multi-select support)
  // ============================================================================

  // Primary selection state - array of selected items
  const [selectedItems, setSelectedItems] = dc.useState<SelectedItem[]>([]);

  // Area select tool state - first corner position for two-click selection
  const [areaSelectStart, setAreaSelectStart] = dc.useState<AreaSelectPosition | null>(null);

  // ============================================================================
  // SELECTION HELPERS
  // ============================================================================

  /**
   * Select a single item (clears any existing selection)
   */
  const selectItem = dc.useCallback((item: SelectedItem | null): void => {
    if (item) {
      setSelectedItems([item]);
    } else {
      setSelectedItems([]);
    }
  }, []);

  /**
   * Select multiple items (replaces existing selection)
   */
  const selectMultiple = dc.useCallback((items: SelectedItem[] | null): void => {
    setSelectedItems(items || []);
  }, []);

  /**
   * Add item to current selection
   */
  const addToSelection = dc.useCallback((item: SelectedItem | null): void => {
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
  const removeFromSelection = dc.useCallback((id: string): void => {
    setSelectedItems(prev => prev.filter(item => item.id !== id));
  }, []);

  /**
   * Clear all selection
   */
  const clearSelection = dc.useCallback((): void => {
    setSelectedItems([]);
  }, []);

  /**
   * Check if an item is selected
   */
  const isSelected = dc.useCallback((id: string): boolean => {
    return selectedItems.some(item => item.id === id);
  }, [selectedItems]);

  /**
   * Update the data for selected items (used during drag to keep selection in sync)
   */
  const updateSelectedItemsData = dc.useCallback((updates: ItemUpdate[]): void => {
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
   */
  const setSelectedItem = dc.useCallback((item: SelectedItem | null): void => {
    selectItem(item);
  }, [selectItem]);

  // ============================================================================
  // DRAG STATE (extended for group drag)
  // ============================================================================

  const [isDraggingSelection, setIsDraggingSelection] = dc.useState<boolean>(false);
  const [dragStart, setDragStart] = dc.useState<DragStartPosition | null>(null);
  const [isResizeMode, setIsResizeMode] = dc.useState<boolean>(false);

  // Group drag: ref to store offsets for all selected items during multi-select drag
  const groupDragOffsetsRef = dc.useRef<Map<string, GroupDragOffset>>(new Map());

  // Initial state ref for batch history (stores objects and textLabels before drag)
  const groupDragInitialStateRef = dc.useRef<GroupDragInitialState | null>(null);

  // Computed: are we dragging a multi-selection?
  const isGroupDragging = isDraggingSelection && hasMultiSelection;

  // ============================================================================
  // HOVER STATE
  // ============================================================================

  const [hoveredObject, setHoveredObject] = dc.useState<HoveredObject | null>(null);
  const [mousePosition, setMousePosition] = dc.useState<MousePosition | null>(null);

  // ============================================================================
  // NOTE PIN MODAL STATE
  // ============================================================================

  const [showNoteLinkModal, setShowNoteLinkModal] = dc.useState<boolean>(false);
  const [pendingNotePinId, setPendingNotePinId] = dc.useState<string | null>(null);
  const [editingNoteObjectId, setEditingNoteObjectId] = dc.useState<string | null>(null);

  // ============================================================================
  // COORDINATE OVERLAY STATE
  // ============================================================================

  const [showCoordinates, setShowCoordinates] = dc.useState<boolean>(false);

  // ============================================================================
  // LAYER VISIBILITY
  // ============================================================================

  const effectiveLayerVisibility: LayerVisibility = {
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

return { MapSelectionProvider, useMapSelection };
