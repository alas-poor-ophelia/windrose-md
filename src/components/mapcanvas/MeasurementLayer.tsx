/**
 * MeasurementLayer.tsx
 *
 * Layer component for the multi-waypoint distance measurement tool.
 * Combines the measurement hook, overlay rendering, editing controls,
 * keyboard affordances (Backspace = remove last, Enter = save as route,
 * Escape = clear), finish-by-double-click (double-tap on touch), route
 * persistence, the save-as-route flow, and — when enabled travel packs
 * exist — live travel times and on-map per-segment terrain assignment.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { MapTravelSettings, MeasurementRoute, SavedRoute } from '#types/core/map.types';
import type { EffectiveDistanceSettings } from '#types/hooks/distanceMeasurement.types';
import type { PluginSettings } from '#types/settings/settings.types';
import type { TravelTimeLine, TravelModeOption, TravelAllowanceOption } from '../overlays/MeasurementControls';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useDistanceMeasurement } from '../../hooks/interactions/useDistanceMeasurement';
import { getSettings } from '../../core/settingsAccessor';
import { createSavedRoute } from '../../drawing/routeOperations';
import { getEnabledTravelPacks } from '../../travel/travelPackOperations';
import {
  collectEnabledTerrains,
  computeRouteTravelTime,
  findTerrainById,
  formatTravelTime,
  resolveSelectedAllowance,
  resolveSelectedModes,
} from '../../travel/travelTimeOperations';
import { MeasurementOverlay } from '../overlays/MeasurementOverlay';
import { MeasurementControls } from '../overlays/MeasurementControls';
import { TerrainPickerPopup } from '../overlays/TerrainPickerPopup';
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
  onMeasurementRouteChange?: (route: MeasurementRoute) => void;
  /** Persists saved routes created via save-as-route */
  onSavedRoutesChange?: (routes: SavedRoute[]) => void;
  /** Persists the map's travel display selection (modes/allowance) */
  onTravelSettingsChange?: (settings: MapTravelSettings) => void;
}

interface TerrainPickerState {
  segmentIndex: number;
  x: number;
  y: number;
}

