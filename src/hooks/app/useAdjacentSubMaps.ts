// useAdjacentSubMaps.ts - Adjacent sub-map previews while inside a sub-hex:
// the global show/hide toggle (plugin settings) and click-to-navigate on the
// drawn sibling grids and "+" empty-slot markers.

import { useCallback, useEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { App } from 'obsidian';
import type { MapData } from '#types/index';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { useSubHexNavigation } from '../interactions/useSubHexNavigation';
import { getSettings } from '../../core/settingsAccessor';
import { getSettingsWriter } from '../../persistence/tilesetArtSettings';
import { clientToWorld } from '../../geometry/core/viewportMath';

type SubHexNavigation = ReturnType<typeof useSubHexNavigation>;

interface UseAdjacentSubMapsOptions {
  app: App;
  isInSubHex: boolean;
  adjacentSubHexes: SubHexNavigation['adjacentSubHexes'];
  adjacentEmptySlots: SubHexNavigation['adjacentEmptySlots'];
  navigateToSibling: SubHexNavigation['navigateToSibling'];
  geometry: ExtendedGeometry | null;
  /** The mapData the canvas renders with (hex maps pinned to north 0). */
  renderMapData: MapData | null;
  containerRef: RefObject<HTMLElement>;
}

interface AdjacentSubMaps {
  showAdjacentSubMaps: boolean;
  setShowAdjacentSubMaps: (show: boolean) => void;
}

function useAdjacentSubMaps({ app, isInSubHex, adjacentSubHexes, adjacentEmptySlots, navigateToSibling, geometry, renderMapData, containerRef }: UseAdjacentSubMapsOptions): AdjacentSubMaps {
  // Adjacent sub-map visibility: persisted in global plugin settings
  const [showAdjacentSubMaps, setShowAdjacentSubMapsState] = useState(() =>
    getSettings().showAdjacentSubMaps ?? false
  );
  const setShowAdjacentSubMaps = useCallback((v: boolean) => {
    // saveSettings() dispatches windrose-settings-changed itself.
    const writer = getSettingsWriter(app);
    if (writer != null) {
      writer.settings.showAdjacentSubMaps = v;
      void writer.saveSettings();
    }
    setShowAdjacentSubMapsState(v);
  }, [app]);
  useEffect(() => {
    const handler = (): void => { setShowAdjacentSubMapsState(getSettings().showAdjacentSubMaps ?? false); };
    window.addEventListener('windrose-settings-changed', handler);
    return () => window.removeEventListener('windrose-settings-changed', handler);
  }, []);

  // Adjacent sub-map click-to-navigate
  useEffect((): (() => void) | undefined => {
    if (!showAdjacentSubMaps || !isInSubHex || (adjacentSubHexes.length === 0 && adjacentEmptySlots.length === 0) || geometry?.type !== 'hex' || !renderMapData) return undefined;
    const maxRing = renderMapData.hexBounds?.maxRing ?? 7;
    const tileStep = 2 * maxRing + 1;

    const handleAdjacentClick = (e: MouseEvent): void => {
      const canvas = (e.target as HTMLElement).closest('canvas');
      if (canvas == null) return;
      // Document-level listener: only react to clicks on THIS block's canvas,
      // or a click on any co-mounted map could hit-test against our adjacency
      // geometry and navigate this map sympathetically.
      if (containerRef.current == null || !containerRef.current.contains(canvas)) return;

      // Same transform as every other pointer path (CSS scale, inverse north
      // rotation about the buffer centre, hex world-px offset).
      const viewState = renderMapData.viewState;
      if (viewState == null) return;
      const { worldX: clickWorldX, worldY: clickWorldY } = clientToWorld(
        geometry, canvas, e.clientX, e.clientY, viewState, (renderMapData.northDirection ?? 0) % 360
      );

      // Check each adjacent sub-hex: is the click within its grid bounds?
      for (const adj of adjacentSubHexes) {
        const scaledQ = adj.dq * tileStep;
        const scaledR = adj.dr * tileStep;
        if (geometry.hexToWorld == null) continue;
        const offset = geometry.hexToWorld(scaledQ, scaledR);

        // Click relative to adjacent grid center
        const relX = clickWorldX - offset.worldX;
        const relY = clickWorldY - offset.worldY;

        // Check if within maxRing hex radius (approximate with world-space distance)
        const hexSize = geometry.hexSize ?? 1;
        const gridRadius = hexSize * Math.sqrt(3) * maxRing;
        if (relX * relX + relY * relY < gridRadius * gridRadius) {
          // Parse the hex key to get absolute q, r. Direct call — this was a
          // document event every co-mounted map obeyed (sympathetic zoom).
          const [aq, ar] = adj.hexKey.split(',').map(Number);
          navigateToSibling(aq, ar);
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      }

      // "+" affordances for empty adjacent slots: hit-test the marker circle
      // drawn where the sibling's label would sit (useCanvasRenderer keeps
      // position + radius in sync with this math). A hit creates the sibling
      // (or enters an existing-but-empty one) and navigates to it.
      for (const slot of adjacentEmptySlots) {
        if (geometry.hexToWorld == null) continue;
        const markerWorld = geometry.hexToWorld(slot.dq * (maxRing + 2), slot.dr * (maxRing + 2));
        const relX = clickWorldX - markerWorld.worldX;
        const relY = clickWorldY - markerWorld.worldY;
        // Drawn radius (screen px, matches the renderer) with a touch-friendly
        // hit slop, converted to world units at the current zoom.
        const hitRadiusWorld = (Math.max(12, 14 * viewState.zoom) * 1.6) / viewState.zoom;
        if (relX * relX + relY * relY < hitRadiusWorld * hitRadiusWorld) {
          const [aq, ar] = slot.hexKey.split(',').map(Number);
          navigateToSibling(aq, ar, { createIfMissing: true });
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      }
    };

    activeDocument.addEventListener('click', handleAdjacentClick, true);
    return () => activeDocument.removeEventListener('click', handleAdjacentClick, true);
  }, [showAdjacentSubMaps, isInSubHex, adjacentSubHexes, adjacentEmptySlots, geometry, renderMapData, navigateToSibling, containerRef]);

  return { showAdjacentSubMaps, setShowAdjacentSubMaps };
}

export { useAdjacentSubMaps };
export type { AdjacentSubMaps };
