/**
 * WeatherLayer.tsx
 *
 * Layer component for weather from the U+13080 Weather plugin. Resolves
 * each weather area's daily report for the store's view day (bound regions
 * and the whole-map area) and renders the static overlay: a tint, a ground
 * sheen when the store derives ground state, region badges, and the static
 * precipitation textures when the map's Sky animation is off (the animated
 * WeatherSkyLayer draws precipitation otherwise). Reads the per-map weather
 * store (WeatherContext); does no work when the weather plugin is
 * unavailable or the map has no weather area.
 */

import type { VNode } from 'preact';
import type { WeatherStore } from '#types/contexts/weather.types';

import { useMemo } from 'preact/hooks';
import { computeCentroid } from '../../geometry/renderers/regionRenderer';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { classifyWeatherVisual, formatBadgeTemperature } from '../../weather/weatherVisuals';
import { buildSkyShapes, cellWinding, skyShapeToSvgPath } from '../../weather/skyClip';
import { collectFoggedKeys, skyCellSource } from '../../weather/skyCells';
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
/** Snow sheen shows from this depth and is full at SNOW_FULL_CM */
const SNOW_MIN_CM = 1;
const SNOW_FULL_CM = 30;
/** Mud stipple shows from this wetness */
const MUD_MIN = 0.3;

type GroundReader = (zoneId: string, day: number) => { snowDepthCm: number; mud: number } | null;

/**
 * The store's ground reader when it has one. Feature-detected: the ground
 * derivation may be absent from the store this layer runs against.
 */
function groundReader(store: WeatherStore): GroundReader | null {
  const ground = (store as { ground?: unknown }).ground;
  return typeof ground === 'function' ? (ground as GroundReader) : null;
}

/** Sheen strengths for a ground state, or null when the ground is unremarkable */
function groundVisual(ground: { snowDepthCm: number; mud: number } | null): WeatherGroundVisual | null {
  if (ground == null) return null;
  const snow = ground.snowDepthCm >= SNOW_MIN_CM
    ? 0.4 + 0.6 * Math.min(1, ground.snowDepthCm / SNOW_FULL_CM)
    : 0;
  const mud = snow === 0 && ground.mud >= MUD_MIN ? 0.4 + 0.6 * Math.min(1, (ground.mud - MUD_MIN) / (1 - MUD_MIN)) : 0;
  return snow > 0 || mud > 0 ? { snow, mud } : null;
}

const WeatherLayer = ({ visible }: WeatherLayerProps): VNode | null => {
  const { mapData, geometry, canvasRef, viewController } = useMapState();
  const weather = useWeatherStore();

  const regions = mapData?.regions;
  const activeLayer = mapData != null ? getActiveLayer(mapData) : null;
  const fogOfWar = activeLayer?.fogOfWar;
  const paintedCells = activeLayer?.cells;
  const orientation = mapData?.orientation ?? 'flat';
  const hexBounds = mapData?.hexBounds;
  const mapType = geometry?.type ?? 'grid';
  const skyAnimates = mapData?.weatherAnimate !== false;

  const fogged = useMemo(
    () => collectFoggedKeys(fogOfWar, mapType, orientation),
    [fogOfWar, mapType, orientation]
  );

  // World-space outlines: only the areas, the fog and the geometry move them
  const shapeData = useMemo(() => {
    if (!visible || geometry == null || weather.areas.length === 0) return null;
    const source = skyCellSource(geometry, hexBounds, paintedCells);
    return {
      shapes: buildSkyShapes({ areas: weather.areas, fogged, cellVertices: source.cellVertices, mapCells: source.mapCells }),
      winding: cellWinding(source.cellVertices),
    };
  }, [visible, geometry, hexBounds, paintedCells, weather.areas, fogged]);

  const areaVisuals = useMemo((): WeatherAreaVisual[] => {
    const day = weather.viewDay;
    if (shapeData == null || !weather.available || day == null || geometry == null) return [];
    const readGround = groundReader(weather);
    const regionById = new Map((regions ?? []).map(region => [region.id, region]));

    const visuals: WeatherAreaVisual[] = [];
    for (const shape of shapeData.shapes) {
      const report = weather.report(shape.zoneId, day);
      if (report == null) continue;
      const area = weather.areas.find(a => a.id === shape.id);

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

      visuals.push({
        id: shape.id,
        path: skyShapeToSvgPath(shape, shapeData.winding),
        visual: classifyWeatherVisual(report),
        tintScale: (shape.kind === 'map' ? MAP_TINT_SCALE : 1) * (skyAnimates ? SKY_TINT_SCALE : 1),
        ground: groundVisual(readGround?.(shape.zoneId, day) ?? null),
        badgeAnchor,
        badgeText: formatBadgeTemperature(report, weather.units),
      });
    }
    return visuals;
  }, [shapeData, weather, regions, geometry, fogged, skyAnimates]);

  if (areaVisuals.length === 0) return null;

  return (
    <WeatherOverlay
      areas={areaVisuals}
      textured={!skyAnimates}
      geometry={geometry}
      mapData={mapData}
      canvasRef={canvasRef}
      viewController={viewController}
    />
  );
};

export { WeatherLayer };
