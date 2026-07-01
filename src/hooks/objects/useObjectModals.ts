/**
 * useObjectModals.ts
 *
 * Manages modal state and handlers for object notes and note links.
 * Extracted from ObjectLayer.tsx to reduce component size.
 */

import type { TargetedMouseEvent } from 'preact';
import type { MapObject } from '#types/objects/object.types';

import { useApp } from '../../context/AppContext';
import { useMapState } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { openNativeTextInputModal } from '../../components/modals/TextInputModal';
import { openNativeNoteLinkModal } from '../../components/modals/NoteLinkModal';










interface UseObjectModalsArgs {
  onObjectsChange: (objects: MapObject[], suppressHistory?: boolean) => void;
  handleNoteSubmit: (content: string, objectId: string | null) => void;
}

const useObjectModals = ({ onObjectsChange, handleNoteSubmit }: UseObjectModalsArgs): {
  handleNoteButtonClick: (e: TargetedMouseEvent<HTMLElement>) => void;
  handleEditNoteLink: (objectId: string) => void;
} => {
  const app = useApp();
  const { mapData } = useMapState();
  const {
    selectedItem, setSelectedItem,
    isDraggingSelection, setIsDraggingSelection,
    setDragStart,
  } = useMapSelection();

  const handleNoteButtonClick = (e: TargetedMouseEvent<HTMLElement>): void => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();

      if (isDraggingSelection) {
        setIsDraggingSelection(false);
        setDragStart(null);
      }

      if (!mapData) return;
      const objectId = selectedItem.id;
      const obj = getActiveLayer(mapData).objects.find((o: MapObject) => o.id === objectId);
      const objTitle = obj?.label != null && obj.label !== '' ? obj.label : 'Object';
      const objTooltip = obj?.customTooltip ?? '';

      openNativeTextInputModal({
        app,
        onSubmit: (content: string) => {
          handleNoteSubmit(content, objectId);
        },
        title: `Note for ${objTitle}`,
        placeholder: 'Add a custom note...',
        initialValue: objTooltip
      });
    }
  };

  const handleNoteLinkSaveForObject = (notePath: string, objectId: string): void => {
    if (!mapData) return;

    const updatedObjects = getActiveLayer(mapData).objects.map((obj: MapObject) => {
      if (obj.id === objectId) {
        return { ...obj, linkedNote: notePath };
      }
      return obj;
    });

    onObjectsChange(updatedObjects);

    if (selectedItem?.type === 'object' && selectedItem.id === objectId) {
      const updatedObject = updatedObjects.find((obj: MapObject) => obj.id === objectId);
      if (updatedObject) {
        setSelectedItem({ ...selectedItem, data: updatedObject });
      }
    }
  };

  const handleEditNoteLink = (objectId: string): void => {
    if (isDraggingSelection) {
      setIsDraggingSelection(false);
      setDragStart(null);
    }

    if (!mapData) return;
    const obj = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === objectId);
    openNativeNoteLinkModal(app, {
      onSave: (notePath: string | null) => { if (notePath != null) handleNoteLinkSaveForObject(notePath, objectId); },
      onClose: () => {},
      currentNotePath: obj?.linkedNote ?? null,
      objectType: obj?.type ?? null
    });
  };

  return {
    handleNoteButtonClick,
    handleEditNoteLink,
  };
};

export { useObjectModals };