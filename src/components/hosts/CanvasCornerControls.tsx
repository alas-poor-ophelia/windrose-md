// CanvasCornerControls.tsx - Controls drawn over the canvas corner: block-mode
// MapControls (zoom, compass, recenter, expand, settings, layers/regions rail
// toggles, visibility toolbar toggle) or, in full-pane, the standalone compass.

import type { VNode } from 'preact';
import type { MapData } from '#types/index';
import type { CompassWind } from '../../weather/skyWeather';
import { useMemo } from 'preact/hooks';
import { MapControls } from '../controls/MapControls';
import { WindroseCompass } from '../shared/WindroseCompass';
import { tooltipRef } from '../shared/obsidianTooltip';
import { useWeatherStore } from '../../context/WeatherContext';
import { createGeometry } from '../../geometry/core/createGeometry';
import { compassWind, pickCompassArea } from '../../weather/skyWeather';

/**
 * Wind for the compass needle: the whole-map area's wind, else the area
 * under the view centre, else the first area; null without weather. Reads
 * the daily report, or the hourly one when the Almanac sets a view hour.
 */
function useCompassWind(mapData: MapData): CompassWind | null {
  const weather = useWeatherStore();
  const centreX = mapData.viewState?.center.x;
  const centreY = mapData.viewState?.center.y;
  const { mapType, gridSize, hexSize, orientation, hexBounds } = mapData;
  return useMemo(() => {
    const day = weather.viewDay;
    if (!weather.available || day == null || weather.areas.length === 0) return null;
    let centreCell: { x: number; y: number } | null = null;
    if (centreX != null && centreY != null && !weather.areas.some(area => area.kind === 'map')) {
      // createGeometry reads only these shape fields
      const geometry = createGeometry({ mapType, gridSize, hexSize, orientation, hexBounds } as MapData);
      // View centres are world px on hex maps, cell units on grid maps
      const scale = geometry.type === 'hex' ? 1 : geometry.cellSize;
      centreCell = geometry.worldToGrid(centreX * scale, centreY * scale);
    }
    const area = pickCompassArea(weather.areas, weather.areaAt, centreCell);
    if (area == null) return null;
    const report = weather.report(area.zoneId, day, weather.viewTime.hour);
    return report != null ? compassWind(report, weather.classify(report)) : null;
  }, [weather, centreX, centreY, mapType, gridSize, hexSize, orientation, hexBounds]);
}

interface BlockControlsState {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenterView: () => void;
  onSettingsClick: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  railOpenId: string | null;
  setRailOpenId: (update: (prev: string | null) => string | null) => void;
  regionsEnabled: boolean;
  showVisibilityToolbar: boolean;
  setShowVisibilityToolbar: (show: boolean) => void;
  /** Closing the visibility toolbar also closes the fog tools it opened. */
  showFogTools: boolean;
  onFogToolsToggle: () => void;
  alwaysShowControls: boolean;
}

interface CanvasCornerControlsProps {
  mapData: MapData;
  onCompassClick: () => void;
  /** Block-mode controls; null in full-pane (compass only) or picture frame (nothing). */
  block: BlockControlsState | null;
  showStandaloneCompass: boolean;
}

const CanvasCornerControls = ({ mapData, onCompassClick, block, showStandaloneCompass }: CanvasCornerControlsProps): VNode => {
  const north = mapData.northDirection ?? 0;
  const wind = useCompassWind(mapData);
  const standaloneTitle = `North: ${north}° — Click to rotate` + (wind != null ? `\n${wind.label}` : '');
  return (
    <>
      {block != null && (
        <MapControls
          onZoomIn={block.onZoomIn}
          onZoomOut={block.onZoomOut}
          onCompassClick={onCompassClick}
          onRecenterView={block.onRecenterView}
          onSettingsClick={block.onSettingsClick}
          northDirection={north}
          wind={wind}
          currentZoom={mapData.viewState?.zoom ?? 1}
          isExpanded={block.isExpanded}
          onToggleExpand={block.onToggleExpand}
          hideExpand={false}
          minimalControls
          mapType={mapData.mapType}
          showLayerPanel={block.railOpenId === 'layers'}
          onToggleLayerPanel={() => block.setRailOpenId(prev => prev === 'layers' ? null : 'layers')}
          showRegionPanel={block.railOpenId === 'regions'}
          onToggleRegionPanel={block.regionsEnabled ? () => block.setRailOpenId(prev => prev === 'regions' ? null : 'regions') : undefined}
          showVisibilityToolbar={block.showVisibilityToolbar}
          onToggleVisibilityToolbar={() => {
            const closing = block.showVisibilityToolbar;
            block.setShowVisibilityToolbar(!block.showVisibilityToolbar);
            if (closing && block.showFogTools) block.onFogToolsToggle();
          }}
          alwaysShowControls={block.alwaysShowControls}
        />
      )}
      {showStandaloneCompass && (
        <div
          className="windrose-compass-standalone"
          onClick={onCompassClick}
          ref={tooltipRef(standaloneTitle)}
        >
          <WindroseCompass rotation={north} className="windrose-compass-svg" wind={wind} />
        </div>
      )}
    </>
  );
};

export { CanvasCornerControls };

