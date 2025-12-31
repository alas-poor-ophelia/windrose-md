/**
 * useDistanceMeasurement.js
 * 
 * Hook for distance measurement tool state and calculations.
 * Handles origin selection, live distance updates, and formatting.
 * Supports both mouse (live updates) and touch (tap-to-tap) modes.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { formatDistance, getEffectiveDistanceSettings } = await requireModuleByName("distanceOperations.ts");

/**
 * Hook for managing distance measurement state
 * @param {string} currentTool - Current active tool
 * @param {Object} geometry - GridGeometry or HexGeometry instance
 * @param {string} mapType - 'grid' or 'hex'
 * @param {Object} globalSettings - Global settings from plugin
 * @param {Object} mapDistanceOverrides - Per-map distance settings (or null)
 */
const useDistanceMeasurement = (currentTool, geometry, mapType, globalSettings, mapDistanceOverrides) => {
  const [measureOrigin, setMeasureOrigin] = dc.useState(null);
  const [currentDistance, setCurrentDistance] = dc.useState(null);
  const [currentTarget, setCurrentTarget] = dc.useState(null);
  const [isTargetLocked, setIsTargetLocked] = dc.useState(false);
  
  // Get resolved distance settings
  const distanceSettings = dc.useMemo(() => {
    return getEffectiveDistanceSettings(mapType, globalSettings, mapDistanceOverrides);
  }, [mapType, globalSettings, mapDistanceOverrides]);
  
  // Clear state when tool changes away from measure
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
  const calculateDistance = dc.useCallback((targetX, targetY) => {
    if (!measureOrigin || !geometry) return 0;
    
    return geometry.getCellDistance(
      measureOrigin.x, measureOrigin.y,
      targetX, targetY,
      { diagonalRule: distanceSettings.gridDiagonalRule }
    );
  }, [measureOrigin, geometry, distanceSettings.gridDiagonalRule]);
  
  /**
   * Handle click/tap - behavior depends on current state and input type
   * @param {number} cellX - Cell X coordinate (gridX or q)
   * @param {number} cellY - Cell Y coordinate (gridY or r)
   * @param {boolean} isTouch - Whether this is a touch event
   */
  const handleMeasureClick = dc.useCallback((cellX, cellY, isTouch = false) => {
    if (!measureOrigin) {
      // First click/tap - set origin
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
  }, [measureOrigin, isTargetLocked, calculateDistance]);
  
  /**
   * Handle cursor move - update live distance (mouse only, not when locked)
   * @param {number} cellX - Cell X coordinate (gridX or q)
   * @param {number} cellY - Cell Y coordinate (gridY or r)
   */
  const handleMeasureMove = dc.useCallback((cellX, cellY) => {
    // Don't update if no origin, locked target, or no geometry
    if (!measureOrigin || isTargetLocked || !geometry) return;
    
    setCurrentTarget({ x: cellX, y: cellY });
    setCurrentDistance(calculateDistance(cellX, cellY));
  }, [measureOrigin, isTargetLocked, geometry, calculateDistance]);
  
  /**
   * Get formatted distance string
   */
  const formattedDistance = dc.useMemo(() => {
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
  const clearMeasurement = dc.useCallback(() => {
    setMeasureOrigin(null);
    setCurrentDistance(null);
    setCurrentTarget(null);
    setIsTargetLocked(false);
  }, []);
  
  return {
    // State
    measureOrigin,
    currentTarget,
    currentDistance,
    formattedDistance,
    distanceSettings,
    isTargetLocked,
    
    // Handlers
    handleMeasureClick,
    handleMeasureMove,
    clearMeasurement
  };
};

return { useDistanceMeasurement };