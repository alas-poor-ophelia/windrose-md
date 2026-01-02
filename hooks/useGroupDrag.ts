/**
 * useGroupDrag.ts
 *
 * Custom hook for managing group drag operations during multi-select.
 * Handles dragging multiple objects and text labels together as a group.
 *
 * Features:
 * - Stores position offsets for all selected items when drag starts
 * - Applies movement delta to all items during drag
 * - Validates all positions (blocks move if any item would go out of bounds)
 * - Creates single history entry for the entire group move
 */

// Type-only imports
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/core/textLabel.types';
import type {
  SelectedItem,
  DragOffset,
  DragOffsetsMap,
  GroupDragInitialState,
  ObjectDragUpdate,
  TextDragUpdate,
  PositionUpdate,
  UseGroupDragResult,
} from '#types/hooks/groupDrag.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

// Context types
interface MapStateValue {
  geometry: (IGeometry & { isWithinBounds?: (x: number, y: number) => boolean }) | null;
  mapData: MapData | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  getClientCoords: (e: PointerEvent | MouseEvent | TouchEvent) => { clientX: number; clientY: number };
}

interface MapOperationsValue {
  onObjectsChange: (objects: MapObject[], skipHistory?: boolean) => void;
  onTextLabelsChange: (labels: TextLabel[], skipHistory?: boolean) => void;
}

interface DragStart {
  x: number;
  y: number;
  gridX: number;
  gridY: number;
  worldX: number;
  worldY: number;
  isGroupDrag?: boolean;
}

interface MapSelectionValue {
  selectedItems: SelectedItem[];
  hasMultiSelection: boolean;
  isSelected: (type: string, id: string) => boolean;
  updateSelectedItemsData: (updates: PositionUpdate[]) => void;
  isDraggingSelection: boolean;
  setIsDraggingSelection: (value: boolean) => void;
  dragStart: DragStart | null;
  setDragStart: (value: DragStart | null) => void;
  groupDragOffsetsRef: { current: DragOffsetsMap };
  groupDragInitialStateRef: { current: GroupDragInitialState | null };
  isGroupDragging: boolean;
}

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx") as {
  useMapState: () => MapStateValue;
  useMapOperations: () => MapOperationsValue;
};

const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx") as {
  useMapSelection: () => MapSelectionValue;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

const { HexGeometry } = await requireModuleByName("HexGeometry.ts") as {
  HexGeometry: unknown;
};

const { getObjectsInCell, assignSlot } = await requireModuleByName("hexSlotPositioner.js") as {
  getObjectsInCell: unknown;
  assignSlot: unknown;
};

/**
 * Hook for managing group drag operations
 */
