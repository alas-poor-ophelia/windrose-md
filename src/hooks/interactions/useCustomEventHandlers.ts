/**
 * useCustomEventHandlers.ts
 *
 * Manages custom DOM event listeners for cross-component communication:
 * - windrose:enter-sub-hex (double-click hex drill-down)
 * - windrose:hex-context-menu (right-click hex context menu)
 * - dmt-navigate-to (deep link navigation)
 * - windrose:center-on-region (region panel centering)
 * - dmt-create-object-link / dmt-remove-object-link (cross-layer linking)
 * - Escape key to exit sub-hex navigation
 */

import type { MapData, Region } from '#types/core/map.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import { Notice } from 'obsidian';
import type { MapObject, ObjectLink } from '#types/objects/object.types';

import { useEffect } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { consumePendingNavigate } from '../../persistence/deepLinkHandler';
import { useHexContextMenu } from './useHexContextMenu';

interface UseCustomEventHandlersOptions {
  mapData: MapData | null;
  mapId: string;
  geometry: ExtendedGeometry | null;
  updateMapData: (updater: MapData | ((current: MapData) => MapData)) => void;
  handleLayerSelect: (layerId: string) => void;
  enterSubHex: (q: number, r: number) => void;
  exitSubHex: () => void;
  isInSubHex: boolean;
  navigateToSibling?: (q: number, r: number) => void;
  handleRegionsChange: (regions: Region[]) => void;
}

function useCustomEventHandlers({
  mapData,
  mapId,
  geometry,
  updateMapData,
  handleLayerSelect,
  enterSubHex,
  exitSubHex,
  isInSubHex,
  navigateToSibling,
  handleRegionsChange
}: UseCustomEventHandlersOptions): void {
  const app = useApp();

  // Escape key exits sub-hex drill-down
  useEffect(() => {
    if (!isInSubHex) return undefined;

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement;
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
  useEffect(() => {
    const handleEnterSubHex = (event: CustomEvent): void => {
      const { q, r } = event.detail;
      if (mapData?.mapType === 'hex') {
        enterSubHex(q, r);
      }
    };

    document.addEventListener('windrose:enter-sub-hex', handleEnterSubHex as EventListener);
    return () => document.removeEventListener('windrose:enter-sub-hex', handleEnterSubHex as EventListener);
  }, [mapData?.mapType, enterSubHex]);

  // Listen for sibling sub-hex navigation (click on adjacent preview)
  useEffect(() => {
    if (!navigateToSibling || !isInSubHex) return undefined;
    const handleNavigateSibling = (event: CustomEvent): void => {
      const { q, r } = event.detail;
      navigateToSibling(q, r);
    };
    document.addEventListener('windrose:navigate-sibling-sub-hex', handleNavigateSibling as EventListener);
    return () => document.removeEventListener('windrose:navigate-sibling-sub-hex', handleNavigateSibling as EventListener);
  }, [isInSubHex, navigateToSibling]);

  // Deep link navigation — also consumes stashed navigation from cross-note openLinkText
  useEffect(() => {
    const handleNavigateTo = (event: CustomEvent): void => {
      const { mapId: targetMapId, x, y, zoom, layerId } = event.detail;

      if (targetMapId !== mapId) return;

      if (mapData?.layers != null && layerId != null && layerId !== '') {
        const targetLayer = mapData.layers.find(l => l.id === layerId);
        if (targetLayer != null && mapData.activeLayerId !== layerId) {
          handleLayerSelect(layerId);
        }
      }

      const DEEP_LINK_ZOOM = 1.175;
      const effectiveZoom = (zoom != null && zoom > 0) ? zoom : DEEP_LINK_ZOOM;

      let centerX = x;
      let centerY = y;
      if (geometry?.type === 'hex') {
        const worldCoords = geometry.hexToWorld(x, y);
        if (worldCoords != null) {
          centerX = worldCoords.worldX;
          centerY = worldCoords.worldY;
        }
      }

      updateMapData((currentMapData: MapData) => {
        if (!currentMapData.viewState) return currentMapData;
        return {
          ...currentMapData,
          viewState: {
            ...currentMapData.viewState,
            center: { x: centerX, y: centerY },
            zoom: effectiveZoom
          }
        };
      });

      new Notice(`Navigated to location on ${mapData?.name ?? 'map'}`);
    };

    window.addEventListener('dmt-navigate-to', handleNavigateTo as EventListener);

    const pending = consumePendingNavigate(mapId);
    if (pending) {
      handleNavigateTo(new CustomEvent('dmt-navigate-to', { detail: pending }));
    }

    return () => {
      window.removeEventListener('dmt-navigate-to', handleNavigateTo as EventListener);
    };
  }, [mapId, mapData, geometry, updateMapData, handleLayerSelect]);

  // Center-on-region events from region panel
  useEffect(() => {
    const handleCenterOnRegion = (event: CustomEvent): void => {
      const { regionId } = event.detail;
      if (!mapData || !geometry || geometry.type !== 'hex') return;

      const region = (mapData.regions ?? []).find((r: Region) => r.id === regionId);
      if (!region || region.hexes.length === 0) return;

      let cx = 0, cy = 0;
      for (const hex of region.hexes) {
        const world = geometry.hexToWorld(hex.x, hex.y);
        cx += world.worldX;
        cy += world.worldY;
      }
      cx /= region.hexes.length;
      cy /= region.hexes.length;

      updateMapData((current: MapData) => ({
        ...current,
        viewState: {
          ...current.viewState,
          center: { x: cx, y: cy },
          zoom: current.viewState?.zoom ?? 1
        }
      }));
    };

    document.addEventListener('windrose:center-on-region', handleCenterOnRegion as EventListener);
    return () => document.removeEventListener('windrose:center-on-region', handleCenterOnRegion as EventListener);
  }, [mapData, geometry, updateMapData]);

  // Cross-layer object link events
  useEffect(() => {
    type LinkUpdate = { layerId: string; objectId: string; link?: ObjectLink };

    const updateObjectLinksAcrossLayers = (updates: LinkUpdate[]): void => {
      updateMapData((currentMapData: MapData) => ({
        ...currentMapData,
        layers: currentMapData.layers.map(layer => {
          const layerUpdates = updates.filter(u => u.layerId === layer.id);
          if (layerUpdates.length === 0) return layer;

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

  // Hex context menu (extracted)
  useHexContextMenu({ app, mapData, enterSubHex, handleRegionsChange });
}

export { useCustomEventHandlers };
