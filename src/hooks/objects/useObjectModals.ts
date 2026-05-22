/**
 * useObjectModals.ts
 *
 * Manages modal state and handlers for object notes and note links.
 * Extracted from ObjectLayer.tsx to reduce component size.
 */

import type { JSX } from 'preact';
import type { MapObject } from '#types/objects/object.types';

import { useState } from 'preact/hooks';
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

const useObjectModals = ({ onObjectsChange, handleNoteSubmit }: UseObjectModalsArgs) => {
  const app = useApp();
  const { mapData } = useMapState();
  const {
    selectedItem, setSelectedItem,
    isDraggingSelection, setIsDraggingSelection,
    setDragStart,
    editingNoteObjectId, setEditingNoteObjectId,
    setShowNoteLinkModal
  } = useMapSelection();

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);

  const handleNoteButtonClick = (e: JSX.TargetedMouseEvent<HTMLElement>): void => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();

      if (isDraggingSelection) {
        setIsDraggingSelection(false);
        setDragStart(null);
      }

      const objectId = selectedItem.id;
      const obj = getActiveLayer(mapData!).objects.find((o: MapObject) => o.id === objectId);
      const objTitle = obj?.label || 'Object';
      const objTooltip = obj?.customTooltip || '';

      const opened = openNativeTextInputModal({
        app,
        onSubmit: (content: string) => {
          handleNoteSubmit(content, objectId);
        },
        title: `Note for ${objTitle}`,
        placeholder: 'Add a custom note...',
        initialValue: objTooltip
      });

      if (!opened) {
        setEditingObjectId(objectId);
        setShowNoteModal(true);
      }
    }
  };

  const handleNoteModalSubmit = (content: string): void => {
    handleNoteSubmit(content, editingObjectId);
    setShowNoteModal(false);
    setEditingObjectId(null);
  };

  const handleNoteCancel = (): void => {
    setShowNoteModal(false);
    setEditingObjectId(null);
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

    const obj = getActiveLayer(mapData!).objects?.find((o: MapObject) => o.id === objectId);
    const opened = openNativeNoteLinkModal(app, {
      onSave: (notePath: string | null) => { if (notePath) handleNoteLinkSaveForObject(notePath, objectId); },
      onClose: () => { setEditingNoteObjectId(null); },
      currentNotePath: obj?.linkedNote || null,
      objectType: obj?.type || null
    });

    if (!opened) {
      setEditingNoteObjectId(objectId);
      setShowNoteLinkModal(true);
    }
  };

  const handleNoteLinkSave = (notePath: string): void => {
    if (!editingNoteObjectId) return;
    handleNoteLinkSaveForObject(notePath, editingNoteObjectId);
    setShowNoteLinkModal(false);
    setEditingNoteObjectId(null);
  };

  const handleNoteLinkCancel = (): void => {
    setShowNoteLinkModal(false);
    setEditingNoteObjectId(null);
  };

  return {
    showNoteModal,
    editingObjectId,
    handleNoteButtonClick,
    handleNoteModalSubmit,
    handleNoteCancel,
    handleEditNoteLink,
    handleNoteLinkSave,
    handleNoteLinkCancel
  };
};

export { useObjectModals };