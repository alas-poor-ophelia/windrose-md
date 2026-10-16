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
import { useTerrainSampling } from '../../hooks/interactions/useTerrainSampling';
import { getSettings } from '../../core/settingsAccessor';
import { createSavedRoute } from '../../drawing/routeOperations';
import { getEnabledTravelPacks, getEffectiveTravelSettings } from '../../travel/travelPackOperations';
import {
  collectEnabledTerrains,
  computeRouteTravelTime,
  findTerrainById,
  formatTravelTime,
  resolveSelectedAllowance,
  resolveSelectedModes,
} from '../../travel/travelTimeOperations';
import type { WeatherTravelEffect } from '../../weather/weatherTravelRules';
import { computeWeatherTimeRatio, formatWeatherNote } from '../../weather/weatherTravelRules';
import { computeSegmentWeatherEffects } from '../../weather/weatherZones';
import { travelEffectFromInterpretation } from '../../weather/travelInterpreter';
import { useWeatherStore } from '../../context/WeatherContext';
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

/** Shared "no weather on any segment" value — one identity, so memos keyed on it hold */
const NO_SEGMENT_WEATHER: WeatherTravelEffect[] = [];

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
  const [pluginSettings, setPluginSettings] = useState(() => getSettings());
  useEffect(() => {
    const handler = (): void => setPluginSettings(getSettings());
    window.addEventListener('windrose-settings-changed', handler);
    return () => window.removeEventListener('windrose-settings-changed', handler);
  }, []);

  const enabledPacks = useMemo(
    () => getEnabledTravelPacks(pluginSettings.travelPacks),
    [pluginSettings]
  );

  const enabledTerrains = useMemo(() => collectEnabledTerrains(enabledPacks), [enabledPacks]);

  // TM-21: the route's first segment defaults to the first terrain any
  // enabled pack defines (later segments inherit their predecessor)
  const firstSegmentTerrainId = enabledTerrains.length > 0 ? enabledTerrains[0].terrain.id : null;

  // x5l.4: every new segment is categorized from the map underneath it.
  // Parked unless the measure tool is active — the context assembly reads
  // the map's render layers, and an idle map has nothing to sample.
  const samplerTerrains = useMemo(() => enabledTerrains.map(e => e.terrain), [enabledTerrains]);
  const terrainSampling = useTerrainSampling(samplerTerrains, currentTool === 'measure');

  const {
    waypoints,
    segmentTerrains,
    segmentTerrainAuto,
    previewTarget,
    segmentDistances,
    previewDistance,
    formattedTotal,
    formattedEuclideanTotal,
    formattedSegments,
    distanceSettings,
    handleMeasureClick,
    handleMeasureMove,
    removeLastWaypoint,
    clearMeasurement,
    assignSegmentTerrain,
    recategorizeRoute
  } = useDistanceMeasurement(
    currentTool,
    geometry,
    mapType,
    globalSettings ?? getSettings(),
    (mapDistanceOverrides ?? null),
    mapData?.measurementRoute,
    onMeasurementRouteChange,
    firstSegmentTerrainId,
    terrainSampling
  );

  const handleSaveRoute = useCallback((): void => {
    if (waypoints.length < 2 || !mapData) return;
    void new SaveRouteModal(app).openAndGetValue().then(options => {
      if (options == null) return;
      const route = createSavedRoute(waypoints, { ...options, segmentTerrains, segmentTerrainAuto });
      onSavedRoutesChange?.([...(mapData.savedRoutes ?? []), route]);
      clearMeasurement();
    });
  }, [waypoints, segmentTerrains, segmentTerrainAuto, mapData, app, onSavedRoutesChange, clearMeasurement]);

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

  useLayerHandlers('measure', { handleMeasureClick: handleMeasureClickOrFinish, handleMeasureMove });

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
    const win = canvasRef.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('keydown', handler);
    return () => win.removeEventListener('keydown', handler);
  }, [isMeasuring, removeLastWaypoint, clearMeasurement, terrainPicker, handleSaveRoute, canvasRef]);

  // Route edits shift segment indices out from under an open picker
  useEffect(() => {
    setTerrainPicker(null);
  }, [waypoints.length]);

  // ===========================================
  // Travel times (TM-14..18)
  // ===========================================

  // Read-time fallback: an unset/empty per-map selection inherits the global
  // default (settings.defaultTravelSettings). No data migration — the map's
  // own travelSettings still override, and a user edit still writes per-map.
  // Re-read on the settings snapshot so a changed global default takes effect live.
  const travelSettings = useMemo(
    () => getEffectiveTravelSettings(pluginSettings.defaultTravelSettings, mapData?.travelSettings),
    [mapData?.travelSettings, pluginSettings]
  );
  const selectedModes = useMemo(
    () => resolveSelectedModes(enabledPacks, travelSettings?.modeIds ?? []),
    [enabledPacks, travelSettings]
  );
  const selectedAllowance = useMemo(
    () => resolveSelectedAllowance(enabledPacks, travelSettings?.allowanceId),
    [enabledPacks, travelSettings]
  );

  // Weather over each segment, from the map's weather store: cells in a
  // bound region or under the map-level zone, costed by the selected
  // "Weather travel rules" interpreter (Windrose's own by default). Kept
  // apart from the terrain sampler: weather changes with the day and never
  // writes segmentTerrains. Parked unless the measure tool is active.
  // The whole route is costed with ONE day (the store's view day, today by
  // default): a journey longer than a day is not walked against the forecast.
  const weather = useWeatherStore();
  const weatherDay = weather.viewDay;
  const weatherActive = currentTool === 'measure' && weather.available && weatherDay != null && weather.areas.length > 0;
  const zoneAt = useMemo(
    () => (x: number, y: number): string | null => weather.areaAt({ x, y })?.zoneId ?? null,
    [weather]
  );
  const effectForZone = useMemo(() => {
    const zoneEffects = new Map<string, WeatherTravelEffect | null>();
    return (zoneId: string): WeatherTravelEffect | null => {
      let effect = zoneEffects.get(zoneId);
      if (effect === undefined) {
        const report = weatherDay != null ? weather.report(zoneId, weatherDay) : null;
        effect = report != null ? travelEffectFromInterpretation(weather.interpretTravel(report)) : null;
        zoneEffects.set(zoneId, effect);
      }
      return effect;
    };
  }, [weather, weatherDay]);

  // Committed segments and the live preview segment are costed apart: the
  // preview moves with the pointer and must not re-walk the whole route.
  // Without weather both stay on shared constants, so the travel lines
  // below recompute exactly as often as they did before weather existed.
  const committedWeather = useMemo((): WeatherTravelEffect[] => {
    if (!weatherActive || geometry == null || waypoints.length < 2) return NO_SEGMENT_WEATHER;
    return computeSegmentWeatherEffects(
      waypoints,
      (x1, y1, x2, y2) => geometry.getCellsInLine(x1, y1, x2, y2),
      zoneAt,
      effectForZone
    );
  }, [weatherActive, geometry, waypoints, zoneAt, effectForZone]);

  const lastWaypoint = waypoints.length > 0 ? waypoints[waypoints.length - 1] : null;
  const previewX = previewTarget?.x;
  const previewY = previewTarget?.y;
  const previewWeather = useMemo((): WeatherTravelEffect | null => {
    if (!weatherActive || geometry == null || lastWaypoint == null ||
        previewX == null || previewY == null || previewDistance <= 0) return null;
    const effects = computeSegmentWeatherEffects(
      [lastWaypoint, { x: previewX, y: previewY }],
      (x1, y1, x2, y2) => geometry.getCellsInLine(x1, y1, x2, y2),
      zoneAt,
      effectForZone
    );
    return effects[0] ?? null;
  }, [weatherActive, geometry, lastWaypoint, previewX, previewY, previewDistance, zoneAt, effectForZone]);

  const segmentWeather = useMemo(
    () => (previewWeather != null ? [...committedWeather, previewWeather] : committedWeather),
    [committedWeather, previewWeather]
  );

  const { travelLines, weatherNote } = useMemo((): { travelLines: TravelTimeLine[]; weatherNote: string | null } => {
    if (selectedModes.length === 0 || waypoints.length === 0) return { travelLines: [], weatherNote: null };

    // Distances in map units, preview segment included live (TM-18); the
    // preview's terrain-to-be is its predecessor's (TM-21), so its
    // multiplier previews honestly too
    const distances = segmentDistances.map(d => d * distanceSettings.distancePerCell);
    const terrainIds: (string | null)[] = [...segmentTerrains];
    if (previewDistance > 0) {
      distances.push(previewDistance * distanceSettings.distancePerCell);
      terrainIds.push(segmentTerrains[segmentTerrains.length - 1] ?? firstSegmentTerrainId);
    }
    const terrainMultipliers = terrainIds.map(id => findTerrainById(enabledPacks, id)?.multiplier ?? 1);
    const weatherMultipliers = terrainMultipliers.map((_, i) => segmentWeather[i]?.multiplier ?? 1);
    const multipliers = terrainMultipliers.map((m, i) => m * weatherMultipliers[i]);

    const lines = selectedModes.map(({ mode, pack }) => {
      const result = computeRouteTravelTime(distances, multipliers, distanceSettings.distanceUnit, mode, pack);
      if (!result.ok) {
        return { modeId: mode.id, name: mode.name, text: result.reason, isError: true };
      }
      return { modeId: mode.id, name: mode.name, text: formatTravelTime(result, selectedAllowance), isError: false };
    });
    const note = formatWeatherNote(segmentWeather, computeWeatherTimeRatio(distances, terrainMultipliers, weatherMultipliers));
    return { travelLines: lines, weatherNote: note };
  }, [selectedModes, selectedAllowance, waypoints.length, segmentDistances, previewDistance, segmentTerrains, distanceSettings, enabledPacks, firstSegmentTerrainId, segmentWeather]);

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

  // Toggle/allowance edits write the per-map override, seeded from the
  // effective selection — so the first edit to an unset map materializes the
  // inherited global default before applying the change (empty default =>
  // effective equals raw per-map, so behavior is unchanged).
  const handleToggleMode = useCallback((modeId: string, selected: boolean): void => {
    const current = travelSettings.modeIds;
    const next = selected ? [...current, modeId] : current.filter(id => id !== modeId);
    onTravelSettingsChange?.({ modeIds: next, allowanceId: travelSettings.allowanceId ?? null });
  }, [travelSettings, onTravelSettingsChange]);

  const handleAllowanceChange = useCallback((allowanceId: string | null): void => {
    onTravelSettingsChange?.({ modeIds: travelSettings.modeIds, allowanceId });
  }, [travelSettings, onTravelSettingsChange]);

  // Capture the current effective selection as the global default for new/unset
  // maps. GLOBAL plugin setting (like tilesetArtScales): write + saveSettings on
  // the live plugin; saveSettings fires windrose-settings-changed, which our
  // settings-snapshot listener picks up.
  const handleSetTravelDefault = useCallback((): void => {
    try {
      const plugin = app.plugins.plugins['windrose-md'] as unknown as
        { settings: { defaultTravelSettings?: MapTravelSettings }; saveSettings(): Promise<void> } | undefined;
      if (plugin != null) {
        plugin.settings.defaultTravelSettings = {
          modeIds: [...travelSettings.modeIds],
          allowanceId: travelSettings.allowanceId ?? null,
        };
        void plugin.saveSettings();
      }
    } catch { /* settings plugin unavailable */ }
  }, [app, travelSettings]);

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
        formattedEuclideanTotal={formattedEuclideanTotal}
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
        weatherNote={weatherNote}
        modeOptions={modeOptions}
        allowanceOptions={allowanceOptions}
        selectedAllowanceId={travelSettings?.allowanceId ?? null}
        onToggleMode={handleToggleMode}
        onAllowanceChange={handleAllowanceChange}
        onSetAsDefault={handleSetTravelDefault}
        onRemoveLast={removeLastWaypoint}
        onClear={clearMeasurement}
        onSaveRoute={handleSaveRoute}
        onRecategorize={
          terrainAssignmentAvailable && terrainSampling.available && waypoints.length >= 2
            ? recategorizeRoute
            : undefined
        }
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
