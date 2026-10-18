/**
 * useObjectHover.ts
 *
 * Hover state tracking for objects under the cursor.
 * Extracted from useObjectInteractions.ts.
 */

import type { MapObject } from '#types/objects/object.types';

import { useCallback } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { getClickedObjectInCell, classicHitRung } from '../../objects/hexSlotPositioner';
import { pickLadderObject } from '../../objects/ladderHitTest';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { isCellFoggedIndexed } from '../../geometry/fog/foggedCellIndex';
















function useObjectHover(): {
  handleHoverUpdate: (e: PointerEvent | MouseEvent) => void;
} {
  const { mapData, geometry, screenToGrid, screenToWorld, getClientCoords, containerRef, ladder, getActiveLevel, viewController } = useMapState();
  const { getObjectAtPosition } = useMapOperations();
  const { setHoveredObject, setMousePosition } = useMapSelection();

  const handleHoverUpdate = useCallback((e: PointerEvent | MouseEvent): void => {
    if (mapData == null) return;
    if (!('touches' in e)) {
      const { clientX, clientY } = getClientCoords(e);
      let obj: MapObject | null = null;

      if (ladder !== null) {
        // Ladder: the drawn footprint on the object's home rung is the hit
        // area (held size and depth-mode visibility included), never the
        // level-0 cell under the pointer. The pick is world-space, so the
        // gate is the world point, not a root cell (rung cells may lie
        // outside root bounds).
        const worldCoords = screenToWorld(clientX, clientY);
        if (!worldCoords) {
          setHoveredObject(null);
          return;
        }
        const zoom = viewController?.getLive().zoom ?? mapData.viewState?.zoom ?? 1;
        const activeLayer = getActiveLayer(mapData);
        // Fogged objects are skipped inside the pick (a deep one at its root
        // ancestor, as the renderer hides it), so a visible one beneath wins.
        const fog = activeLayer.fogOfWar?.enabled === true ? { layer: activeLayer, isCellFogged: isCellFoggedIndexed } : undefined;
        obj = pickLadderObject(activeLayer.objects, worldCoords.worldX, worldCoords.worldY, {
          ladder, level: getActiveLevel(), zoom, orientation: mapData.orientation ?? 'flat'
        }, fog);
      } else {
        const coords = screenToGrid(clientX, clientY);
        if (!coords) {
          setHoveredObject(null);
          return;
        }
        const { x, y } = coords;

        if (geometry?.type === 'hex') {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords && geometry.gridToWorld != null && geometry.width != null) {
            const hexCenter = geometry.gridToWorld(x, y);
            const clickOffsetX = (worldCoords.worldX - hexCenter.worldX) / geometry.width;
            const clickOffsetY = (worldCoords.worldY - hexCenter.worldY) / geometry.width;

            obj = getClickedObjectInCell(
              getActiveLayer(mapData).objects,
              x, y,
              clickOffsetX, clickOffsetY,
              mapData.orientation ?? 'flat',
              classicHitRung(mapData)
            );
          }
        }

        // A `lod` map off the ladder view draws rung 0 only: deep objects are not hittable.
        obj ??= getObjectAtPosition(getActiveLayer(mapData).objects, x, y, classicHitRung(mapData));
      }

      // Classic path: a fogged object is not hoverable. (The ladder pick skips
      // fogged candidates itself.)
      if (obj && ladder === null) {
        const activeLayer = getActiveLayer(mapData);
        if (activeLayer.fogOfWar?.enabled === true && geometry != null) {
          const objOffset = geometry.toOffsetCoords(obj.position.x, obj.position.y);
          if (isCellFoggedIndexed(activeLayer, objOffset.col, objOffset.row)) {
            obj = null;
          }
        }
      }

      // useState bails out on an identical value, so an unchanged hover
      // (same object, or still nothing) does not re-render.
      setHoveredObject(obj);

      // The cursor position only feeds the hover tooltip; skip the per-move
      // state write when nothing is hovered (REACT-01).
      const container = obj ? containerRef.current : null;
      if (container) {
        const rect = container.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const relativeY = clientY - rect.top;
        setMousePosition({ x: relativeX, y: relativeY });
      }
    }
  }, [mapData, geometry, getClientCoords, screenToGrid, screenToWorld, getObjectAtPosition, setHoveredObject, setMousePosition, containerRef, ladder, getActiveLevel, viewController]
  );

  return { handleHoverUpdate };
}

export { useObjectHover };