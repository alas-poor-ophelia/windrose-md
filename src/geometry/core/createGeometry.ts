/**
 * createGeometry.ts
 *
 * Builds the geometry instance for a map from its shape parameters.
 * Shared by DungeonMapTracker and MapCanvas so hex/grid construction
 * defaults stay in one place.
 */

import type { MapData } from '#types/core/map.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';

import { DEFAULTS } from '../../core/dmtConstants';
import { GridGeometry } from './GridGeometry';
import { HexGeometry } from './HexGeometry';

function createGeometry(mapData: MapData): ExtendedGeometry {
  const mapType = mapData.mapType ?? DEFAULTS.mapType;

  if (mapType === 'hex') {
    const hexSize = mapData.hexSize ?? DEFAULTS.hexSize;
    const orientation = mapData.orientation ?? DEFAULTS.hexOrientation;
    const hexBounds = mapData.hexBounds ?? null; // null = infinite (backward compat)
    return new HexGeometry(hexSize, orientation, hexBounds);
  }

  return new GridGeometry(mapData.gridSize ?? DEFAULTS.gridSize);
}

export { createGeometry };
