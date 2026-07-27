/**
 * useDistanceMeasurement.ts
 *
 * Hook for the multi-waypoint distance measurement tool.
 * Each click/tap appends a waypoint; a live preview segment follows the
 * cursor from the last waypoint (mouse) and is included in the running
 * total. Supports remove-last and clear-all editing.
 *
 * The committed route is reported to the caller via onRouteChange so it can
 * persist with the map (one current route per map); when the tool activates,
 * the persisted route is restored.
 */

// Type-only imports
import type { MapType } from '#types/core/map.types';
import type { IGeometry, Point } from '#types/core/geometry.types';
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
  appendWaypoint,
  computeSegmentDistances,
  removeLastWaypoint as removeLastFromRoute,
  sumDistances,
} from '../../drawing/routeOperations';


/**
 * Hook for managing multi-waypoint distance measurement state
 */
const useDistanceMeasurement = (
  currentTool: ToolId,
  geometry: IGeometry | null,
  mapType: MapType,
  globalSettings: PluginSettings,
  mapDistanceOverrides: MapDistanceOverrides | null,
  persistedRoute?: Point[],
  onRouteChange?: (points: Point[]) => void
): UseDistanceMeasurementResult => {
  const [waypoints, setWaypoints] = useState<MeasurementPoint[]>([]);
  const [previewTarget, setPreviewTarget] = useState<MeasurementPoint | null>(null);

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
      if (!didRestoreRef.current && persistedRoute && persistedRoute.length > 0) {
        didRestoreRef.current = true;
        setWaypoints(persistedRoute.map(p => ({ x: p.x, y: p.y })));
      }
    } else {
      didRestoreRef.current = false;
      setWaypoints([]);
      setPreviewTarget(null);
    }
  }, [currentTool, persistedRoute]);

  /** Commit a waypoint change to local state and the persisted route */
  const commitWaypoints = useCallback((next: MeasurementPoint[]): void => {
    setWaypoints(next);
    onRouteChange?.(next);
  }, [onRouteChange]);

  /**
   * Handle click/tap - append a waypoint (same-cell repeat is a no-op)
   */
  const handleMeasureClick = useCallback(
    (cellX: number, cellY: number, _isTouch: boolean = false): void => {
      const next = appendWaypoint(waypoints, { x: cellX, y: cellY });
      if (next !== waypoints) commitWaypoints(next);
    },
    [waypoints, commitWaypoints]
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
   * Remove the last committed waypoint
   */
  const removeLastWaypoint = useCallback((): void => {
    if (waypoints.length === 0) return;
    commitWaypoints(removeLastFromRoute(waypoints));
  }, [waypoints, commitWaypoints]);

  /**
   * Clear the whole measurement
   */
  const clearMeasurement = useCallback((): void => {
    setPreviewTarget(null);
    commitWaypoints([]);
  }, [commitWaypoints]);

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
    clearMeasurement
  };
};

export { useDistanceMeasurement };
