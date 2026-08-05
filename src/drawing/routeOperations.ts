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
import type { MeasurementRoute, SavedRoute } from '#types/core/map.types';
import type { DiagonalRule } from '#types/settings/settings.types';
import { closestPointOnSegment } from './segmentMath';

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

// ===========================================
// Terrain-aware route editing
// ===========================================

/**
 * Append a waypoint to a measurement route, defaulting the new segment's
 * terrain to the previous segment's terrain — or `firstSegmentTerrainId`
 * for the route's first segment (TM-21). A repeat click on the last
 * waypoint is a no-op.
 */
function appendRouteWaypoint(
  route: MeasurementRoute,
  point: Point,
  firstSegmentTerrainId: string | null
): MeasurementRoute {
  const nextPoints = appendWaypoint(route.points, point);
  if (nextPoints === route.points) return route;
  if (nextPoints.length < 2) {
    return { points: nextPoints, segmentTerrains: [] };
  }
  const previous = route.segmentTerrains[route.segmentTerrains.length - 1];
  const newTerrain = route.segmentTerrains.length > 0 ? (previous ?? null) : firstSegmentTerrainId;
  return { points: nextPoints, segmentTerrains: [...route.segmentTerrains, newTerrain] };
}

/**
 * Remove the last waypoint and its segment's terrain assignment.
 */
function removeLastRouteWaypoint(route: MeasurementRoute): MeasurementRoute {
  return {
    points: route.points.slice(0, -1),
    segmentTerrains: route.segmentTerrains.slice(0, -1),
  };
}

/**
 * Assign a terrain (or null = unassigned) to one segment by index.
 */
function setSegmentTerrain(
  route: MeasurementRoute,
  segmentIndex: number,
  terrainId: string | null
): MeasurementRoute {
  if (segmentIndex < 0 || segmentIndex >= route.segmentTerrains.length) return route;
  const segmentTerrains = [...route.segmentTerrains];
  segmentTerrains[segmentIndex] = terrainId;
  return { points: route.points, segmentTerrains };
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
 * Distance from a point to a line segment (both in the same coordinate
 * space). Used for route hover/tap hit-testing.
 */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  return closestPointOnSegment(ax, ay, bx, by, px, py).dist;
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
 * Update a saved route's style/name by id (points are immutable after save).
 * An explicit empty-string name removes the name. Unknown ids are a no-op.
 */
function updateSavedRoute(
  routes: SavedRoute[],
  routeId: string,
  updates: Partial<Omit<SavedRoute, 'id' | 'points'>>
): SavedRoute[] {
  return routes.map(r => {
    if (r.id !== routeId) return r;
    const next: SavedRoute = { ...r, ...updates };
    if (updates.name !== undefined && updates.name === '') {
      delete next.name;
    }
    return next;
  });
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
  appendRouteWaypoint,
  removeLastRouteWaypoint,
  setSegmentTerrain,
  computeSegmentDistances,
  sumDistances,
  distanceToSegment,
  createSavedRoute,
  updateSavedRoute,
  removeSavedRoute,
};
