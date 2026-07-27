/**
 * useDistanceMeasurement.ts
 *
 * Hook for the multi-waypoint distance measurement tool.
 * Each click/tap appends a waypoint; a live preview segment follows the
 * cursor from the last waypoint (mouse) and is included in the running
 * total. Supports remove-last, clear-all, and per-segment terrain
 * assignment (new segments inherit the previous segment's terrain; the
 * first segment takes the caller-provided default).
 *
 * The committed route is reported to the caller via onRouteChange so it can
 * persist with the map (one current route per map); when the tool activates,
 * the persisted route is restored.
 */

// Type-only imports
import type { MapType, MeasurementRoute } from '#types/core/map.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { ToolId } from '#types/tools/tool.types';
import type { PluginSettings } from '#types/settings/settings.types';
import type {
  MeasurementPoint,
  EffectiveDistanceSettings,
  MapDistanceOverrides,
  UseDistanceMeasurementResult,
} from '#types/hooks/distanceMeasurement.types';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatDistance, getEffectiveDistanceSettings } from '../../drawing/distanceOperations';
import {
  appendRouteWaypoint,
  computeSegmentDistances,
  removeLastRouteWaypoint,
  setSegmentTerrain,
  sumDistances,
} from '../../drawing/routeOperations';

const EMPTY_ROUTE: MeasurementRoute = { points: [], segmentTerrains: [] };

/** Accept the legacy bare-array persisted shape defensively */
function normalizeRoute(route: MeasurementRoute | MeasurementPoint[] | undefined): MeasurementRoute | undefined {
  if (route == null) return undefined;
  if (Array.isArray(route)) return { points: route, segmentTerrains: [] };
  return route;
}

/**
 * Hook for managing multi-waypoint distance measurement state
 */
const useDistanceMeasurement = (
  currentTool: ToolId,
  geometry: IGeometry | null,
  mapType: MapType,
  globalSettings: PluginSettings,
  mapDistanceOverrides: MapDistanceOverrides | null,
  persistedRoute?: MeasurementRoute,
  onRouteChange?: (route: MeasurementRoute) => void,
  /** Terrain the route's FIRST segment defaults to (TM-21); null = unassigned */
  firstSegmentTerrainId: string | null = null
): UseDistanceMeasurementResult => {
  const [route, setRoute] = useState<MeasurementRoute>(EMPTY_ROUTE);
  const [previewTarget, setPreviewTarget] = useState<MeasurementPoint | null>(null);

  const waypoints = route.points;

  const distanceSettings = useMemo((): EffectiveDistanceSettings => {
    return getEffectiveDistanceSettings(mapType, globalSettings, mapDistanceOverrides);
  }, [mapType, globalSettings, mapDistanceOverrides]);

  // Restore the persisted route once per tool activation; drop only the
  // transient preview when the tool deactivates (the committed route
  // persists with the map, so returning to the tool resumes it). The
  // persisted route may arrive after activation (async map load), so the
  // effect also watches persistedRoute — the flag stops write-backs of our
  // own commits from re-restoring.
  const didRestoreRef = useRef(false);

  useEffect(() => {
    if (currentTool === 'measure') {
      const restored = normalizeRoute(persistedRoute);
      if (!didRestoreRef.current && restored != null && restored.points.length > 0) {
        didRestoreRef.current = true;
        setRoute({
          points: restored.points.map(p => ({ x: p.x, y: p.y })),
          segmentTerrains: [...restored.segmentTerrains],
        });
      }
    } else {
      didRestoreRef.current = false;
      setRoute(EMPTY_ROUTE);
      setPreviewTarget(null);
    }
  }, [currentTool, persistedRoute]);

  /** Commit a route change to local state and the persisted route */
  const commitRoute = useCallback((next: MeasurementRoute): void => {
    setRoute(next);
    onRouteChange?.(next);
  }, [onRouteChange]);

  /**
   * Handle click/tap - append a waypoint (same-cell repeat is a no-op)
   */
  const handleMeasureClick = useCallback(
    (cellX: number, cellY: number, _isTouch: boolean = false): void => {
      const next = appendRouteWaypoint(route, { x: cellX, y: cellY }, firstSegmentTerrainId);
      if (next !== route) commitRoute(next);
    },
    [route, firstSegmentTerrainId, commitRoute]
  );

  /**
   * Handle cursor move - update the live preview segment
   */
  const handleMeasureMove = useCallback(
    (cellX: number, cellY: number): void => {
      if (waypoints.length === 0 || !geometry) return;
      setPreviewTarget({ x: cellX, y: cellY });
    },
    [waypoints.length, geometry]
  );

  /**
   * Remove the last committed waypoint (and its segment's terrain)
   */
  const removeLastWaypoint = useCallback((): void => {
    if (waypoints.length === 0) return;
    commitRoute(removeLastRouteWaypoint(route));
  }, [route, waypoints.length, commitRoute]);

  /**
   * Clear the whole measurement
   */
  const clearMeasurement = useCallback((): void => {
    setPreviewTarget(null);
    commitRoute(EMPTY_ROUTE);
  }, [commitRoute]);

  /**
   * Assign a terrain to a committed segment (null = unassigned)
   */
  const assignSegmentTerrain = useCallback((segmentIndex: number, terrainId: string | null): void => {
    const next = setSegmentTerrain(route, segmentIndex, terrainId);
    if (next !== route) commitRoute(next);
  }, [route, commitRoute]);

  /** Per-committed-segment distances in cells */
  const segmentDistances = useMemo((): number[] => {
    if (!geometry) return [];
    return computeSegmentDistances(waypoints, geometry, distanceSettings.gridDiagonalRule);
  }, [waypoints, geometry, distanceSettings.gridDiagonalRule]);

  /** Preview segment distance in cells (0 when idle or on the last waypoint) */
  const previewDistance = useMemo((): number => {
    if (!geometry || !previewTarget || waypoints.length === 0) return 0;
    const last = waypoints[waypoints.length - 1];
    return geometry.getCellDistance(
      last.x, last.y,
      previewTarget.x, previewTarget.y,
      { diagonalRule: distanceSettings.gridDiagonalRule }
    );
  }, [waypoints, previewTarget, geometry, distanceSettings.gridDiagonalRule]);

  /** Running total in cells, preview included */
  const totalDistance = useMemo((): number | null => {
    if (waypoints.length === 0) return null;
    return sumDistances(segmentDistances) + previewDistance;
  }, [waypoints.length, segmentDistances, previewDistance]);

  const formattedTotal = useMemo((): string | null => {
    if (totalDistance === null) return null;
    return formatDistance(
      totalDistance,
      distanceSettings.distancePerCell,
      distanceSettings.distanceUnit,
      distanceSettings.displayFormat
    );
  }, [totalDistance, distanceSettings]);

  const formattedSegments = useMemo((): string[] => {
    return segmentDistances.map(d => formatDistance(
      d,
      distanceSettings.distancePerCell,
      distanceSettings.distanceUnit,
      distanceSettings.displayFormat
    ));
  }, [segmentDistances, distanceSettings]);

  return {
    waypoints,
    segmentTerrains: route.segmentTerrains,
    previewTarget,
    segmentDistances,
    previewDistance,
    totalDistance,
    formattedTotal,
    formattedSegments,
    distanceSettings,
    handleMeasureClick,
    handleMeasureMove,
    removeLastWaypoint,
    clearMeasurement,
    assignSegmentTerrain
  };
};

export { useDistanceMeasurement };
