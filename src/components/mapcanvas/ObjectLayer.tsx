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

import type { TargetedMouseEvent, VNode } from 'preact';
import { Notice } from 'obsidian';
import type { ToolId } from '#types/tools/tool.types';
import type { ObjectTypeId, MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { HexColor } from '#types/core/common.types';
import type { SelectedItem } from '#types/contexts/context.types';
import type { CustomColor } from '#types/core/common.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { useLinkingMode } from '../../context/ObjectLinkingContext';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';
import { useObjectInteractions } from '../../hooks/objects/useObjectInteractions';
import type { MenuItem } from 'obsidian';
import { Menu } from 'obsidian';
import { useObjectModals } from '../../hooks/objects/useObjectModals';
import { SelectionActionsOverlay } from '../toolbars/SelectionActionsOverlay';
import { buildObjectActions, buildMultiActions } from '../../hooks/interactions/useSelectionActions';
import { calculateObjectScreenPosition } from '../../objects/screenPositionUtils';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { convertObjectToFreeform, snapObjectToGrid } from '../../objects/objectOperations';
import { copyDeepLinkToClipboard } from '../../persistence/deepLinkHandler';
import { LinkingModeBanner } from '../overlays/LinkingModeBanner';
import { CardinalIndicators } from './CardinalIndicators';
import { MeasurementOverlay } from '../overlays/MeasurementOverlay';
import { formatDistance, getEffectiveDistanceSettings } from '../../drawing/distanceOperations';
import { getSettings } from '../../core/settingsAccessor';
import { rotateByIncrement } from '../../drawing/rotationOperations';
import { Z_INDEX } from '../../core/dmtConstants';
import type { SelectionContextMenuDetail } from '../../core/windroseEvents';



























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
  /** Whether freeform placement mode is active (sidebar toggle) */
  freeformPlacementMode?: boolean;
}

