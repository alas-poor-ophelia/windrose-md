/**
 * useObjectInteractions.ts
 *
 * Orchestrator hook for object interactions. Composes focused sub-hooks:
 * - useEdgeSnapModifiers: keyboard modifier tracking
 * - useObjectHover: hover state management
 * - useObjectPlacement: object placement on click
 * - useObjectResize: corner handle resizing
 * - useObjectDragSelect: selection + drag (coupled by longPressTimerRef)
 * - useObjectModifications: color, rotation, deletion, duplication
 * - useObjectUIPositions: button position calculations
 */

// Type-only imports
import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { ToolId } from '#types/tools/tool.types';
import type {
  ResizeCorner,
  ObjectDragStart,
  UseObjectInteractionsResult,
} from '#types/hooks/objectInteractions.types';
import type { MapStateContextValue, MapOperationsContextValue, MapSelectionContextValue } from '#types/contexts/context.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { getNextRotation } = await dc.require(dc.resolvePath("utils/rotationOperations.ts")) as {
  getNextRotation: (currentRotation: number) => number
};

const { useEdgeSnapModifiers } = await requireModuleByName("useEdgeSnapModifiers.ts") as {
  useEdgeSnapModifiers: () => {
    altKeyPressedRef: { current: boolean };
    shiftKeyPressedRef: { current: boolean };
    edgeSnapMode: boolean;
    setEdgeSnapMode: (v: boolean) => void;
    freeformDragPreview: boolean;
  };
};

const { useObjectModifications } = await requireModuleByName("useObjectModifications.ts") as {
  useObjectModifications: () => {
    handleObjectWheel: (e: WheelEvent) => boolean;
    handleNoteSubmit: (content: string, editingObjectId: string) => void;
    handleObjectColorSelect: (color: string) => void;
    handleObjectColorReset: (setShowObjectColorPicker: (show: boolean) => void) => void;
    handleObjectRotation: () => void;
    handleObjectDeletion: () => void;
    handleObjectDuplicate: () => void;
  };
};

const { useObjectUIPositions } = await requireModuleByName("useObjectUIPositions.ts") as {
  useObjectUIPositions: () => {
    calculateLabelButtonPosition: () => import('#types/hooks/objectInteractions.types').ButtonPosition;
    calculateLinkNoteButtonPosition: () => import('#types/hooks/objectInteractions.types').ButtonPosition;
    calculateResizeButtonPosition: () => import('#types/hooks/objectInteractions.types').ButtonPosition;
    calculateObjectColorButtonPosition: () => import('#types/hooks/objectInteractions.types').ButtonPosition;
  };
};

const { useObjectHover } = await requireModuleByName("useObjectHover.ts") as {
  useObjectHover: () => { handleHoverUpdate: (e: PointerEvent | MouseEvent) => void };
};

const { useObjectPlacement } = await requireModuleByName("useObjectPlacement.ts") as {
  useObjectPlacement: (
    currentTool: ToolId,
    selectedObjectType: string | null,
    altKeyPressedRef: { current: boolean },
    shiftKeyPressedRef: { current: boolean },
    edgeSnapMode: boolean,
    freeformPlacementModeRef?: { current: boolean }
  ) => { handleObjectPlacement: (gridX: number, gridY: number, clientX: number, clientY: number) => boolean };
};

const { useObjectResize } = await requireModuleByName("useObjectResize.ts") as {
  useObjectResize: () => {
    isResizing: boolean;
    resizeCorner: ResizeCorner;
    getClickedCorner: (clientX: number, clientY: number, object: MapObject) => ResizeCorner;
    handleObjectResizing: (e: PointerEvent | MouseEvent | TouchEvent) => boolean;
    stopObjectResizing: () => boolean;
    beginResize: (corner: ResizeCorner, objects: MapObject[], dragStart: ObjectDragStart) => void;
  };
};

const { useObjectDragSelect } = await requireModuleByName("useObjectDragSelect.ts") as {
  useObjectDragSelect: (
    currentTool: ToolId,
    selectedObjectType: string | null,
    altKeyPressedRef: { current: boolean },
    shiftKeyPressedRef: { current: boolean },
    edgeSnapMode: boolean,
    setEdgeSnapMode: (v: boolean) => void,
    beginResize: (corner: ResizeCorner, objects: MapObject[], dragStart: ObjectDragStart) => void,
    getClickedCorner: (clientX: number, clientY: number, object: MapObject) => ResizeCorner
  ) => {
    handleObjectSelection: (clientX: number, clientY: number, gridX: number, gridY: number) => boolean;
    handleObjectDragging: (e: PointerEvent | MouseEvent | TouchEvent) => boolean;
    stopObjectDragging: () => boolean;
  };
};

