/**
 * weatherFog.ts
 *
 * The fog rule for weather UI: weather never reveals anything about cells
 * or areas the players have not uncovered. One pure view over the shown
 * level's active-layer fog answers "is this cell fogged" and "is this
 * weather area revealed"; every weather surface (Almanac, region panel,
 * rail/dock offers, overlay, sky, measure tool) asks it instead of reading
 * fog itself.
 *
 * Coordinates: weather area cells are hex axial {x: q, y: r} or grid
 * {x: col, y: row}; fog is stored in offset (col, row), so hex fog is
 * converted once per fog array (cached on the array's identity: fog
 * updates are immutable, a change is a new array).
 *
 * WeatherProvider (src/context/WeatherContext.tsx) builds the view for the
 * level being shown and provides it; `useWeatherFog()` reads it. Outside a
 * provider the view is inert (nothing fogged, no areas).
 */

// Type-only imports
import type { Cell } from '#types/core/cell.types';
import type { FogOfWar, HexBounds } from '#types/core/map.types';
import type { WeatherArea } from '#types/contexts/weather.types';
import type { HexOrientation } from '#types/settings/settings.types';

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { offsetToAxial } from '../geometry/core/offsetCoordinates';
import { isHexCell } from '../geometry/core/cellAccessor';

/** A region counts as revealed while at least this share of its cells is out of the fog (the badge rule) */
const WEATHER_MIN_REVEALED = 0.5;

export interface WeatherFogView {
  /** Current level, active layer fog; hex axial {x:q,y:r} / grid {x:col,y:row} */
  isFogged(cell: { x: number; y: number }): boolean;
  /** Regions: >= 50% of cells unfogged; 'all' areas: any non-fogged map cell exists, or no fog */
  areaRevealed(area: WeatherArea): boolean;
  /** The areas filtered by areaRevealed (stable identity while inputs unchanged) */
  revealedAreas: WeatherArea[];
}

/** The fog and map shape of the level being shown */
export interface WeatherFogInput {
  /** The active layer's fog */
  fogOfWar: FogOfWar | null | undefined;
  mapType: 'grid' | 'hex';
  orientation: HexOrientation;
  /** A bounded hex map's bounds: the whole-map area covers exactly these cells */
  hexBounds?: HexBounds | null;
  /** The active layer's painted cells: the whole-map area of an unbounded map */
  paintedCells?: readonly Cell[] | null;
}

// ===========================================
// Fogged cells in area coordinates
// ===========================================

const keyCache = new WeakMap<readonly unknown[], Map<string, Set<string>>>();

function areaCellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Fogged cells as "x,y" keys in weather-area cell coordinates, or null when
 * the layer has no active fog. Cached per foggedCells array (and geometry).
 */
function foggedAreaKeys(
  fogOfWar: FogOfWar | null | undefined,
  mapType: 'grid' | 'hex',
  orientation: HexOrientation
): Set<string> | null {
  if (fogOfWar?.enabled !== true || fogOfWar.foggedCells.length === 0) return null;
  const cells = fogOfWar.foggedCells;
  const variant = mapType === 'hex' ? `hex|${orientation}` : 'grid';
  let byVariant = keyCache.get(cells);
  if (byVariant == null) {
    byVariant = new Map();
    keyCache.set(cells, byVariant);
  }
  let keys = byVariant.get(variant);
  if (keys == null) {
    keys = new Set();
    for (const cell of cells) {
      if (mapType === 'hex') {
        const { q, r } = offsetToAxial(cell.col, cell.row, orientation);
        keys.add(areaCellKey(q, r));
      } else {
        keys.add(areaCellKey(cell.col, cell.row));
      }
    }
    byVariant.set(variant, keys);
  }
  return keys;
}

// ===========================================
// Revealed rules
// ===========================================

