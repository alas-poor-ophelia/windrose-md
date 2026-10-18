/**
 * WeatherLayer.tsx
 *
 * Layer component for weather from the U+13080 Weather plugin. Resolves
 * each weather area's daily report for the store's view day (bound regions
 * and the whole-map area) and renders the static overlay: a tint, a ground
 * sheen when the store derives ground state, region badges, and the static
 * precipitation textures when the map's Sky animation is off (the animated
 * WeatherSkyLayer draws precipitation otherwise). Region name plates are
 * kept clear of the overlay so they stay readable on snowy ground.
 *
 * Area outlines come from useWeatherShapes (traced once, shared with the
 * Sky). Reads the per-map weather store (WeatherContext); does no work when
 * the weather plugin is unavailable or the map has no weather area.
 */

import type { VNode } from 'preact';
import type { GroundState } from '../../weather/groundState';

import { useMemo } from 'preact/hooks';
import { computeCentroid } from '../../geometry/renderers/regionRenderer';
import { classifyWeatherVisual, formatBadgeTemperature } from '../../weather/weatherVisuals';
import { skyShapeToSvgPath } from '../../weather/skyClip';
import { regionLabelSpots } from '../../weather/skyCells';
import { useWeatherShapes } from '../../hooks/canvas/useWeatherShapes';
import { WeatherOverlay } from '../overlays/WeatherOverlay';
import type { WeatherAreaVisual, WeatherGroundVisual } from '../overlays/WeatherOverlay';
import { useMapState } from '../../context/MapContext';
import { useWeatherStore } from '../../context/WeatherContext';

/** Props for WeatherLayer component */
export interface WeatherLayerProps {
  /** Visibility-toolbar toggle */
  visible: boolean;
}

/** A region shows its badge only while at least this share of it is out of the fog */
const BADGE_MIN_REVEALED = 0.5;
/** The whole-map area is tinted at this share of a region's strength: it is the backdrop, not a highlight */
const MAP_TINT_SCALE = 0.45;
/**
 * While the Sky animates, its own washes (overcast dimming, fog haze, snow
 * whitening) already colour the area; the tint steps back to this share so
 * the terrain stays readable.
 */
const SKY_TINT_SCALE = 0.45;
/**
 * Snow is a white wash over a light map: its tint is held to this share on
 * top of the scales above, so painted terrain still reads through it.
 */
const SNOW_TINT_SCALE = 0.55;
/** Snow sheen shows from this depth and is full at SNOW_FULL_CM */
const SNOW_MIN_CM = 1;
const SNOW_FULL_CM = 30;
/** Snow sheen strength range (light cover .. full cover) */
const SNOW_SHEEN_MIN = 0.35;
const SNOW_SHEEN_MAX = 0.75;
/** Mud stipple shows from this wetness */
const MUD_MIN = 0.3;
/** Mud stipple strength range (damp .. waterlogged) */
const MUD_SHEEN_MIN = 0.3;
const MUD_SHEEN_MAX = 0.7;

/** Sheen strengths for a ground state, or null when the ground is unremarkable */
function groundVisual(ground: Pick<GroundState, 'snowDepthCm' | 'mud'> | null): WeatherGroundVisual | null {
  if (ground == null) return null;
  const snow = ground.snowDepthCm >= SNOW_MIN_CM
    ? SNOW_SHEEN_MIN + (SNOW_SHEEN_MAX - SNOW_SHEEN_MIN) * Math.min(1, ground.snowDepthCm / SNOW_FULL_CM)
    : 0;
  const mud = snow === 0 && ground.mud >= MUD_MIN
    ? MUD_SHEEN_MIN + (MUD_SHEEN_MAX - MUD_SHEEN_MIN) * Math.min(1, (ground.mud - MUD_MIN) / (1 - MUD_MIN))
    : 0;
  return snow > 0 || mud > 0 ? { snow, mud } : null;
}

const WeatherLayer = ({ visible }: WeatherLayerProps): VNode | null => {
  const { mapData, geometry, canvasRef, viewController } = useMapState();
  const weather = useWeatherStore();
  const skyAnimates = weather.animate;

  const regions = mapData?.regions;
  const shapeData = useWeatherShapes(visible);
  const fogged = shapeData?.fogged ?? null;

  const areaVisuals = useMemo((): WeatherAreaVisual[] => {
    const day = weather.viewDay;
    if (shapeData == null || !weather.available || day == null || geometry == null) return [];
    const regionById = new Map((regions ?? []).map(region => [region.id, region]));
    const areaById = new Map(weather.areas.map(area => [area.id, area]));

    const visuals: WeatherAreaVisual[] = [];
    for (const shape of shapeData.shapes) {
      const report = weather.report(shape.zoneId, day);
      if (report == null) continue;
      const area = areaById.get(shape.id);

      let badgeAnchor: WeatherAreaVisual['badgeAnchor'] = null;
      const region = area?.regionId != null ? regionById.get(area.regionId) : undefined;
      // A hidden region hides its tint and badge, as it hides its fill
      if (region?.visible === false) continue;
      if (region != null && region.hexes.length > 0 && geometry.type === 'hex') {
        const anchor = region.labelPosition != null
          ? { worldX: region.labelPosition.x, worldY: region.labelPosition.y }
          : computeCentroid(region.hexes, geometry);
        // The overlay draws above the fog, so a badge must not sit on a hex
        // the players have not revealed
        const anchorCell = geometry.worldToGrid(anchor.worldX, anchor.worldY);
        const anchorFogged = fogged?.has(`${anchorCell.x},${anchorCell.y}`) === true;
        const revealed = fogged != null ? region.hexes.filter(h => !fogged.has(`${h.x},${h.y}`)).length : region.hexes.length;
        if (!anchorFogged && revealed / region.hexes.length >= BADGE_MIN_REVEALED) badgeAnchor = anchor;
      }

      const visual = classifyWeatherVisual(report);
      const ground = groundVisual(weather.ground(shape.zoneId, day));
      const snowy = visual.kind === 'snow' || (ground?.snow ?? 0) > 0;
      visuals.push({
        id: shape.id,
        path: skyShapeToSvgPath(shape, shapeData.winding),
        visual,
        tintScale: (shape.kind === 'map' ? MAP_TINT_SCALE : 1) * (skyAnimates ? SKY_TINT_SCALE : 1) * (snowy ? SNOW_TINT_SCALE : 1),
        ground,
        badgeAnchor,
        badgeText: formatBadgeTemperature(report, weather.units),
      });
    }
    return visuals;
  }, [shapeData, weather, regions, geometry, fogged, skyAnimates]);

  // Region name plates the overlay leaves clear (drawn on the canvas below it)
  const labelSpots = useMemo(
    () => (areaVisuals.length > 0 && geometry?.type === 'hex' ? regionLabelSpots(regions, geometry, fogged) : []),
    [areaVisuals.length, geometry, regions, fogged]
  );

  if (areaVisuals.length === 0) return null;

  return (
    <WeatherOverlay
      areas={areaVisuals}
      labels={labelSpots}
      textured={!skyAnimates}
      geometry={geometry}
      mapData={mapData}
      canvasRef={canvasRef}
      viewController={viewController}
    />
  );
};

export { WeatherLayer };
