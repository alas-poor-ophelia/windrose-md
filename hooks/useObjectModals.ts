/**
 * useObjectModals.ts
 *
 * Manages modal state and handlers for object notes and note links.
 * Extracted from ObjectLayer.tsx to reduce component size.
 */

import type { JSX } from 'preact';
import type { MapObject } from '#types/objects/object.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState } = await requireModuleByName("MapContext.tsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx");
const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");
const { openNativeTextInputModal } = await requireModuleByName("TextInputModal.tsx");
const { openNativeNoteLinkModal } = await requireModuleByName("NoteLinkModal.jsx");

interface UseObjectModalsArgs {
  onObjectsChange: (objects: MapObject[], suppressHistory?: boolean) => void;
  handleNoteSubmit: (content: string, objectId: string | null) => void;
}

const useObjectModals = ({ onObjectsChange, handleNoteSubmit }: UseObjectModalsArgs) => {
  const { mapData } = useMapState();
  const {
    selectedItem, setSelectedItem,
    isDraggingSelection, setIsDraggingSelection,
    dragStart, setDragStart,
    editingNoteObjectId, setEditingNoteObjectId,
    showNoteLinkModal, setShowNoteLinkModal
  } = useMapSelection();

  const [showNoteModal, setShowNoteModal] = dc.useState(false);
  const [editingObjectId, setEditingObjectId] = dc.useState<string | null>(null);

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
    const opened = openNativeNoteLinkModal({
      onSave: (notePath: string) => handleNoteLinkSaveForObject(notePath, objectId),
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

return { useObjectModals };
