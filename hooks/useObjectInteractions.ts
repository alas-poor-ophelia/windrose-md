/**
 * useObjectInteractions.ts
 *
 * Custom hook for managing object interactions including:
 * - Object placement on click
 * - Object selection
 * - Object dragging with grid snapping
 * - Object resizing with corner handles
 * - Hover state management
 * - Object note and color management
 * - Button position calculations for object UI
 */

// Type-only imports
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { ToolId } from '#types/tools/tool.types';
import type {
  ResizeCorner,
  ObjectDragStart,
  ButtonPosition,
  MousePosition,
  UseObjectInteractionsResult,
} from '#types/hooks/objectInteractions.types';
import type { SelectedItem } from '#types/hooks/groupDrag.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const rotationOpsPath = dc.resolvePath("utils/rotationOperations.ts");
const { getNextRotation } = await dc.require(rotationOpsPath) as {
  getNextRotation: (currentRotation: number) => number
};

// Context types
interface MapStateValue {
  geometry: (IGeometry & {
    cellSize: number;
    hexSize?: number;
    isWithinBounds?: (x: number, y: number) => boolean;
    getScaledCellSize?: (zoom: number) => number;
    hexToWorld?: (x: number, y: number) => { worldX: number; worldY: number };
    gridToScreen?: (x: number, y: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number };
    gridToWorld?: (x: number, y: number) => { worldX: number; worldY: number };
    worldToGrid?: (worldX: number, worldY: number) => Point;
    width?: number;
    toOffsetCoords: (x: number, y: number) => { col: number; row: number };
  }) | null;
  canvasRef: { current: HTMLCanvasElement | null };
  containerRef: { current: HTMLElement | null };
  mapData: MapData | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  getClientCoords: (e: PointerEvent | MouseEvent | TouchEvent) => { clientX: number; clientY: number };
  GridGeometry: unknown;
}

interface MapOperationsValue {
  getObjectAtPosition: (objects: MapObject[], x: number, y: number) => MapObject | null;
  addObject: (objects: MapObject[], type: string, x: number, y: number) => MapObject[];
  updateObject: (objects: MapObject[], id: string, updates: Partial<MapObject>) => MapObject[];
  removeObject: (objects: MapObject[], id: string) => MapObject[];
  isAreaFree: (objects: MapObject[], x: number, y: number, width: number, height: number, excludeId?: string) => boolean;
  onObjectsChange: (objects: MapObject[], skipHistory?: boolean) => void;
}

interface MapSelectionValue {
  selectedItem: SelectedItem | null;
  setSelectedItem: (item: SelectedItem | null) => void;
  isDraggingSelection: boolean;
  setIsDraggingSelection: (value: boolean) => void;
  dragStart: ObjectDragStart | null;
  setDragStart: (value: ObjectDragStart | null) => void;
  isResizeMode: boolean;
  setIsResizeMode: (value: boolean) => void;
  hoveredObject: MapObject | null;
  setHoveredObject: (obj: MapObject | null) => void;
  mousePosition: MousePosition | null;
  setMousePosition: (pos: MousePosition | null) => void;
}

interface ScreenPositionResult {
  screenX: number;
  screenY: number;
  objectWidth: number;
  objectHeight: number;
}

const { calculateObjectScreenPosition: calculateScreenPos, applyInverseRotation } = await requireModuleByName("screenPositionUtils.ts") as {
  calculateObjectScreenPosition: (object: MapObject, canvas: HTMLCanvasElement, mapData: MapData, geometry: IGeometry) => ScreenPositionResult | null;
  applyInverseRotation: (x: number, y: number, width: number, height: number, angle: number) => { x: number; y: number };
};

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateValue;
  useMapOperations: () => MapOperationsValue;
};

const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx") as {
  useMapSelection: () => MapSelectionValue;
};