const ObjectLayer = ({
  currentTool,
  selectedObjectType,
  onObjectsChange,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor,
  freeformPlacementMode = false
}: ObjectLayerProps): VNode | null => {
  const { canvasRef, containerRef, mapData, mapId, notePath, geometry, screenToGrid } = useMapState();
  const { getObjectAtPosition, updateObject, onObjectsChange: contextOnObjectsChange, onTextLabelsChange } = useMapOperations();
  const {
    selectedItem, setSelectedItem,
    selectedItems, hasMultiSelection, selectionCount, selectMultiple, clearSelection,
    isDraggingSelection,
    isResizeMode, setIsResizeMode,
    hoveredObject,
    mousePosition,
    showCoordinates,
    layerVisibility,
    updateSelectedItemsData
  } = useMapSelection();

  const { isLinkingMode, linkingFrom, startLinking, cancelLinking } = useLinkingMode();


  const handlePlayerToggle = useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) return;
    const obj = getActiveLayer(mapData).objects?.find(o => o.id === selectedItem.id);
    if (!obj) return;
    const isPlayer = obj.isPlayer !== true;
    const updates: Record<string, unknown> = { isPlayer };
    if (isPlayer && (obj.lightRadius == null || obj.lightRadius === 0)) {
      updates.lightRadius = 30;
      updates.lightColor = 'rgba(255, 255, 100, 1)';
      updates.lightEnabled = true;
    }
    const updatedObjects = updateObject(getActiveLayer(mapData).objects, selectedItem.id, updates);
    contextOnObjectsChange(updatedObjects);
    const updatedObj = updatedObjects.find((o: MapObject) => o.id === selectedItem.id);
    if (updatedObj) setSelectedItem({ ...selectedItem, data: updatedObj });
  }, [selectedItem, mapData, updateObject, contextOnObjectsChange, setSelectedItem]);

  const handleLightToggle = useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) return;
    const lightEnabled = selectedItem.data?.lightEnabled !== true;
    const updatedObjects = updateObject(getActiveLayer(mapData).objects, selectedItem.id, { lightEnabled });
    contextOnObjectsChange(updatedObjects);
    const updatedObj = updatedObjects.find((o: MapObject) => o.id === selectedItem.id);
    if (updatedObj) setSelectedItem({ ...selectedItem, data: updatedObj });
  }, [selectedItem, mapData, updateObject, contextOnObjectsChange, setSelectedItem]);

  const handleLightRadiusChange = useCallback((radius: number) => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) return;
    const updatedObjects = updateObject(getActiveLayer(mapData).objects, selectedItem.id, { lightRadius: radius });
    contextOnObjectsChange(updatedObjects);
    const updatedObj = updatedObjects.find((o: MapObject) => o.id === selectedItem.id);
    if (updatedObj) setSelectedItem({ ...selectedItem, data: updatedObj });
  }, [selectedItem, mapData, updateObject, contextOnObjectsChange, setSelectedItem]);

  const handleLightColorSelect = useCallback((color: string) => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) return;
    const updatedObjects = updateObject(getActiveLayer(mapData).objects, selectedItem.id, { lightColor: color });
    contextOnObjectsChange(updatedObjects);
    const updatedObj = updatedObjects.find((o: MapObject) => o.id === selectedItem.id);
    if (updatedObj) setSelectedItem({ ...selectedItem, data: updatedObj });
  }, [selectedItem, mapData, updateObject, contextOnObjectsChange, setSelectedItem]);

  const [showLightColorPicker, setShowLightColorPicker] = useState(false);
  const lightColorBtnRef = useRef<HTMLButtonElement>(null);

  const [measureMovement, setMeasureMovement] = useState(false);
  const measureOriginRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMeasureMovement(false);
    measureOriginRef.current = null;
  }, [selectedItem?.id]);

  if (isDraggingSelection && measureMovement && selectedItem?.type === 'object' && selectedItem.data && !measureOriginRef.current) {
    measureOriginRef.current = { x: selectedItem.data.position.x, y: selectedItem.data.position.y };
  }
  if (!isDraggingSelection) {
    measureOriginRef.current = null;
  }

  // Keep a ref in sync with the freeformPlacementMode prop for the interactions hook
  const freeformPlacementModeRef = useRef(freeformPlacementMode);
  freeformPlacementModeRef.current = freeformPlacementMode;

  // Helper for bidirectional link updates (handles same-layer vs cross-layer)
  const applyLinkUpdate = useCallback((
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
      if (updatedObjects != null) {
        onObjectsChange(updatedObjects);
      }
    } else {
      window.dispatchEvent(new CustomEvent(crossLayerEvent.name, { detail: crossLayerEvent.detail }));
    }
  }, [mapData, onObjectsChange]);

  const [showObjectColorPicker, setShowObjectColorPicker] = useState(false);

  const handleScaleChange = useCallback((newScale: number) => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData?.objects) return;

    const updatedObjects = updateObject(getActiveLayer(mapData).objects, selectedItem.id, { scale: newScale });
    contextOnObjectsChange(updatedObjects);

    const updatedObject = updatedObjects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (updatedObject) {
      setSelectedItem({ ...selectedItem, data: updatedObject });
    }
  }, [selectedItem, mapData, updateObject, contextOnObjectsChange, setSelectedItem]);

  const handleRotateAll = useCallback(() => {
    if (!hasMultiSelection || !mapData) return;

    const activeLayer = getActiveLayer(mapData);
    const updatedObjects = [...(activeLayer.objects ?? [])];
    const updatedTextLabels = [...(activeLayer.textLabels ?? [])];

    for (const item of selectedItems) {
      if (item.type === 'object') {
        const idx = updatedObjects.findIndex((o: MapObject) => o.id === item.id);
        if (idx !== -1) {
          const obj = updatedObjects[idx];
          const currentRotation = obj.rotation ?? 0;
          const nextRotation = rotateByIncrement(currentRotation);
          updatedObjects[idx] = { ...obj, rotation: nextRotation };
        }
      } else if (item.type === 'text') {
        const idx = updatedTextLabels.findIndex((l: { id: string }) => l.id === item.id);
        if (idx !== -1) {
          const label = updatedTextLabels[idx];
          const currentRotation = label.rotation ?? 0;
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
    }).filter((x): x is { id: string; rotation: number | undefined } => x !== null);

    updateSelectedItemsData(updates);
  }, [hasMultiSelection, mapData, selectedItems, onObjectsChange, onTextLabelsChange, updateSelectedItemsData]);

  const handleDuplicateAll = useCallback(() => {
    if (!hasMultiSelection || !mapData) return;

    const activeLayer = getActiveLayer(mapData);
    const updatedObjects = [...(activeLayer.objects ?? [])];
    const updatedTextLabels = [...(activeLayer.textLabels ?? [])];
    const newSelectedItems: SelectedItem[] = [];

    const offsetX = 1;
    const offsetY = 0;

    for (const item of selectedItems) {
      if (item.type === 'object') {
        const sourceObj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
        if (!sourceObj) continue;

        const newId = `obj-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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

        const newId = `text-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const offsetWorld = (mapData.gridSize ?? 32) * 1;
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
  }, [hasMultiSelection, mapData, selectedItems, onObjectsChange, onTextLabelsChange, selectMultiple]);

  const handleDeleteAll = useCallback(() => {
    if (!hasMultiSelection || !mapData) return;

    const activeLayer = getActiveLayer(mapData);
    const selectedObjectIds = new Set(selectedItems.filter((i: SelectedItem) => i.type === 'object').map((i: SelectedItem) => i.id));
    const selectedTextIds = new Set(selectedItems.filter((i: SelectedItem) => i.type === 'text').map((i: SelectedItem) => i.id));

    const updatedObjects = (activeLayer.objects ?? []).filter((obj: MapObject) => !selectedObjectIds.has(obj.id));
    const updatedTextLabels = (activeLayer.textLabels ?? []).filter((label: { id: string }) => !selectedTextIds.has(label.id));

    onObjectsChange(updatedObjects, true);
    onTextLabelsChange(updatedTextLabels, false);

    clearSelection();
  }, [hasMultiSelection, mapData, selectedItems, onObjectsChange, onTextLabelsChange, clearSelection]);

  const handleCopyLink = useCallback(() => {
    if (!selectedItem || !mapData || mapId == null || mapId === '' || notePath == null || notePath === '') return;

    const activeLayer = getActiveLayer(mapData);
    const zoom = mapData.viewState?.zoom ?? 1.0;
    const layerId = mapData.activeLayerId ?? activeLayer?.id ?? 'layer_001';

    let displayText = 'Map Location';
    let x = 0;
    let y = 0;

    if (selectedItem.type === 'object') {
      const obj = activeLayer.objects?.find((o: MapObject) => o.id === selectedItem.id);
      if (!obj) return;
      displayText = obj.label ?? obj.customTooltip ?? 'Object';
      const size = obj.size ?? { width: 1, height: 1 };
      x = obj.position.x + size.width / 2;
      y = obj.position.y + size.height / 2;
    } else if (selectedItem.type === 'text') {
      const label = activeLayer.textLabels?.find((l: TextLabel) => l.id === selectedItem.id);
      if (!label) return;
      displayText = label.content ?? 'Text';
      // Text labels use world coordinates, convert to grid
      const gridSize = mapData.gridSize ?? 32;
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
    freeformDragPreview,
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
  } = useObjectInteractions(currentTool, selectedObjectType, freeformPlacementModeRef);

  const {
    handleNoteButtonClick,
    handleEditNoteLink,
  } = useObjectModals({ onObjectsChange, handleNoteSubmit: (content: string, objectId: string | null) => { if (objectId != null && objectId !== '') handleNoteSubmit(content, objectId); } });

  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  // Wrap handleObjectSelection to intercept clicks when in linking mode
  const wrappedHandleObjectSelection = useCallback((
    clientX: number,
    clientY: number,
    gridX: number,
    gridY: number,
    isTouchActive?: boolean
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
    return handleObjectSelection(clientX, clientY, gridX, gridY, isTouchActive);
  }, [isLinkingMode, linkingFrom, mapData, handleObjectSelection, applyLinkUpdate, cancelLinking, setSelectedItem]);

  const objectHandlersRef = useRef<Record<string, unknown> | null>(null);
  objectHandlersRef.current = {
    handleObjectPlacement,
    handleObjectSelection: wrappedHandleObjectSelection,
    handleObjectDragging, handleObjectResizing,
    stopObjectDragging, stopObjectResizing,
    handleHoverUpdate, handleObjectWheel, handleObjectKeyDown,
    isResizing, resizeCorner,
    edgeSnapMode, setEdgeSnapMode
  };

  useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return objectHandlersRef.current?.[prop];
      }
    });
    registerHandlers('object', proxy);
    return () => unregisterHandlers('object');
  }, [registerHandlers, unregisterHandlers]);

  const handleResizeButtonClick = (e: TargetedMouseEvent<HTMLElement>): void => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();
      setIsResizeMode(!isResizeMode);
    }
  };

  const handleFreeformToggle = (): void => {
    if (selectedItem?.type !== 'object' || !mapData || !geometry) return;
    const obj = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === selectedItem.id);
    if (!obj) return;

    let updates: Partial<MapObject>;
    if (obj.freeform === true) {
      // Snap to grid: find nearest cell from worldPosition
      const nearestGrid = obj.worldPosition != null && geometry.worldToGrid != null
        ? geometry.worldToGrid(obj.worldPosition.x, obj.worldPosition.y)
        : obj.position;
      updates = snapObjectToGrid(nearestGrid);
    } else {
      // Convert to freeform: compute world position from grid cell center
      const cellCenter = geometry.getCellCenter(obj.position.x, obj.position.y);
      const cellSize = (geometry).cellSize ?? mapData.gridSize ?? 1;
      updates = convertObjectToFreeform(obj, cellCenter.worldX, cellCenter.worldY, cellSize);
    }

    const updatedObjects = updateObject(getActiveLayer(mapData).objects, obj.id, updates);
    onObjectsChange(updatedObjects);

    // Update selected item data so toolbar reflects new state
    const updatedObj = updatedObjects.find((o: MapObject) => o.id === obj.id);
    if (updatedObj) {
      setSelectedItem({ type: 'object', id: obj.id, data: updatedObj });
    }
  };

  const handleObjectColorButtonClick = (e: TargetedMouseEvent<HTMLElement>): void => {
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

  const handleLinkObject = useCallback(() => {
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

  const handleMeasureToggle = useCallback(() => {
    setMeasureMovement(prev => !prev);
  }, []);

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
    setSelectedItem({
      type: 'object',
      id: targetObject.id,
      data: targetObject
    });
  }, [selectedItem, mapData, mapId, notePath, setSelectedItem]);

  const handleRemoveLink = useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) return;

    const obj = selectedItem.data;
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
        name: 'windrose-remove-object-link',
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

  useEffect(() => {
    if (!showObjectColorPicker) return undefined;

    const handleClickOutside = (e: MouseEvent | TouchEvent): void => {
      const target = e.target as Element;
      const pickerElement = target.closest('.windrose-color-picker');
      const buttonElement = target.closest('.windrose-object-color-button');

      if (!pickerElement && !buttonElement) {
        if (pendingObjectCustomColorRef.current != null && pendingObjectCustomColorRef.current !== '' && onAddCustomColor) {
          onAddCustomColor(pendingObjectCustomColorRef.current);
          handleObjectColorSelect(pendingObjectCustomColorRef.current);
          pendingObjectCustomColorRef.current = null;
        }

        handleObjectColorPickerClose();
      }
    };

    activeDocument.addEventListener('mousedown', handleClickOutside);
    activeDocument.addEventListener('touchstart', handleClickOutside, { passive: true });

    return () => {
      activeDocument.removeEventListener('mousedown', handleClickOutside);
      activeDocument.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showObjectColorPicker, handleObjectColorSelect, onAddCustomColor, pendingObjectCustomColorRef]);

  // Context menu: hit-test for object, select it, show native menu
  useEffect(() => {
    if (!mapData || !geometry) return undefined;

    const handler = (e: CustomEvent<SelectionContextMenuDetail>): void => {
      const detail = e.detail;
      if (detail.handled === true) return;

      const coords = screenToGrid(detail.clientX, detail.clientY);
      if (!coords) return;

      const activeLayer = getActiveLayer(mapData);
      const obj = getObjectAtPosition(activeLayer.objects ?? [], coords.x, coords.y);
      if (!obj) return;

      detail.handled = true;

      const item = { type: 'object' as const, id: obj.id, data: obj };

      const actions = buildObjectActions(item, {
        onRotate: handleObjectRotation,
        onDuplicate: handleObjectDuplicate,
        onFreeformToggle: handleFreeformToggle,
        onLabel: handleNoteButtonClick as (e?: Event) => void,
        onLinkNote: () => handleEditNoteLink(obj.id),
        onLinkObject: handleLinkObject,
        onFollowLink: handleFollowLink,
        onRemoveLink: handleRemoveLink,
        onCopyLink: handleCopyLink,
        onColorClick: handleObjectColorButtonClick as (e?: Event) => void,
        onResize: handleResizeButtonClick as (e?: Event) => void,
        onDelete: handleObjectDeletion,
        onMeasureToggle: handleMeasureToggle
      }, mapData, { isResizeMode, isMeasuring: measureMovement });

      const menu = new Menu();
      let lastGroup: string | null = null;
      for (const action of actions.filter(a => a.visible && a.disabled !== true)) {
        if (lastGroup != null && lastGroup !== '' && action.group !== lastGroup) menu.addSeparator();
        lastGroup = action.group;
        menu.addItem((mi: MenuItem) => {
          mi.setTitle(action.label);
          mi.setIcon(action.icon);
          if (action.id === 'delete') mi.setWarning(true);
          mi.onClick(() => action.invoke());
        });
      }
      menu.showAtPosition({ x: detail.screenX, y: detail.screenY });
    };

    activeDocument.addEventListener('windrose:selection-context-menu', handler);
    return () => activeDocument.removeEventListener('windrose:selection-context-menu', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- context-menu listener; several handlers are plain fns + measureMovement volatile; handlers captured at invocation time
  }, [mapData, geometry, screenToGrid, isResizeMode]);

  if (showCoordinates || !layerVisibility.objects) {
    return null;
  }

  const getCardinalIndicatorPositions = (selectedObject: MapObject): { north: { x: number; y: number }; south: { x: number; y: number }; east: { x: number; y: number }; west: { x: number; y: number } } | null => {
    if (!canvasRef.current || !containerRef.current || !mapData || !geometry) {
      return null;
    }

    const screenPos = calculateObjectScreenPosition(selectedObject, canvasRef.current, mapData, geometry, containerRef);

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

  const measureTarget = (() => {
    if (!measureMovement || !isDraggingSelection || !measureOriginRef.current || selectedItem?.id == null || selectedItem.id === '' || !mapData) return null;
    const obj = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === selectedItem.id);
    return obj ? obj.position : null;
  })();

  const formattedMeasureDistance = (() => {
    if (!measureOriginRef.current || !measureTarget || !geometry) return null;
    const origin = measureOriginRef.current;
    if (origin.x === measureTarget.x && origin.y === measureTarget.y) return null;
    const globalSettings = getSettings() ?? {};
    const overrides = mapData?.settings?.distanceSettings ?? null;
    const settings = getEffectiveDistanceSettings(mapData?.mapType ?? 'grid', globalSettings, overrides);
    const dist = geometry.getCellDistance(origin.x, origin.y, measureTarget.x, measureTarget.y, { diagonalRule: settings.gridDiagonalRule });
    return formatDistance(dist, settings.distancePerCell, settings.distanceUnit, settings.displayFormat);
  })();

  return (
    <>
      {/* Linking Mode Banner */}
      {isLinkingMode && linkingFrom && (
        <LinkingModeBanner
          linkingFrom={linkingFrom}
          onCancel={cancelLinking}
        />
      )}

      <CardinalIndicators
        indicatorPositions={indicatorPositions}
        isObjectSelected={selectedItem?.type === 'object'}
        isFreeformPreview={!!freeformDragPreview}
        isFreeform={selectedObject?.freeform === true}
      />

      {measureOriginRef.current && measureTarget && formattedMeasureDistance != null && formattedMeasureDistance !== '' && (
        <MeasurementOverlay
          measureOrigin={measureOriginRef.current}
          currentTarget={measureTarget}
          formattedDistance={formattedMeasureDistance}
          isTargetLocked={false}
          geometry={geometry}
          mapData={mapData}
          canvasRef={canvasRef}
        />
      )}

      {hasMultiSelection && selectedItems?.length > 1 && !isDraggingSelection && mapData && geometry && (
        <SelectionActionsOverlay
          selectedItems={selectedItems}
          actions={buildMultiActions(selectionCount || selectedItems.length, {
            onRotateAll: handleRotateAll,
            onDuplicateAll: handleDuplicateAll,
            onDeleteAll: handleDeleteAll
          })}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          geometry={geometry}
          selectionType="multi"
          selectionCount={selectionCount}
        />
      )}

      {selectedItem?.type === 'object' && !hasMultiSelection && !isDraggingSelection && mapData && geometry && (
        <SelectionActionsOverlay
          key={selectedItem.id}
          selectedItems={[selectedItem]}
          actions={[...buildObjectActions(
            selectedItem,
            {
            onRotate: handleObjectRotation,
            onDuplicate: handleObjectDuplicate,
            onFreeformToggle: handleFreeformToggle,
            onLabel: handleNoteButtonClick as (e?: Event) => void,
            onLinkNote: () => handleEditNoteLink(selectedItem?.id),
            onLinkObject: handleLinkObject,
            onFollowLink: handleFollowLink,
            onRemoveLink: handleRemoveLink,
            onCopyLink: handleCopyLink,
            onColorClick: handleObjectColorButtonClick as (e?: Event) => void,
            onResize: handleResizeButtonClick as (e?: Event) => void,
            onDelete: handleObjectDeletion,
            onPlayerToggle: handlePlayerToggle,
            onMeasureToggle: handleMeasureToggle
          }, mapData, { isResizeMode, isPlayer: selectedItem.data?.isPlayer === true, isMeasuring: measureMovement })]}

          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          geometry={geometry}
          selectionType="object"
          isResizeMode={isResizeMode}
          onScaleChange={handleScaleChange}
          showColorPicker={showObjectColorPicker}
          currentColor={selectedItem.data?.color}
          onColorSelect={handleObjectColorSelect}
          onColorPickerClose={handleObjectColorPickerClose}
          onColorReset={handleObjectColorResetWrapper}
          customColors={customColors}
          onAddCustomColor={onAddCustomColor}
          onDeleteCustomColor={onDeleteCustomColor}
          pendingCustomColorRef={pendingObjectCustomColorRef}
          colorButtonRef={objectColorBtnRef}
          isPlayer={selectedItem.data?.isPlayer === true}
          lightEnabled={selectedItem.data?.lightEnabled === true}
          lightRadius={selectedItem.data?.lightRadius ?? 30}
          lightColor={selectedItem.data?.lightColor ?? 'rgba(255, 255, 100, 1)'}
          onLightToggle={handleLightToggle}
          onLightRadiusChange={handleLightRadiusChange}
          onLightColorSelect={handleLightColorSelect}
          showLightColorPicker={showLightColorPicker}
          onLightColorSwatchClick={() => setShowLightColorPicker(prev => !prev)}
          onLightColorPickerClose={() => setShowLightColorPicker(false)}
          lightColorButtonRef={lightColorBtnRef}
          distanceUnit={(() => { const s = mapData?.settings?.overrides ?? {}; const unit = s.distanceUnit as string | undefined; return unit != null && unit !== '' ? unit : 'ft'; })()}
        />
      )}


      {hoveredObject && mousePosition && hoveredObject.type !== 'note_pin' && (
        <div
          className="windrose-object-tooltip"
          style={{
            position: 'absolute',
            left: mousePosition.x + 20,
            top: mousePosition.y + 25,
            pointerEvents: 'none',
            zIndex: Z_INDEX.INTERACTIVE_LAYER
          }}
        >
          {hoveredObject.customTooltip != null && hoveredObject.customTooltip !== ''
            ? `${hoveredObject.label} - ${hoveredObject.customTooltip}`
            : hoveredObject.label
          }
        </div>
      )}
    </>
  );
};

export { ObjectLayer };