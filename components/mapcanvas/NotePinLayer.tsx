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
import type { ObjectTypeId } from '#types/objects/object.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useNotePinInteraction } = await requireModuleByName("useNotePinInteraction.ts");
const { useMapState, useMapOperations } = await requireModuleByName("MapContext.tsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx");
const { NoteLinkModal, openNativeNoteLinkModal } = await requireModuleByName("NoteLinkModal.jsx");
const { isBridgeAvailable } = await requireModuleByName("obsidianBridge.ts");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");

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
}: NotePinLayerProps): React.ReactElement | null => {
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
    handleEditNoteLink
  } = useNotePinInteraction(currentTool, selectedObjectType);

  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  const nativeOpenedRef = dc.useRef(false);

  const notePinHandlersRef = dc.useRef<Record<string, unknown> | null>(null);
  notePinHandlersRef.current = { handleNotePinPlacement };

  dc.useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return notePinHandlersRef.current?.[prop];
      }
    });
    registerHandlers('notePin', proxy);
    return () => unregisterHandlers('notePin');
  }, []);

  // Try native modal when showNoteLinkModal becomes true
  dc.useEffect(() => {
    if (!showNoteLinkModal || !pendingNotePinId || !mapData) {
      nativeOpenedRef.current = false;
      return;
    }

    const currentNotePath = mapData.objects?.find(
      (obj: { id: string }) => obj.id === pendingNotePinId
    )?.linkedNote || null;

    const opened = openNativeNoteLinkModal({
      onSave: handleNoteLinkSave,
      onClose: handleNoteLinkCancel,
      currentNotePath,
      objectType: 'note_pin'
    });
    nativeOpenedRef.current = opened;
  }, [showNoteLinkModal, pendingNotePinId]);

  if (showCoordinates) {
    return null;
  }

  return (
    <>
      {showNoteLinkModal && pendingNotePinId && mapData && !nativeOpenedRef.current && !isBridgeAvailable() && (
        <NoteLinkModal
          isOpen={showNoteLinkModal}
          onClose={handleNoteLinkCancel}
          onSave={handleNoteLinkSave}
          currentNotePath={
            mapData.objects?.find((obj: { id: string }) => obj.id === pendingNotePinId)?.linkedNote || null
          }
          objectType="note_pin"
        />
      )}
    </>
  );
};

return { NotePinLayer };