const { calculateEdgeAlignment, getAlignmentOffset, placeObject, canPlaceObjectAt, removeObjectFromHex, generateObjectId } = await requireModuleByName("objectOperations.ts") as {
  calculateEdgeAlignment: (fractionalX: number, fractionalY: number, gridX: number, gridY: number) => string;
  getAlignmentOffset: (alignment: string, cellSize: number) => { x: number; y: number };
  placeObject: (objects: MapObject[], type: string, x: number, y: number, options: { mapType: string; alignment?: string }) => { success: boolean; objects: MapObject[] };
  canPlaceObjectAt: (objects: MapObject[], x: number, y: number, mapType: string) => boolean;
  removeObjectFromHex: (objects: MapObject[], id: string) => MapObject[];
  generateObjectId: () => string;
};

const { getClickedObjectInCell, getObjectsInCell, canAddObjectToCell, assignSlot } = await requireModuleByName("hexSlotPositioner.ts") as {
  getClickedObjectInCell: (objects: MapObject[], x: number, y: number, offsetX: number, offsetY: number, orientation: string) => MapObject | null;
  getObjectsInCell: (objects: MapObject[], x: number, y: number) => MapObject[];
  canAddObjectToCell: (objects: MapObject[], x: number, y: number) => boolean;
  assignSlot: (occupiedSlots: number[]) => number;
};

const { HexGeometry } = await requireModuleByName("HexGeometry.ts") as {
  HexGeometry: new (...args: unknown[]) => IGeometry;
};

const { getActiveLayer, isCellFogged } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
  isCellFogged: (layer: MapLayer, col: number, row: number) => boolean;
};

