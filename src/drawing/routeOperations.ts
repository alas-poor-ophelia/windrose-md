/**
 * routeOperations.ts
 *
 * Pure operations for multi-waypoint measurement routes and saved routes.
 * Waypoints are cell coordinates ({x: col, y: row} on grid maps, {x: q, y: r}
 * axial on hex maps); all distances are computed through the map's geometry
 * so grid diagonal rules and true hex distance apply uniformly.
 *
 * All functions return new arrays/objects (immutable updates) so they compose
 * with data-change handlers and history tracking.
 */

// Type-only imports
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { SavedRoute } from '#types/core/map.types';
import type { DiagonalRule } from '#types/settings/settings.types';

/** Defaults for a freshly saved route */
const SAVED_ROUTE_DEFAULTS = {
  color: '#c4a57b',
  width: 3,
  showLabel: true,
};

/**
 * Generate a unique saved route ID
 */
function generateRouteId(): string {
  return 'route-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

/**
 * Append a waypoint to a route. A click on the same cell as the current
 * last waypoint is a no-op (returns the original array) so double-taps
 * never create zero-length segments.
 */
function appendWaypoint(points: Point[], point: Point): Point[] {
  const last = points[points.length - 1];
  if (last != null && last.x === point.x && last.y === point.y) return points;
  return [...points, { ...point }];
}

/**
 * Remove the last waypoint from a route.
 */
function removeLastWaypoint(points: Point[]): Point[] {
  return points.slice(0, -1);
}

/**
 * Compute per-segment distances in cells for a waypoint sequence.
 * Returns an array of length points.length - 1 (empty for 0 or 1 points).
 */
function computeSegmentDistances(
  points: Point[],
  geometry: IGeometry,
  diagonalRule: DiagonalRule
): number[] {
  const distances: number[] = [];
  for (let i = 1; i < points.length; i++) {
    distances.push(geometry.getCellDistance(
      points[i - 1].x, points[i - 1].y,
      points[i].x, points[i].y,
      { diagonalRule }
    ));
  }
  return distances;
}

/**
 * Sum a list of segment distances.
 */
function sumDistances(segments: number[]): number {
  return segments.reduce((total, d) => total + d, 0);
}

/**
 * Create a permanent saved route from a measured waypoint sequence.
 * Requires at least 2 points; throws otherwise (callers gate on length).
 */
function createSavedRoute(
  points: Point[],
  overrides: Partial<Omit<SavedRoute, 'id' | 'points'>> = {}
): SavedRoute {
  if (points.length < 2) {
    throw new Error('A saved route requires at least 2 waypoints');
  }
  return {
    id: generateRouteId(),
    ...(overrides.name !== undefined && overrides.name !== '' ? { name: overrides.name } : {}),
    points: points.map(p => ({ ...p })),
    color: overrides.color ?? SAVED_ROUTE_DEFAULTS.color,
    width: overrides.width ?? SAVED_ROUTE_DEFAULTS.width,
    showLabel: overrides.showLabel ?? SAVED_ROUTE_DEFAULTS.showLabel,
    ...(overrides.segmentTerrains !== undefined ? { segmentTerrains: [...overrides.segmentTerrains] } : {}),
  };
}

/**
 * Remove a saved route by id. Returns a new array; the original is not modified.
 */
function removeSavedRoute(routes: SavedRoute[], routeId: string): SavedRoute[] {
  return routes.filter(r => r.id !== routeId);
}

export {
  SAVED_ROUTE_DEFAULTS,
  appendWaypoint,
  removeLastWaypoint,
  computeSegmentDistances,
  sumDistances,
  createSavedRoute,
  removeSavedRoute,
};