const { useMapState } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateContextValue;
};

const { useMapOperations } = await requireModuleByName("MapContext.tsx") as {
  useMapOperations: () => MapOperationsContextValue;
};

const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx") as {
  useMapSelection: () => MapSelectionContextValue;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

const useObjectInteractions = (
  currentTool: ToolId,
  selectedObjectType: string | null,
  onAddCustomColor: ((color: string) => void) | undefined,
  customColors: string[],
  freeformPlacementModeRef?: { current: boolean }
): UseObjectInteractionsResult => {
  const { mapData } = useMapState();
  const { updateObject, removeObject, onObjectsChange } = useMapOperations();
  const { selectedItem, setSelectedItem, hoveredObject, setHoveredObject, mousePosition, isResizeMode, setIsResizeMode } = useMapSelection();

  // Sub-hooks
  const {
    altKeyPressedRef, shiftKeyPressedRef, edgeSnapMode, setEdgeSnapMode, freeformDragPreview
  } = useEdgeSnapModifiers();

  const {
    handleObjectWheel, handleNoteSubmit, handleObjectColorSelect, handleObjectColorReset,
    handleObjectRotation, handleObjectDeletion, handleObjectDuplicate
  } = useObjectModifications();

  const {
    calculateLabelButtonPosition, calculateLinkNoteButtonPosition,
    calculateResizeButtonPosition, calculateObjectColorButtonPosition
  } = useObjectUIPositions();

  const { handleHoverUpdate } = useObjectHover();

  const { handleObjectPlacement } = useObjectPlacement(
    currentTool, selectedObjectType,
    altKeyPressedRef, shiftKeyPressedRef, edgeSnapMode, freeformPlacementModeRef
  );

  const {
    isResizing, resizeCorner, getClickedCorner, handleObjectResizing, stopObjectResizing, beginResize
  } = useObjectResize();

  const { handleObjectSelection, handleObjectDragging, stopObjectDragging } = useObjectDragSelect(
    currentTool, selectedObjectType,
    altKeyPressedRef, shiftKeyPressedRef, edgeSnapMode, setEdgeSnapMode,
    beginResize, getClickedCorner
  );

  // Pass-through refs for ObjectLayer
  const objectColorBtnRef = dc.useRef(null);
  const pendingObjectCustomColorRef = dc.useRef(null);

  // Keyboard shortcuts for selected objects
  const handleObjectKeyDown = dc.useCallback((e: KeyboardEvent): boolean => {
    if (selectedItem?.type !== 'object') {
      return false;
    }

    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      const currentObject = getActiveLayer(mapData!).objects?.find((obj: MapObject) => obj.id === selectedItem.id);
      const currentRotation = currentObject?.rotation || 0;
      const nextRotation = getNextRotation(currentRotation);

      const updatedObjects = updateObject(
        getActiveLayer(mapData!).objects,
        selectedItem.id,
        { rotation: nextRotation }
      );
      onObjectsChange(updatedObjects);

      return true;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const updatedObjects = removeObject(getActiveLayer(mapData!).objects, selectedItem.id);
      onObjectsChange(updatedObjects);
      setSelectedItem(null);
      setIsResizeMode(false);
      return true;
    }

    if (e.key === 'Escape' && isResizeMode) {
      e.preventDefault();
      setIsResizeMode(false);
      return true;
    }

    return false;
  }, [selectedItem, isResizeMode, mapData, removeObject, updateObject, onObjectsChange, setSelectedItem, setIsResizeMode]
  );

  dc.useEffect(() => {
    if (currentTool !== 'select') {
      setIsResizeMode(false);
    }
  }, [currentTool, setIsResizeMode]);

  return {
    isResizeMode,
    setIsResizeMode,
    isResizing,
    resizeCorner,
    hoveredObject,
    setHoveredObject,
    mousePosition,
    objectColorBtnRef,
    pendingObjectCustomColorRef,
    edgeSnapMode,
    setEdgeSnapMode,
    freeformDragPreview,

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

    calculateLabelButtonPosition,
    calculateLinkNoteButtonPosition,
    calculateResizeButtonPosition,
    calculateObjectColorButtonPosition,

    handleNoteSubmit,
    handleObjectColorSelect,
    handleObjectColorReset,

    getClickedCorner
  };
};

return { useObjectInteractions };
