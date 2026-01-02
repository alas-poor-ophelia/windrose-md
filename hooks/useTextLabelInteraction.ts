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
import type { MapData, MapLayer, TextLabelSettings } from '#types/core/map.types';
import type { HexColor } from '#types/core/common.types';
import type {
  UseTextLabelInteractionResult,
  PendingTextPosition,
  TextButtonPosition,
  TextDragStart,
  TextLabelModalData,
} from '#types/hooks/textLabelInteraction.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { applyInverseRotation } = await requireModuleByName("screenPositionUtils.js") as {
  applyInverseRotation: (x: number, y: number, angle: number, centerX: number, centerY: number) => { x: number; y: number };
};

// Inline context types for not-yet-migrated contexts
interface SelectedItem {
  type: 'object' | 'text';
  id: string;
  data: TextLabel | Record<string, unknown>;
}

interface WorldCoords {
  worldX: number;
  worldY: number;
}

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx") as {
  useMapState: () => {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    mapData: MapData | null;
    screenToWorld: (clientX: number, clientY: number) => WorldCoords | null;
    getClientCoords: (e: Event) => { clientX: number; clientY: number };
  };
  useMapOperations: () => {
    onTextLabelsChange: (labels: TextLabel[], suppressHistory?: boolean) => void;
    onMapDataUpdate: (updates: { lastTextLabelSettings?: TextLabelSettings }) => void;
    getTextLabelAtPosition: (labels: TextLabel[], x: number, y: number, ctx: CanvasRenderingContext2D) => TextLabel | null;
    addTextLabel: (labels: TextLabel[], content: string, x: number, y: number, options: Partial<TextLabel>) => TextLabel[];
    updateTextLabel: (labels: TextLabel[], id: TextLabelId, updates: Partial<TextLabel>) => TextLabel[];
    removeTextLabel: (labels: TextLabel[], id: TextLabelId) => TextLabel[];
  };
};

const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx") as {
  useMapSelection: () => {
    selectedItem: SelectedItem | null;
    setSelectedItem: (item: SelectedItem | null) => void;
    isDraggingSelection: boolean;
    setIsDraggingSelection: (dragging: boolean) => void;
    dragStart: TextDragStart | null;
    setDragStart: (start: TextDragStart | null) => void;
  };
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

/**
 * Hook for managing text label interactions
 */
