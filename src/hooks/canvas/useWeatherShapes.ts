/**
 * useWeatherShapes.ts
 *
 * The world-space outlines of the map's weather areas (src/weather/skyClip),
 * shared by WeatherLayer (tint, sheen, badges) and WeatherSkyLayer (the
 * animated Sky's clips). Both layers render in the same pass with the same
 * inputs, so the outlines are traced once per input change and handed to
 * both: the result is cached per geometry instance (one per mounted map).
 *
 * Every area gets a shape here; the Sky keeps the ones it animates. That is
 * equivalent to tracing only the animated areas, because an area claims its
 * cells from the whole-map area whether or not it is drawn.
 *
 * Painted cells only matter when the whole-map area follows them (grid maps
 * and hex maps without bounds); then they are keyed by a cheap signature
 * (count + bounding box) instead of the array's identity, which changes on
 * every map edit.
 */

import type { Cell } from '#types/core/cell.types';
import type { FogOfWar, HexBounds } from '#types/core/map.types';
import type { HexOrientation } from '#types/settings/settings.types';
import type { WeatherArea } from '#types/contexts/weather.types';
import type { SkyShape } from '../../weather/skyClip';
import type { SkyCellGeometry } from '../../weather/skyCells';

import { useMemo } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useWeatherStore } from '../../context/WeatherContext';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { isHexCell } from '../../geometry/core/cellAccessor';
import { buildSkyShapes, cellWinding } from '../../weather/skyClip';
import { skyCellSource } from '../../weather/skyCells';
import { foggedAreaKeys } from '../../weather/weatherFog';

interface WeatherShapes {
  /** One shape per weather area with cells left after fog (store order) */
  shapes: SkyShape[];
  /** Winding of the cell polygons (+1 / -1), for projection and SVG paths */
  winding: 1 | -1;
  /** Fogged cells as "x,y" keys in area cell coordinates, or null */
  fogged: ReadonlySet<string> | null;
}

interface WeatherShapesInput {
  geometry: SkyCellGeometry;
  areas: readonly WeatherArea[];
  hexBounds: HexBounds | null | undefined;
  orientation: HexOrientation;
  fogOfWar: FogOfWar | null | undefined;
  paintedCells: readonly Cell[] | null | undefined;
}

interface CacheEntry {
  areas: readonly WeatherArea[];
  hexBounds: HexBounds | null | undefined;
  orientation: HexOrientation;
  fogOfWar: FogOfWar | null | undefined;
  painted: readonly Cell[] | null | undefined;
  paintedSignature: string;
  result: WeatherShapes;
}

const cache = new WeakMap<object, CacheEntry>();

/** Whether the whole-map area follows the painted cells (see skyCells.ts) */
function usesPaintedCells(geometry: SkyCellGeometry, hexBounds: HexBounds | null | undefined): boolean {
  return geometry.type === 'grid' || hexBounds == null;
}

/** Cheap content signature of the painted cells: count and bounding box */
function paintedCellsSignature(cells: readonly Cell[] | null | undefined): string {
  if (cells == null || cells.length === 0) return '0';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cell of cells) {
    const x = isHexCell(cell) ? cell.q : cell.x;
    const y = isHexCell(cell) ? cell.r : cell.y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return `${cells.length}:${minX},${minY},${maxX},${maxY}`;
}

/**
 * The weather shapes for these inputs, traced at most once per input
 * change per geometry instance. Pure apart from the cache.
 */
function getWeatherShapes(input: WeatherShapesInput): WeatherShapes {
  const { geometry, areas, hexBounds, orientation, fogOfWar, paintedCells } = input;
  const usesPainted = usesPaintedCells(geometry, hexBounds);
  const entry = cache.get(geometry);

  // The signature walks the cells: reuse it while the array is the same one
  let paintedSignature = '';
  if (usesPainted) {
    paintedSignature = entry != null && entry.painted === paintedCells
      ? entry.paintedSignature
      : paintedCellsSignature(paintedCells);
  }

  if (entry != null && entry.areas === areas && entry.hexBounds === hexBounds &&
      entry.orientation === orientation && entry.fogOfWar === fogOfWar &&
      entry.paintedSignature === paintedSignature) {
    entry.painted = paintedCells;
    return entry.result;
  }

  const fogged = foggedAreaKeys(fogOfWar, geometry.type, orientation);
  const source = skyCellSource(geometry, hexBounds, usesPainted ? paintedCells : null);
  const result: WeatherShapes = {
    shapes: areas.length > 0
      ? buildSkyShapes({ areas, fogged, cellVertices: source.cellVertices, mapCells: source.mapCells })
      : [],
    winding: cellWinding(source.cellVertices),
    fogged,
  };
  cache.set(geometry, { areas, hexBounds, orientation, fogOfWar, painted: paintedCells, paintedSignature, result });
  return result;
}

/**
 * The weather area outlines for the mounted map, or null when there is no
 * geometry or no weather area. Shared by the weather layers (see above).
 */
function useWeatherShapes(enabled: boolean): WeatherShapes | null {
  const { mapData, geometry } = useMapState();
  const weather = useWeatherStore();

  const activeLayer = mapData != null ? getActiveLayer(mapData) : null;
  const fogOfWar = activeLayer?.fogOfWar;
  const paintedCells = activeLayer?.cells;
  const orientation = mapData?.orientation ?? 'flat';
  const hexBounds = mapData?.hexBounds;
  const areas = weather.areas;

  // Painted cells re-run the memo only when the whole-map area follows them;
  // getWeatherShapes then compares their signature, not their identity
  const paintedKey = geometry != null && usesPaintedCells(geometry, hexBounds) ? paintedCells : null;

  return useMemo(() => {
    if (!enabled || geometry == null || areas.length === 0) return null;
    return getWeatherShapes({ geometry, areas, hexBounds, orientation, fogOfWar, paintedCells: paintedKey });
  }, [enabled, geometry, areas, hexBounds, orientation, fogOfWar, paintedKey]);
}

export { getWeatherShapes, paintedCellsSignature, useWeatherShapes };
