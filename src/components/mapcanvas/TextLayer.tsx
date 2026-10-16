/**
 * TextLayer.tsx
 *
 * Handles all text label interactions:
 * - Text label placement
 * - Text label selection and dragging
 * - Text label rotation and editing
 * - Text label UI controls (rotate button, edit button)
 * - Text label modal
 */

import type { ToolId } from '#types/tools/tool.types';
import type { TextLabel } from '#types/objects/note.types';
import type { VNode } from 'preact';
import type { HexColor } from '#types/core/common.types';
import type { CustomColor } from '#types/core/common.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useTextLabelInteraction } from '../../hooks/interactions/useTextLabelInteraction';
import { useMapState } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { useApp } from '../../context/AppContext';
import { openNativeTextLabelEditor } from '../modals/TextLabelEditor';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { SelectionActionsOverlay } from '../toolbars/SelectionActionsOverlay';
import { buildTextActions } from '../toolbars/selectionActionBuilders';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { copyDeepLinkToClipboard } from '../../persistence/deepLinkHandler';
import { depthModeOf, effectiveVisibleLevels, withLevelMembership } from '../../geometry/renderers/elementBands';
import { LevelPickerPopup, levelPickerAnchor } from '../overlays/LevelPickerPopup';
import { isLadderView } from '../../core/lodFlags';















/** Props for TextLayer component */
export interface TextLayerProps {
  /** Current active tool */
  currentTool: ToolId;
  /** Custom colors array */
  customColors?: CustomColor[];
  /** Callback to add custom color */
  onAddCustomColor?: (color: HexColor) => void;
  /** Callback to delete custom color */
  onDeleteCustomColor?: (colorId: string) => void;
}

