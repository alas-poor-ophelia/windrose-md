/**
 * useTextLabelInteraction.ts
 *
 * Custom hook for managing text label interactions:
 * - Placement of new text labels
 * - Selection and deselection
 * - Dragging to reposition
 * - Rotation (R key and button)
 * - Deletion (Delete/Backspace)
 * - Editing (double-click and edit button)
 * - Modal state management
 * - Button position calculations
 */

// Type-only imports
import type { ToolId } from '#types/tools/tool.types';
import type { TextLabel, TextLabelId } from '#types/objects/note.types';
import type { HexColor } from '#types/core/common.types';
import type {
  UseTextLabelInteractionResult,
  PendingTextPosition,
  TextLabelModalData
} from '#types/hooks/textLabelInteraction.types';

import { useCallback, useRef, useState } from 'preact/hooks';
import { getNextRotation } from '../../drawing/rotationOperations';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { getActiveLayer } from '../../persistence/layerAccessor';


// Inline context types for not-yet-migrated contexts


/**
 * Hook for managing text label interactions
 */
const useTextLabelInteraction = (
  currentTool: ToolId,
  _onAddCustomColor: ((color: HexColor) => void) | undefined,
  _customColors: HexColor[]
): UseTextLabelInteractionResult => {
  // Get all required state and operations from Context
  const {
    canvasRef,
    mapData,
    screenToWorld,
    getClientCoords
  } = useMapState();

  const {
    onTextLabelsChange,
    onMapDataUpdate,
    getTextLabelAtPosition,
    addTextLabel,
    updateTextLabel,
    removeTextLabel
  } = useMapOperations();

  const {
    selectedItem,
    setSelectedItem,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart
  } = useMapSelection();

  // Text label modal state
  const [showTextModal, setShowTextModal] = useState<boolean>(false);
  const [pendingTextPosition, setPendingTextPosition] = useState<PendingTextPosition | null>(null);
  const [editingTextId, setEditingTextId] = useState<TextLabelId | null>(null);
  const dragInitialStateRef = useRef<TextLabel[] | null>(null);

  /**
   * Handle text label placement - opens modal to create new label
   */
  const handleTextPlacement = useCallback((clientX: number, clientY: number): boolean => {
    if (currentTool !== 'addText' || !canvasRef.current || !mapData) {
      return false;
    }

    // Use screenToWorld helper which handles both grid and hex geometries
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return false;

    setPendingTextPosition({ x: worldCoords.worldX, y: worldCoords.worldY });
    setShowTextModal(true);
    return true;
  }, [currentTool, canvasRef, mapData, screenToWorld]);

  /**
   * Handle text label selection
   */
  const handleTextSelection = useCallback((clientX: number, clientY: number): boolean => {
    if (currentTool !== 'select' || !mapData?.textLabels || !canvasRef.current) {
      return false;
    }

    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return false;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const textLabel = getTextLabelAtPosition(
      getActiveLayer(mapData).textLabels,
      worldCoords.worldX,
      worldCoords.worldY,
      ctx
    );

    if (textLabel) {
      // Store initial text label state for batched history entry at drag end
      dragInitialStateRef.current = [...getActiveLayer(mapData).textLabels];
      setSelectedItem({ type: 'text', id: textLabel.id, data: textLabel });
      setIsDraggingSelection(true);
      setDragStart({ x: clientX, y: clientY, worldX: worldCoords.worldX, worldY: worldCoords.worldY });
      return true;
    }

    return false;
  }, [currentTool, mapData, canvasRef, screenToWorld, getTextLabelAtPosition, setSelectedItem, setIsDraggingSelection, setDragStart]);

  /**
   * Handle text label dragging
   */
  const handleTextDragging = useCallback((e: PointerEvent | MouseEvent | TouchEvent): boolean => {
    if (!isDraggingSelection || selectedItem?.type !== 'text' || !selectedItem.data || !dragStart || !mapData) {
      return false;
    }

    e.preventDefault();
    e.stopPropagation();

    const { clientX, clientY } = getClientCoords(e);
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return false;

    // Calculate delta from drag start
    const deltaWorldX = worldCoords.worldX - (dragStart.worldX ?? 0);
    const deltaWorldY = worldCoords.worldY - (dragStart.worldY ?? 0);

    const selectedData = selectedItem.data;

    // Update text label position (suppress history during drag)
    const updatedLabels = updateTextLabel(
      getActiveLayer(mapData).textLabels,
      selectedItem.id,
      {
        position: {
          x: selectedData.position.x + deltaWorldX,
          y: selectedData.position.y + deltaWorldY
        }
      }
    );
    onTextLabelsChange(updatedLabels, true); // Suppress history

    // Update drag start and selected item data for next frame
    setDragStart({ x: clientX, y: clientY, worldX: worldCoords.worldX, worldY: worldCoords.worldY });
    setSelectedItem({
      ...selectedItem,
      data: {
        ...selectedData,
        position: {
          x: selectedData.position.x + deltaWorldX,
          y: selectedData.position.y + deltaWorldY
        }
      }
    });

    return true;
  }, [isDraggingSelection, selectedItem, dragStart, mapData, getClientCoords, screenToWorld, updateTextLabel, onTextLabelsChange, setDragStart, setSelectedItem]);

  /**
   * Handle text label rotation (45° increments)
   */
  const handleTextRotation = useCallback((): void => {
    if (!selectedItem || selectedItem.type !== 'text' || !selectedItem.data || !mapData) {
      return;
    }

    const selectedData = selectedItem.data;
    const currentRotation = selectedData.rotation ?? 0;
    const nextRotation = getNextRotation(currentRotation);

    const updatedLabels = updateTextLabel(
      getActiveLayer(mapData).textLabels,
      selectedItem.id,
      { rotation: nextRotation }
    );
    onTextLabelsChange(updatedLabels);

    // Update selected item data
    setSelectedItem({
      ...selectedItem,
      data: {
        ...selectedData,
        rotation: nextRotation
      }
    });
  }, [selectedItem, mapData, updateTextLabel, onTextLabelsChange, setSelectedItem]);

  /**
   * Handle text label deletion
   */
  const handleTextDeletion = (): void => {
    if (!selectedItem || selectedItem.type !== 'text' || !mapData) {
      return;
    }

    const updatedLabels = removeTextLabel(
      getActiveLayer(mapData).textLabels,
      selectedItem.id
    );
    onTextLabelsChange(updatedLabels);
    setSelectedItem(null);
  };

  /**
   * Handle keyboard shortcuts for text labels
   */
  const handleTextKeyDown = (e: KeyboardEvent): boolean => {
    if (!selectedItem || selectedItem.type !== 'text') {
      return false;
    }

    // Rotation with R key
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      handleTextRotation();
      return true;
    }

    // Deletion with Delete or Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      handleTextDeletion();
      return true;
    }

    return false;
  };

  /**
   * Handle text label modal submission
   */
  const handleTextSubmit = (labelData: TextLabelModalData): void => {
    if (labelData == null || labelData.content == null || labelData.content.trim() === '') {
      return;
    }

    if (editingTextId != null && editingTextId !== '') {
      if (mapData == null) return;
      // Update existing label
      const newLabels = updateTextLabel(
        getActiveLayer(mapData).textLabels,
        editingTextId,
        {
          content: labelData.content.trim(),
          fontSize: labelData.fontSize,
          fontFace: labelData.fontFace,
          color: labelData.color,
          ...(labelData.opacity !== undefined ? { opacity: labelData.opacity } : {})
        }
      );
      onTextLabelsChange(newLabels);
    } else if (pendingTextPosition && mapData) {
      // Create new label
      const newLabels = addTextLabel(
        getActiveLayer(mapData).textLabels,
        labelData.content.trim(),
        pendingTextPosition.x,
        pendingTextPosition.y,
        {
          fontSize: labelData.fontSize,
          fontFace: labelData.fontFace,
          color: labelData.color,
          ...(labelData.opacity !== undefined ? { opacity: labelData.opacity } : {})
        }
      );
      onTextLabelsChange(newLabels);

      // Save text label settings for future new labels (per-map)
      if (onMapDataUpdate) {
        onMapDataUpdate({
          lastTextLabelSettings: {
            fontSize: labelData.fontSize,
            fontFace: labelData.fontFace,
            color: labelData.color,
            ...(labelData.opacity !== undefined ? { opacity: labelData.opacity } : {})
          }
        });
      }
    }

    setShowTextModal(false);
    setPendingTextPosition(null);
    setEditingTextId(null);
  };

  /**
   * Handle text label modal cancellation
   */
  const handleTextCancel = (): void => {
    setShowTextModal(false);
    setPendingTextPosition(null);
    setEditingTextId(null);
  };

  /**
   * Handle rotate button click
   */
  const handleRotateClick = (e?: Event): void => {
    if (selectedItem?.type === 'text') {
      e?.preventDefault();
      e?.stopPropagation();
      handleTextRotation();
    }
  };

  /**
   * Handle edit button click
   */
  const handleEditClick = (e?: Event): void => {
    if (selectedItem?.type === 'text') {
      e?.preventDefault();
      e?.stopPropagation();

      // Open editor with current label data
      setEditingTextId(selectedItem.id);
      setShowTextModal(true);
    }
  };

  /**
   * Handle double-click to edit selected text label
   */
  const handleCanvasDoubleClick = (e: MouseEvent): void => {
    // Only handle double-click for text labels in select mode
    if (currentTool !== 'select' || !selectedItem || selectedItem.type !== 'text') {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Open editor with current label data
    setEditingTextId(selectedItem.id);
    setShowTextModal(true);
  };

  /**
   * Stop text label dragging and finalize history
   */
  const stopTextDragging = (): boolean => {
    if (isDraggingSelection && selectedItem?.type === 'text') {
      setIsDraggingSelection(false);
      setDragStart(null);

      // Add single history entry for the completed drag
      if (dragInitialStateRef.current !== null && mapData) {
        onTextLabelsChange(getActiveLayer(mapData).textLabels, false);
        dragInitialStateRef.current = null;
      }
      return true;
    }
    return false;
  };

  return {
    // State
    showTextModal,
    editingTextId,

    // Handlers
    handleTextPlacement,
    handleTextSelection,
    handleTextDragging,
    stopTextDragging,
    handleTextRotation,
    handleTextDeletion,
    handleTextKeyDown,
    handleTextSubmit,
    handleTextCancel,
    handleRotateClick,
    handleEditClick,
    handleCanvasDoubleClick
  };
};

export { useTextLabelInteraction };