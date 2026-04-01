/**
 * MeasurementLayer.tsx
 *
 * Layer component for distance measurement tool.
 * Combines the measurement hook, overlay rendering, and event handler registration.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { EffectiveDistanceSettings } from '#types/hooks/distanceMeasurement.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useDistanceMeasurement } = await requireModuleByName("useDistanceMeasurement.ts");
const { MeasurementOverlay } = await requireModuleByName("MeasurementOverlay.jsx");
const { useMapState } = await requireModuleByName("MapContext.tsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");

/** Props for MeasurementLayer component */
export interface MeasurementLayerProps {
  /** Current active tool */
  currentTool: ToolId;
  /** Global plugin settings */
  globalSettings?: Record<string, unknown>;
  /** Per-map distance setting overrides */
  mapDistanceOverrides?: Partial<EffectiveDistanceSettings>;
}

const MeasurementLayer = ({
  currentTool,
  globalSettings,
  mapDistanceOverrides
}: MeasurementLayerProps): React.ReactElement | null => {
  const {
    mapData,
    geometry,
    canvasRef
  } = useMapState();

  const mapType = mapData?.mapType || 'grid';

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

  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const measureHandlersRef = dc.useRef<Record<string, unknown> | null>(null);
  measureHandlersRef.current = { handleMeasureClick, handleMeasureMove, clearMeasurement, measureOrigin };

  dc.useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return measureHandlersRef.current?.[prop];
      }
    });
    registerHandlers('measure', proxy);
    return () => unregisterHandlers('measure');
  }, []);

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
