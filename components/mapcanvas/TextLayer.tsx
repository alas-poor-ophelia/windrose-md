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
  const { mapData, canvasRef, containerRef, geometry } = useMapState();
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
