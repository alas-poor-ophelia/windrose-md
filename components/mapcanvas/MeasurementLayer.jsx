/**
 * MeasurementLayer.jsx
 * 
 * Layer component for distance measurement tool.
 * Combines the measurement hook, overlay rendering, and event handler registration.
 * 
 * Usage:
 * <MapCanvas.MeasurementLayer
 *   currentTool={currentTool}
 *   globalSettings={globalSettings}
 *   mapDistanceOverrides={mapData.settings.distanceSettings}
 * />
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useDistanceMeasurement } = await requireModuleByName("useDistanceMeasurement.ts");
const { MeasurementOverlay } = await requireModuleByName("MeasurementOverlay.jsx");
const { useMapState } = await requireModuleByName("MapContext.jsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");

const MeasurementLayer = ({
  currentTool,
  globalSettings,
  mapDistanceOverrides
}) => {
  const { 
    mapData, 
    geometry,
    canvasRef
  } = useMapState();
  
  const mapType = mapData?.mapType || 'grid';
  
  // Use the distance measurement hook
  const {
    measureOrigin,
    currentTarget,
    formattedDistance,
    isTargetLocked,
    handleMeasureClick,
    handleMeasureMove,
    clearMeasurement
  } = useDistanceMeasurement(
    currentTool,
    geometry,
    mapType,
    globalSettings,
    mapDistanceOverrides
  );
  
  // Register handlers with event coordinator
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  dc.useEffect(() => {
    registerHandlers('measure', {
      handleMeasureClick,
      handleMeasureMove,
      clearMeasurement,
      measureOrigin
    });
    return () => unregisterHandlers('measure');
  }, [registerHandlers, unregisterHandlers, handleMeasureClick, handleMeasureMove, clearMeasurement, measureOrigin]);
  
  // Only render overlay when measure tool is active and we have an origin
  if (currentTool !== 'measure' || !measureOrigin) {
    return null;
  }
  
  return (
    <MeasurementOverlay
      measureOrigin={measureOrigin}
      currentTarget={currentTarget}
      formattedDistance={formattedDistance}
      isTargetLocked={isTargetLocked}
      geometry={geometry}
      mapData={mapData}
      canvasRef={canvasRef}
    />
  );
};

return { MeasurementLayer };