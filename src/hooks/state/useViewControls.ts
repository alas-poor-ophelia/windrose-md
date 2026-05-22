/**
 * useViewControls.ts
 *
 * Manages zoom in/out and compass rotation controls.
 */

import type { MapData, StoredViewState } from '#types/core/map.types';

import { DEFAULTS } from '../../core/dmtConstants';






interface UseViewControlsOptions {
  mapData: MapData | null;
  updateMapData: (data: MapData | ((current: MapData) => MapData)) => void;
  handleViewStateChange: (viewState: StoredViewState) => void;
}

interface UseViewControlsResult {
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleCompassClick: () => void;
}

function useViewControls({
  mapData,
  updateMapData,
  handleViewStateChange
}: UseViewControlsOptions): UseViewControlsResult {

  const handleZoomIn = (): void => {
    if (!mapData || !mapData.viewState) return;
    const newZoom = Math.min(
      DEFAULTS.maxZoom,
      mapData.viewState.zoom + DEFAULTS.zoomButtonStep
    );
    handleViewStateChange({
      ...mapData.viewState,
      zoom: newZoom
    });
  };

  const handleZoomOut = (): void => {
    if (!mapData || !mapData.viewState) return;
    const newZoom = Math.max(
      DEFAULTS.minZoom,
      mapData.viewState.zoom - DEFAULTS.zoomButtonStep
    );
    handleViewStateChange({
      ...mapData.viewState,
      zoom: newZoom
    });
  };

  const handleCompassClick = (): void => {
    if (!mapData) return;
    const rotations = [0, 90, 180, 270];
    const currentIndex = rotations.indexOf(mapData.northDirection ?? 0);
    const nextIndex = (currentIndex + 1) % rotations.length;
    const newRotation = rotations[nextIndex] ?? 0;

    const newMapData = {
      ...mapData,
      northDirection: newRotation
    };
    updateMapData(newMapData);
  };

  return { handleZoomIn, handleZoomOut, handleCompassClick };
}

export { useViewControls };