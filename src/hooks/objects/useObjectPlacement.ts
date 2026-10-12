/**
 * useObjectPlacement.ts
 *
 * Object placement on click (grid-snapped and freeform).
 * Extracted from useObjectInteractions.ts.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { ObjectAlignment } from '#types/objects/object.types';

import { useCallback } from 'preact/hooks';
import { Notice } from 'obsidian';
import { useMapState } from '../../context/MapContext';
import { useMapOperations } from '../../context/MapContext';
import { calculateEdgeAlignment, placeObject, placeObjectFreeform, canPlaceObjectAt } from '../../objects/objectOperations';
import { getActiveLayer, authoredCells } from '../../persistence/layerAccessor';
import { guardDepthWrite } from '../../persistence/depthAuthoring';
import { depthRefusalMessage } from '../../drawing/depthCellOps';












function useObjectPlacement(
  currentTool: ToolId,
  selectedObjectType: string | null,
  altKeyPressedRef: { current: boolean },
  shiftKeyPressedRef: { current: boolean },
  edgeSnapMode: boolean,
  freeformPlacementModeRef?: { current: boolean }
): {
  handleObjectPlacement: (gridX: number, gridY: number, clientX: number, clientY: number) => boolean;
} {
  const { mapData, geometry, screenToWorld, getEditLevel, screenToLevelCell, ladder } = useMapState();
  const { onObjectsChange } = useMapOperations();

  const handleObjectPlacement = useCallback((
    gridX: number,
    gridY: number,
    clientX: number,
    clientY: number
  ): boolean => {
    if (currentTool !== 'addObject' || selectedObjectType == null || selectedObjectType === '') {
      return false;
    }

    if (geometry == null || mapData == null) return false;

    // Zoomed onto a ladder rung (0 on classic maps): the object is homed there,
    // in that rung's cell under the pointer, behind the same gate as cell paint.
    const level = getEditLevel();
    let cellX = gridX;
    let cellY = gridY;
    if (level > 0) {
      if (ladder === null) {
        new Notice(depthRefusalMessage('not-a-ladder'));
        return true;
      }
      const activeLayer = getActiveLayer(mapData);
      const refusal = guardDepthWrite(mapData, activeLayer.id, level, authoredCells(activeLayer, level));
      if (refusal !== null) {
        new Notice(depthRefusalMessage(refusal));
        return true;
      }
      const cell = screenToLevelCell(clientX, clientY, level);
      if (!cell || !ladder.existsAt(level, cell.x, cell.y)) return true;
      cellX = cell.x;
      cellY = cell.y;
    } else if (!geometry.isWithinBounds(gridX, gridY)) {
      return true;
    }

    const mapType = mapData.mapType || 'grid';

    // Freeform placement: Alt+Shift or sidebar toggle places at exact world coordinates
    const useFreeformPlacement = (altKeyPressedRef.current && shiftKeyPressedRef.current)
                                || (freeformPlacementModeRef?.current ?? false);
    if (useFreeformPlacement && clientX !== undefined && clientY !== undefined) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (!worldCoords) return true;

      const result = placeObjectFreeform(
        getActiveLayer(mapData).objects,
        selectedObjectType,
        worldCoords.worldX,
        worldCoords.worldY,
        { x: cellX, y: cellY },
        mapType,
        mapData.objectSetId,
        level
      );
      if (result.success) {
        onObjectsChange(result.objects);
      }
      return true;
    }

    if (!canPlaceObjectAt(getActiveLayer(mapData).objects, cellX, cellY, mapType, level)) {
      return true;
    }

    let alignment = 'center';
    if (mapType === 'grid' && edgeSnapMode && clientX !== undefined && clientY !== undefined) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords) {
        const cellSize = mapData.gridSize ?? geometry.cellSize;
        const fractionalX = worldCoords.worldX / cellSize;
        const fractionalY = worldCoords.worldY / cellSize;
        alignment = calculateEdgeAlignment(fractionalX, fractionalY, gridX, gridY);
      }
    }

    const result = placeObject(
      getActiveLayer(mapData).objects,
      selectedObjectType,
      cellX,
      cellY,
      { mapType, alignment: alignment as ObjectAlignment, objectSetId: mapData.objectSetId, homeLevel: level }
    );

    if (result.success) {
      onObjectsChange(result.objects);
    }
    return true;
  }, [currentTool, selectedObjectType, mapData, geometry, getEditLevel, screenToLevelCell, ladder, edgeSnapMode, onObjectsChange, screenToWorld, altKeyPressedRef, freeformPlacementModeRef, shiftKeyPressedRef]);

  return { handleObjectPlacement };
}

export { useObjectPlacement };