const MeasurementLayer = ({
  currentTool,
  globalSettings,
  mapDistanceOverrides,
  onMeasurementRouteChange,
  onSavedRoutesChange,
  onTravelSettingsChange
}: MeasurementLayerProps): VNode | null => {
  const app = useApp();
  const {
    mapData,
    geometry,
    canvasRef
  } = useMapState();

  const mapType = mapData?.mapType ?? 'grid';

  // Travel packs come from plugin settings; re-read when settings change
  // (packs can be edited in settings while a map view is open)
  const [settingsVersion, setSettingsVersion] = useState(0);
  useEffect(() => {
    const handler = (): void => setSettingsVersion(v => v + 1);
    window.addEventListener('windrose-settings-changed', handler);
    return () => window.removeEventListener('windrose-settings-changed', handler);
  }, []);

  const enabledPacks = useMemo(
    () => getEnabledTravelPacks(getSettings().travelPacks),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settingsVersion re-reads the plugin settings singleton
    [settingsVersion]
  );

  const enabledTerrains = useMemo(() => collectEnabledTerrains(enabledPacks), [enabledPacks]);

  // TM-21: the route's first segment defaults to the first terrain any
  // enabled pack defines (later segments inherit their predecessor)
  const firstSegmentTerrainId = enabledTerrains.length > 0 ? enabledTerrains[0].terrain.id : null;

  const {
    waypoints,
    segmentTerrains,
    previewTarget,
    segmentDistances,
    previewDistance,
    formattedTotal,
    formattedSegments,
    distanceSettings,
    handleMeasureClick,
    handleMeasureMove,
    removeLastWaypoint,
    clearMeasurement,
    assignSegmentTerrain
  } = useDistanceMeasurement(
    currentTool,
    geometry,
    mapType,
    globalSettings ?? getSettings(),
    (mapDistanceOverrides ?? null),
    mapData?.measurementRoute,
    onMeasurementRouteChange,
    firstSegmentTerrainId
  );

  const handleSaveRoute = useCallback((): void => {
    if (waypoints.length < 2 || !mapData) return;
    void new SaveRouteModal(app).openAndGetValue().then(options => {
      if (options == null) return;
      const route = createSavedRoute(waypoints, { ...options, segmentTerrains });
      onSavedRoutesChange?.([...(mapData.savedRoutes ?? []), route]);
      clearMeasurement();
    });
  }, [waypoints, segmentTerrains, mapData, app, onSavedRoutesChange, clearMeasurement]);

  // Double-click (double-tap on touch) on the end cell finishes the route:
  // the first click commits the final waypoint, the repeat click on the same
  // cell inside the window opens save-as-route instead of no-opping
  const DOUBLE_CLICK_MS = 500;
  const lastClickRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const handleMeasureClickOrFinish = useCallback((cellX: number, cellY: number, isTouch: boolean = false): void => {
    const now = performance.now();
    const prev = lastClickRef.current;
    lastClickRef.current = { x: cellX, y: cellY, time: now };
    if (prev != null && prev.x === cellX && prev.y === cellY &&
        now - prev.time < DOUBLE_CLICK_MS && waypoints.length >= 2) {
      lastClickRef.current = null;
      handleSaveRoute();
      return;
    }
    handleMeasureClick(cellX, cellY, isTouch);
  }, [handleMeasureClick, handleSaveRoute, waypoints.length]);

  useLayerHandlers('measure', { handleMeasureClick: handleMeasureClickOrFinish, handleMeasureMove, clearMeasurement });

  const [terrainPicker, setTerrainPicker] = useState<TerrainPickerState | null>(null);

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
      } else if (e.key === 'Enter') {
        handleSaveRoute();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        if (terrainPicker != null) {
          setTerrainPicker(null);
        } else {
          clearMeasurement();
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMeasuring, removeLastWaypoint, clearMeasurement, terrainPicker, handleSaveRoute]);

  // Route edits shift segment indices out from under an open picker
  useEffect(() => {
    setTerrainPicker(null);
  }, [waypoints.length]);

  // ===========================================
  // Travel times (TM-14..18)
  // ===========================================

  const travelSettings = mapData?.travelSettings;
  const selectedModes = useMemo(
    () => resolveSelectedModes(enabledPacks, travelSettings?.modeIds ?? []),
    [enabledPacks, travelSettings]
  );
  const selectedAllowance = useMemo(
    () => resolveSelectedAllowance(enabledPacks, travelSettings?.allowanceId),
    [enabledPacks, travelSettings]
  );

  const travelLines = useMemo((): TravelTimeLine[] => {
    if (selectedModes.length === 0 || waypoints.length === 0) return [];

    // Distances in map units, preview segment included live (TM-18); the
    // preview's terrain-to-be is its predecessor's (TM-21), so its
    // multiplier previews honestly too
    const distances = segmentDistances.map(d => d * distanceSettings.distancePerCell);
    const terrainIds: (string | null)[] = [...segmentTerrains];
    if (previewDistance > 0) {
      distances.push(previewDistance * distanceSettings.distancePerCell);
      terrainIds.push(segmentTerrains[segmentTerrains.length - 1] ?? firstSegmentTerrainId);
    }
    const multipliers = terrainIds.map(id => findTerrainById(enabledPacks, id)?.multiplier ?? 1);

    return selectedModes.map(({ mode, pack }) => {
      const result = computeRouteTravelTime(distances, multipliers, distanceSettings.distanceUnit, mode, pack);
      if (!result.ok) {
        return { modeId: mode.id, name: mode.name, text: result.reason, isError: true };
      }
      return { modeId: mode.id, name: mode.name, text: formatTravelTime(result, selectedAllowance), isError: false };
    });
  }, [selectedModes, selectedAllowance, waypoints.length, segmentDistances, previewDistance, segmentTerrains, distanceSettings, enabledPacks, firstSegmentTerrainId]);

  const modeOptions = useMemo((): TravelModeOption[] => {
    const selected = new Set(travelSettings?.modeIds ?? []);
    return enabledPacks.flatMap(pack => pack.modes.map(mode => ({
      id: mode.id,
      name: mode.name,
      packName: pack.name,
      selected: selected.has(mode.id),
    })));
  }, [enabledPacks, travelSettings]);

  const allowanceOptions = useMemo((): TravelAllowanceOption[] => {
    return enabledPacks.flatMap(pack => pack.allowances.map(a => ({ id: a.id, name: a.name })));
  }, [enabledPacks]);

  const handleToggleMode = useCallback((modeId: string, selected: boolean): void => {
    const current = mapData?.travelSettings?.modeIds ?? [];
    const next = selected ? [...current, modeId] : current.filter(id => id !== modeId);
    onTravelSettingsChange?.({ modeIds: next, allowanceId: mapData?.travelSettings?.allowanceId ?? null });
  }, [mapData, onTravelSettingsChange]);

  const handleAllowanceChange = useCallback((allowanceId: string | null): void => {
    onTravelSettingsChange?.({ modeIds: mapData?.travelSettings?.modeIds ?? [], allowanceId });
  }, [mapData, onTravelSettingsChange]);

  // ===========================================
  // Terrain assignment (TM-19..22)
  // ===========================================

  const segmentColors = useMemo((): (string | null)[] => {
    return segmentTerrains.map(id => findTerrainById(enabledPacks, id)?.color ?? null);
  }, [segmentTerrains, enabledPacks]);

  const handleSegmentClick = useCallback((segmentIndex: number, x: number, y: number): void => {
    setTerrainPicker({ segmentIndex, x, y });
  }, []);

  const handleTerrainPick = useCallback((terrainId: string | null): void => {
    if (terrainPicker != null) assignSegmentTerrain(terrainPicker.segmentIndex, terrainId);
    setTerrainPicker(null);
  }, [terrainPicker, assignSegmentTerrain]);

  if (currentTool !== 'measure' || waypoints.length === 0) {
    return null;
  }

  const terrainAssignmentAvailable = enabledTerrains.length > 0;

  return (
    <>
      <MeasurementOverlay
        waypoints={waypoints}
        previewTarget={previewTarget}
        formattedTotal={formattedTotal}
        formattedSegments={formattedSegments}
        segmentColors={segmentColors}
        onSegmentClick={terrainAssignmentAvailable ? handleSegmentClick : undefined}
        geometry={geometry}
        mapData={mapData}
        canvasRef={canvasRef}
      />
      <MeasurementControls
        waypointCount={waypoints.length}
        formattedTotal={formattedTotal}
        travelLines={travelLines}
        modeOptions={modeOptions}
        allowanceOptions={allowanceOptions}
        selectedAllowanceId={travelSettings?.allowanceId ?? null}
        onToggleMode={handleToggleMode}
        onAllowanceChange={handleAllowanceChange}
        onRemoveLast={removeLastWaypoint}
        onClear={clearMeasurement}
        onSaveRoute={handleSaveRoute}
      />
      {terrainPicker != null && terrainAssignmentAvailable && (
        <TerrainPickerPopup
          x={terrainPicker.x}
          y={terrainPicker.y}
          options={enabledTerrains.map(({ terrain }) => ({
            id: terrain.id,
            name: terrain.name,
            ...(terrain.color !== undefined ? { color: terrain.color } : {}),
            multiplier: terrain.multiplier,
          }))}
          currentTerrainId={segmentTerrains[terrainPicker.segmentIndex] ?? null}
          onPick={handleTerrainPick}
          onClose={() => setTerrainPicker(null)}
        />
      )}
    </>
  );
};

export { MeasurementLayer };
