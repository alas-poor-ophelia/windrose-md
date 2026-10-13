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
import { mintId } from '../core/ids';
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
  return mintId('route');
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
 * The shape every terrain-aware route operation needs: a waypoint list plus
 * the two parallel per-segment arrays. Both MeasurementRoute (in-progress)
 * and SavedRoute satisfy it, so one set of helpers serves both.
 */
type TerrainRouteLike = {
  points: Point[];
  segmentTerrains?: (string | null)[];
  segmentTerrainAuto?: boolean[];
};

/**
 * Read a route's per-segment auto flags, normalized to one entry per
 * segment. A missing array (every pre-2.4.0 save) reads as all-manual —
 * automatic categorization must never clobber terrain it did not write.
 */
function getSegmentTerrainAuto(route: TerrainRouteLike): boolean[] {
  const flags = route.segmentTerrainAuto ?? [];
  return (route.segmentTerrains ?? []).map((_, i) => flags[i] === true);
}

/**
 * Rebuild a route with new segment arrays. `segmentTerrainAuto` is only
 * written when at least one segment is auto, so hand-categorized routes
 * keep saving exactly the bytes 2.3.5 wrote (undefined === all false).
 */
function withSegmentTerrains<T extends TerrainRouteLike>(
  route: T,
  segmentTerrains: (string | null)[],
  autoFlags: boolean[]
): T & TerrainRouteLike {
  const next = { ...route, segmentTerrains } as T & TerrainRouteLike;
  const mutable = next as TerrainRouteLike;
  if (autoFlags.some(flag => flag)) {
    mutable.segmentTerrainAuto = autoFlags;
  } else {
    delete mutable.segmentTerrainAuto;
  }
  return next;
}

/**
 * Append a waypoint to a measurement route, defaulting the new segment's
 * terrain to the previous segment's terrain — or `firstSegmentTerrainId`
 * for the route's first segment (TM-21). A repeat click on the last
 * waypoint is a no-op.
 *
 * The new segment inherits the previous segment's auto flag: a route the
 * sampler owns stays re-sampleable as it grows, while a hand-categorized
 * route keeps its carried-forward pick manual. The route's first segment
 * is always manual — `firstSegmentTerrainId` is a user setting, not a
 * sample. Callers that sample immediately after appending should overwrite
 * with setSegmentTerrainAuto.
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
  const hadSegments = route.segmentTerrains.length > 0;
  const newTerrain = hadSegments ? (previous ?? null) : firstSegmentTerrainId;
  const flags = getSegmentTerrainAuto(route);
  const inheritedFlag = hadSegments ? flags[flags.length - 1] === true : false;
  return withSegmentTerrains(
    { ...route, points: nextPoints },
    [...route.segmentTerrains, newTerrain],
    [...flags, inheritedFlag]
  );
}

/**
 * Remove the last waypoint and its segment's terrain assignment.
 */
function removeLastRouteWaypoint(route: MeasurementRoute): MeasurementRoute {
  return withSegmentTerrains(
    { ...route, points: route.points.slice(0, -1) },
    route.segmentTerrains.slice(0, -1),
    getSegmentTerrainAuto(route).slice(0, -1)
  );
}

/**
 * Assign a terrain (or null = unassigned) to one segment by index. This is
 * the manual path — the picker and its Clear action — so the segment is
 * marked NOT auto and later automatic passes will leave it alone.
 */
function setSegmentTerrain<T extends TerrainRouteLike>(
  route: T,
  segmentIndex: number,
  terrainId: string | null
): T & TerrainRouteLike {
  const current = route.segmentTerrains ?? [];
  if (segmentIndex < 0 || segmentIndex >= current.length) return route;
  const segmentTerrains = [...current];
  segmentTerrains[segmentIndex] = terrainId;
  const flags = getSegmentTerrainAuto(route);
  flags[segmentIndex] = false;
  return withSegmentTerrains(route, segmentTerrains, flags);
}

