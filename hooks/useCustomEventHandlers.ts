/**
 * useCustomEventHandlers.ts
 *
 * Manages custom DOM event listeners for cross-component communication:
 * - windrose:enter-sub-hex (double-click hex drill-down)
 * - dmt-navigate-to (deep link navigation)
 * - windrose:center-on-region (region panel centering)
 * - dmt-create-object-link / dmt-remove-object-link (cross-layer linking)
 * - Escape key to exit sub-hex navigation
 */

import type { MapData } from '#types/core/map.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { MapObject, ObjectLink } from '#types/objects/object.types';

interface Region {
  id: string;
  hexes: { x: number; y: number }[];
}

interface UseCustomEventHandlersOptions {
  mapData: MapData | null;
  mapId: string;
  geometry: IGeometry | null;
  updateMapData: (updater: MapData | ((current: MapData) => MapData)) => void;
  handleLayerSelect: (layerId: string) => void;
  enterSubHex: (q: number, r: number) => void;
  exitSubHex: () => void;
  isInSubHex: boolean;
}

function useCustomEventHandlers({
  mapData,
  mapId,
  geometry,
  updateMapData,
  handleLayerSelect,
  enterSubHex,
  exitSubHex,
  isInSubHex
}: UseCustomEventHandlersOptions): void {

  // Escape key exits sub-hex drill-down
  dc.useEffect(() => {
    if (!isInSubHex) return;

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement;
        // Don't intercept when typing in inputs or when a modal is open
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        if (document.querySelector('.modal-container')) return;
        e.preventDefault();
        e.stopPropagation();
        exitSubHex();
      }
    };

    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [isInSubHex, exitSubHex]);

  // Listen for sub-hex entry events from double-click on hex
  dc.useEffect(() => {
    const handleEnterSubHex = (event: CustomEvent): void => {
      const { q, r } = event.detail;
      if (mapData?.mapType === 'hex') {
        enterSubHex(q, r);
      }
    };

    document.addEventListener('windrose:enter-sub-hex', handleEnterSubHex as EventListener);
    return () => document.removeEventListener('windrose:enter-sub-hex', handleEnterSubHex as EventListener);
  }, [mapData?.mapType, enterSubHex]);

  // Listen for deep link navigation events
  dc.useEffect(() => {
    const handleNavigateTo = (event: CustomEvent): void => {
      const { mapId: targetMapId, x, y, zoom, layerId } = event.detail;

      // Only respond if this is our map
      if (targetMapId !== mapId) return;

      // Switch to target layer if it exists and is different
      if (mapData?.layers && layerId) {
        const targetLayer = mapData.layers.find((l: { id: string }) => l.id === layerId);
        if (targetLayer && mapData.activeLayerId !== layerId) {
          handleLayerSelect(layerId);
        }
      }

      // Navigate to a comfortable viewing zoom regardless of what the link stored
      const DEEP_LINK_ZOOM = 1.175;
      updateMapData((currentMapData: MapData) => ({
        ...currentMapData,
        viewState: {
          ...currentMapData.viewState,
          center: { x, y },
          zoom: DEEP_LINK_ZOOM
        }
      }));

      new Notice(`Navigated to location on ${mapData?.name || 'map'}`);
    };

    window.addEventListener('dmt-navigate-to', handleNavigateTo as EventListener);

    return () => {
      window.removeEventListener('dmt-navigate-to', handleNavigateTo as EventListener);
    };
  }, [mapId, mapData, updateMapData, handleLayerSelect]);

  // Listen for center-on-region events from region panel
  dc.useEffect(() => {
    const handleCenterOnRegion = (event: CustomEvent): void => {
      const { regionId } = event.detail;
      if (!mapData || !geometry || geometry.type !== 'hex') return;

      const region = (mapData.regions || []).find((r: Region) => r.id === regionId);
      if (!region || region.hexes.length === 0) return;

      // Compute centroid in world coordinates
      let cx = 0, cy = 0;
      for (const hex of region.hexes) {
        const world = (geometry as any).hexToWorld(hex.x, hex.y);
        cx += world.worldX;
        cy += world.worldY;
      }
      cx /= region.hexes.length;
      cy /= region.hexes.length;


      updateMapData((current: MapData) => ({
        ...current,
        viewState: {
          ...current.viewState,
          center: { x: cx, y: cy }
        }
      }));
    };

    document.addEventListener('windrose:center-on-region', handleCenterOnRegion as EventListener);
    return () => document.removeEventListener('windrose:center-on-region', handleCenterOnRegion as EventListener);
  }, [mapData, geometry, updateMapData]);

  // Listen for cross-layer object link events
  dc.useEffect(() => {
    type LinkUpdate = { layerId: string; objectId: string; link?: ObjectLink };

    const updateObjectLinksAcrossLayers = (updates: LinkUpdate[]): void => {
      updateMapData((currentMapData: MapData) => ({
        ...currentMapData,
        layers: currentMapData.layers.map((layer: { id: string; objects?: MapObject[] }) => {
          const layerUpdates = updates.filter(u => u.layerId === layer.id);
          if (layerUpdates.length === 0 || !layer.objects) return layer;

          return {
            ...layer,
            objects: layer.objects.map((obj: MapObject) => {
              const update = layerUpdates.find(u => u.objectId === obj.id);
              if (!update) return obj;
              if (update.link !== undefined) {
                return { ...obj, linkedObject: update.link };
              }
              const { linkedObject: _removed, ...rest } = obj;
              return rest as MapObject;
            })
          };
        })
      }));
    };

    const handleCreateObjectLink = (event: CustomEvent): void => {
      const { sourceLayerId, sourceObjectId, sourceLink, targetLayerId, targetObjectId, targetLink } = event.detail;
      updateObjectLinksAcrossLayers([
        { layerId: sourceLayerId, objectId: sourceObjectId, link: sourceLink },
        { layerId: targetLayerId, objectId: targetObjectId, link: targetLink }
      ]);
    };

    const handleRemoveObjectLink = (event: CustomEvent): void => {
      const { sourceLayerId, sourceObjectId, targetLayerId, targetObjectId } = event.detail;
      updateObjectLinksAcrossLayers([
        { layerId: sourceLayerId, objectId: sourceObjectId },
        { layerId: targetLayerId, objectId: targetObjectId }
      ]);
    };

    window.addEventListener('dmt-create-object-link', handleCreateObjectLink as EventListener);
    window.addEventListener('dmt-remove-object-link', handleRemoveObjectLink as EventListener);

    return () => {
      window.removeEventListener('dmt-create-object-link', handleCreateObjectLink as EventListener);
      window.removeEventListener('dmt-remove-object-link', handleRemoveObjectLink as EventListener);
    };
  }, [updateMapData]);
}

return { useCustomEventHandlers };