const TextLayer = ({
  currentTool,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor
}: TextLayerProps): VNode | null => {
  const app = useApp();
  const { mapData, mapId, notePath, canvasRef, containerRef, geometry, subHexPath, ladder, getActiveLevel } = useMapState();
  const { selectedItem, showCoordinates, layerVisibility, isDraggingSelection } = useMapSelection();

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
    handleDepthModeToggle,
    handleVisibleLevelsChange,
    handleEditClick,
    handleCanvasDoubleClick,
    handleTextDeletion
  } = useTextLabelInteraction(currentTool, onAddCustomColor, customColors?.map(c => c.color) ?? []);

  // Latest-ref: the editor opens when the show flag / edited id change,
  // reading the current map, colors and handlers at that moment.
  const textModalInputsRef = useRef({ app, mapData, customColors, onAddCustomColor, onDeleteCustomColor, handleTextSubmit, handleTextCancel });
  textModalInputsRef.current = { app, mapData, customColors, onAddCustomColor, onDeleteCustomColor, handleTextSubmit, handleTextCancel };

  useEffect(() => {
    const { app, mapData, customColors, onAddCustomColor, onDeleteCustomColor, handleTextSubmit, handleTextCancel } = textModalInputsRef.current;
    if (!showTextModal || !mapData) return;

    let currentLabel = null;
    if (editingTextId != null && editingTextId !== '') {
      currentLabel = getActiveLayer(mapData).textLabels?.find((l: TextLabel) => l.id === editingTextId) ?? null;
    }

    const savedSettings = mapData?.lastTextLabelSettings as { fontSize?: number; fontFace?: string; color?: HexColor; opacity?: number } | undefined;
    const defaultFontSize = currentLabel?.fontSize ?? savedSettings?.fontSize ?? 16;
    const defaultFontFace = currentLabel?.fontFace ?? savedSettings?.fontFace ?? 'sans';
    const defaultColor = currentLabel?.color ?? savedSettings?.color ?? '#ffffff';
    const defaultOpacity = currentLabel?.opacity ?? savedSettings?.opacity ?? 1;

    openNativeTextLabelEditor(app, {
      initialValue: currentLabel?.content ?? '',
      initialFontSize: defaultFontSize,
      initialFontFace: defaultFontFace,
      initialColor: defaultColor,
      initialOpacity: defaultOpacity,
      isEditing: editingTextId != null && editingTextId !== '',
      customColors: customColors ?? [],
      onAddCustomColor,
      onDeleteCustomColor,
      onSubmit: handleTextSubmit,
      onCancel: handleTextCancel
    });
  }, [showTextModal, editingTextId]);

  const handleCopyLink = useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'text' || !mapData || mapId == null || mapId === '' || notePath == null || notePath === '') return;

    const activeLayer = getActiveLayer(mapData);
    const label = activeLayer.textLabels?.find((l: TextLabel) => l.id === selectedItem.id);
    if (!label) return;

    const zoom = mapData.viewState?.zoom ?? 1.0;
    const layerId = mapData.activeLayerId ?? activeLayer?.id ?? 'layer_001';
    const displayText = label.content ?? 'Text';

    // Text labels use world coordinates, convert to grid
    const gridSize = mapData.gridSize ?? 32;
    const x = label.position.x / gridSize;
    const y = label.position.y / gridSize;

    copyDeepLinkToClipboard(displayText, notePath, mapId, x, y, zoom, layerId, subHexPath, ladder !== null && getActiveLevel() >= 1 ? getActiveLevel() : undefined);
  }, [selectedItem, mapData, mapId, notePath, subHexPath, ladder, getActiveLevel]);

  useLayerHandlers('text', {
    handleTextPlacement, handleTextSelection,
    handleTextDragging, stopTextDragging,
    handleCanvasDoubleClick, handleTextKeyDown
  });

  // Ladder level picker (kgc.31), tied to the label it was opened for.
  const [levelPicker, setLevelPicker] = useState<{ x: number; y: number; id: string } | null>(null);
  const closeLevelPicker = useCallback(() => setLevelPicker(null), []);
  const maxLevel = ladder?.params.maxLevel ?? 0;
  const pickedLabel: TextLabel | undefined = selectedItem?.type === 'text' && mapData
    ? getActiveLayer(mapData).textLabels?.find((l: TextLabel) => l.id === selectedItem.id)
    : undefined;
  const openLevelPicker = (e?: Event): void => {
    if (selectedItem?.type !== 'text') return;
    e?.preventDefault();
    e?.stopPropagation();
    setLevelPicker({ ...levelPickerAnchor(e, containerRef.current), id: selectedItem.id });
  };
  const handleLevelToggle = (level: number): void => {
    if (!pickedLabel) return;
    const on = !effectiveVisibleLevels(pickedLabel, maxLevel, 'label').includes(level);
    handleVisibleLevelsChange(withLevelMembership(pickedLabel, level, on, maxLevel, 'label'));
  };

  if (showCoordinates || !layerVisibility.textLabels) {
    return null;
  }

  return (
    <>
      {selectedItem?.type === 'text' && !isDraggingSelection && mapData && geometry && (
        <SelectionActionsOverlay
          selectedItems={[selectedItem]}
          actions={buildTextActions({
            onEdit: handleEditClick,
            onRotate: handleRotateClick,
            onCopyLink: handleCopyLink,
            onDelete: handleTextDeletion,
            onDepthModeToggle: handleDepthModeToggle,
            onLevels: openLevelPicker
          }, { isLadder: isLadderView(mapData), depthMode: depthModeOf(selectedItem.data ?? {}), hasExplicitLevels: pickedLabel?.visibleLevels !== undefined })}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          geometry={geometry}
          selectionType="text"
        />
      )}

      {levelPicker !== null && pickedLabel !== undefined && levelPicker.id === pickedLabel.id && !isDraggingSelection && ladder !== null && (
        <LevelPickerPopup
          x={levelPicker.x}
          y={levelPicker.y}
          maxLevel={maxLevel}
          autoState={pickedLabel.visibleLevels === undefined ? 'on' : 'off'}
          levelState={(level) => (effectiveVisibleLevels(pickedLabel, maxLevel, 'label').includes(level) ? 'on' : 'off')}
          onToggleLevel={handleLevelToggle}
          onAuto={() => handleVisibleLevelsChange(undefined)}
          onClose={closeLevelPicker}
        />
      )}

    </>
  );
};

export { TextLayer };