/**
 * Assign a terrain to one segment on behalf of the automatic sampler and
 * mark it auto, so a later re-categorization may replace it. A null id
 * ("sampled, matched nothing") still counts as auto-owned.
 */
function setSegmentTerrainAuto<T extends TerrainRouteLike>(
  route: T,
  segmentIndex: number,
  terrainId: string | null
): T & TerrainRouteLike {
  const current = route.segmentTerrains ?? [];
  if (segmentIndex < 0 || segmentIndex >= current.length) return route;
  const segmentTerrains = [...current];
  segmentTerrains[segmentIndex] = terrainId;
  const flags = getSegmentTerrainAuto(route);
  flags[segmentIndex] = true;
  return withSegmentTerrains(route, segmentTerrains, flags);
}

/**
 * Write a whole pass of sampled terrains onto a route.
 *
 * A segment is only overwritten when the sampler already owns it (auto
 * flag true). A cleared segment (null, flag false) is indistinguishable
 * from an untouched one in the saved data, so neither is filled here:
 * anything without the auto flag survives unless `overwriteManual` is set
 * (the route card's explicit "recategorize everything" action). `results`
 * entries past the segment
 * count are ignored, and a shorter `results` leaves the tail untouched.
 * Returns the original route when nothing changed.
 */
function applyAutoTerrains<T extends TerrainRouteLike>(
  route: T,
  results: (string | null)[],
  overwriteManual = false
): T & TerrainRouteLike {
  const current = route.segmentTerrains ?? [];
  if (current.length === 0) return route;
  const flags = getSegmentTerrainAuto(route);
  const segmentTerrains = [...current];
  let changed = false;
  for (let i = 0; i < segmentTerrains.length && i < results.length; i++) {
    const eligible = overwriteManual || flags[i];
    if (!eligible) continue;
    if (segmentTerrains[i] !== results[i] || !flags[i]) changed = true;
    segmentTerrains[i] = results[i];
    flags[i] = true;
  }
  if (!changed) return route;
  return withSegmentTerrains(route, segmentTerrains, flags);
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
 * True Euclidean ("as the crow flies") world-pixel length of a waypoint
 * polyline: the sum of straight-line distances between consecutive cell
 * centers. Unlike computeSegmentDistances (hex-metric cell count, where a
 * straight and an L-shaped path between the same endpoints tie), this
 * grows with the actual drawn path length — an L-shaped route reports a
 * longer euclidean length than a straight one.
 *
 * Measured from cell centers in world pixels; getCellDistance is a cell-count
 * metric on hex maps, so it is not usable here.
 */
function computeEuclideanPathLength(points: Point[], geometry: IGeometry): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = geometry.getCellCenter(points[i - 1].x, points[i - 1].y);
    const b = geometry.getCellCenter(points[i].x, points[i].y);
    total += Math.hypot(b.worldX - a.worldX, b.worldY - a.worldY);
  }
  return total;
}

/**
 * World-pixel distance spanning one cell step — the center-to-center
 * distance between two adjacent cells — derived from the geometry's own
 * getCellCenter so it stays correct if hex size / cell size changes.
 * Used to convert a Euclidean pixel length into real-world units.
 */
function getCellPitchPixels(geometry: IGeometry): number {
  const a = geometry.getCellCenter(0, 0);
  const b = geometry.getCellCenter(1, 0);
  return Math.hypot(b.worldX - a.worldX, b.worldY - a.worldY);
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
    // Only written when the sampler owns a segment, so a hand-categorized
    // route still saves exactly the bytes 2.3.5 wrote.
    ...(overrides.segmentTerrainAuto?.some(flag => flag) === true
      ? { segmentTerrainAuto: [...overrides.segmentTerrainAuto] }
      : {}),
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
  setSegmentTerrainAuto,
  applyAutoTerrains,
  getSegmentTerrainAuto,
  computeSegmentDistances,
  sumDistances,
  computeEuclideanPathLength,
  getCellPitchPixels,
  distanceToSegment,
  createSavedRoute,
  updateSavedRoute,
  removeSavedRoute,
};
