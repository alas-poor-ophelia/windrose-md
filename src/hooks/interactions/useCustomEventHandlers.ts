/**
 * useCustomEventHandlers.ts
 *
 * Manages custom DOM event listeners for cross-component communication:
 * - windrose:enter-sub-hex (double-click hex drill-down)
 * - windrose:hex-context-menu (right-click hex context menu)
 * - windrose-navigate-to (deep link navigation)
 * - windrose:center-on-region (region panel centering)
 * - windrose-create-object-link / windrose-remove-object-link (cross-layer linking)
 * - Escape key to exit sub-hex navigation
 */

import type { MapData, Region } from '#types/core/map.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import { Notice } from 'obsidian';
import type { MapObject, ObjectLink } from '#types/objects/object.types';

import { useEffect, useRef } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { consumePendingNavigate } from '../../persistence/deepLinkHandler';
import type { NavigationEventDetail } from '../../persistence/deepLinkHandler';
import type {
  SubHexCoordDetail,
  SubHexExitDetail,
  RegionIdDetail,
  CreateObjectLinkDetail,
  RemoveObjectLinkDetail
} from '../../core/windroseEvents';
import { useHexContextMenu } from './useHexContextMenu';
import { DEFAULTS } from '../../core/dmtConstants';
import { calculateFitZoom, subHexAnchorToChildCenter } from '../../geometry/core/hexMeasurements';

interface UseCustomEventHandlersOptions {
  mapData: MapData | null;
  mapId: string;
  geometry: ExtendedGeometry | null;
  updateMapData: (updater: MapData | ((current: MapData) => MapData)) => void;
  handleLayerSelect: (layerId: string) => void;
  enterSubHex: (q: number, r: number, viewOverride?: { zoom: number; center: { x: number; y: number } }) => void;
  exitSubHex: (seamlessExit?: SubHexExitDetail | null) => void;
  /** Drill into an absolute sub-hex path, then run onArrive. Deep-link navigation. */
  drillToSubHexPath?: (path: string | null, onArrive?: () => void) => void;
  isInSubHex: boolean;
  navigateToSibling?: (q: number, r: number) => void;
  handleRegionsChange: (regions: Region[]) => void;
  /** Current drill-down path ('/'-joined hexKeys), null at root. */
  subHexPath?: string | null;
}