const useGroupDrag = (): UseGroupDragResult => {
  const {
    geometry,
    mapData,
    screenToGrid,
    screenToWorld,
    getClientCoords
  } = useMapState();

  const {
    onObjectsChange,
    onTextLabelsChange
  } = useMapOperations();

  const {
    selectedItems,
    hasMultiSelection,
    isSelected,
    updateSelectedItemsData,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    groupDragOffsetsRef,
    groupDragInitialStateRef,
    isGroupDragging
  } = useMapSelection();

  const getClickedSelectedItem = dc.useCallback((
    x: number,
    y: number,
    worldX: number,
    worldY: number
  ): SelectedItem | null => {
    if (!hasMultiSelection || !mapData) {
      return null;
    }

    const activeLayer = getActiveLayer(mapData);

    for (const item of selectedItems) {
      if (item.type === 'object') {
        const obj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
        if (obj) {
          const size = obj.size || { width: 1, height: 1 };
          if (x >= obj.position.x && x < obj.position.x + size.width &&
              y >= obj.position.y && y < obj.position.y + size.height) {
            return item;
          }
        }
      } else if (item.type === 'text') {
        const label = activeLayer.textLabels?.find((l: TextLabel) => l.id === item.id);
        if (label) {
          const labelWorldX = label.position.x;
          const labelWorldY = label.position.y;
          const hitRadius = (label.fontSize || 16) * 2;
          const dx = worldX - labelWorldX;
          const dy = worldY - labelWorldY;
          if (Math.abs(dx) < hitRadius && Math.abs(dy) < hitRadius) {
            return item;
          }
        }
      }
    }

    return null;
  }, [hasMultiSelection, selectedItems, mapData]);

  const startGroupDrag = dc.useCallback((
    clientX: number,
    clientY: number,
    gridX: number,
    gridY: number
  ): boolean => {
    if (!hasMultiSelection || !mapData) {
      return false;
    }

    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return false;

    const activeLayer = getActiveLayer(mapData);

    groupDragInitialStateRef.current = {
      objects: [...(activeLayer.objects || [])],
      textLabels: [...(activeLayer.textLabels || [])]
    };

    const offsets: DragOffsetsMap = new Map();

    for (const item of selectedItems) {
      if (item.type === 'object') {
        const obj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
        if (obj) {
          offsets.set(item.id, {
            type: 'object',
            gridOffsetX: gridX - obj.position.x,
            gridOffsetY: gridY - obj.position.y,
            worldOffsetX: 0,
            worldOffsetY: 0
          });
        }
      } else if (item.type === 'text') {
        const label = activeLayer.textLabels?.find((l: TextLabel) => l.id === item.id);
        if (label) {
          offsets.set(item.id, {
            type: 'text',
            gridOffsetX: 0,
            gridOffsetY: 0,
            worldOffsetX: worldCoords.worldX - label.position.x,
            worldOffsetY: worldCoords.worldY - label.position.y
          });
        }
      }
    }

    groupDragOffsetsRef.current = offsets;

    setIsDraggingSelection(true);
    setDragStart({
      x: clientX,
      y: clientY,
      gridX,
      gridY,
      worldX: worldCoords.worldX,
      worldY: worldCoords.worldY,
      isGroupDrag: true
    });

    return true;
  }, [hasMultiSelection, selectedItems, mapData, screenToWorld, setIsDraggingSelection, setDragStart]);

  const handleGroupDrag = dc.useCallback((e: PointerEvent | MouseEvent | TouchEvent): boolean => {
    if (!isDraggingSelection || !dragStart?.isGroupDrag || !mapData) {
      return false;
    }

    const { clientX, clientY } = getClientCoords(e);
    const gridCoords = screenToGrid(clientX, clientY);
    const worldCoords = screenToWorld(clientX, clientY);

    if (!gridCoords || !worldCoords) return true;

    const { x, y } = gridCoords;
    const gridX = x;
    const gridY = y;
    const { worldX, worldY } = worldCoords;

    const gridDeltaX = x - dragStart.gridX;
    const gridDeltaY = y - dragStart.gridY;
    const worldDeltaX = worldX - dragStart.worldX;
    const worldDeltaY = worldY - dragStart.worldY;

    if (gridDeltaX === 0 && gridDeltaY === 0 && worldDeltaX === 0 && worldDeltaY === 0) {
      return true;
    }

    const activeLayer = getActiveLayer(mapData);
    const offsets = groupDragOffsetsRef.current;

    const objectUpdates: ObjectDragUpdate[] = [];
    const textUpdates: TextDragUpdate[] = [];

    for (const item of selectedItems) {
      const offset = offsets.get(item.id);
      if (!offset) continue;

      if (item.type === 'object') {
        const obj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
        if (obj) {
          const newX = gridX - offset.gridOffsetX;
          const newY = gridY - offset.gridOffsetY;
          objectUpdates.push({
            id: item.id,
            oldObj: obj,
            newPosition: { x: newX, y: newY }
          });
        }
      } else if (item.type === 'text') {
        const label = activeLayer.textLabels?.find((l: TextLabel) => l.id === item.id);
        if (label) {
          const newX = worldX - offset.worldOffsetX;
          const newY = worldY - offset.worldOffsetY;
          textUpdates.push({
            id: item.id,
            oldLabel: label,
            newPosition: { x: newX, y: newY }
          });
        }
      }
    }

    if (geometry && geometry.isWithinBounds) {
      for (const update of objectUpdates) {
        if (!geometry.isWithinBounds(update.newPosition.x, update.newPosition.y)) {
          return true;
        }
      }
    }

    const selectedObjectIds = new Set(
      selectedItems.filter(item => item.type === 'object').map(item => item.id)
    );

    const nonSelectedObjects = (activeLayer.objects || []).filter(
      (obj: MapObject) => !selectedObjectIds.has(obj.id)
    );

    for (const update of objectUpdates) {
      const movingSize = update.oldObj.size || { width: 1, height: 1 };
      const movingMinX = update.newPosition.x;
      const movingMinY = update.newPosition.y;
      const movingMaxX = movingMinX + movingSize.width;
      const movingMaxY = movingMinY + movingSize.height;

      for (const staticObj of nonSelectedObjects) {
        const staticSize = staticObj.size || { width: 1, height: 1 };
        const staticMinX = staticObj.position.x;
        const staticMinY = staticObj.position.y;
        const staticMaxX = staticMinX + staticSize.width;
        const staticMaxY = staticMinY + staticSize.height;

        const overlapsX = movingMinX < staticMaxX && movingMaxX > staticMinX;
        const overlapsY = movingMinY < staticMaxY && movingMaxY > staticMinY;

        if (overlapsX && overlapsY) {
          return true;
        }
      }
    }

    if (objectUpdates.length > 0) {
      const updatedObjects = [...activeLayer.objects];

      for (const update of objectUpdates) {
        const idx = updatedObjects.findIndex((o: MapObject) => o.id === update.id);
        if (idx !== -1) {
          updatedObjects[idx] = {
            ...updatedObjects[idx],
            position: update.newPosition
          };
        }
      }

      onObjectsChange(updatedObjects, true);
    }

    if (textUpdates.length > 0) {
      const updatedLabels = [...activeLayer.textLabels];

      for (const update of textUpdates) {
        const idx = updatedLabels.findIndex((l: TextLabel) => l.id === update.id);
        if (idx !== -1) {
          updatedLabels[idx] = {
            ...updatedLabels[idx],
            position: update.newPosition
          };
        }
      }

      onTextLabelsChange(updatedLabels, true);
    }

    setDragStart({
      ...dragStart,
      gridX,
      gridY,
      worldX,
      worldY
    });

    const allUpdates: PositionUpdate[] = [
      ...objectUpdates.map(u => ({ id: u.id, position: u.newPosition })),
      ...textUpdates.map(u => ({ id: u.id, position: u.newPosition }))
    ];
    updateSelectedItemsData(allUpdates);

    return true;
  }, [isDraggingSelection, dragStart, mapData, geometry, selectedItems, getClientCoords,
      screenToGrid, screenToWorld, onObjectsChange, onTextLabelsChange, setDragStart, updateSelectedItemsData]);

  const stopGroupDrag = dc.useCallback((): boolean => {
    if (!isDraggingSelection || !dragStart?.isGroupDrag) {
      return false;
    }

    setIsDraggingSelection(false);
    setDragStart(null);

    if (groupDragInitialStateRef.current !== null) {
      const activeLayer = getActiveLayer(mapData!);

      if (activeLayer.objects) {
        onObjectsChange(activeLayer.objects, false);
      }

      if (activeLayer.textLabels) {
        onTextLabelsChange(activeLayer.textLabels, false);
      }

      groupDragInitialStateRef.current = null;
    }

    groupDragOffsetsRef.current = new Map();

    return true;
  }, [isDraggingSelection, dragStart, mapData, setIsDraggingSelection, setDragStart, onObjectsChange, onTextLabelsChange]);

  return {
    isGroupDragging,
    getClickedSelectedItem,
    startGroupDrag,
    handleGroupDrag,
    stopGroupDrag
  };
};

return { useGroupDrag };
