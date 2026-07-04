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

import { useCallback, useEffect } from 'preact/hooks';
import { useTextLabelInteraction } from '../../hooks/interactions/useTextLabelInteraction';
import { useMapState } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { useApp } from '../../context/AppContext';
import { openNativeTextLabelEditor } from '../modals/TextLabelEditor';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { SelectionActionsOverlay } from '../toolbars/SelectionActionsOverlay';
import { buildTextActions } from '../../hooks/interactions/useSelectionActions';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { copyDeepLinkToClipboard } from '../../persistence/deepLinkHandler';















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
  const { mapData, mapId, notePath, canvasRef, containerRef, geometry } = useMapState();
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
    handleEditClick,
    handleCanvasDoubleClick,
    handleTextDeletion
  } = useTextLabelInteraction(currentTool, onAddCustomColor, customColors?.map(c => c.color) ?? []);

  useEffect(() => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- modal opens once on showTextModal/editingTextId; submit/cancel inline + mapData/customColors volatile would reopen mid-edit
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

    copyDeepLinkToClipboard(displayText, notePath, mapId, x, y, zoom, layerId);
  }, [selectedItem, mapData, mapId, notePath]);

  useLayerHandlers('text', {
    handleTextPlacement, handleTextSelection,
    handleTextDragging, stopTextDragging,
    handleCanvasDoubleClick, handleEditClick, handleTextKeyDown
  });

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
            onDelete: handleTextDeletion
          })}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          geometry={geometry}
          selectionType="text"
        />
      )}

    </>
  );
};

export { TextLayer };