function useCustomEventHandlers({
  mapData,
  mapId,
  geometry,
  updateMapData,
  handleLayerSelect,
  enterSubHex,
  exitSubHex,
  drillToSubHexPath,
  isInSubHex,
  navigateToSibling,
  handleRegionsChange,
  subHexPath
}: UseCustomEventHandlersOptions): void {
  const app = useApp();

  // Escape key exits sub-hex drill-down
  useEffect(() => {
    if (!isInSubHex) return undefined;

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        if (activeDocument.querySelector('.modal-container')) return;
        e.preventDefault();
        e.stopPropagation();
        exitSubHex();
      }
    };

    activeDocument.addEventListener('keydown', handleEscape, true);
    return () => activeDocument.removeEventListener('keydown', handleEscape, true);
  }, [isInSubHex, exitSubHex]);

  // Listen for sub-hex entry events from double-click on hex
  useEffect(() => {
    const handleEnterSubHex = (event: CustomEvent<SubHexCoordDetail>): void => {
      const { q, r, viewOverride, anchor, canvasSize } = event.detail;
      if (mapData?.mapType !== 'hex') return;

      // Seamless dives supply a full viewOverride. The double-click path
      // instead supplies the clicked world point (`anchor`) and the live
      // canvas size: the sub-map opens at a fit zoom computed against the
      // REAL viewport (its stored zoom was fit at creation-time canvas
      // dimensions and opens over-zoomed in any smaller pane), centered on
      // the clicked spot. Also covers to-be-created sub-maps, which use the
      // same defaults createSubHexMapData will.
      let override = viewOverride;
      if (override == null && geometry?.type === 'hex') {
        const subHex = mapData.subHexMaps?.[`${q},${r}`];
        const rings = subHex?.subdivisionRings ?? 7;
        const parentHexSize = mapData.hexSize ?? DEFAULTS.hexSize;
        const childHexSize = subHex?.mapData.hexSize ?? parentHexSize;
        const orientation = mapData.orientation ?? DEFAULTS.hexOrientation;
        const childBounds = subHex?.mapData.hexBounds
          ?? { maxCol: rings * 2 + 1, maxRow: rings * 2 + 1, maxRing: rings };

        const zoom = canvasSize != null
          ? calculateFitZoom(childHexSize, orientation, childBounds, canvasSize.width, canvasSize.height)
          : subHex?.mapData.viewState?.zoom ?? 1;

        let center = { x: 0, y: 0 };
        if (anchor != null) {
          const parentCenter = geometry.hexToWorld(q, r);
          center = subHexAnchorToChildCenter(
            anchor.worldX - parentCenter.worldX,
            anchor.worldY - parentCenter.worldY,
            parentHexSize,
            childHexSize,
            orientation,
            rings
          );
        }
        override = { zoom, center };
      }

      enterSubHex(q, r, override);
    };

    activeDocument.addEventListener('windrose:enter-sub-hex', handleEnterSubHex);
    return () => activeDocument.removeEventListener('windrose:enter-sub-hex', handleEnterSubHex);
  }, [mapData, geometry, enterSubHex]);

  // Seamless zoom-out surfacing: the canvas dispatches this when a zoom-out
  // tick drops below the continuity zoom, carrying the child view at that
  // instant so the exit restores a continuous parent view. No-op at root.
  useEffect(() => {
    if (!isInSubHex) return undefined;
    const handleExitSubHex = (event: CustomEvent<SubHexExitDetail | null>): void => {
      exitSubHex(event.detail);
    };
    activeDocument.addEventListener('windrose:exit-sub-hex', handleExitSubHex);
    return () => activeDocument.removeEventListener('windrose:exit-sub-hex', handleExitSubHex);
  }, [isInSubHex, exitSubHex]);

  // Listen for sibling sub-hex navigation (click on adjacent preview)
  useEffect(() => {
    if (!navigateToSibling || !isInSubHex) return undefined;
    const handleNavigateSibling = (event: CustomEvent<SubHexCoordDetail>): void => {
      const { q, r } = event.detail;
      navigateToSibling(q, r);
    };
    activeDocument.addEventListener('windrose:navigate-sibling-sub-hex', handleNavigateSibling);
    return () => activeDocument.removeEventListener('windrose:navigate-sibling-sub-hex', handleNavigateSibling);
  }, [isInSubHex, navigateToSibling]);

  // Deep link navigation — also consumes stashed navigation from cross-note openLinkText.
  //
  // applyViewRef holds an ALWAYS-FRESH applier: reassigned every render so that
  // after a sub-hex drill it closes over the target level's geometry/updateMapData
  // (avoiding a stale closure when onArrive fires from useSubHexNavigation).
  const applyViewRef = useRef<(x: number, y: number, zoom: number, layerId: string) => void>(() => { /* noop until assigned */ });
  applyViewRef.current = (x: number, y: number, zoom: number, layerId: string): void => {
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

  // Stashed target view for a link into a sub-hex; applied once the drill lands.
  const pendingSubHexViewRef = useRef<{ x: number; y: number; zoom: number; layerId: string } | null>(null);

  useEffect(() => {
    const handleNavigateTo = (event: CustomEvent<NavigationEventDetail>): void => {
      const { mapId: targetMapId, x, y, zoom, layerId, subHexPath: targetSubHexPath } = event.detail;

      if (targetMapId !== mapId) return;

      // Link into a sub-hex: drill there first, then apply the view at that
      // level. Unless already at the target path (apply immediately). Root/
      // legacy links (no sub-hex segment) apply immediately — unchanged.
      if (
        drillToSubHexPath != null &&
        targetSubHexPath != null &&
        targetSubHexPath !== '' &&
        (subHexPath ?? '') !== targetSubHexPath
      ) {
        pendingSubHexViewRef.current = { x, y, zoom, layerId };
        drillToSubHexPath(targetSubHexPath, () => {
          const pendingView = pendingSubHexViewRef.current;
          pendingSubHexViewRef.current = null;
          if (pendingView != null) {
            applyViewRef.current(pendingView.x, pendingView.y, pendingView.zoom, pendingView.layerId);
          }
        });
        return;
      }

      applyViewRef.current(x, y, zoom, layerId);
    };

    window.addEventListener('windrose-navigate-to', handleNavigateTo);

    const pending = consumePendingNavigate(mapId);
    if (pending) {
      handleNavigateTo(new CustomEvent('windrose-navigate-to', { detail: pending }));
    }

    return () => {
      window.removeEventListener('windrose-navigate-to', handleNavigateTo);
    };
  }, [mapId, mapData, geometry, updateMapData, handleLayerSelect, drillToSubHexPath, subHexPath]);

  // Center-on-region events from region panel
  useEffect(() => {
    const handleCenterOnRegion = (event: CustomEvent<RegionIdDetail>): void => {
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

    activeDocument.addEventListener('windrose:center-on-region', handleCenterOnRegion);
    return () => activeDocument.removeEventListener('windrose:center-on-region', handleCenterOnRegion);
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
              const { linkedObject, ...rest } = obj;
              void linkedObject; // dropped from the copy
              return rest;
            })
          };
        })
      }));
    };

    const handleCreateObjectLink = (event: CustomEvent<CreateObjectLinkDetail>): void => {
      const { sourceLayerId, sourceObjectId, sourceLink, targetLayerId, targetObjectId, targetLink } = event.detail;
      updateObjectLinksAcrossLayers([
        { layerId: sourceLayerId, objectId: sourceObjectId, link: sourceLink },
        { layerId: targetLayerId, objectId: targetObjectId, link: targetLink }
      ]);
    };

    const handleRemoveObjectLink = (event: CustomEvent<RemoveObjectLinkDetail>): void => {
      const { sourceLayerId, sourceObjectId, targetLayerId, targetObjectId } = event.detail;
      updateObjectLinksAcrossLayers([
        { layerId: sourceLayerId, objectId: sourceObjectId },
        { layerId: targetLayerId, objectId: targetObjectId }
      ]);
    };

    window.addEventListener('windrose-create-object-link', handleCreateObjectLink);
    window.addEventListener('windrose-remove-object-link', handleRemoveObjectLink);

    return () => {
      window.removeEventListener('windrose-create-object-link', handleCreateObjectLink);
      window.removeEventListener('windrose-remove-object-link', handleRemoveObjectLink);
    };
  }, [updateMapData]);

  // Hex context menu (extracted)
  useHexContextMenu({ app, mapData, mapId, subHexPath, enterSubHex, handleRegionsChange });
}

export { useCustomEventHandlers };
