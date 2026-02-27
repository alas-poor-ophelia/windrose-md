/**
 * ObjectLayer.tsx
 *
 * Handles all object-related interactions:
 * - Object placement
 * - Object selection and dragging
 * - Object resizing
 * - Object color and notes
 * - Hover tooltips
 */

import type { JSX } from 'preact';
import type { ToolId } from '#types/tools/tool.types';
import type { ObjectTypeId, MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { HexColor } from '#types/core/common.types';
import type { CustomColor } from '../ColorPicker.tsx';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.tsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx");
const { useLinkingMode } = await requireModuleByName("ObjectLinkingContext.tsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");
const { useObjectInteractions } = await requireModuleByName("useObjectInteractions.ts");
const { TextInputModal, openNativeTextInputModal } = await requireModuleByName("TextInputModal.tsx");
const { NoteLinkModal } = await requireModuleByName("NoteLinkModal.jsx");
const { SelectionToolbar } = await requireModuleByName("SelectionToolbar.jsx");
const { calculateObjectScreenPosition } = await requireModuleByName("screenPositionUtils.ts");
const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");
const { copyDeepLinkToClipboard } = await requireModuleByName("deepLinkHandler.ts");
const { LinkingModeBanner } = await requireModuleByName("LinkingModeBanner.tsx");

const { rotateByIncrement } = await dc.require(dc.resolvePath("utils/rotationOperations.ts")) as {
  rotateByIncrement: (currentRotation: number) => number
};

/** Selected item from context */
interface SelectedItem {
  type: 'object' | 'text' | 'notePin';
  id: string;
  data?: MapObject;
}

/** Cardinal direction indicator positions */
interface CardinalIndicatorPositions {
  north: { x: number; y: number };
  south: { x: number; y: number };
  east: { x: number; y: number };
  west: { x: number; y: number };
}

/** Props for ObjectLayer component */
export interface ObjectLayerProps {
  /** Current active tool */
  currentTool: ToolId;
  /** Currently selected object type */
  selectedObjectType: ObjectTypeId | null;
  /** Callback when objects change */
  onObjectsChange: (objects: MapObject[], suppressHistory?: boolean) => void;
  /** Custom colors array */
  customColors?: CustomColor[];
  /** Callback to add custom color */
  onAddCustomColor?: (color: HexColor) => void;
  /** Callback to delete custom color */
  onDeleteCustomColor?: (colorId: string) => void;
}

const ObjectLayer = ({
  currentTool,
  selectedObjectType,
  onObjectsChange,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor
}: ObjectLayerProps): React.ReactElement | null => {
  const { canvasRef, containerRef, mapData, mapId, notePath, geometry, screenToGrid, screenToWorld, getClientCoords, GridGeometry } = useMapState();
  const { getObjectAtPosition, addObject, updateObject, removeObject, isAreaFree, onObjectsChange: contextOnObjectsChange, onTextLabelsChange, removeTextLabel } = useMapOperations();
  const {
    selectedItem, setSelectedItem,
    selectedItems, isSelected, hasMultiSelection, selectionCount, selectItem, selectMultiple, clearSelection,
    isDraggingSelection, setIsDraggingSelection,
    dragStart, setDragStart,
    isResizeMode, setIsResizeMode,
    hoveredObject, setHoveredObject,
    mousePosition, setMousePosition,
    showNoteLinkModal, setShowNoteLinkModal,
    editingNoteObjectId, setEditingNoteObjectId,
    showCoordinates,
    layerVisibility,
    updateSelectedItemsData
  } = useMapSelection();

  const { isLinkingMode, linkingFrom, startLinking, cancelLinking } = useLinkingMode();

  // Helper for bidirectional link updates (handles same-layer vs cross-layer)
  const applyLinkUpdate = dc.useCallback((
    updates: Array<{ layerId: string; objectId: string; transform: (obj: MapObject) => MapObject }>,
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
      if (updatedObjects) {
        onObjectsChange(updatedObjects);
      }
    } else {
      window.dispatchEvent(new CustomEvent(crossLayerEvent.name, { detail: crossLayerEvent.detail }));
    }
  }, [mapData, onObjectsChange]);

  const [showNoteModal, setShowNoteModal] = dc.useState(false);
  const [editingObjectId, setEditingObjectId] = dc.useState<string | null>(null);
  const [showObjectColorPicker, setShowObjectColorPicker] = dc.useState(false);

  const handleScaleChange = dc.useCallback((newScale: number) => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData?.objects) return;

    const updatedObjects = updateObject(getActiveLayer(mapData).objects, selectedItem.id, { scale: newScale });
    contextOnObjectsChange(updatedObjects);

    const updatedObject = updatedObjects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (updatedObject) {
      setSelectedItem({ ...selectedItem, data: updatedObject });
    }
  }, [selectedItem, mapData, updateObject, contextOnObjectsChange, setSelectedItem]);

  const handleRotateAll = dc.useCallback(() => {
    if (!hasMultiSelection || !mapData) return;

    const activeLayer = getActiveLayer(mapData);
    let updatedObjects = [...(activeLayer.objects || [])];
    let updatedTextLabels = [...(activeLayer.textLabels || [])];

    for (const item of selectedItems) {
      if (item.type === 'object') {
        const idx = updatedObjects.findIndex((o: MapObject) => o.id === item.id);
        if (idx !== -1) {
          const obj = updatedObjects[idx];
          const currentRotation = obj.rotation || 0;
          const nextRotation = rotateByIncrement(currentRotation);
          updatedObjects[idx] = { ...obj, rotation: nextRotation };
        }
      } else if (item.type === 'text') {
        const idx = updatedTextLabels.findIndex((l: { id: string }) => l.id === item.id);
        if (idx !== -1) {
          const label = updatedTextLabels[idx];
          const currentRotation = label.rotation || 0;
          const nextRotation = rotateByIncrement(currentRotation);
          updatedTextLabels[idx] = { ...label, rotation: nextRotation };
        }
      }
    }

    onObjectsChange(updatedObjects, true);
    onTextLabelsChange(updatedTextLabels, false);

    const updates = selectedItems.map((item: SelectedItem) => {
      if (item.type === 'object') {
        const obj = updatedObjects.find((o: MapObject) => o.id === item.id);
        return obj ? { id: item.id, rotation: obj.rotation } : null;
      } else {
        const label = updatedTextLabels.find((l: { id: string; rotation?: number }) => l.id === item.id);
        return label ? { id: item.id, rotation: label.rotation } : null;
      }
    }).filter(Boolean);

    updateSelectedItemsData(updates);
  }, [hasMultiSelection, mapData, selectedItems, onObjectsChange, onTextLabelsChange, updateSelectedItemsData]);

  const handleDuplicateAll = dc.useCallback(() => {
    if (!hasMultiSelection || !mapData) return;

    const activeLayer = getActiveLayer(mapData);
    let updatedObjects = [...(activeLayer.objects || [])];
    let updatedTextLabels = [...(activeLayer.textLabels || [])];
    const newSelectedItems: SelectedItem[] = [];

    const offsetX = 1;
    const offsetY = 0;

    for (const item of selectedItems) {
      if (item.type === 'object') {
        const sourceObj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
        if (!sourceObj) continue;

        const newId = `obj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newObj = {
          ...sourceObj,
          id: newId,
          position: {
            x: sourceObj.position.x + offsetX,
            y: sourceObj.position.y + offsetY
          }
        };
        updatedObjects.push(newObj);
        newSelectedItems.push({ type: 'object', id: newId, data: newObj });
      } else if (item.type === 'text') {
        const sourceLabel = activeLayer.textLabels?.find((l: { id: string }) => l.id === item.id);
        if (!sourceLabel) continue;

        const newId = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const offsetWorld = (mapData.gridSize || 32) * 1;
        const newLabel = {
          ...sourceLabel,
          id: newId,
          position: {
            x: sourceLabel.position.x + offsetWorld,
            y: sourceLabel.position.y
          }
        };
        updatedTextLabels.push(newLabel);
        newSelectedItems.push({ type: 'text', id: newId, data: newLabel });
      }
    }

    onObjectsChange(updatedObjects, true);
    onTextLabelsChange(updatedTextLabels, false);

    if (newSelectedItems.length > 0) {
      selectMultiple(newSelectedItems);
    }
  }, [hasMultiSelection, mapData, selectedItems, contextOnObjectsChange, onTextLabelsChange, selectMultiple]);

  const handleDeleteAll = dc.useCallback(() => {
    if (!hasMultiSelection || !mapData) return;

    const activeLayer = getActiveLayer(mapData);
    const selectedObjectIds = new Set(selectedItems.filter((i: SelectedItem) => i.type === 'object').map((i: SelectedItem) => i.id));
    const selectedTextIds = new Set(selectedItems.filter((i: SelectedItem) => i.type === 'text').map((i: SelectedItem) => i.id));

    const updatedObjects = (activeLayer.objects || []).filter((obj: MapObject) => !selectedObjectIds.has(obj.id));
    const updatedTextLabels = (activeLayer.textLabels || []).filter((label: { id: string }) => !selectedTextIds.has(label.id));

    onObjectsChange(updatedObjects, true);
    onTextLabelsChange(updatedTextLabels, false);

    clearSelection();
  }, [hasMultiSelection, mapData, selectedItems, onObjectsChange, onTextLabelsChange, clearSelection]);

  const handleCopyLink = dc.useCallback(() => {
    if (!selectedItem || !mapData || !mapId || !notePath) return;

    const activeLayer = getActiveLayer(mapData);
    const zoom = mapData.viewState?.zoom ?? 1.0;
    const layerId = mapData.activeLayerId || activeLayer?.id || 'layer_001';

    let displayText = 'Map Location';
    let x = 0;
    let y = 0;

    if (selectedItem.type === 'object') {
      const obj = activeLayer.objects?.find((o: MapObject) => o.id === selectedItem.id);
      if (!obj) return;
      displayText = obj.label || obj.customTooltip || 'Object';
      x = obj.position.x;
      y = obj.position.y;
    } else if (selectedItem.type === 'text') {
      const label = activeLayer.textLabels?.find((l: TextLabel) => l.id === selectedItem.id);
      if (!label) return;
      displayText = label.content || 'Text';
      // Text labels use world coordinates, convert to grid
      const gridSize = mapData.gridSize || 32;
      x = label.position.x / gridSize;
      y = label.position.y / gridSize;
    }

    copyDeepLinkToClipboard(displayText, notePath, mapId, x, y, zoom, layerId);
  }, [selectedItem, mapData, mapId, notePath]);

  const {
    isResizing,
    resizeCorner,
    objectColorBtnRef,
    pendingObjectCustomColorRef,
    edgeSnapMode,
    setEdgeSnapMode,
    longPressTimerRef,
    handleObjectPlacement,
    handleObjectSelection,
    handleObjectDragging,
    handleObjectResizing,
    handleObjectWheel,
    handleHoverUpdate,
    stopObjectDragging,
    stopObjectResizing,
    handleObjectKeyDown,
    handleObjectRotation,
    handleObjectDeletion,
    handleObjectDuplicate,
    handleNoteSubmit,
    handleObjectColorSelect,
    handleObjectColorReset,
    getClickedCorner
  } = useObjectInteractions(currentTool, selectedObjectType, onAddCustomColor, customColors);

  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  // Wrap handleObjectSelection to intercept clicks when in linking mode
  const wrappedHandleObjectSelection = dc.useCallback((
    clientX: number,
    clientY: number,
    gridX: number,
    gridY: number
  ): boolean => {
    if (isLinkingMode && linkingFrom && mapData) {
      // In linking mode - try to find target object
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

        // Complete the bidirectional link
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
            name: 'dmt-create-object-link',
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

        // Clear linking mode
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
    return handleObjectSelection(clientX, clientY, gridX, gridY);
  }, [isLinkingMode, linkingFrom, mapData, handleObjectSelection, applyLinkUpdate, cancelLinking, setSelectedItem]);

  dc.useEffect(() => {
    registerHandlers('object', {
      handleObjectPlacement,
      handleObjectSelection: wrappedHandleObjectSelection,
      handleObjectDragging,
      handleObjectResizing,
      stopObjectDragging,
      stopObjectResizing,
      handleHoverUpdate,
      handleObjectWheel,
      handleObjectKeyDown,
      isResizing,
      resizeCorner,
      edgeSnapMode,
      setEdgeSnapMode
    });

    return () => unregisterHandlers('object');
  }, [
    registerHandlers, unregisterHandlers,
    handleObjectPlacement, wrappedHandleObjectSelection,
    handleObjectDragging, handleObjectResizing,
    stopObjectDragging, stopObjectResizing,
    handleHoverUpdate, handleObjectWheel, handleObjectKeyDown,
    isResizing, resizeCorner,
    edgeSnapMode, setEdgeSnapMode
  ]);

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

  const handleResizeButtonClick = (e: JSX.TargetedMouseEvent<HTMLElement>): void => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();
      setIsResizeMode(true);
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

  const handleObjectColorButtonClick = (e: JSX.TargetedMouseEvent<HTMLElement>): void => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();
      setShowObjectColorPicker(!showObjectColorPicker);
    }
  };

  const handleObjectColorPickerClose = (): void => {
    setShowObjectColorPicker(false);
  };

  const handleObjectColorResetWrapper = (): void => {
    handleObjectColorReset(setShowObjectColorPicker);
  };

  const handleEditNoteLink = (objectId: string): void => {
    if (isDraggingSelection) {
      setIsDraggingSelection(false);
      setDragStart(null);
    }

    setEditingNoteObjectId(objectId);
    setShowNoteLinkModal(true);
  };

  const handleNoteLinkSave = (notePath: string): void => {
    if (!mapData || !editingNoteObjectId) return;

    const updatedObjects = getActiveLayer(mapData).objects.map((obj: MapObject) => {
      if (obj.id === editingNoteObjectId) {
        return { ...obj, linkedNote: notePath };
      }
      return obj;
    });

    onObjectsChange(updatedObjects);

    if (selectedItem?.type === 'object' && selectedItem.id === editingNoteObjectId) {
      const updatedObject = updatedObjects.find((obj: MapObject) => obj.id === editingNoteObjectId);
      if (updatedObject) {
        setSelectedItem({ ...selectedItem, data: updatedObject });
      }
    }

    setShowNoteLinkModal(false);
    setEditingNoteObjectId(null);
  };

  const handleNoteLinkCancel = (): void => {
    setShowNoteLinkModal(false);
    setEditingNoteObjectId(null);
  };

  const handleLinkObject = dc.useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) return;

    const activeLayer = getActiveLayer(mapData);
    const obj = activeLayer.objects?.find((o: MapObject) => o.id === selectedItem.id);
    if (!obj) return;

    startLinking({
      layerId: mapData.activeLayerId,
      objectId: obj.id,
      position: obj.position,
      objectType: obj.type
    });
  }, [selectedItem, mapData, startLinking]);

  const handleFollowLink = dc.useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData || !mapId || !notePath) return;

    const obj = selectedItem.data as MapObject;
    if (!obj?.linkedObject) return;

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
    window.dispatchEvent(new CustomEvent('dmt-navigate-to', {
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
    setSelectedItem({
      type: 'object',
      id: targetObject.id,
      data: targetObject
    });
  }, [selectedItem, mapData, mapId, notePath, setSelectedItem]);

  const handleRemoveLink = dc.useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) return;

    const obj = selectedItem.data as MapObject;
    if (!obj?.linkedObject) return;

    const { layerId: targetLayerId, objectId: targetObjectId } = obj.linkedObject;
    const sourceLayerId = mapData.activeLayerId;
    const sourceObjectId = selectedItem.id;

    const removeLinkedObject = (o: MapObject): MapObject => {
      const { linkedObject: _removed, ...rest } = o;
      return rest as MapObject;
    };

    applyLinkUpdate(
      [
        { layerId: sourceLayerId, objectId: sourceObjectId, transform: removeLinkedObject },
        { layerId: targetLayerId, objectId: targetObjectId, transform: removeLinkedObject }
      ],
      {
        name: 'dmt-remove-object-link',
        detail: { sourceLayerId, sourceObjectId, targetLayerId, targetObjectId }
      }
    );

    const { linkedObject: _removed, ...restData } = obj;
    setSelectedItem({
      type: 'object',
      id: selectedItem.id,
      data: restData as MapObject
    });

    new Notice('Link removed');
  }, [selectedItem, mapData, applyLinkUpdate, setSelectedItem]);

  dc.useEffect(() => {
    if (!showObjectColorPicker) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent): void => {
      const target = e.target as Element;
      const pickerElement = target.closest('.dmt-color-picker');
      const buttonElement = target.closest('.dmt-object-color-button');

      if (!pickerElement && !buttonElement) {
        if (pendingObjectCustomColorRef.current && onAddCustomColor) {
          onAddCustomColor(pendingObjectCustomColorRef.current);
          handleObjectColorSelect(pendingObjectCustomColorRef.current);
          pendingObjectCustomColorRef.current = null;
        }

        handleObjectColorPickerClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showObjectColorPicker]);

  if (showCoordinates || !layerVisibility.objects) {
    return null;
  }

  const getCardinalIndicatorPositions = (selectedObject: MapObject): CardinalIndicatorPositions | null => {
    if (!selectedObject || !canvasRef.current || !containerRef.current || !mapData) {
      return null;
    }

    const screenPos = calculateObjectScreenPosition(selectedObject, canvasRef.current, mapData, geometry);

    if (!screenPos) return null;

    const { screenX, screenY, objectWidth, objectHeight } = screenPos;
    const indicatorSize = 12;
    const gap = 6;

    return {
      north: {
        x: screenX - indicatorSize / 2,
        y: screenY - objectHeight / 2 - gap - indicatorSize
      },
      south: {
        x: screenX - indicatorSize / 2,
        y: screenY + objectHeight / 2 + gap
      },
      east: {
        x: screenX + objectWidth / 2 + gap,
        y: screenY - indicatorSize / 2
      },
      west: {
        x: screenX - objectWidth / 2 - gap - indicatorSize,
        y: screenY - indicatorSize / 2
      }
    };
  };

  const selectedObject = selectedItem?.type === 'object' && mapData?.objects
    ? getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id)
    : null;

  const indicatorPositions = edgeSnapMode && selectedObject && mapData?.mapType !== 'hex'
    ? getCardinalIndicatorPositions(selectedObject)
    : null;

  return (
    <>
      {/* Linking Mode Banner */}
      {isLinkingMode && linkingFrom && (
        <LinkingModeBanner
          linkingFrom={linkingFrom}
          onCancel={cancelLinking}
        />
      )}

      {edgeSnapMode && selectedItem?.type === 'object' && indicatorPositions && (
        <>
          <div
            className="dmt-edge-snap-indicator north"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.north.x}px`,
              top: `${indicatorPositions.north.y}px`,
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
          <div
            className="dmt-edge-snap-indicator south"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.south.x}px`,
              top: `${indicatorPositions.south.y}px`,
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
          <div
            className="dmt-edge-snap-indicator east"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.east.x}px`,
              top: `${indicatorPositions.east.y}px`,
              width: 0,
              height: 0,
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderLeft: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
          <div
            className="dmt-edge-snap-indicator west"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.west.x}px`,
              top: `${indicatorPositions.west.y}px`,
              width: 0,
              height: 0,
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderRight: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
        </>
      )}

      {((selectedItem?.type === 'object' || hasMultiSelection) && !isDraggingSelection) && (
        <SelectionToolbar
          selectedItem={selectedItem}
          selectedItems={selectedItems}
          hasMultiSelection={hasMultiSelection}
          selectionCount={selectionCount}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          geometry={geometry}
          onRotate={handleObjectRotation}
          onDuplicate={handleObjectDuplicate}
          onLabel={handleNoteButtonClick}
          onLinkNote={() => handleEditNoteLink(selectedItem?.id)}
          onLinkObject={handleLinkObject}
          onFollowLink={handleFollowLink}
          onRemoveLink={handleRemoveLink}
          onCopyLink={handleCopyLink}
          onColorClick={handleObjectColorButtonClick}
          onResize={handleResizeButtonClick}
          onDelete={handleObjectDeletion}
          onScaleChange={handleScaleChange}
          onRotateAll={handleRotateAll}
          onDuplicateAll={handleDuplicateAll}
          onDeleteAll={handleDeleteAll}
          isResizeMode={isResizeMode}
          showColorPicker={showObjectColorPicker}
          currentColor={selectedItem?.data?.color}
          onColorSelect={handleObjectColorSelect}
          onColorPickerClose={handleObjectColorPickerClose}
          onColorReset={handleObjectColorResetWrapper}
          customColors={customColors}
          onAddCustomColor={onAddCustomColor}
          onDeleteCustomColor={onDeleteCustomColor}
          pendingCustomColorRef={pendingObjectCustomColorRef}
          colorButtonRef={objectColorBtnRef}
        />
      )}

      {showNoteModal && editingObjectId && mapData && (
        <TextInputModal
          onSubmit={handleNoteModalSubmit}
          onCancel={handleNoteCancel}
          title={`Note for ${getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === editingObjectId)?.label || 'Object'}`}
          placeholder="Add a custom note..."
          initialValue={getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === editingObjectId)?.customTooltip || ''}
        />
      )}

      {showNoteLinkModal && mapData && (
        <NoteLinkModal
          isOpen={showNoteLinkModal}
          onClose={handleNoteLinkCancel}
          onSave={handleNoteLinkSave}
          currentNotePath={
            editingNoteObjectId
              ? getActiveLayer(mapData).objects?.find((obj: MapObject) => obj.id === editingNoteObjectId)?.linkedNote || null
              : null
          }
          objectType={
            editingNoteObjectId
              ? getActiveLayer(mapData).objects?.find((obj: MapObject) => obj.id === editingNoteObjectId)?.type || null
              : null
          }
        />
      )}

      {hoveredObject && mousePosition && hoveredObject.type !== 'note_pin' && (
        <div
          className="dmt-object-tooltip"
          style={{
            position: 'absolute',
            left: mousePosition.x + 20,
            top: mousePosition.y + 25,
            pointerEvents: 'none',
            zIndex: 1000
          }}
        >
          {hoveredObject.customTooltip
            ? `${hoveredObject.label} - ${hoveredObject.customTooltip}`
            : hoveredObject.label
          }
        </div>
      )}
    </>
  );
};

return { ObjectLayer };
