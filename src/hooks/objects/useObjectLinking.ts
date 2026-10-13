/**
 * useObjectLinking.ts
 *
 * Bidirectional object-to-object links: start linking, complete a link by
 * clicking a target while linking mode is on, follow a link, remove a link.
 * Same-layer updates go straight through onObjectsChange; cross-layer
 * updates round-trip through a window event handled by this mount's
 * useCustomEventHandlers.
 */

import { useCallback } from 'preact/hooks';
import { Notice } from 'obsidian';
import type { MapObject } from '#types/objects/object.types';
import type { SelectedItem } from '#types/contexts/context.types';
import type { HandleObjectSelection } from '#types/hooks/objectInteractions.types';
import { useMapState } from '../../context/MapContext';
import { useLinkingMode } from '../../context/ObjectLinkingContext';
import type { LinkingSource } from '../../context/ObjectLinkingContext';
import { getActiveLayer } from '../../persistence/layerAccessor';

export interface ObjectLinkingOptions {
  onObjectsChange: (objects: MapObject[], suppressHistory?: boolean) => void;
  /** Normal selection handler, used when the click does not complete a link */
  handleObjectSelection: HandleObjectSelection;
  selectedItem: SelectedItem | null;
  setSelectedItem: (item: SelectedItem | null) => void;
}

export interface ObjectLinkingResult {
  isLinkingMode: boolean;
  linkingFrom: LinkingSource | null;
  cancelLinking: () => void;
  /** handleObjectSelection that completes a pending link first */
  wrappedHandleObjectSelection: HandleObjectSelection;
  handleLinkObject: () => void;
  handleFollowLink: () => void;
  handleRemoveLink: () => void;
}

interface LinkUpdate {
  layerId: string;
  objectId: string;
  transform: (obj: MapObject) => MapObject;
}

const removeLinkedObject = (o: MapObject): MapObject => {
  const { linkedObject, ...rest } = o;
  void linkedObject; // dropped from the copy
  return rest;
};

