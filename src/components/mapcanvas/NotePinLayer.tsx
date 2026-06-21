/**
 * NotePinLayer.tsx
 *
 * Handles note pin placement interactions:
 * - Places note_pin objects on click
 * - Opens note link modal for new pins
 * - Handles save/cancel for pending note pins
 *
 * Note: Editing note links on existing objects (including note_pins)
 * is handled by ObjectLayer via the "link note" button
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { ObjectTypeId } from '#types/objects/object.types';

import { useEffect, useRef } from 'preact/hooks';
import { useNotePinInteraction } from '../../hooks/interactions/useNotePinInteraction';
import { useMapState } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { openNativeNoteLinkModal } from '../modals/NoteLinkModal';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';
import { useApp } from '../../context/AppContext';











/** Props for NotePinLayer component */
export interface NotePinLayerProps {
  /** Current active tool */
  currentTool: ToolId;
  /** Currently selected object type */
  selectedObjectType: ObjectTypeId | null;
}

const NotePinLayer = ({
  currentTool,
  selectedObjectType
}: NotePinLayerProps): VNode | null => {
  const app = useApp();
  const { mapData } = useMapState();
  const {
    showNoteLinkModal,
    pendingNotePinId,
    showCoordinates
  } = useMapSelection();

  const {
    handleNotePinPlacement,
    handleNoteLinkSave,
    handleNoteLinkCancel,
  } = useNotePinInteraction(currentTool, selectedObjectType);

  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const notePinHandlersRef = useRef<Record<string, unknown> | null>(null);
  notePinHandlersRef.current = { handleNotePinPlacement };

  useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return notePinHandlersRef.current?.[prop];
      }
    });
    registerHandlers('notePin', proxy);
    return () => unregisterHandlers('notePin');
  }, [registerHandlers, unregisterHandlers]);

  useEffect(() => {
    if (!showNoteLinkModal || pendingNotePinId == null || pendingNotePinId === '' || !mapData) return;

    const currentNotePath = mapData.objects?.find(
      (obj: { id: string }) => obj.id === pendingNotePinId
    )?.linkedNote ?? null;

    openNativeNoteLinkModal(app, {
      onSave: handleNoteLinkSave,
      onClose: handleNoteLinkCancel,
      currentNotePath,
      objectType: 'note_pin'
    });
  }, [showNoteLinkModal, pendingNotePinId]);

  if (showCoordinates) {
    return null;
  }

  return (
    <>
    </>
  );
};

export { NotePinLayer };