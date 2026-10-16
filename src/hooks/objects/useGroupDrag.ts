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
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type {
  SelectedItem,
  DragOffsetsMap,
  ObjectDragUpdate,
  TextDragUpdate,
  PositionUpdate,
  UseGroupDragResult
} from '#types/hooks/groupDrag.types';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import type { Point } from '#types/core/geometry.types';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { homeLevelOf, classicHitRung } from '../../objects/hexSlotPositioner';
import { groupItemHitsCell, reorganizeVacatedCells, groupMoveStacksInSlots, planGroupGridMove } from '../../objects/groupDragOps';
import { ladderFootprintContains } from '../../objects/ladderHitTest';


/**
 * Hook for managing group drag operations
 */
const useGroupDrag = (): UseGroupDragResult => {
  const {
    geometry,
    mapData,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    canvasRef,
    ladder,
    screenToLevelCell,
    getActiveLevel,
    viewController
  } = useMapState();

  // Geometry an object's `position` indexes into: its home rung under the
  // lattice ladder, the root geometry otherwise (home 0 / classic maps).
  const cellGeometryFor = useCallback((home: number) => {
    return ladder !== null && home > 0 ? ladder.geometryForLevel(home) : geometry;
  }, [ladder, geometry]);

  const {
    onObjectsChange,
    onTextLabelsChange,
    clearTransient
  } = useMapOperations();

  const {
    selectedItems,
    hasMultiSelection,
    updateSelectedItemsData,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    groupDragOffsetsRef,
    groupDragInitialStateRef,
    isGroupDragging
  } = useMapSelection();

  // Track Alt+Shift for drag inversion in group drags
  const altKeyRef = useRef(false);
  const shiftKeyRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') altKeyRef.current = true;
      if (e.key === 'Shift') shiftKeyRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') altKeyRef.current = false;
      if (e.key === 'Shift') shiftKeyRef.current = false;
    };
    // Popout-safe: the window that owns this map's canvas, captured once.
    const win = canvasRef.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('keydown', onKeyDown);
    win.addEventListener('keyup', onKeyUp);
    return () => {
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
    };
  }, [canvasRef]);

  const getClickedSelectedItem = useCallback((
    x: number,
    y: number,
    worldX: number,
    worldY: number,
    clientX?: number,
    clientY?: number
  ): SelectedItem | null => {
    if (!hasMultiSelection || !mapData) {
      return null;
    }

    const activeLayer = getActiveLayer(mapData);

    for (const item of selectedItems) {
      if (item.type === 'object') {
        const obj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
        if (obj != null) {
          // Ladder: the drawn footprint is what the pointer grabs (a held
          // persist object is drawn smaller/larger than its cell). Classic:
          // the pointer cell on the object's own rung (home 0 = the root cell).
          const hit = ladder !== null
            ? ladderFootprintContains(obj, activeLayer.objects ?? [], worldX, worldY, {
              ladder,
              level: getActiveLevel(),
              zoom: viewController?.getLive().zoom ?? mapData.viewState?.zoom ?? 1,
              orientation: mapData.orientation ?? 'flat'
            })
            : groupItemHitsCell(obj, (home: number): Point | null => {
              if (home === 0) return { x, y };
              // A `lod` map off the ladder view draws rung 0 only: a deep member is not grabbable.
              if (classicHitRung(mapData) !== undefined) return null;
              if (clientX === undefined || clientY === undefined) return null;
              return screenToLevelCell(clientX, clientY, home);
            });
          if (hit) return item;
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
  }, [hasMultiSelection, selectedItems, mapData, screenToLevelCell, ladder, getActiveLevel, viewController]);

  const startGroupDrag = useCallback((
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
      objects: [...activeLayer.objects],
      textLabels: [...activeLayer.textLabels]
    };

    const offsets: DragOffsetsMap = new Map();

    for (const item of selectedItems) {
      if (item.type === 'object') {
        const obj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
        if (obj) {
          if (obj.freeform === true && obj.worldPosition != null) {
            offsets.set(item.id, {
              type: 'object',
              gridOffsetX: 0,
              gridOffsetY: 0,
              worldOffsetX: worldCoords.worldX - obj.worldPosition.x,
              worldOffsetY: worldCoords.worldY - obj.worldPosition.y,
              freeform: true,
              homeLevel: homeLevelOf(obj)
            });
          } else {
            // Offset measured on the object's own rung: a group may mix rungs,
            // and rung cell indexes are not comparable across levels.
            const home = homeLevelOf(obj);
            const pointerCell = home === 0 ? { x: gridX, y: gridY } : screenToLevelCell(clientX, clientY, home);
            if (pointerCell === null) { groupDragInitialStateRef.current = null; return false; }
            offsets.set(item.id, {
              type: 'object',
              gridOffsetX: pointerCell.x - obj.position.x,
              gridOffsetY: pointerCell.y - obj.position.y,
              worldOffsetX: 0,
              worldOffsetY: 0,
              homeLevel: home
            });
          }
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
  }, [hasMultiSelection, selectedItems, mapData, screenToWorld, screenToLevelCell, setIsDraggingSelection, setDragStart, groupDragInitialStateRef, groupDragOffsetsRef]);

  const handleGroupDrag = useCallback((e: PointerEvent | MouseEvent | TouchEvent): boolean => {
    if (!isDraggingSelection || dragStart?.isGroupDrag !== true) {
      return false;
    }
    if (geometry == null || mapData == null) return true;

    const { clientX, clientY } = getClientCoords(e);
    const gridCoords = screenToGrid(clientX, clientY);
    const worldCoords = screenToWorld(clientX, clientY);

    // Under the ladder the root cell may be off-canvas while a deep rung cell
    // exists; only a home-0 grid mover needs it (pointerCellOn(0) then bails).
    if (!worldCoords || (gridCoords === null && ladder === null)) return true;

    const gridX = gridCoords?.x ?? dragStart.gridX ?? 0;
    const gridY = gridCoords?.y ?? dragStart.gridY ?? 0;
    const { worldX, worldY } = worldCoords;

    const gridDeltaX = gridX - (dragStart.gridX ?? 0);
    const gridDeltaY = gridY - (dragStart.gridY ?? 0);
    const worldDeltaX = worldX - (dragStart.worldX ?? 0);
    const worldDeltaY = worldY - (dragStart.worldY ?? 0);

    if (gridDeltaX === 0 && gridDeltaY === 0 && worldDeltaX === 0 && worldDeltaY === 0) {
      return true;
    }

    const activeLayer = getActiveLayer(mapData);
    const offsets = groupDragOffsetsRef.current;

    const objectUpdates: ObjectDragUpdate[] = [];
    const textUpdates: TextDragUpdate[] = [];

    const isInverted = altKeyRef.current && shiftKeyRef.current;

    // Pointer cell per rung, resolved lazily (rung 0 is the root cell above)
    const rungCells = new Map<number, Point | null>([[0, gridCoords]]);
    const pointerCellOn = (home: number): Point | null => {
      if (!rungCells.has(home)) rungCells.set(home, screenToLevelCell(clientX, clientY, home));
      return rungCells.get(home) ?? null;
    };

    for (const item of selectedItems) {
      const offset = offsets.get(item.id);
      if (!offset) continue;

      if (item.type === 'object') {
        const obj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
        if (obj != null) {
          const home = offset.homeLevel ?? 0;
          const cellGeometry = cellGeometryFor(home);
          const rungCell = pointerCellOn(home);
          if (rungCell === null || cellGeometry == null) return true;
          if (isInverted) {
            // Drag inversion: flip each object's snap behavior
            if (offset.freeform !== true) {
              // Grid → freeform inversion: use world-space delta
              const cellCenter = cellGeometry.getCellCenter(obj.position.x, obj.position.y);
              const baseX = obj.worldPosition?.x ?? cellCenter.worldX;
              const baseY = obj.worldPosition?.y ?? cellCenter.worldY;
              const newWorldX = baseX + worldDeltaX;
              const newWorldY = baseY + worldDeltaY;
              objectUpdates.push({
                id: item.id,
                oldObj: obj,
                newPosition: rungCell,
                freeformPosition: { x: newWorldX, y: newWorldY }
              });
            } else {
              // Freeform → grid inversion: snap to grid
              const newX = rungCell.x - offset.gridOffsetX;
              const newY = rungCell.y - offset.gridOffsetY;
              const cellCenter = cellGeometry.getCellCenter(newX, newY);
              objectUpdates.push({
                id: item.id,
                oldObj: obj,
                newPosition: { x: newX, y: newY },
                freeformPosition: { x: cellCenter.worldX, y: cellCenter.worldY }
              });
            }
          } else if (offset.freeform === true) {
            const newWorldX = worldX - offset.worldOffsetX;
            const newWorldY = worldY - offset.worldOffsetY;
            objectUpdates.push({
              id: item.id,
              oldObj: obj,
              newPosition: obj.position,
              freeformPosition: { x: newWorldX, y: newWorldY }
            });
          } else {
            const newX = rungCell.x - offset.gridOffsetX;
            const newY = rungCell.y - offset.gridOffsetY;
            objectUpdates.push({
              id: item.id,
              oldObj: obj,
              newPosition: { x: newX, y: newY }
            });
          }
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

    // Bounds and overlap checks only apply to grid-anchored objects
    const gridUpdates = objectUpdates.filter(u => !u.freeformPosition);

    const selectedObjectIds = new Set(
      selectedItems.filter(item => item.type === 'object').map(item => item.id)
    );

    const nonSelectedObjects = activeLayer.objects.filter(
      (obj: MapObject) => !selectedObjectIds.has(obj.id)
    );

    // Bounds (root bounds at home 0, ladder existence deeper) and overlap,
    // both scoped to each moving object's own rung. On a LADDER hex map cells
    // hold up to getMaxObjectsPerCell() objects in slots, so there the overlap
    // check is replaced by per-cell slot assignment (refused on overflow). A
    // classic hex map keeps main's refusal of any occupied cell.
    const stackInSlots = groupMoveStacksInSlots(mapData.mapType, ladder !== null, mapData.lod != null);
    const plan = planGroupGridMove(gridUpdates, nonSelectedObjects, (home, cx, cy) =>
      ladder !== null && home > 0 ? ladder.existsAt(home, cx, cy) : geometry.isWithinBounds(cx, cy),
      stackInSlots
    );
    if (plan.blocked) return true;
    const hexSlots = plan.slots;

    if (objectUpdates.length > 0) {
      let updatedObjects = [...activeLayer.objects];

      for (const update of objectUpdates) {
        const idx = updatedObjects.findIndex((o: MapObject) => o.id === update.id);
        if (idx !== -1) {
          if (update.freeformPosition) {
            updatedObjects[idx] = {
              ...updatedObjects[idx],
              position: update.newPosition,
              worldPosition: update.freeformPosition,
              ...(isInverted && offsets.get(update.id)?.freeform !== true ? { freeform: true } : {})
            };
          } else {
            const slot = hexSlots?.get(update.id);
            updatedObjects[idx] = {
              ...updatedObjects[idx],
              position: update.newPosition,
              ...(slot !== undefined ? { slot } : {})
            };
          }
        }
      }

      // Compact the hex cells the grid movers left (per rung)
      if (stackInSlots) updatedObjects = reorganizeVacatedCells(updatedObjects, gridUpdates);

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
  }, [isDraggingSelection, dragStart, mapData, geometry, ladder, selectedItems, getClientCoords,
      screenToGrid, screenToWorld, screenToLevelCell, cellGeometryFor, onObjectsChange, onTextLabelsChange, setDragStart, updateSelectedItemsData, groupDragOffsetsRef]);

  const stopGroupDrag = useCallback((): boolean => {
    if (!isDraggingSelection || dragStart?.isGroupDrag !== true) {
      return false;
    }
    if (geometry == null || mapData == null) {
      // No commit: drop any live-move pin so the next unrelated commit cannot absorb it.
      clearTransient?.();
      return false;
    }

    // Restore original freeform state for any objects that were inverted during drag
    {
      const activeLayer = getActiveLayer(mapData);
      const offsets = groupDragOffsetsRef.current;
      let needsRestore = false;
      const updatedObjects = [...activeLayer.objects];

      for (const [id, offset] of offsets) {
        if (offset.type !== 'object') continue;
        const idx = updatedObjects.findIndex((o: MapObject) => o.id === id);
        if (idx === -1) continue;
        const obj = updatedObjects[idx];

        // Grid object that was temporarily made freeform → restore to grid
        if (offset.freeform !== true && obj.freeform === true) {
          const { freeform, worldPosition, ...rest } = obj;
          void freeform; void worldPosition; // dropped from the copy
          updatedObjects[idx] = rest;
          needsRestore = true;
        }
        // Freeform object that was snapped to grid → keep freeform, snap worldPosition to cell center
        if (offset.freeform === true && obj.worldPosition != null) {
          const cellCenter = (cellGeometryFor(homeLevelOf(obj)) ?? geometry).getCellCenter(obj.position.x, obj.position.y);
          updatedObjects[idx] = {
            ...obj,
            worldPosition: { x: cellCenter.worldX, y: cellCenter.worldY }
          };
          needsRestore = true;
        }
      }

      if (needsRestore) {
        onObjectsChange(updatedObjects, true);
      }
    }

    setIsDraggingSelection(false);
    setDragStart(null);

    if (groupDragInitialStateRef.current !== null) {
      const activeLayer = getActiveLayer(mapData);

      onObjectsChange(activeLayer.objects, false);
      onTextLabelsChange(activeLayer.textLabels, false);

      groupDragInitialStateRef.current = null;
    } else {
      // No commit: drop any live-move pin so the next unrelated commit cannot absorb it.
      clearTransient?.();
    }

    groupDragOffsetsRef.current = new Map();

    return true;
  }, [isDraggingSelection, dragStart, mapData, geometry, cellGeometryFor, setIsDraggingSelection, setDragStart, onObjectsChange, onTextLabelsChange, groupDragInitialStateRef, groupDragOffsetsRef, clearTransient]);

  return {
    isGroupDragging,
    getClickedSelectedItem,
    startGroupDrag,
    handleGroupDrag,
    stopGroupDrag
  };
};

export { useGroupDrag };