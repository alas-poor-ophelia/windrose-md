/**
 * MeasurementLayer.tsx
 *
 * Layer component for the multi-waypoint distance measurement tool.
 * Combines the measurement hook, overlay rendering, editing controls,
 * keyboard affordances (Backspace = remove last, Escape = clear), route
 * persistence, and the save-as-route flow.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { Point } from '#types/core/geometry.types';
import type { SavedRoute } from '#types/core/map.types';
import type { EffectiveDistanceSettings } from '#types/hooks/distanceMeasurement.types';
import type { PluginSettings } from '#types/settings/settings.types';

import { useCallback, useEffect } from 'preact/hooks';
import { useDistanceMeasurement } from '../../hooks/interactions/useDistanceMeasurement';
import { getSettings } from '../../core/settingsAccessor';
import { createSavedRoute } from '../../drawing/routeOperations';
import { MeasurementOverlay } from '../overlays/MeasurementOverlay';
import { MeasurementControls } from '../overlays/MeasurementControls';
import { SaveRouteModal } from '../modals/SaveRouteModal';
import { useApp } from '../../context/AppContext';
import { useMapState } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';


/** Props for MeasurementLayer component */
export interface MeasurementLayerProps {
  /** Current active tool */
  currentTool: ToolId;
  /** Global plugin settings */
  globalSettings?: PluginSettings;
  /** Per-map distance setting overrides */
  mapDistanceOverrides?: Partial<EffectiveDistanceSettings>;
  /** Persists the in-progress route with the map (history-free) */
  onMeasurementRouteChange?: (points: Point[]) => void;
  /** Persists saved routes created via save-as-route */
  onSavedRoutesChange?: (routes: SavedRoute[]) => void;
}

const MeasurementLayer = ({
  currentTool,
  globalSettings,
  mapDistanceOverrides,
  onMeasurementRouteChange,
  onSavedRoutesChange
}: MeasurementLayerProps): VNode | null => {
  const app = useApp();
  const {
    mapData,
    geometry,
    canvasRef
  } = useMapState();

  const mapType = mapData?.mapType ?? 'grid';

  const {
    waypoints,
    previewTarget,
    formattedTotal,
    formattedSegments,
    handleMeasureClick,
    handleMeasureMove,
    removeLastWaypoint,
    clearMeasurement
  } = useDistanceMeasurement(
    currentTool,
    geometry,
    mapType,
    globalSettings ?? getSettings(),
    (mapDistanceOverrides ?? null),
    mapData?.measurementRoute,
    onMeasurementRouteChange
  );

  useLayerHandlers('measure', { handleMeasureClick, handleMeasureMove, clearMeasurement });

  // Keyboard editing affordances while measuring (desktop; the controls
  // card carries the same actions for touch)
  const isMeasuring = currentTool === 'measure' && waypoints.length > 0;
  useEffect(() => {
    if (!isMeasuring) return undefined;
    const handler = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace') {
        removeLastWaypoint();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        clearMeasurement();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMeasuring, removeLastWaypoint, clearMeasurement]);

  const handleSaveRoute = useCallback((): void => {
    if (waypoints.length < 2 || !mapData) return;
    void new SaveRouteModal(app).openAndGetValue().then(options => {
      if (options == null) return;
      const route = createSavedRoute(waypoints, options);
      onSavedRoutesChange?.([...(mapData.savedRoutes ?? []), route]);
      clearMeasurement();
    });
  }, [waypoints, mapData, app, onSavedRoutesChange, clearMeasurement]);

  if (currentTool !== 'measure' || waypoints.length === 0) {
    return null;
  }

  return (
    <>
      <MeasurementOverlay
        waypoints={waypoints}
        previewTarget={previewTarget}
        formattedTotal={formattedTotal}
        formattedSegments={formattedSegments}
        geometry={geometry}
        mapData={mapData}
        canvasRef={canvasRef}
      />
      <MeasurementControls
        waypointCount={waypoints.length}
        formattedTotal={formattedTotal}
        onRemoveLast={removeLastWaypoint}
        onClear={clearMeasurement}
        onSaveRoute={handleSaveRoute}
      />
    </>
  );
};

export { MeasurementLayer };
