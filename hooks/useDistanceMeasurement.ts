/**
 * useDistanceMeasurement.ts
 *
 * Hook for distance measurement tool state and calculations.
 * Handles origin selection, live distance updates, and formatting.
 * Supports both mouse (live updates) and touch (tap-to-tap) modes.
 */

// Type-only imports
import type { MapType } from '#types/core/map.types';
import type { IGeometry, DistanceOptions } from '#types/core/geometry.types';
import type { ToolId } from '#types/tools/tool.types';
import type { PluginSettings, DiagonalRule, DistanceDisplayFormat } from '#types/settings/settings.types';
import type {
  MeasurementPoint,
  EffectiveDistanceSettings,
  MapDistanceOverrides,
  UseDistanceMeasurementResult,
} from '#types/hooks/distanceMeasurement.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { formatDistance, getEffectiveDistanceSettings } = await requireModuleByName("distanceOperations.ts") as {
  formatDistance: (distance: number, distancePerCell: number, unit: string, format: DistanceDisplayFormat) => string;
  getEffectiveDistanceSettings: (mapType: MapType, globalSettings: PluginSettings, overrides: MapDistanceOverrides | null) => EffectiveDistanceSettings;
};

/**
 * Hook for managing distance measurement state
 */
const useDistanceMeasurement = (
  currentTool: ToolId,
  geometry: IGeometry | null,
  mapType: MapType,
  globalSettings: PluginSettings,
  mapDistanceOverrides: MapDistanceOverrides | null
): UseDistanceMeasurementResult => {
  const [measureOrigin, setMeasureOrigin] = dc.useState<MeasurementPoint | null>(null);
  const [currentDistance, setCurrentDistance] = dc.useState<number | null>(null);
  const [currentTarget, setCurrentTarget] = dc.useState<MeasurementPoint | null>(null);
  const [isTargetLocked, setIsTargetLocked] = dc.useState<boolean>(false);

  const distanceSettings = dc.useMemo((): EffectiveDistanceSettings => {
    return getEffectiveDistanceSettings(mapType, globalSettings, mapDistanceOverrides);
  }, [mapType, globalSettings, mapDistanceOverrides]);

  dc.useEffect(() => {
    if (currentTool !== 'measure') {
      setMeasureOrigin(null);
      setCurrentDistance(null);
      setCurrentTarget(null);
      setIsTargetLocked(false);
    }
  }, [currentTool]);

  /**
   * Calculate distance between origin and a target point
   */
  const calculateDistance = dc.useCallback(
    (targetX: number, targetY: number): number => {
      if (!measureOrigin || !geometry) return 0;

      return geometry.getCellDistance(
        measureOrigin.x, measureOrigin.y,
        targetX, targetY,
        { diagonalRule: distanceSettings.gridDiagonalRule } as DistanceOptions
      );
    },
    [measureOrigin, geometry, distanceSettings.gridDiagonalRule]
  );

  /**
   * Handle click/tap - behavior depends on current state and input type
   */
  const handleMeasureClick = dc.useCallback(
    (cellX: number, cellY: number, isTouch: boolean = false): void => {
      if (!measureOrigin) {
        setMeasureOrigin({ x: cellX, y: cellY });
        setCurrentTarget({ x: cellX, y: cellY });
        setCurrentDistance(0);
        setIsTargetLocked(false);
      } else if (isTouch && !isTargetLocked) {
        // Touch: second tap sets and locks target
        setCurrentTarget({ x: cellX, y: cellY });
        setCurrentDistance(calculateDistance(cellX, cellY));
        setIsTargetLocked(true);
      } else {
        // Mouse: second click clears
        // Touch: third tap (after target locked) clears
        setMeasureOrigin(null);
        setCurrentDistance(null);
        setCurrentTarget(null);
        setIsTargetLocked(false);
      }
    },
    [measureOrigin, isTargetLocked, calculateDistance]
  );

  /**
   * Handle cursor move - update live distance (mouse only, not when locked)
   */
  const handleMeasureMove = dc.useCallback(
    (cellX: number, cellY: number): void => {
      if (!measureOrigin || isTargetLocked || !geometry) return;

      setCurrentTarget({ x: cellX, y: cellY });
      setCurrentDistance(calculateDistance(cellX, cellY));
    },
    [measureOrigin, isTargetLocked, geometry, calculateDistance]
  );

  /**
   * Get formatted distance string
   */
  const formattedDistance = dc.useMemo((): string | null => {
    if (currentDistance === null) return null;

    return formatDistance(
      currentDistance,
      distanceSettings.distancePerCell,
      distanceSettings.distanceUnit,
      distanceSettings.displayFormat
    );
  }, [currentDistance, distanceSettings]);

  /**
   * Clear measurement manually
   */
  const clearMeasurement = dc.useCallback((): void => {
    setMeasureOrigin(null);
    setCurrentDistance(null);
    setCurrentTarget(null);
    setIsTargetLocked(false);
  }, []);

  return {
    measureOrigin,
    currentTarget,
    currentDistance,
    formattedDistance,
    distanceSettings,
    isTargetLocked,
    handleMeasureClick,
    handleMeasureMove,
    clearMeasurement
  };
};

return { useDistanceMeasurement };
