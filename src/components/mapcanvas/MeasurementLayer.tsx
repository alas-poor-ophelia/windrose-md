/**
 * MeasurementLayer.tsx
 *
 * Layer component for distance measurement tool.
 * Combines the measurement hook, overlay rendering, and event handler registration.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { EffectiveDistanceSettings, MapDistanceOverrides } from '#types/hooks/distanceMeasurement.types';
import type { PluginSettings } from '#types/settings/settings.types';

import { useEffect, useRef } from 'preact/hooks';
import { useDistanceMeasurement } from '../../hooks/interactions/useDistanceMeasurement';
import { MeasurementOverlay } from '../overlays/MeasurementOverlay';
import { useMapState } from '../../context/MapContext';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';


/** Props for MeasurementLayer component */
export interface MeasurementLayerProps {
  /** Current active tool */
  currentTool: ToolId;
  /** Global plugin settings */
  globalSettings?: PluginSettings;
  /** Per-map distance setting overrides */
  mapDistanceOverrides?: Partial<EffectiveDistanceSettings>;
}

const MeasurementLayer = ({
  currentTool,
  globalSettings,
  mapDistanceOverrides
}: MeasurementLayerProps): VNode | null => {
  const {
    mapData,
    geometry,
    canvasRef
  } = useMapState();

  const mapType = mapData?.mapType ?? 'grid';

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
    globalSettings!,
    (mapDistanceOverrides ?? null) as MapDistanceOverrides | null
  );

  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const measureHandlersRef = useRef<Record<string, unknown> | null>(null);
  measureHandlersRef.current = { handleMeasureClick, handleMeasureMove, clearMeasurement, measureOrigin };

  useEffect(() => {
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

export { MeasurementLayer };