/** Hex ring of an axial cell from the origin */
function hexRing(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

/**
 * Whether the whole-map area shows any cell out of the fog: a bounded hex
 * map compares the fogged count inside the bounds with the cell count; an
 * unbounded map asks its painted cells; a map with nothing painted is the
 * whole canvas, which fog cannot cover.
 */
function anyMapCellRevealed(input: WeatherFogInput, fogged: Set<string>): boolean {
  const { mapType, hexBounds } = input;
  if (mapType === 'hex' && hexBounds != null) {
    if (hexBounds.maxRing !== undefined) {
      const ring = Math.max(0, hexBounds.maxRing);
      const total = 1 + 3 * ring * (ring + 1);
      let inside = 0;
      for (const key of fogged) {
        const [q, r] = key.split(',').map(Number);
        if (hexRing(q, r) <= ring) inside++;
      }
      return inside < total;
    }
    if (hexBounds.maxCol > 0 && hexBounds.maxRow > 0) {
      const inside = new Set<string>();
      for (const cell of input.fogOfWar?.foggedCells ?? []) {
        if (cell.col >= 0 && cell.col < hexBounds.maxCol && cell.row >= 0 && cell.row < hexBounds.maxRow) {
          inside.add(areaCellKey(cell.col, cell.row));
        }
      }
      return inside.size < hexBounds.maxCol * hexBounds.maxRow;
    }
  }
  const painted = input.paintedCells;
  if (painted == null || painted.length === 0) return true;
  return painted.some(cell => (isHexCell(cell)
    ? !fogged.has(areaCellKey(cell.q, cell.r))
    : !fogged.has(areaCellKey(cell.x, cell.y))));
}

function regionRevealed(cells: ReadonlyArray<{ x: number; y: number }>, fogged: Set<string> | null): boolean {
  if (cells.length === 0) return false;
  if (fogged == null) return true;
  let open = 0;
  for (const cell of cells) {
    if (!fogged.has(areaCellKey(cell.x, cell.y))) open++;
  }
  return open / cells.length >= WEATHER_MIN_REVEALED;
}

/**
 * The fog view over `areas` for one level. Pure: the same inputs give the
 * same answers; `revealedAreas` is `areas` itself when every area is
 * revealed.
 */
function buildWeatherFogView(areas: WeatherArea[], input: WeatherFogInput): WeatherFogView {
  const fogged = foggedAreaKeys(input.fogOfWar, input.mapType, input.orientation);
  let mapRevealed: boolean | null = null;
  const areaRevealed = (area: WeatherArea): boolean => {
    if (fogged == null) return true;
    if (area.cells === 'all') {
      mapRevealed ??= anyMapCellRevealed(input, fogged);
      return mapRevealed;
    }
    return regionRevealed(area.cells, fogged);
  };
  const revealed = areas.filter(areaRevealed);
  return {
    isFogged: cell => fogged?.has(areaCellKey(cell.x, cell.y)) === true,
    areaRevealed,
    revealedAreas: revealed.length === areas.length ? areas : revealed,
  };
}

/**
 * Keep the previous list when it holds the same areas (by identity) in the
 * same order, so consumers' memos do not churn on edits that leave the
 * revealed set alone (painting, fog strokes elsewhere).
 */
function sameAreaList(a: WeatherArea[], b: WeatherArea[]): boolean {
  return a === b || (a.length === b.length && a.every((area, i) => area === b[i]));
}

// ===========================================
// Context
// ===========================================

/** The view outside a provider: nothing fogged, no areas */
const INERT_WEATHER_FOG_VIEW: WeatherFogView = {
  isFogged: () => false,
  areaRevealed: () => true,
  revealedAreas: [],
};

const WeatherFogContext = createContext<WeatherFogView | null>(null);

/** The fog view of the level being shown (WeatherProvider); inert outside one */
function useWeatherFog(): WeatherFogView {
  return useContext(WeatherFogContext) ?? INERT_WEATHER_FOG_VIEW;
}

export {
  WEATHER_MIN_REVEALED,
  foggedAreaKeys,
  buildWeatherFogView,
  sameAreaList,
  WeatherFogContext,
  useWeatherFog,
};
