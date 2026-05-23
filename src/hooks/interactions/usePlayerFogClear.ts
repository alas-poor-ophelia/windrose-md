import { useEffect } from 'preact/hooks';
import type { MapData, FoggedCell } from '#types/core/map.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { MapObject } from '#types/objects/object.types';
import type { MapDataUpdater } from '#types/hooks/mapData.types';
import type { LayerHistorySnapshot } from '#types/hooks/layerHistory.types';
import { getActiveLayer } from '../../persistence/layerAccessor';

interface UsePlayerFogClearOptions {
  geometry: IGeometry | null;
  updateMapData: MapDataUpdater;
  addToHistory: (state: LayerHistorySnapshot) => void;
  isApplyingHistory: () => boolean;
}

function usePlayerFogClear({
  geometry, updateMapData, addToHistory, isApplyingHistory
}: UsePlayerFogClearOptions): void {
  useEffect(() => {
    const handler = (e: CustomEvent): void => {
      if (geometry == null || isApplyingHistory()) return;
      const { objectId } = e.detail;

      updateMapData((current: MapData) => {
        if (current == null) return current;
        const activeLayer = getActiveLayer(current);
        if (activeLayer.fogOfWar?.enabled !== true || (activeLayer.fogOfWar?.foggedCells?.length ?? 0) === 0) return current;

        const obj = activeLayer.objects.find((o: MapObject) => o.id === objectId);
        if (obj == null || obj.isPlayer !== true || obj.lightEnabled !== true || (obj.lightRadius ?? 0) === 0) return current;

        const settings = current.settings?.overrides ?? {};
        const distancePerCell = (settings.distancePerCell as number | undefined) ?? 5;
        const extGeom = geometry as ExtendedGeometry;
        const cellSize = (extGeom.cellSize ?? extGeom.hexSize) ?? 1;
        const radiusInCells = (obj.lightRadius ?? 0) / distancePerCell;
        const radiusInWorld = radiusInCells * cellSize;

        let objWorldX: number, objWorldY: number;
        if (obj.freeform === true && obj.worldPosition != null) {
          objWorldX = obj.worldPosition.x;
          objWorldY = obj.worldPosition.y;
        } else {
          const w = extGeom.getCellCenter(obj.position.x, obj.position.y);
          objWorldX = w.worldX;
          objWorldY = w.worldY;
        }

        const clearRadius = radiusInWorld + cellSize * 0.5;
        const radiusSq = clearRadius * clearRadius;
        const remainingCells = activeLayer.fogOfWar.foggedCells.filter((fc: FoggedCell) => {
          let cellWorldX: number, cellWorldY: number;
          if (extGeom.offsetToWorld != null) {
            const w = extGeom.offsetToWorld(fc.col, fc.row);
            cellWorldX = w.worldX;
            cellWorldY = w.worldY;
          } else {
            cellWorldX = (fc.col + 0.5) * cellSize;
            cellWorldY = (fc.row + 0.5) * cellSize;
          }
          const dx = cellWorldX - objWorldX;
          const dy = cellWorldY - objWorldY;
          return dx * dx + dy * dy > radiusSq;
        });

        if (remainingCells.length >= activeLayer.fogOfWar.foggedCells.length) return current;

        const newFog = { ...activeLayer.fogOfWar, foggedCells: remainingCells };

        addToHistory({
          cells: activeLayer.cells,
          curves: activeLayer.curves,
          name: current.name ?? '',
          objects: activeLayer.objects,
          textLabels: activeLayer.textLabels,
          edges: activeLayer.edges,
          tiles: activeLayer.tiles ?? [],
          regions: current.regions ?? [],
          outlines: current.outlines ?? [],
          shapeOverlays: current.shapeOverlays ?? [],
          fogOfWar: newFog
        });

        const layers = current.layers.map(l =>
          l.id === current.activeLayerId
            ? { ...l, fogOfWar: newFog }
            : l
        );
        return { ...current, layers };
      });
    };

    document.addEventListener('windrose:player-fog-clear', handler as EventListener);
    return () => document.removeEventListener('windrose:player-fog-clear', handler as EventListener);
  }, [geometry, updateMapData, addToHistory, isApplyingHistory]);
}

export { usePlayerFogClear };
