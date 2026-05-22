// components/MapCanvasActionButtons.jsx - All floating action buttons and modals










// Sub-component: Text Label Control Buttons

import type { VNode } from 'preact';
import { TextLabelEditor } from '../modals/TextLabelEditor';
import { TextInputModal } from '../modals/TextInputModal';
import { Icon } from '../shared/Icon';
import type { MapData, MapObjectRef } from '#types/core/map.types';
import type { TextLabel } from '#types/objects/note.types';
import type { SelectedItem } from '#types/contexts/context.types';
import type { CustomColor } from '#types/hooks/dataHandlers.types';

interface Point { x: number; y: number }

interface TextLabelControlsProps {
  selectedItem: SelectedItem | null;
  mapData: MapData | null;
  calculateEditButtonPosition: () => Point;
  calculateRotateButtonPosition: () => Point;
  handleEditClick: (e: MouseEvent) => void;
  handleRotateClick: (e: MouseEvent) => void;
}

const TextLabelControls = ({
  selectedItem,
  mapData,
  calculateEditButtonPosition,
  calculateRotateButtonPosition,
  handleEditClick,
  handleRotateClick
}: TextLabelControlsProps): VNode | null => {
  if (selectedItem?.type !== 'text' || !mapData) return null;
  
  return (
    <>
      <div
        className="dmt-edit-button"
        onClick={handleEditClick}
        style={{
          position: 'absolute',
          left: calculateEditButtonPosition().x,
          top: calculateEditButtonPosition().y,
          pointerEvents: 'auto'
        }}
        title="Edit Text Label"
      >
        <Icon icon="lucide-pencil" />
      </div>
      
      <div
        className="dmt-rotate-button"
        onClick={handleRotateClick}
        style={{
          position: 'absolute',
          left: calculateRotateButtonPosition().x,
          top: calculateRotateButtonPosition().y,
          pointerEvents: 'auto'
        }}
        title="Rotate 45° (or press R)"
      >
        <Icon icon="lucide-rotate-cw" />
      </div>
    </>
  );
};

// Sub-component: Modal Overlays
interface ModalOverlaysProps {
  showTextModal: boolean;
  editingTextId: string | null;
  showNoteModal: boolean;
  editingObjectId: string | null;
  mapData: MapData | null;
  customColors: CustomColor[];
  handleTextSubmit: (data: unknown) => void;
  handleTextCancel: () => void;
  handleNoteModalSubmit: (value: string) => void;
  handleNoteCancel: () => void;
  onAddCustomColor: (color: string) => void;
  onDeleteCustomColor: (colorId: string) => void;
}

const ModalOverlays = ({
  showTextModal,
  editingTextId,
  showNoteModal,
  editingObjectId,
  mapData,
  customColors,
  handleTextSubmit,
  handleTextCancel,
  handleNoteModalSubmit,
  handleNoteCancel,
  onAddCustomColor,
  onDeleteCustomColor
}: ModalOverlaysProps): VNode => {
  return (
    <>
      {/* Text Label Editor Modal */}
      {showTextModal && (() => {
        let currentLabel: TextLabel | undefined;
        if (editingTextId != null && editingTextId !== '' && mapData?.textLabels != null) {
          currentLabel = mapData.textLabels.find((l: TextLabel) => l.id === editingTextId);
        }

        return (
          <TextLabelEditor
            initialValue={currentLabel?.content ?? ''}
            initialFontSize={currentLabel?.fontSize ?? 16}
            initialFontFace={currentLabel?.fontFace ?? 'sans'}
            initialColor={currentLabel?.color ?? '#ffffff'}
            initialOpacity={currentLabel?.opacity ?? 1}
            isEditing={editingTextId != null && editingTextId !== ''}
            customColors={customColors ?? []}
            onAddCustomColor={onAddCustomColor}
            onDeleteCustomColor={onDeleteCustomColor}
            onSubmit={handleTextSubmit}
            onCancel={handleTextCancel}
          />
        );
      })()}

      {/* Object Note Modal */}
      {showNoteModal && editingObjectId != null && editingObjectId !== '' && mapData != null && (
        <TextInputModal
          onSubmit={handleNoteModalSubmit}
          onCancel={handleNoteCancel}
          title={`Label for ${(mapData.objects ?? []).find((obj: MapObjectRef) => obj.id === editingObjectId)?.label ?? 'Object'}`}
          placeholder="Add a custom note..."
          initialValue={(mapData.objects ?? []).find((obj: MapObjectRef) => obj.id === editingObjectId)?.customTooltip ?? ''}
        />
      )}

    </>
  );
};

// Main component: Coordinates all action buttons and modals
interface MapCanvasActionButtonsProps extends TextLabelControlsProps, ModalOverlaysProps {}

const MapCanvasActionButtons = ({
  // Selection state
  selectedItem,
  mapData,

  // Text label handlers
  calculateEditButtonPosition,
  calculateRotateButtonPosition,
  handleEditClick,
  handleRotateClick,

  // Modal state and handlers
  showTextModal,
  editingTextId,
  showNoteModal,
  editingObjectId,
  handleTextSubmit,
  handleTextCancel,
  handleNoteModalSubmit,
  handleNoteCancel,

  // Custom colors
  customColors,
  onAddCustomColor,
  onDeleteCustomColor
}: MapCanvasActionButtonsProps): VNode => {
  return (
    <>
      <TextLabelControls
        selectedItem={selectedItem}
        mapData={mapData}
        calculateEditButtonPosition={calculateEditButtonPosition}
        calculateRotateButtonPosition={calculateRotateButtonPosition}
        handleEditClick={handleEditClick}
        handleRotateClick={handleRotateClick}
      />
    
      
      <ModalOverlays
        showTextModal={showTextModal}
        editingTextId={editingTextId}
        showNoteModal={showNoteModal}
        editingObjectId={editingObjectId}
        mapData={mapData}
        customColors={customColors}
        handleTextSubmit={handleTextSubmit}
        handleTextCancel={handleTextCancel}
        handleNoteModalSubmit={handleNoteModalSubmit}
        handleNoteCancel={handleNoteCancel}
        onAddCustomColor={onAddCustomColor}
        onDeleteCustomColor={onDeleteCustomColor}
      />
    </>
  );
};

export { MapCanvasActionButtons };