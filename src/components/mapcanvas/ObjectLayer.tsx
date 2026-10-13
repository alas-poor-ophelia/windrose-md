/**
 * ObjectLayer.tsx
 *
 * Handles all object-related interactions:
 * - Object placement
 * - Object selection and dragging
 * - Object resizing
 * - Object color and notes
 * - Hover tooltips
 *
 * Focused pieces live in hooks/objects: useObjectInteractions (pointer
 * tools), useMultiSelectionActions (rotate/duplicate/delete all),
 * useObjectLinking (object-to-object links), useObjectContextMenu (native
 * right-click menu), useDragMeasurement (measure-movement readout).
 */

import type { TargetedMouseEvent, VNode } from 'preact';
import type { ToolId } from '#types/tools/tool.types';
import type { ObjectTypeId, MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { HexColor } from '#types/core/common.types';
import type { CustomColor } from '#types/core/common.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { useObjectInteractions } from '../../hooks/objects/useObjectInteractions';
import { useObjectModals } from '../../hooks/objects/useObjectModals';
import { useMultiSelectionActions } from '../../hooks/objects/useMultiSelectionActions';
import { useObjectLinking } from '../../hooks/objects/useObjectLinking';
import { useObjectContextMenu } from '../../hooks/objects/useObjectContextMenu';
import type { ObjectMenuHandlers } from '../../hooks/objects/useObjectContextMenu';
import { useDragMeasurement } from '../../hooks/objects/useDragMeasurement';
import { SelectionActionsOverlay } from '../toolbars/SelectionActionsOverlay';
import { buildObjectActions, buildMultiActions } from '../toolbars/selectionActionBuilders';
import { calculateObjectScreenPosition } from '../../objects/screenPositionUtils';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { convertObjectToFreeform, snapObjectToGrid } from '../../objects/objectOperations';
import { copyDeepLinkToClipboard } from '../../persistence/deepLinkHandler';
import { LinkingModeBanner } from '../overlays/LinkingModeBanner';
import { CardinalIndicators } from './CardinalIndicators';
import { MeasurementOverlay } from '../overlays/MeasurementOverlay';
import { ObjectHoverTooltip } from './ObjectHoverTooltip';

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
  const { canvasRef, containerRef, mapData, mapId, notePath, geometry, distanceOverrides, subHexPath } = useMapState();
  const { updateObject, onObjectsChange: contextOnObjectsChange } = useMapOperations();
  const {
    selectedItem, setSelectedItem,
    selectedItems, hasMultiSelection, selectionCount,
    isDraggingSelection,
    isResizeMode, setIsResizeMode,
    showCoordinates,
    layerVisibility
  } = useMapSelection();

  const applyObjectUpdates = useCallback((updates: Record<string, unknown>) => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) return;
    const updatedObjects = updateObject(getActiveLayer(mapData).objects, selectedItem.id, updates);
    contextOnObjectsChange(updatedObjects);
    const updatedObj = updatedObjects.find((o: MapObject) => o.id === selectedItem.id);
    if (updatedObj) setSelectedItem({ ...selectedItem, data: updatedObj });
  }, [selectedItem, mapData, updateObject, contextOnObjectsChange, setSelectedItem]);

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
    applyObjectUpdates(updates);
  }, [selectedItem, mapData, applyObjectUpdates]);

  const handleLightToggle = useCallback(() => {
    if (selectedItem?.type !== 'object') return;
    applyObjectUpdates({ lightEnabled: selectedItem.data?.lightEnabled !== true });
  }, [selectedItem, applyObjectUpdates]);

  const handleLightRadiusChange = useCallback((radius: number) => {
    applyObjectUpdates({ lightRadius: radius });
  }, [applyObjectUpdates]);

  const handleLightColorSelect = useCallback((color: string) => {
    applyObjectUpdates({ lightColor: color });
  }, [applyObjectUpdates]);

  const handleScaleChange = useCallback((newScale: number) => {
    applyObjectUpdates({ scale: newScale });
  }, [applyObjectUpdates]);

  const [showLightColorPicker, setShowLightColorPicker] = useState(false);
  const lightColorBtnRef = useRef<HTMLButtonElement>(null);
  const [showObjectColorPicker, setShowObjectColorPicker] = useState(false);

  const {
    measureMovement, toggleMeasureMovement, measureOrigin, measureTarget, formattedMeasureDistance
  } = useDragMeasurement({ selectedItem, isDraggingSelection, mapData, geometry, distanceOverrides });

  // Keep a ref in sync with the freeformPlacementMode prop for the interactions hook
  const freeformPlacementModeRef = useRef(freeformPlacementMode);
  freeformPlacementModeRef.current = freeformPlacementMode;

  const { handleRotateAll, handleDuplicateAll, handleDeleteAll } = useMultiSelectionActions(onObjectsChange);

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

    copyDeepLinkToClipboard(displayText, notePath, mapId, x, y, zoom, layerId, subHexPath);
  }, [selectedItem, mapData, mapId, notePath, subHexPath]);

  const {
    isResizing,
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

  const {
    isLinkingMode, linkingFrom, cancelLinking,
    wrappedHandleObjectSelection, handleLinkObject, handleFollowLink, handleRemoveLink
  } = useObjectLinking({ onObjectsChange, handleObjectSelection, selectedItem, setSelectedItem });

  useLayerHandlers('object', {
    handleObjectPlacement,
    handleObjectSelection: wrappedHandleObjectSelection,
    handleObjectDragging, handleObjectResizing,
    stopObjectDragging, stopObjectResizing,
    handleHoverUpdate, handleObjectWheel, handleObjectKeyDown,
    isResizing, edgeSnapMode, setEdgeSnapMode
  });

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

  // Single-object action handlers: shared by the selection toolbar and the
  // right-click menu (which reads them at click time).
  const objectActionHandlers: ObjectMenuHandlers = {
    onRotate: handleObjectRotation,
    onDuplicate: handleObjectDuplicate,
    onFreeformToggle: handleFreeformToggle,
    onLabel: handleNoteButtonClick as (e?: Event) => void,
    onLinkNote: () => { if (selectedItem != null) handleEditNoteLink(selectedItem.id); },
    onLinkObject: handleLinkObject,
    onFollowLink: handleFollowLink,
    onRemoveLink: handleRemoveLink,
    onCopyLink: handleCopyLink,
    onColorClick: handleObjectColorButtonClick as (e?: Event) => void,
    onResize: handleResizeButtonClick as (e?: Event) => void,
    onDelete: handleObjectDeletion,
    onPlayerToggle: handlePlayerToggle,
    onMeasureToggle: toggleMeasureMovement
  };

  useObjectContextMenu({
    handlers: objectActionHandlers,
    idActions: {
      rotate: handleObjectRotation,
      duplicate: handleObjectDuplicate,
      delete: handleObjectDeletion,
      editNoteLink: handleEditNoteLink
    },
    measureMovement
  });

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

  const selectedObject = selectedItem?.type === 'object' && mapData
    ? getActiveLayer(mapData).objects?.find((obj: MapObject) => obj.id === selectedItem.id)
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

      <CardinalIndicators
        indicatorPositions={indicatorPositions}
        isObjectSelected={selectedItem?.type === 'object'}
        isFreeformPreview={!!freeformDragPreview}
        isFreeform={selectedObject?.freeform === true}
      />

      {measureOrigin && measureTarget && formattedMeasureDistance != null && formattedMeasureDistance !== '' && (
        <MeasurementOverlay
          waypoints={[measureOrigin]}
          previewTarget={measureTarget}
          formattedTotal={formattedMeasureDistance}
          formattedSegments={[]}
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
            objectActionHandlers,
            mapData,
            { isResizeMode, isPlayer: selectedItem.data?.isPlayer === true, isMeasuring: measureMovement }
          )]}
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

      <ObjectHoverTooltip />
    </>
  );
};

export { ObjectLayer };