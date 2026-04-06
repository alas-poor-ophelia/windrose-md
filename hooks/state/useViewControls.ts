/**
 * useViewControls.ts
 *
 * Manages zoom in/out and compass rotation controls.
 */

import type { MapData, ViewState } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { DEFAULTS } = await requireModuleByName("dmtConstants.ts");

interface UseViewControlsOptions {
  mapData: MapData | null;
  updateMapData: (data: MapData | ((current: MapData) => MapData)) => void;
  handleViewStateChange: (viewState: ViewState) => void;
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
    if (!mapData) return;
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
    if (!mapData) return;
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
    const currentIndex = rotations.indexOf(mapData.northDirection);
    const nextIndex = (currentIndex + 1) % rotations.length;
    const newRotation = rotations[nextIndex];

    const newMapData = {
      ...mapData,
      northDirection: newRotation
    };
    updateMapData(newMapData);
  };

  return { handleZoomIn, handleZoomOut, handleCompassClick };
}

return { useViewControls };