export function useObjectLinking({
  onObjectsChange, handleObjectSelection, selectedItem, setSelectedItem
}: ObjectLinkingOptions): ObjectLinkingResult {
  const { mapData, mapId, notePath, instanceId } = useMapState();
  const { isLinkingMode, linkingFrom, startLinking, cancelLinking } = useLinkingMode();

  // Bidirectional link updates (handles same-layer vs cross-layer)
  const applyLinkUpdate = useCallback((
    updates: LinkUpdate[],
    crossLayerEvent: { name: string; detail: Record<string, unknown> }
  ): void => {
    if (!mapData) return;

    const allOnActiveLayer = updates.every(u => u.layerId === mapData.activeLayerId);

    if (allOnActiveLayer) {
      const activeLayer = getActiveLayer(mapData);
      const updatedObjects = activeLayer.objects?.map((obj: MapObject) => {
        const update = updates.find(u => u.objectId === obj.id);
        return update ? update.transform(obj) : obj;
      });
      if (updatedObjects != null) {
        onObjectsChange(updatedObjects);
      }
    } else {
      // Stamp the sender so co-mounted maps don't apply it too.
      window.dispatchEvent(new CustomEvent(crossLayerEvent.name, {
        detail: { ...crossLayerEvent.detail, instanceId: instanceId ?? undefined }
      }));
    }
  }, [mapData, onObjectsChange, instanceId]);

  // Intercepts clicks while in linking mode
  const wrappedHandleObjectSelection = useCallback((
    clientX: number,
    clientY: number,
    gridX: number,
    gridY: number,
    isTouchActive?: boolean
  ): boolean => {
    if (isLinkingMode && linkingFrom && mapData) {
      const activeLayer = getActiveLayer(mapData);
      const targetObject = activeLayer.objects?.find((obj: MapObject) => {
        return obj.position.x === gridX && obj.position.y === gridY;
      });

      if (targetObject) {
        // Prevent self-linking
        if (targetObject.id === linkingFrom.objectId && mapData.activeLayerId === linkingFrom.layerId) {
          new Notice('Cannot link an object to itself');
          return true;
        }

        const sourceToTargetLink = {
          layerId: mapData.activeLayerId,
          objectId: targetObject.id,
          position: targetObject.position,
          objectType: targetObject.type
        };

        const targetToSourceLink = {
          layerId: linkingFrom.layerId,
          objectId: linkingFrom.objectId,
          position: linkingFrom.position,
          objectType: linkingFrom.objectType
        };

        applyLinkUpdate(
          [
            { layerId: linkingFrom.layerId, objectId: linkingFrom.objectId, transform: (obj) => ({ ...obj, linkedObject: sourceToTargetLink }) },
            { layerId: mapData.activeLayerId, objectId: targetObject.id, transform: (obj) => ({ ...obj, linkedObject: targetToSourceLink }) }
          ],
          {
            name: 'windrose-create-object-link',
            detail: {
              sourceLayerId: linkingFrom.layerId,
              sourceObjectId: linkingFrom.objectId,
              sourceLink: sourceToTargetLink,
              targetLayerId: mapData.activeLayerId,
              targetObjectId: targetObject.id,
              targetLink: targetToSourceLink
            }
          }
        );

        cancelLinking();
        new Notice('Objects linked');

        // Select the target object with updated data
        setSelectedItem({
          type: 'object',
          id: targetObject.id,
          data: { ...targetObject, linkedObject: targetToSourceLink }
        });

        return true;
      }
    }

    // Not in linking mode or no target found - use normal selection
    return handleObjectSelection(clientX, clientY, gridX, gridY, isTouchActive);
  }, [isLinkingMode, linkingFrom, mapData, handleObjectSelection, applyLinkUpdate, cancelLinking, setSelectedItem]);

  const handleLinkObject = useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) return;

    const obj = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === selectedItem.id);
    if (!obj) return;

    startLinking({
      layerId: mapData.activeLayerId,
      objectId: obj.id,
      position: obj.position,
      objectType: obj.type
    });
  }, [selectedItem, mapData, startLinking]);

  const handleFollowLink = useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData || mapId == null || mapId === '' || notePath == null || notePath === '') return;

    const obj = selectedItem.data;
    if (obj?.linkedObject == null) return;

    const { layerId, objectId } = obj.linkedObject;

    const targetLayer = mapData.layers.find(l => l.id === layerId);
    if (!targetLayer) {
      new Notice('Linked layer no longer exists');
      return;
    }

    const targetObject = targetLayer.objects?.find((o: MapObject) => o.id === objectId);
    if (!targetObject) {
      new Notice('Linked object no longer exists');
      return;
    }

    // Navigate to the target (DungeonMapTracker handles layer switching + panning)
    window.dispatchEvent(new CustomEvent('windrose-navigate-to', {
      detail: {
        notePath,
        mapId,
        x: targetObject.position.x,
        y: targetObject.position.y,
        zoom: 1.175,
        layerId,
        timestamp: Date.now()
      }
    }));

    // Select the target object immediately (we already have its data)
    setSelectedItem({ type: 'object', id: targetObject.id, data: targetObject });
  }, [selectedItem, mapData, mapId, notePath, setSelectedItem]);

  const handleRemoveLink = useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) return;

    const obj = selectedItem.data;
    if (!obj?.linkedObject) return;

    const { layerId: targetLayerId, objectId: targetObjectId } = obj.linkedObject;
    const sourceLayerId = mapData.activeLayerId;
    const sourceObjectId = selectedItem.id;

    applyLinkUpdate(
      [
        { layerId: sourceLayerId, objectId: sourceObjectId, transform: removeLinkedObject },
        { layerId: targetLayerId, objectId: targetObjectId, transform: removeLinkedObject }
      ],
      {
        name: 'windrose-remove-object-link',
        detail: { sourceLayerId, sourceObjectId, targetLayerId, targetObjectId }
      }
    );

    setSelectedItem({ type: 'object', id: selectedItem.id, data: removeLinkedObject(obj) });

    new Notice('Link removed');
  }, [selectedItem, mapData, applyLinkUpdate, setSelectedItem]);

  return {
    isLinkingMode, linkingFrom, cancelLinking,
    wrappedHandleObjectSelection, handleLinkObject, handleFollowLink, handleRemoveLink
  };
}
