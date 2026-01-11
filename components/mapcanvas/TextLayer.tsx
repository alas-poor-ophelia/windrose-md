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
import type { HexColor } from '#types/core/common.types';
import type { CustomColor } from '../ColorPicker.tsx';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useTextLabelInteraction } = await requireModuleByName("useTextLabelInteraction.ts");
const { useMapState, useMapOperations } = await requireModuleByName("MapContext.tsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx");
const { TextLabelEditor } = await requireModuleByName("TextLabelEditor.jsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");
const { SelectionToolbar } = await requireModuleByName("SelectionToolbar.jsx");
const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");
const { generateDeepLinkMarkdown } = await requireModuleByName("deepLinkHandler.ts");

/** Text label data structure */
interface TextLabel {
  id: string;
  content: string;
  fontSize?: number;
  fontFace?: string;
  color?: HexColor;
  rotation?: number;
  position: { x: number; y: number };
}

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
}: TextLayerProps): React.ReactElement | null => {
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
    handleTextRotation,
    handleTextDeletion
  } = useTextLabelInteraction(currentTool, onAddCustomColor, customColors);

  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const handleCopyLink = dc.useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'text' || !mapData || !mapId || !notePath) return;

    const activeLayer = getActiveLayer(mapData);
    const label = activeLayer.textLabels?.find((l: TextLabel) => l.id === selectedItem.id);
    if (!label) return;

    const zoom = mapData.viewState?.zoom ?? 1.0;
    const layerId = mapData.activeLayerId || activeLayer?.id || 'layer_001';
    const displayText = label.content || 'Text';

    // Text labels use world coordinates, convert to grid
    const gridSize = mapData.gridSize || 32;
    const x = label.position.x / gridSize;
    const y = label.position.y / gridSize;

    const markdown = generateDeepLinkMarkdown(displayText, notePath, mapId, x, y, zoom, layerId);

    navigator.clipboard.writeText(markdown).then(() => {
      new Notice('Deep link copied to clipboard');
    }).catch((err: Error) => {
      console.error('Failed to copy link:', err);
      new Notice('Failed to copy link');
    });
  }, [selectedItem, mapData, mapId, notePath]);

  dc.useEffect(() => {
    registerHandlers('text', {
      handleTextPlacement,
      handleTextSelection,
      handleTextDragging,
      stopTextDragging,
      handleCanvasDoubleClick,
      handleEditClick,
      handleTextKeyDown
    });

    return () => unregisterHandlers('text');
  }, [
    registerHandlers, unregisterHandlers,
    handleTextPlacement, handleTextSelection,
    handleTextDragging, stopTextDragging,
    handleCanvasDoubleClick, handleEditClick,
    handleTextKeyDown
  ]);

  if (showCoordinates || !layerVisibility.textLabels) {
    return null;
  }

  return (
    <>
      {selectedItem?.type === 'text' && !isDraggingSelection && (
        <SelectionToolbar
          selectedItem={selectedItem}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          geometry={geometry}
          onEdit={handleEditClick}
          onRotate={handleRotateClick}
          onCopyLink={handleCopyLink}
          onDelete={handleTextDeletion}
          isResizeMode={false}
          showColorPicker={false}
        />
      )}

      {showTextModal && (() => {
        let currentLabel: TextLabel | null = null;
        if (editingTextId && mapData?.textLabels) {
          currentLabel = getActiveLayer(mapData).textLabels.find((l: TextLabel) => l.id === editingTextId) || null;
        }

        const savedSettings = mapData?.lastTextLabelSettings as { fontSize?: number; fontFace?: string; color?: HexColor } | undefined;
        const defaultFontSize = currentLabel?.fontSize || savedSettings?.fontSize || 16;
        const defaultFontFace = currentLabel?.fontFace || savedSettings?.fontFace || 'sans';
        const defaultColor = currentLabel?.color || savedSettings?.color || '#ffffff';

        return (
          <TextLabelEditor
            initialValue={currentLabel?.content || ''}
            initialFontSize={defaultFontSize}
            initialFontFace={defaultFontFace}
            initialColor={defaultColor}
            isEditing={!!editingTextId}
            customColors={customColors || []}
            onAddCustomColor={onAddCustomColor}
            onDeleteCustomColor={onDeleteCustomColor}
            onSubmit={handleTextSubmit}
            onCancel={handleTextCancel}
          />
        );
      })()}
    </>
  );
};

return { TextLayer };
