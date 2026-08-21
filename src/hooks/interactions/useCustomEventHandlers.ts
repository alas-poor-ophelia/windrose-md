/**
 * useCustomEventHandlers.ts
 *
 * Manages custom DOM event listeners for cross-component communication:
 * - windrose:hex-context-menu (right-click hex context menu)
 * - windrose-navigate-to (deep link navigation)
 * - windrose:center-on-region (region panel centering)
 * - windrose-create-object-link / windrose-remove-object-link (cross-layer linking)
 * - Escape key to exit sub-hex navigation
 *
 * Also builds the DIRECT sub-hex entry/exit callbacks (requestEnterSubHex /
 * requestExitSubHex) that the canvas interaction layer calls. These were DOM
 * events (windrose:enter/exit-sub-hex) until 2.3.2 — but dispatcher and
 * handler always belonged to the same mount, and the document-wide broadcast
 * made every co-mounted hex map dive in sympathy (and even silently mint
 * sub-maps on maps the user never touched). Instance-scoped events listened
 * on `activeDocument` MUST gate with isForeignInstanceEvent (fail-open).
 */

import type { MapData, Region } from '#types/core/map.types';
import type { MapDataUpdater } from '#types/hooks/mapData.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import { Notice } from 'obsidian';
import type { MapObject, ObjectLink } from '#types/objects/object.types';

import { useCallback, useEffect, useRef } from 'preact/hooks';
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
import { isForeignInstanceEvent } from '../../core/windroseEvents';
import { useHexContextMenu } from './useHexContextMenu';
import { DEFAULTS } from '../../core/dmtConstants';
import { calculateFitZoom, subHexAnchorToChildCenter } from '../../geometry/core/hexMeasurements';

interface UseCustomEventHandlersOptions {
  mapData: MapData | null;
  mapId: string;
  /** Per-mount instance id — gates instance-scoped events (fail-open). */
  instanceId: string;
  /** Whether this map block currently has focus; unfocused blocks ignore Escape. */
  isFocused?: boolean;
  geometry: ExtendedGeometry | null;
  updateMapData: MapDataUpdater;
  handleLayerSelect: (layerId: string) => void;
  enterSubHex: (q: number, r: number, viewOverride?: { zoom: number; center: { x: number; y: number } }) => void;
  exitSubHex: (seamlessExit?: SubHexExitDetail | null) => void;
  /** Drill into an absolute sub-hex path, then run onArrive. Deep-link navigation. */
  drillToSubHexPath?: (path: string | null, onArrive?: () => void) => void;
  isInSubHex: boolean;
  handleRegionsChange: (regions: Region[]) => void;
  /** Current drill-down path ('/'-joined hexKeys), null at root. */
  subHexPath?: string | null;
}

interface UseCustomEventHandlersResult {
  /**
   * Enter the sub-hex at (q, r), computing a fit-zoom view override from the
   * clicked anchor + live canvas size when no explicit override is supplied.
   * Called directly by this mount's canvas interaction layer (seamless dive,
   * double-click) — never by another mount's.
   */
  requestEnterSubHex: (detail: SubHexCoordDetail) => void;
  /** Exit the current sub-hex (seamless zoom-out surfacing). No-op at root. */
  requestExitSubHex: (detail: SubHexExitDetail | null) => void;
}

function useCustomEventHandlers({
  mapData,
  mapId,
  instanceId,
  isFocused,
  geometry,
  updateMapData,
  handleLayerSelect,
  enterSubHex,
  exitSubHex,
  drillToSubHexPath,
  isInSubHex,
  handleRegionsChange,
  subHexPath
}: UseCustomEventHandlersOptions): UseCustomEventHandlersResult {
  const app = useApp();

  // Escape key exits sub-hex drill-down. Focus-gated: the keydown listener is
  // document-wide, so without the gate one Escape press would surface EVERY
  // drilled-in map block in the window, not just the one being worked in.
  useEffect(() => {
    if (!isInSubHex) return undefined;

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (isFocused === false) return;
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
  }, [isInSubHex, exitSubHex, isFocused]);

  // Direct sub-hex entry (seamless dive, double-click, context menu re-uses
  // enterSubHex itself). Formerly the windrose:enter-sub-hex listener.
  const requestEnterSubHex = useCallback((detail: SubHexCoordDetail): void => {
    const { q, r, viewOverride, anchor, canvasSize } = detail;
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
          rings
        );
      }
      override = { zoom, center };
    }

    enterSubHex(q, r, override);
  }, [mapData, geometry, enterSubHex]);

  // Seamless zoom-out surfacing: the canvas calls this when a zoom-out tick
  // drops below the continuity zoom, carrying the child view at that instant
  // so the exit restores a continuous parent view. No-op at root. Formerly
  // the windrose:exit-sub-hex listener.
  const requestExitSubHex = useCallback((detail: SubHexExitDetail | null): void => {
    if (!isInSubHex) return;
    exitSubHex(detail);
  }, [isInSubHex, exitSubHex]);

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

    // Cosmetic: a deep-link navigation is a pan/zoom — a stale refusal of
    // this write must never raise the conflict panel (which tears down the
    // canvas tree; doing that mid-drill froze the UI for seconds).
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
    }, { cosmetic: true });

    new Notice(`Navigated to location on ${mapData?.name ?? 'map'}`);
  };

  // Stashed target view for a link into a sub-hex; applied once the drill lands.
  const pendingSubHexViewRef = useRef<{ x: number; y: number; zoom: number; layerId: string } | null>(null);

  useEffect(() => {
    const handleNavigateTo = (event: CustomEvent<NavigationEventDetail>): void => {
      const { mapId: targetMapId, x, y, zoom, layerId, subHexPath: targetSubHexPath } = event.detail;

      if (targetMapId !== mapId) return;
      // Same map mounted twice (block + embed): exactly ONE mount navigates.
      // Without the claim, both drill in parallel — a render storm that has
      // locked the UI for seconds on deep sub-hex links.
      if (event.detail.handled === true) return;
      event.detail.handled = true;

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
      if (isForeignInstanceEvent(event.detail, instanceId)) return;
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
  }, [mapData, geometry, updateMapData, instanceId]);

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
      if (isForeignInstanceEvent(event.detail, instanceId)) return;
      const { sourceLayerId, sourceObjectId, sourceLink, targetLayerId, targetObjectId, targetLink } = event.detail;
      updateObjectLinksAcrossLayers([
        { layerId: sourceLayerId, objectId: sourceObjectId, link: sourceLink },
        { layerId: targetLayerId, objectId: targetObjectId, link: targetLink }
      ]);
    };

    const handleRemoveObjectLink = (event: CustomEvent<RemoveObjectLinkDetail>): void => {
      if (isForeignInstanceEvent(event.detail, instanceId)) return;
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
  }, [updateMapData, instanceId]);

  // Hex context menu (extracted)
  useHexContextMenu({ app, mapData, mapId, instanceId, subHexPath, enterSubHex, handleRegionsChange });

  return { requestEnterSubHex, requestExitSubHex };
}

export { useCustomEventHandlers };
