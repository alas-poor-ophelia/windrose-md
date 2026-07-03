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
import type { MapObject } from '#types/objects/object.types';
import type { ToolId } from '#types/tools/tool.types';
import type { UseObjectInteractionsResult } from '#types/hooks/objectInteractions.types';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { getNextRotation } from '../../drawing/rotationOperations';
import { useEdgeSnapModifiers } from './useEdgeSnapModifiers';
import { useObjectModifications } from './useObjectModifications';
import { useObjectUIPositions } from './useObjectUIPositions';
import { useObjectHover } from './useObjectHover';
import { useObjectPlacement } from './useObjectPlacement';
import { useObjectResize } from './useObjectResize';
import { useObjectDragSelect } from './useObjectDragSelect';
import { useMapState } from '../../context/MapContext';
import { useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { getActiveLayer } from '../../persistence/layerAccessor';


const useObjectInteractions = (
  currentTool: ToolId,
  selectedObjectType: string | null,
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
  const objectColorBtnRef = useRef(null);
  const pendingObjectCustomColorRef = useRef(null);

  // Keyboard shortcuts for selected objects
  const handleObjectKeyDown = useCallback((e: KeyboardEvent): boolean => {
    if (selectedItem?.type !== 'object') {
      return false;
    }

    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      if (!mapData) return false;
      const currentObject = getActiveLayer(mapData).objects?.find((obj: MapObject) => obj.id === selectedItem.id);
      const currentRotation = currentObject?.rotation ?? 0;
      const nextRotation = getNextRotation(currentRotation);

      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        selectedItem.id,
        { rotation: nextRotation }
      );
      onObjectsChange(updatedObjects);

      return true;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!mapData) return false;
      e.preventDefault();
      const updatedObjects = removeObject(getActiveLayer(mapData).objects, selectedItem.id);
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

  useEffect(() => {
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

export { useObjectInteractions };