const useTextLabelInteraction = (
  currentTool: ToolId,
  onAddCustomColor: ((color: HexColor) => void) | undefined,
  customColors: HexColor[]
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
  const [showTextModal, setShowTextModal] = dc.useState<boolean>(false);
  const [pendingTextPosition, setPendingTextPosition] = dc.useState<PendingTextPosition | null>(null);
  const [editingTextId, setEditingTextId] = dc.useState<TextLabelId | null>(null);
  const dragInitialStateRef = dc.useRef<TextLabel[] | null>(null);

  /**
   * Handle text label placement - opens modal to create new label
   */
  const handleTextPlacement = dc.useCallback((clientX: number, clientY: number): boolean => {
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
  const handleTextSelection = dc.useCallback((clientX: number, clientY: number): boolean => {
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
      dragInitialStateRef.current = [...(getActiveLayer(mapData).textLabels || [])];
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
  const handleTextDragging = dc.useCallback((e: PointerEvent | MouseEvent | TouchEvent): boolean => {
    if (!isDraggingSelection || selectedItem?.type !== 'text' || !dragStart || !mapData) {
      return false;
    }

    e.preventDefault();
    e.stopPropagation();

    const { clientX, clientY } = getClientCoords(e as Event);
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return false;

    // Calculate delta from drag start
    const deltaWorldX = worldCoords.worldX - dragStart.worldX;
    const deltaWorldY = worldCoords.worldY - dragStart.worldY;

    const selectedData = selectedItem.data as TextLabel;

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
   * Handle text label rotation
   */
  const handleTextRotation = dc.useCallback((): void => {
    if (!selectedItem || selectedItem.type !== 'text' || !mapData) {
      return;
    }

    const selectedData = selectedItem.data as TextLabel;

    // Cycle through 0° -> 90° -> 180° -> 270° -> 0°
    const rotations = [0, 90, 180, 270];
    const currentRotation = selectedData.rotation || 0;
    const currentIndex = rotations.indexOf(currentRotation);
    const nextRotation = rotations[(currentIndex + 1) % 4];

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
    if (!labelData || !labelData.content || !labelData.content.trim()) {
      return;
    }

    if (editingTextId) {
      // Update existing label
      const newLabels = updateTextLabel(
        getActiveLayer(mapData!).textLabels || [],
        editingTextId,
        {
          content: labelData.content.trim(),
          fontSize: labelData.fontSize,
          fontFace: labelData.fontFace,
          color: labelData.color
        }
      );
      onTextLabelsChange(newLabels);
    } else if (pendingTextPosition && mapData) {
      // Create new label
      const newLabels = addTextLabel(
        getActiveLayer(mapData).textLabels || [],
        labelData.content.trim(),
        pendingTextPosition.x,
        pendingTextPosition.y,
        {
          fontSize: labelData.fontSize,
          fontFace: labelData.fontFace,
          color: labelData.color
        }
      );
      onTextLabelsChange(newLabels);

      // Save text label settings for future new labels (per-map)
      if (onMapDataUpdate) {
        onMapDataUpdate({
          lastTextLabelSettings: {
            fontSize: labelData.fontSize,
            fontFace: labelData.fontFace,
            color: labelData.color
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
  const handleRotateClick = (e: MouseEvent): void => {
    if (selectedItem?.type === 'text') {
      e.preventDefault();
      e.stopPropagation();
      handleTextRotation();
    }
  };

  /**
   * Handle edit button click
   */
  const handleEditClick = (e: MouseEvent): void => {
    if (selectedItem?.type === 'text') {
      e.preventDefault();
      e.stopPropagation();

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
   * Calculate rotate button position
   */
  const calculateRotateButtonPosition = (): TextButtonPosition => {
    if (selectedItem?.type !== 'text' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const label = getActiveLayer(mapData).textLabels.find(l => l.id === selectedItem.id);
    if (!label) return { x: 0, y: 0 };

    const canvas = canvasRef.current;
    const { gridSize, viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    const scaledGridSize = gridSize * zoom;

    // Calculate offsets accounting for map rotation
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const offsetX = centerX - center.x * scaledGridSize;
    const offsetY = centerY - center.y * scaledGridSize;

    // Get label position in world space, then convert to screen space
    let screenX = offsetX + label.position.x * zoom;
    let screenY = offsetY + label.position.y * zoom;

    // Apply canvas rotation if present
    if (northDirection !== 0) {
      // Translate to canvas center
      const relX = screenX - centerX;
      const relY = screenY - centerY;

      // Apply rotation
      const angleRad = (northDirection * Math.PI) / 180;
      const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
      const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);

      // Translate back
      screenX = centerX + rotatedX;
      screenY = centerY + rotatedY;
    }

    // Measure text to get bounding box (same as selection box calculation)
    const ctx = canvas.getContext('2d');
    if (!ctx) return { x: 0, y: 0 };

    const fontSize = label.fontSize * zoom;
    ctx.font = `${fontSize}px sans-serif`;
    const metrics = ctx.measureText(label.content);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.2; // Same as selection box

    // Calculate rotated bounding box for the label itself
    const labelAngle = ((label.rotation || 0) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(labelAngle));
    const sin = Math.abs(Math.sin(labelAngle));
    const rotatedWidth = textWidth * cos + textHeight * sin;
    const rotatedHeight = textWidth * sin + textHeight * cos;

    // Position button at top-right corner of selection box
    // Selection box has 4px padding on sides and 2px on top/bottom
    const selectionPaddingX = 4;
    const selectionPaddingY = 2;
    const buttonOffset = 4; // Small gap between selection box and button
    const buttonHeight = 32;

    // Return canvas-relative coordinates for absolute positioning
    const buttonX = screenX + (rotatedWidth / 2) + selectionPaddingX + buttonOffset;
    const buttonY = screenY - (rotatedHeight / 2) - selectionPaddingY - buttonOffset - buttonHeight;

    const rect = canvas.getBoundingClientRect();
    const containerRect = canvas.parentElement?.getBoundingClientRect();
    if (!containerRect) return { x: 0, y: 0 };

    // Calculate canvas offset within container (due to flex centering)
    const canvasOffsetX = rect.left - containerRect.left;
    const canvasOffsetY = rect.top - containerRect.top;

    // Scale from canvas internal coordinates to displayed coordinates
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    return { x: (buttonX * scaleX) + canvasOffsetX, y: (buttonY * scaleY) + canvasOffsetY };
  };

  /**
   * Calculate edit button position (to the left of rotate button)
   */
  const calculateEditButtonPosition = (): TextButtonPosition => {
    const rotatePos = calculateRotateButtonPosition();
    // Position edit button 40px to the left of rotate button (32px button + 8px gap)
    return { x: rotatePos.x - 40, y: rotatePos.y };
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
    handleCanvasDoubleClick,

    // Position calculators
    calculateRotateButtonPosition,
    calculateEditButtonPosition
  };
};

return { useTextLabelInteraction };
