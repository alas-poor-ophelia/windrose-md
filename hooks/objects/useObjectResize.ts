/**
 * useObjectResize.ts
 *
 * Object resize via corner handles.
 * Extracted from useObjectInteractions.ts.
 */

import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { IGeometry } from '#types/core/geometry.types';
import type {
  ResizeCorner,
  ObjectDragStart,
} from '#types/hooks/objectInteractions.types';
import type { MapStateContextValue, MapOperationsContextValue, MapSelectionContextValue } from '#types/contexts/context.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

interface ScreenPositionResult {
  screenX: number;
  screenY: number;
  objectWidth: number;
  objectHeight: number;
}

const { applyInverseRotation } = await requireModuleByName("screenPositionUtils.ts") as {
  applyInverseRotation: (x: number, y: number, width: number, height: number, angle: number) => { x: number; y: number };
};

const { useMapState } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateContextValue;
};

const { useMapOperations } = await requireModuleByName("MapContext.tsx") as {
  useMapOperations: () => MapOperationsContextValue;
};

const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx") as {
  useMapSelection: () => MapSelectionContextValue;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

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

  const [isResizing, setIsResizing] = dc.useState(false);
  const [resizeCorner, setResizeCorner] = dc.useState(null);
  const resizeInitialStateRef = dc.useRef(null);

  const beginResize = dc.useCallback((corner: ResizeCorner, objects: MapObject[], dragStartData: ObjectDragStart): void => {
    resizeInitialStateRef.current = [...objects];
    setIsResizing(true);
    setResizeCorner(corner);
    setDragStart(dragStartData);
  }, [setDragStart]);

  const getClickedCorner = dc.useCallback((
    clientX: number,
    clientY: number,
    object: MapObject
  ): ResizeCorner => {
    if (!object || !mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let x = clientX - rect.left;
    let y = clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;

    const { viewState, northDirection, mapType } = mapData;
    const { zoom, center } = viewState;

    let offsetX: number, offsetY: number, objectWidth: number, objectHeight: number;
    if (mapType === 'hex') {
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;

      const hexSize = geometry.hexSize!;
      const size = object.size || { width: 1, height: 1 };
      objectWidth = size.width * hexSize * zoom;
      objectHeight = size.height * hexSize * zoom;
    } else {
      const scaledGridSize = geometry.getScaledCellSize!(zoom);
      offsetX = canvas.width / 2 - center.x * scaledGridSize;
      offsetY = canvas.height / 2 - center.y * scaledGridSize;

      const size = object.size || { width: 1, height: 1 };
      objectWidth = size.width * scaledGridSize;
      objectHeight = size.height * scaledGridSize;
    }

    const rotated = applyInverseRotation(x, y, canvas.width, canvas.height, northDirection);
    x = rotated.x;
    y = rotated.y;

    let screenX: number, screenY: number;
    if (mapType === 'hex') {
      const { worldX, worldY } = geometry.hexToWorld!(object.position.x, object.position.y);
      screenX = offsetX + worldX * zoom;
      screenY = offsetY + worldY * zoom;

      screenX -= objectWidth / 2;
      screenY -= objectHeight / 2;
    } else {
      const pos = geometry.gridToScreen!(object.position.x, object.position.y, offsetX, offsetY, zoom);
      screenX = pos.screenX;
      screenY = pos.screenY;
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

  const handleObjectResizing = dc.useCallback((e: PointerEvent | MouseEvent | TouchEvent): boolean => {
    if (!isResizing || !dragStart || !mapData || selectedItem?.type !== 'object') {
      return false;
    }

    e.preventDefault();
    e.stopPropagation();

    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToGrid(clientX, clientY);
    if (!coords) return true;

    const { x, y } = coords;
    const originalObject = dragStart.object!;
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

  const stopObjectResizing = dc.useCallback((): boolean => {
    if (isResizing) {
      setIsResizing(false);
      setResizeCorner(null);
      setDragStart(null);

      if (resizeInitialStateRef.current !== null) {
        onObjectsChange(getActiveLayer(mapData!).objects, false);
        resizeInitialStateRef.current = null;
      }
      return true;
    }
    return false;
  }, [isResizing, setIsResizing, setResizeCorner, setDragStart, onObjectsChange, mapData]
  );

  return { isResizing, resizeCorner, getClickedCorner, handleObjectResizing, stopObjectResizing, beginResize };
}

return { useObjectResize };
