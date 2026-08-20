/**
 * useViewControls.ts
 *
 * Manages zoom in/out, compass rotation, and recenter-view controls.
 */

import type { HexBounds, MapData, StoredViewState } from '#types/core/map.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';

import { DEFAULTS } from '../../core/dmtConstants';
import { calculateContentFitView } from '../../geometry/core/contentFitView';
import { calculateFitZoom } from '../../geometry/core/hexMeasurements';
import { offsetToAxial } from '../../geometry/core/offsetCoordinates';




interface UseViewControlsOptions {
  mapData: MapData | null;
  updateMapData: (data: MapData | ((current: MapData) => MapData)) => void;
  handleViewStateChange: (viewState: StoredViewState) => void;
  /** Active geometry instance; needed to compute the content-fit view. */
  geometry: ExtendedGeometry | null;
  /** Returns the canvas's current pixel size, or null if not yet mounted. */
  getCanvasSize: () => { width: number; height: number } | null;
}

interface UseViewControlsResult {
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleCompassClick: () => void;
  handleRecenterView: () => void;
}

/**
 * Fallback "home" view for a hex map with no content to fit: mirrors the
 * default viewState computed at map creation (fileOperations.ts), so an
 * empty map recenters the same place it opened.
 */
function calculateHexHomeView(
  geometry: Extract<ExtendedGeometry, { type: 'hex' }>,
  canvasWidth: number,
  canvasHeight: number
): StoredViewState {
  const bounds: HexBounds | null = geometry.getBounds();

  if (!bounds) {
    return { zoom: DEFAULTS.initialZoom, center: { x: 0, y: 0 } };
  }

  const zoom = calculateFitZoom(geometry.hexSize, geometry.orientation, bounds, canvasWidth, canvasHeight);

  if (bounds.maxRing !== undefined) {
    // Radial (sub-hex) bounds are centered on the origin hex.
    return { zoom, center: { x: 0, y: 0 } };
  }

  const centerCol = Math.floor(bounds.maxCol / 2);
  const centerRow = Math.floor(bounds.maxRow / 2);
  const { q, r } = offsetToAxial(centerCol, centerRow, geometry.orientation);
  const { worldX, worldY } = geometry.hexToWorld(q, r);

  return { zoom, center: { x: worldX, y: worldY } };
}

/**
 * Fallback "home" view for a grid map with no content to fit: mirrors the
 * default viewState computed at map creation (fileOperations.ts).
 */
function calculateGridHomeView(mapData: MapData): StoredViewState {
  const dimensions = mapData.dimensions ?? DEFAULTS.dimensions;
  return {
    zoom: DEFAULTS.initialZoom,
    center: {
      x: Math.floor(dimensions.width / 2),
      y: Math.floor(dimensions.height / 2)
    }
  };
}

function useViewControls({
  mapData,
  updateMapData,
  handleViewStateChange,
  geometry,
  getCanvasSize
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

  const handleRecenterView = (): void => {
    if (!mapData || !geometry) return;

    const canvasSize = getCanvasSize() ?? DEFAULTS.canvasSize;

    const fitView = calculateContentFitView(mapData, geometry, canvasSize.width, canvasSize.height);
    if (fitView) {
      handleViewStateChange(fitView);
      return;
    }

    const homeView = geometry.type === 'hex'
      ? calculateHexHomeView(geometry, canvasSize.width, canvasSize.height)
      : calculateGridHomeView(mapData);
    handleViewStateChange(homeView);
  };

  return { handleZoomIn, handleZoomOut, handleCompassClick, handleRecenterView };
}

export { useViewControls };
