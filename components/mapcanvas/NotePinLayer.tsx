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
const { NoteLinkModal } = await requireModuleByName("NoteLinkModal.jsx");
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

  dc.useEffect(() => {
    registerHandlers('notePin', {
      handleNotePinPlacement
    });

    return () => unregisterHandlers('notePin');
  }, [registerHandlers, unregisterHandlers, handleNotePinPlacement]);

  if (showCoordinates) {
    return null;
  }

  return (
    <>
      {showNoteLinkModal && pendingNotePinId && mapData && (
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