const useObjectInteractions = (
  currentTool: ToolId,
  selectedObjectType: string | null,
  onAddCustomColor: ((color: string) => void) | undefined,
  customColors: string[]
): UseObjectInteractionsResult => {
  const {
    geometry,
    canvasRef,
    containerRef,
    mapData,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry
  } = useMapState();

  const {
    getObjectAtPosition,
    addObject,
    updateObject,
    removeObject,
    isAreaFree,
    onObjectsChange
  } = useMapOperations();

  const {
    selectedItem,
    setSelectedItem,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    isResizeMode,
    setIsResizeMode,
    hoveredObject,
    setHoveredObject,
    mousePosition,
    setMousePosition
  } = useMapSelection();

  const [isResizing, setIsResizing] = dc.useState<boolean>(false);
  const [resizeCorner, setResizeCorner] = dc.useState<ResizeCorner>(null);
  const resizeInitialStateRef = dc.useRef<MapObject[] | null>(null);
  const dragInitialStateRef = dc.useRef<MapObject[] | null>(null);

  const [edgeSnapMode, setEdgeSnapMode] = dc.useState<boolean>(false);
  const longPressTimerRef = dc.useRef<ReturnType<typeof setTimeout> | null>(null);
  const altKeyPressedRef = dc.useRef<boolean>(false);

  const objectColorBtnRef = dc.useRef<HTMLButtonElement | null>(null);
  const pendingObjectCustomColorRef = dc.useRef<string | null>(null);

  dc.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Alt' && !altKeyPressedRef.current) {
        altKeyPressedRef.current = true;
        if (currentTool === 'addObject' || selectedItem?.type === 'object') {
          setEdgeSnapMode(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') {
        altKeyPressedRef.current = false;
        setEdgeSnapMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedItem, currentTool]);

  dc.useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const prevToolRef = dc.useRef<ToolId>(currentTool);
  dc.useEffect(() => {
    if (!selectedItem || selectedItem.type !== 'object') {
      setEdgeSnapMode(false);
    }

    if (prevToolRef.current !== currentTool && selectedItem) {
      if (currentTool !== 'select') {
        setSelectedItem(null);
        setEdgeSnapMode(false);
      }
    }
    prevToolRef.current = currentTool;
  }, [currentTool, selectedItem, setSelectedItem]);

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

  const handleObjectPlacement = dc.useCallback((
    gridX: number,
    gridY: number,
    clientX: number,
    clientY: number
  ): boolean => {
    if (currentTool !== 'addObject' || !selectedObjectType) {
      return false;
    }

    if (geometry && geometry.isWithinBounds) {
      if (!geometry.isWithinBounds(gridX, gridY)) {
        return true;
      }
    }

    const mapType = mapData!.mapType || 'grid';

    if (!canPlaceObjectAt(getActiveLayer(mapData!).objects || [], gridX, gridY, mapType)) {
      return true;
    }

    let alignment = 'center';
    if (mapType === 'grid' && edgeSnapMode && clientX !== undefined && clientY !== undefined) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords && geometry) {
        const cellSize = mapData!.gridSize || geometry.cellSize;
        const fractionalX = worldCoords.worldX / cellSize;
        const fractionalY = worldCoords.worldY / cellSize;
        alignment = calculateEdgeAlignment(fractionalX, fractionalY, gridX, gridY);
      }
    }

    const result = placeObject(
      getActiveLayer(mapData!).objects || [],
      selectedObjectType,
      gridX,
      gridY,
      { mapType, alignment }
    );

    if (result.success) {
      onObjectsChange(result.objects);
    }
    return true;
  }, [currentTool, selectedObjectType, mapData, geometry, edgeSnapMode, onObjectsChange, screenToWorld]);

  const handleObjectSelection = dc.useCallback((
    clientX: number,
    clientY: number,
    gridX: number,
    gridY: number
  ): boolean => {
    if (currentTool !== 'select') {
      return false;
    }

    if (selectedItem?.type === 'object' && isResizeMode) {
      const selectedObject = getActiveLayer(mapData!).objects?.find((obj: MapObject) => obj.id === selectedItem.id);
      if (selectedObject) {
        const corner = getClickedCorner(clientX, clientY, selectedObject);
        if (corner) {
          resizeInitialStateRef.current = [...(getActiveLayer(mapData!).objects || [])];
          setIsResizing(true);
          setResizeCorner(corner);
          setDragStart({ x: clientX, y: clientY, gridX, gridY, object: { ...selectedObject } });
          return true;
        }
      }
    }

    let object: MapObject | null = null;
    if (mapData!.mapType === 'hex' && geometry instanceof HexGeometry) {
      const cellObjects = getObjectsInCell(getActiveLayer(mapData!).objects || [], gridX, gridY);

      if (cellObjects.length > 1) {
        const worldCoords = screenToWorld(clientX, clientY);
        if (worldCoords && geometry.hexToWorld) {
          const { worldX: hexCenterX, worldY: hexCenterY } = geometry.hexToWorld(gridX, gridY);
          const hexWidth = geometry.hexSize! * 2;
          const clickOffsetX = (worldCoords.worldX - hexCenterX) / hexWidth;
          const clickOffsetY = (worldCoords.worldY - hexCenterY) / hexWidth;

          object = getClickedObjectInCell(
            getActiveLayer(mapData!).objects || [],
            gridX,
            gridY,
            clickOffsetX,
            clickOffsetY,
            mapData!.orientation || 'flat'
          );
        }
      } else if (cellObjects.length === 1) {
        object = cellObjects[0];
      }
    } else {
      object = getObjectAtPosition(getActiveLayer(mapData!).objects || [], gridX, gridY);
    }

    if (object) {
      const activeLayer = getActiveLayer(mapData!);
      if (activeLayer.fogOfWar?.enabled) {
        const objOffset = geometry!.toOffsetCoords(object.position.x, object.position.y);
        if (isCellFogged(activeLayer, objOffset.col, objOffset.row)) {
          object = null;
        }
      }
    }

    if (object) {
      const isAlreadySelected = selectedItem?.type === 'object' && selectedItem.id === object.id;

      if (isAlreadySelected) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }

        if (mapData!.mapType !== 'hex') {
          longPressTimerRef.current = setTimeout(() => {
            setEdgeSnapMode(prev => !prev);

            if (navigator.vibrate) {
              navigator.vibrate(50);
            }

            longPressTimerRef.current = null;
          }, 500);
        }

        dragInitialStateRef.current = [...(getActiveLayer(mapData!).objects || [])];
        setIsDraggingSelection(true);
        const offsetX = gridX - object.position.x;
        const offsetY = gridY - object.position.y;
        setDragStart({ x: clientX, y: clientY, gridX, gridY, offsetX, offsetY });
        setIsResizeMode(false);
      } else {
        setSelectedItem({ type: 'object', id: object.id, data: object });
        setIsResizeMode(false);

        dragInitialStateRef.current = [...(getActiveLayer(mapData!).objects || [])];
        setIsDraggingSelection(true);
        const offsetX = gridX - object.position.x;
        const offsetY = gridY - object.position.y;
        setDragStart({
          x: clientX,
          y: clientY,
          gridX,
          gridY,
          offsetX,
          offsetY,
          objectId: object.id
        });

        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }

        if (mapData!.mapType !== 'hex') {
          longPressTimerRef.current = setTimeout(() => {
            setEdgeSnapMode(true);

            if (navigator.vibrate) {
              navigator.vibrate(50);
            }

            longPressTimerRef.current = null;
          }, 500);
        }
      }

      return true;
    }

    return false;
  }, [currentTool, selectedObjectType, selectedItem, isResizeMode, mapData, geometry,
    getObjectAtPosition, setSelectedItem, setIsDraggingSelection, setDragStart, setIsResizing, screenToWorld, getClickedCorner
  ]);

  const handleObjectDragging = dc.useCallback((e: PointerEvent | MouseEvent | TouchEvent): boolean => {
    const isDraggingObject = selectedItem?.type === 'object' || dragStart?.objectId;
    if (!isDraggingSelection || !isDraggingObject || !dragStart || !mapData) {
      return false;
    }

    const objectId = selectedItem?.id || dragStart.objectId;

    const { clientX, clientY } = getClientCoords(e);

    if (longPressTimerRef.current) {
      const dx = clientX - dragStart.x;
      const dy = clientY - dragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 5) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    e.preventDefault();
    e.stopPropagation();

    const coords = screenToGrid(clientX, clientY);
    if (!coords) return true;

    const { x, y } = coords;

    const offsetX = dragStart.offsetX || 0;
    const offsetY = dragStart.offsetY || 0;
    const targetX = x - offsetX;
    const targetY = y - offsetY;

    if (x !== dragStart.gridX || y !== dragStart.gridY) {
      const currentObject = getActiveLayer(mapData).objects?.find((o: MapObject) => o.id === objectId);
      if (!currentObject) return true;

      const isMovingWithinSameCell = currentObject.position.x === targetX && currentObject.position.y === targetY;

      if (mapData.mapType === 'hex' && !isMovingWithinSameCell) {
        const targetCellObjects = getObjectsInCell(getActiveLayer(mapData).objects || [], targetX, targetY);

        if (targetCellObjects.length >= 4) {
          return true;
        }

        const targetSlots = targetCellObjects.map((o: MapObject) => o.slot ?? 0);
        const newSlot = assignSlot(targetSlots);

        let updatedObjects = removeObjectFromHex(getActiveLayer(mapData).objects, objectId!);

        updatedObjects = [...updatedObjects, {
          ...currentObject,
          position: { x: targetX, y: targetY },
          slot: newSlot
        }];

        onObjectsChange(updatedObjects, true);

        setDragStart({ x: clientX, y: clientY, gridX: x, gridY: y, offsetX, offsetY, objectId });
        const movedObject = updatedObjects.find((obj: MapObject) => obj.id === objectId);
        if (movedObject) {
          setSelectedItem({
            type: 'object',
            id: objectId!
          });
        }
      } else {
        const existingObj = getObjectAtPosition(getActiveLayer(mapData).objects || [], targetX, targetY);

        if (!existingObj || existingObj.id === objectId) {
          let alignment = 'center';
          if (edgeSnapMode) {
            const worldCoords = screenToWorld(clientX, clientY);
            if (worldCoords && geometry?.worldToGrid) {
              const fractionalX = worldCoords.worldX / (mapData.gridSize || geometry.cellSize);
              const fractionalY = worldCoords.worldY / (mapData.gridSize || geometry.cellSize);
              alignment = calculateEdgeAlignment(fractionalX, fractionalY, targetX, targetY);
            }
          }

          const updatedObjects = updateObject(
            getActiveLayer(mapData).objects,
            objectId!,
            { position: { x: targetX, y: targetY }, alignment }
          );
          onObjectsChange(updatedObjects, true);

          setDragStart({ x: clientX, y: clientY, gridX: x, gridY: y, offsetX, offsetY, objectId });
          const updatedObject = updatedObjects.find((obj: MapObject) => obj.id === objectId);
          if (updatedObject) {
            setSelectedItem({
              type: 'object',
              id: objectId!
            });
          }
        }
      }
    }
    return true;
  }, [isDraggingSelection, selectedItem, dragStart, mapData, edgeSnapMode, geometry,
    getClientCoords, screenToGrid, screenToWorld, updateObject, onObjectsChange, setDragStart, setSelectedItem, getObjectAtPosition]);

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

  const handleHoverUpdate = dc.useCallback((e: PointerEvent | MouseEvent): void => {
    const touchEvent = e as unknown as TouchEvent;
    if (!touchEvent.touches && mapData && getActiveLayer(mapData).objects) {
      const { clientX, clientY } = getClientCoords(e);
      const coords = screenToGrid(clientX, clientY);
      if (coords) {
        let obj: MapObject | null = null;

        const { x, y } = coords;

        if (mapData.mapType === 'hex' && geometry instanceof HexGeometry) {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords) {
            const hexCenter = geometry.gridToWorld!(x, y);
            const clickOffsetX = (worldCoords.worldX - hexCenter.worldX) / geometry.width!;
            const clickOffsetY = (worldCoords.worldY - hexCenter.worldY) / geometry.width!;

            obj = getClickedObjectInCell(
              getActiveLayer(mapData).objects,
              x, y,
              clickOffsetX, clickOffsetY,
              mapData.orientation || 'flat'
            );
          }
        }

        if (!obj) {
          obj = getObjectAtPosition(getActiveLayer(mapData).objects, x, y);
        }

        if (obj) {
          const activeLayer = getActiveLayer(mapData);
          if (activeLayer.fogOfWar?.enabled) {
            const objOffset = geometry!.toOffsetCoords(obj.position.x, obj.position.y);
            if (isCellFogged(activeLayer, objOffset.col, objOffset.row)) {
              obj = null;
            }
          }
        }

        setHoveredObject(obj);

        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const relativeX = clientX - rect.left;
          const relativeY = clientY - rect.top;
          setMousePosition({ x: relativeX, y: relativeY });
        }
      } else {
        setHoveredObject(null);
      }
    }
  }, [mapData, geometry, getClientCoords, screenToGrid, screenToWorld, getObjectAtPosition, setHoveredObject, setMousePosition, containerRef]
  );

  const stopObjectDragging = dc.useCallback((): boolean => {
    const isDraggingObject = selectedItem?.type === 'object' || dragStart?.objectId;
    if (isDraggingSelection && isDraggingObject) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      setIsDraggingSelection(false);
      setDragStart(null);

      if (dragInitialStateRef.current !== null) {
        onObjectsChange(getActiveLayer(mapData!).objects, false);
        dragInitialStateRef.current = null;
      }
      return true;
    }
    return false;
  }, [isDraggingSelection, selectedItem, dragStart, setIsDraggingSelection, setDragStart, onObjectsChange, mapData]);

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

  const handleObjectKeyDown = dc.useCallback((e: KeyboardEvent): boolean => {
    if (selectedItem?.type !== 'object') {
      return false;
    }

    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      const currentObject = getActiveLayer(mapData!).objects?.find((obj: MapObject) => obj.id === selectedItem.id);
      const currentRotation = currentObject?.rotation || 0;
      const nextRotation = getNextRotation(currentRotation);

      const updatedObjects = updateObject(
        getActiveLayer(mapData!).objects,
        selectedItem.id,
        { rotation: nextRotation }
      );
      onObjectsChange(updatedObjects);

      return true;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const updatedObjects = removeObject(getActiveLayer(mapData!).objects, selectedItem.id);
      onObjectsChange(updatedObjects);
      setSelectedItem(null);
      setIsResizeMode(false);
      return true;
    }

    if (e.key === 'Escape' && isResizeMode) {
      e.preventDefault();
      setIsResizeMode(false);
      return true;
    }

    return false;
  }, [selectedItem, isResizeMode, mapData, removeObject, updateObject, onObjectsChange, setSelectedItem, setIsResizeMode]
  );

  const handleObjectWheel = dc.useCallback((e: WheelEvent): boolean => {
    if (selectedItem?.type !== 'object' || !mapData) {
      return false;
    }

    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return false;

    const { x, y } = coords;
    const selectedObject = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!selectedObject) return false;

    const isOverObject = x >= selectedObject.position.x &&
                     x < selectedObject.position.x + (selectedObject.size?.width || 1) &&
                     y >= selectedObject.position.y &&
                     y < selectedObject.position.y + (selectedObject.size?.height || 1);

    if (!isOverObject) return false;

    e.preventDefault();

    const currentScale = selectedObject.scale ?? 1.0;
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.25, Math.min(1.3, currentScale + delta));

    if (newScale !== currentScale) {
      const updatedObjects = updateObject(getActiveLayer(mapData).objects, selectedItem.id, { scale: newScale });
      onObjectsChange(updatedObjects);
    }

    return true;
  }, [selectedItem, mapData, screenToGrid, updateObject, onObjectsChange]);

  const calculateLabelButtonPosition = dc.useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry!);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;

    const buttonX = screenX + (objectWidth / 2) + buttonOffset;
    const buttonY = screenY - (objectHeight / 2) - buttonOffset - 22;

    return { x: buttonX, y: buttonY };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  const calculateLinkNoteButtonPosition = dc.useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry!);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonHeight = 44;
    const minSpacing = 8;

    let buttonY = screenY + (objectHeight / 2) + buttonOffset;

    const addEditNoteButtonBottom = screenY - (objectHeight / 2) - buttonOffset - 22 + buttonHeight;

    if (buttonY - 22 < addEditNoteButtonBottom + minSpacing) {
      buttonY = addEditNoteButtonBottom + minSpacing + 22;
    }

    const buttonX = screenX + (objectWidth / 2) + buttonOffset;

    return { x: buttonX, y: buttonY - 22 };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  const calculateResizeButtonPosition = dc.useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry!);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44;

    const buttonX = screenX - (objectWidth / 2) - buttonOffset - buttonSize;
    const buttonY = screenY - (objectHeight / 2) - buttonOffset - 22;

    return { x: buttonX, y: buttonY };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  const calculateObjectColorButtonPosition = dc.useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry!);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44;
    const buttonHeight = 44;
    const minSpacing = 8;

    let buttonY = screenY + (objectHeight / 2) + buttonOffset;

    const resizeButtonBottom = screenY - (objectHeight / 2) - buttonOffset - 22 + buttonHeight;

    if (buttonY - 22 < resizeButtonBottom + minSpacing) {
      buttonY = resizeButtonBottom + minSpacing + 22;
    }

    const buttonX = screenX - (objectWidth / 2) - buttonOffset - buttonSize;

    return { x: buttonX, y: buttonY - 22 };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  const handleNoteSubmit = dc.useCallback((content: string, editingObjectId: string): void => {
    if (editingObjectId && mapData) {
      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        editingObjectId,
        { customTooltip: content && content.trim() ? content.trim() : undefined }
      );
      onObjectsChange(updatedObjects);
    }
  }, [mapData, onObjectsChange, updateObject]
  );

  const handleObjectColorSelect = dc.useCallback((color: string): void => {
    if (selectedItem?.type === 'object' && mapData) {
      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        selectedItem.id,
        { color: color }
      );
      onObjectsChange(updatedObjects);
    }
  }, [selectedItem, mapData, updateObject, onObjectsChange]
  );

  const handleObjectColorReset = dc.useCallback((setShowObjectColorPicker: (show: boolean) => void): void => {
    handleObjectColorSelect('#ffffff');
    setShowObjectColorPicker(false);
  }, [handleObjectColorSelect]);

  const handleObjectRotation = dc.useCallback((): void => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }

    const currentObject = getActiveLayer(mapData).objects?.find((obj: MapObject) => obj.id === selectedItem.id);
    const currentRotation = currentObject?.rotation || 0;
    const nextRotation = getNextRotation(currentRotation);

    const updatedObjects = updateObject(
      getActiveLayer(mapData).objects,
      selectedItem.id,
      { rotation: nextRotation }
    );
    onObjectsChange(updatedObjects);
  }, [selectedItem, mapData, updateObject, onObjectsChange]);

  const handleObjectDeletion = dc.useCallback((): void => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }

    const updatedObjects = removeObject(getActiveLayer(mapData).objects, selectedItem.id);
    onObjectsChange(updatedObjects);
    setSelectedItem(null);
  }, [selectedItem, mapData, removeObject, onObjectsChange, setSelectedItem]);

  const handleObjectDuplicate = dc.useCallback((): void => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }

    const sourceObject = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!sourceObject) return;

    const { mapType } = mapData;
    const { x: sourceX, y: sourceY } = sourceObject.position;

    const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let targetX = sourceX;
    let targetY = sourceY;
    let found = false;

    for (let ring = 1; ring <= 10 && !found; ring++) {
      for (let dir = 0; dir < 4 && !found; dir++) {
        for (let step = 0; step < ring && !found; step++) {
          const checkX = sourceX + directions[dir][0] * ring;
          const checkY = sourceY + directions[dir][1] * (step + 1 - ring);

          if (canPlaceObjectAt(getActiveLayer(mapData).objects, checkX, checkY, mapType)) {
            targetX = checkX;
            targetY = checkY;
            found = true;
          }
        }
      }

      if (!found) {
        for (let dx = -ring; dx <= ring && !found; dx++) {
          for (let dy = -ring; dy <= ring && !found; dy++) {
            if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
              const checkX = sourceX + dx;
              const checkY = sourceY + dy;

              if (canPlaceObjectAt(getActiveLayer(mapData).objects, checkX, checkY, mapType)) {
                targetX = checkX;
                targetY = checkY;
                found = true;
              }
            }
          }
        }
      }
    }

    if (!found) {
      console.warn('No empty space found for duplicate');
      return;
    }

    const newObject: MapObject = {
      ...sourceObject,
      id: generateObjectId(),
      position: { x: targetX, y: targetY }
    };

    if (mapType === 'hex') {
      const occupiedSlots = getActiveLayer(mapData).objects
        .filter((obj: MapObject) => obj.position.x === targetX && obj.position.y === targetY)
        .map((obj: MapObject) => obj.slot)
        .filter((s: number | undefined): s is number => s !== undefined);
      newObject.slot = assignSlot(occupiedSlots);
    }

    const updatedObjects = [...getActiveLayer(mapData).objects, newObject];
    onObjectsChange(updatedObjects);

    setSelectedItem({
      type: 'object',
      id: newObject.id
    });
  }, [selectedItem, mapData, onObjectsChange, setSelectedItem]);

  dc.useEffect(() => {
    if (currentTool !== 'select') {
      setIsResizeMode(false);
    }
  }, [currentTool, setIsResizeMode]);

  return {
    isResizeMode,
    setIsResizeMode,
    isResizing,
    resizeCorner,
    hoveredObject,
    setHoveredObject,
    mousePosition,
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

    calculateLabelButtonPosition,
    calculateLinkNoteButtonPosition,
    calculateResizeButtonPosition,
    calculateObjectColorButtonPosition,

    handleNoteSubmit,
    handleObjectColorSelect,
    handleObjectColorReset,

    getClickedCorner
  };
};

return { useObjectInteractions };
