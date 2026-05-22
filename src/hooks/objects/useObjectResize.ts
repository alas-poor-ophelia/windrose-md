/**
 * useObjectResize.ts
 *
 * Object resize via corner handles.
 * Extracted from useObjectInteractions.ts.
 */

import type { MapObject } from '#types/objects/object.types';
import type {
  ResizeCorner,
  ObjectDragStart,
} from '#types/hooks/objectInteractions.types';

import { useCallback, useRef, useState } from 'preact/hooks';
import { applyInverseRotation } from '../../objects/screenPositionUtils';
import { useMapState } from '../../context/MapContext';
import { useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { getActiveLayer } from '../../persistence/layerAccessor';















function useObjectResize(): {
  isResizing: boolean;
  resizeCorner: ResizeCorner;
  getClickedCorner: (clientX: number, clientY: number, object: MapObject) => ResizeCorner;
  handleObjectResizing: (e: PointerEvent | MouseEvent | TouchEvent) => boolean;
  stopObjectResizing: () => boolean;
  beginResize: (corner: ResizeCorner, objects: MapObject[], dragStartData: ObjectDragStart) => void;
} {
  const { mapData, geometry, canvasRef, screenToGrid, getClientCoords } = useMapState();
  const { updateObject, onObjectsChange, isAreaFree } = useMapOperations();
  const { selectedItem, setSelectedItem, isResizeMode, dragStart, setDragStart } = useMapSelection();

  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<ResizeCorner>(null);
  const resizeInitialStateRef = useRef<MapObject[] | null>(null);

  const beginResize = useCallback((corner: ResizeCorner, objects: MapObject[], dragStartData: ObjectDragStart): void => {
    resizeInitialStateRef.current = [...objects];
    setIsResizing(true);
    setResizeCorner(corner);
    setDragStart(dragStartData);
  }, [setDragStart]);

  const getClickedCorner = useCallback((
    clientX: number,
    clientY: number,
    object: MapObject
  ): ResizeCorner => {
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let x = clientX - rect.left;
    let y = clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;

    if (mapData == null) return null;
    const { viewState, mapType } = mapData;
    if (viewState == null) return null;
    const { zoom, center } = viewState;
    const northDirection = mapData.northDirection ?? 0;

    let offsetX: number, offsetY: number, objectWidth: number, objectHeight: number;
    if (mapType === 'hex') {
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;

      const hexSize = geometry.hexSize ?? 1;
      const size = object.size ?? { width: 1, height: 1 };
      objectWidth = size.width * hexSize * zoom;
      objectHeight = size.height * hexSize * zoom;
    } else {
      const scaledGridSize = geometry.getScaledCellSize != null ? geometry.getScaledCellSize(zoom) : zoom;
      offsetX = canvas.width / 2 - center.x * scaledGridSize;
      offsetY = canvas.height / 2 - center.y * scaledGridSize;

      const size = object.size ?? { width: 1, height: 1 };
      objectWidth = size.width * scaledGridSize;
      objectHeight = size.height * scaledGridSize;
    }

    const rotated = applyInverseRotation(x, y, canvas.width, canvas.height, northDirection);
    x = rotated.x;
    y = rotated.y;

    let screenX: number, screenY: number;
    if (mapType === 'hex' && geometry.hexToWorld != null) {
      const { worldX, worldY } = geometry.hexToWorld(object.position.x, object.position.y);
      screenX = offsetX + worldX * zoom;
      screenY = offsetY + worldY * zoom;

      screenX -= objectWidth / 2;
      screenY -= objectHeight / 2;
    } else if (geometry.gridToScreen != null) {
      const pos = geometry.gridToScreen(object.position.x, object.position.y, offsetX, offsetY, zoom);
      screenX = pos.screenX;
      screenY = pos.screenY;
    } else {
      return null;
    }

    const handleSize = isResizeMode ? 14 : 8;
    const hitMargin = handleSize / 2 + 4;

    const corners = [
      { name: 'tl' as const, cx: screenX + 2, cy: screenY + 2 },
      { name: 'tr' as const, cx: screenX + objectWidth - 2, cy: screenY + 2 },
      { name: 'bl' as const, cx: screenX + 2, cy: screenY + objectHeight - 2 },
      { name: 'br' as const, cx: screenX + objectWidth - 2, cy: screenY + objectHeight - 2 }
    ];

    for (const corner of corners) {
      const dx = x - corner.cx;
      const dy = y - corner.cy;
      if (Math.abs(dx) <= hitMargin && Math.abs(dy) <= hitMargin) {
        return corner.name;
      }
    }

    return null;
  }, [mapData, isResizeMode, canvasRef, geometry]);

  const handleObjectResizing = useCallback((e: PointerEvent | MouseEvent | TouchEvent): boolean => {
    if (!isResizing || !dragStart || !mapData || selectedItem?.type !== 'object') {
      return false;
    }

    e.preventDefault();
    e.stopPropagation();

    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToGrid(clientX, clientY);
    if (!coords) return true;

    const { x, y } = coords;
    if (!dragStart.object) return false;
    const originalObject = dragStart.object as { position: { x: number; y: number }; size?: { width: number; height: number } };
    const originalPos = originalObject.position;
    const originalSize = originalObject.size || { width: 1, height: 1 };

    let newX = originalPos.x;
    let newY = originalPos.y;
    let newWidth = originalSize.width;
    let newHeight = originalSize.height;

    switch (resizeCorner) {
      case 'tl':
        newX = Math.min(x, originalPos.x + originalSize.width - 1);
        newY = Math.min(y, originalPos.y + originalSize.height - 1);
        newWidth = originalPos.x + originalSize.width - newX;
        newHeight = originalPos.y + originalSize.height - newY;
        break;
      case 'tr':
        newY = Math.min(y, originalPos.y + originalSize.height - 1);
        newWidth = Math.max(1, x - originalPos.x + 1);
        newHeight = originalPos.y + originalSize.height - newY;
        break;
      case 'bl':
        newX = Math.min(x, originalPos.x + originalSize.width - 1);
        newWidth = originalPos.x + originalSize.width - newX;
        newHeight = Math.max(1, y - originalPos.y + 1);
        break;
      case 'br':
        newWidth = Math.max(1, x - originalPos.x + 1);
        newHeight = Math.max(1, y - originalPos.y + 1);
        break;
    }

    newWidth = Math.min(newWidth, 5);
    newHeight = Math.min(newHeight, 5);

    let finalWidth = newWidth;
    let finalHeight = newHeight;
    let finalX = newX;
    let finalY = newY;
    let resizeSucceeded = false;

    if (isAreaFree(getActiveLayer(mapData).objects, newX, newY, newWidth, newHeight, selectedItem.id)) {
      resizeSucceeded = true;
    }

    if (!resizeSucceeded && newWidth !== originalSize.width) {
      if (isAreaFree(getActiveLayer(mapData).objects, newX, originalPos.y, newWidth, originalSize.height, selectedItem.id)) {
        finalWidth = newWidth;
        finalHeight = originalSize.height;
        finalX = newX;
        finalY = originalPos.y;
        resizeSucceeded = true;
      }
    }

    if (!resizeSucceeded && newHeight !== originalSize.height) {
      if (isAreaFree(getActiveLayer(mapData).objects, originalPos.x, newY, originalSize.width, newHeight, selectedItem.id)) {
        finalWidth = originalSize.width;
        finalHeight = newHeight;
        finalX = originalPos.x;
        finalY = newY;
        resizeSucceeded = true;
      }
    }

    if (resizeSucceeded) {
      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        selectedItem.id,
        {
          position: { x: finalX, y: finalY },
          size: { width: finalWidth, height: finalHeight }
        }
      );
      onObjectsChange(updatedObjects, true);

      const updatedObject = updatedObjects.find((obj: MapObject) => obj.id === selectedItem.id);
      if (updatedObject) {
        setSelectedItem({
          ...selectedItem,
          id: selectedItem.id
        });
      }
    }
    return true;
  }, [isResizing, dragStart, mapData, selectedItem, resizeCorner,
    getClientCoords, screenToGrid, isAreaFree, updateObject, onObjectsChange, setSelectedItem]
  );

  const stopObjectResizing = useCallback((): boolean => {
    if (isResizing) {
      setIsResizing(false);
      setResizeCorner(null);
      setDragStart(null);

      if (resizeInitialStateRef.current !== null) {
        onObjectsChange(getActiveLayer(mapData).objects, false);
        resizeInitialStateRef.current = null;
      }
      return true;
    }
    return false;
  }, [isResizing, setIsResizing, setResizeCorner, setDragStart, onObjectsChange, mapData]
  );

  return { isResizing, resizeCorner, getClickedCorner, handleObjectResizing, stopObjectResizing, beginResize };
}

export { useObjectResize };