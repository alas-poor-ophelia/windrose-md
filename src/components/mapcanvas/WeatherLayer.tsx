/**
 * WeatherLayer.tsx
 *
 * Layer component for weather from the U+13080 Weather plugin. Resolves
 * each weather-bound region's report for the world's current day and
 * renders the overlay; also publishes this map's hex-to-zone index so the
 * weather plugin's zone resolver can answer for it. Does no work beyond
 * that index when the weather plugin is unavailable or no region is bound.
 */

import type { VNode } from 'preact';
import type { FogOfWar } from '#types/core/map.types';
import type { HexOrientation } from '#types/settings/settings.types';

import { useEffect, useMemo } from 'preact/hooks';
import { computeCentroid } from '../../geometry/renderers/regionRenderer';
import type { HexGeometryLike } from '../../geometry/renderers/regionRenderer';
import { offsetToAxial } from '../../geometry/core/offsetCoordinates';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { buildCellZoneIndex, hasWeatherZone, publishMapZones } from '../../weather/weatherZones';
import { classifyWeatherVisual, formatBadgeTemperature } from '../../weather/weatherVisuals';
import { WeatherOverlay } from '../overlays/WeatherOverlay';
import type { WeatherRegionVisual } from '../overlays/WeatherOverlay';
import { useMapState } from '../../context/MapContext';
import { useWeather } from '../../hooks/state/useWeather';

/** Props for WeatherLayer component */
export interface WeatherLayerProps {
  /** Visibility-toolbar toggle. The zone index is published either way. */
  visible: boolean;
}

/** A region shows its badge only while at least this share of it is out of the fog */
const BADGE_MIN_REVEALED = 0.5;

/**
 * The active layer's fogged hexes as axial keys, or null when nothing is
 * fogged. Fogged hexes hide their weather, exactly as they hide the region
 * fill.
 */
function collectFoggedCells(fogOfWar: FogOfWar | null | undefined, orientation: HexOrientation): Set<string> | null {
  if (fogOfWar?.enabled !== true || fogOfWar.foggedCells == null || fogOfWar.foggedCells.length === 0) return null;
  const fogged = new Set<string>();
  for (const cell of fogOfWar.foggedCells) {
    const { q, r } = offsetToAxial(cell.col, cell.row, orientation);
    fogged.add(`${q},${r}`);
  }
  return fogged;
}

const WeatherLayer = ({ visible }: WeatherLayerProps): VNode | null => {
  const { mapData, geometry, canvasRef, viewController, mapId, isInSubHex } = useMapState();
  const weather = useWeather();

  const regions = mapData?.regions;
  const cellZones = useMemo(() => buildCellZoneIndex(regions), [regions]);

  // While drilled into a sub-hex, mapData is the sub-hex's map but mapId is
  // still the root's — publishing then would answer for the wrong hexes
  useEffect(() => {
    if (mapId == null || mapId === '' || isInSubHex === true || cellZones.size === 0) return undefined;
    return publishMapZones(mapId, cellZones);
  }, [mapId, isInSubHex, cellZones]);

  const fogOfWar = mapData != null ? getActiveLayer(mapData).fogOfWar : null;
  const orientation = mapData?.orientation ?? 'flat';

  const regionVisuals = useMemo((): WeatherRegionVisual[] => {
    if (!visible || !weather.available || cellZones.size === 0 || regions == null || geometry?.type !== 'hex') return [];
    const hexGeometry = geometry as unknown as HexGeometryLike;

    const fogged = collectFoggedCells(fogOfWar, orientation);

    const visuals: WeatherRegionVisual[] = [];
    for (const region of regions) {
      if (!region.visible || !hasWeatherZone(region) || region.hexes.length === 0) continue;
      const report = weather.reportFor(region.weatherZoneId);
      if (report == null) continue;

      const hexes = fogged != null
        ? region.hexes.filter(h => !fogged.has(`${h.x},${h.y}`))
        : region.hexes;
      if (hexes.length === 0) continue;

      const anchor = region.labelPosition != null
        ? { worldX: region.labelPosition.x, worldY: region.labelPosition.y }
        : computeCentroid(region.hexes, hexGeometry);
      // The overlay draws above the fog, so a badge must not sit on a hex
      // the players have not revealed
      const anchorCell = geometry.worldToGrid(anchor.worldX, anchor.worldY);
      const anchorFogged = fogged?.has(`${anchorCell.x},${anchorCell.y}`) === true;
      const showBadge = !anchorFogged && hexes.length / region.hexes.length >= BADGE_MIN_REVEALED;

      visuals.push({
        regionId: region.id,
        hexes,
        visual: classifyWeatherVisual(report),
        badgeAnchor: showBadge ? anchor : null,
        badgeText: formatBadgeTemperature(report, weather.units),
      });
    }
    return visuals;
  }, [visible, weather, cellZones, regions, geometry, fogOfWar, orientation]);

  if (regionVisuals.length === 0) return null;

  return (
    <WeatherOverlay
      regions={regionVisuals}
      geometry={geometry}
      mapData={mapData}
      canvasRef={canvasRef}
      viewController={viewController}
    />
  );
};

export { WeatherLayer };
