/**
 * WeatherContext.tsx
 *
 * The per-map weather store. DungeonMapTracker mounts one WeatherProvider
 * per map instance; every weather consumer under it reads `useWeatherStore()`
 * instead of subscribing to the weather plugin itself. The provider also
 * publishes the ROOT map's zones for the weather plugin's zone resolver
 * (correct even while the view is drilled into a sub-hex), and the fog
 * view of the level being shown (src/weather/weatherFog.ts: weather UI
 * never reveals fogged cells or areas; read it with useWeatherFog()).
 *
 * Outside a provider `useWeatherStore()` returns an inert, unavailable
 * store: weather is an optional companion, so a component rendered in a
 * test harness or a host without a map never throws for it.
 */

import type { ComponentChildren, VNode } from 'preact';
import type { MapData } from '#types/core/map.types';
import type { WeatherArea, WeatherStore } from '#types/contexts/weather.types';
import type { WadjetReport } from '#types/integrations/wadjet.types';

import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getActiveLayer } from '../persistence/layerAccessor';
import { useApp } from './AppContext';
import { getSettings } from '../core/settingsAccessor';
import { getMapAtSubHexPath, parseSubHexPath } from '../persistence/subHexPath';
import { WeatherStoreCore } from '../weather/weatherStore';
import { buildAreaLookup, resolveWeatherAnimate, resolveWeatherAreas, sameWeatherAreas } from '../weather/weatherAreas';
import { WeatherFogContext, buildWeatherFogView, sameAreaList } from '../weather/weatherFog';
import { buildMapZoneSnapshot, publishMapZones } from '../weather/weatherZones';
import { classifyLocally, describeLocally } from '../weather/weatherClassify';
import { WINDROSE_TRAVEL_INTERPRETER_ID, interpretTravelLocally } from '../weather/travelInterpreter';

/** The store when there is no weather plugin or no provider */
const UNAVAILABLE_WEATHER_STORE: WeatherStore = {
  available: false,
  apiVersion: 0,
  zones: [],
  units: 'metric',
  today: null,
  viewTime: { dayOffset: 0, hour: null },
  setViewTime: () => {},
  viewDay: null,
  areas: [],
  hasWeather: false,
  animate: true,
  areaAt: () => null,
  report: () => null,
  range: () => [],
  classify: classifyLocally,
  glyphSvg: () => null,
  formatDay: (day: number) => `Day ${day}`,
  describe: describeLocally,
  canAdvance: false,
  advance: () => Promise.resolve(false),
  ground: () => null,
  interpretTravel: (report, ctx) => interpretTravelLocally(report, ctx),
  version: 0,
};

const WeatherContext = createContext<WeatherStore | null>(null);

/** The map's weather store (an unavailable store outside a provider) */
function useWeatherStore(): WeatherStore {
  return useContext(WeatherContext) ?? UNAVAILABLE_WEATHER_STORE;
}

function readTravelInterpreterId(): string {
  const id = getSettings().weatherTravelInterpreter;
  return typeof id === 'string' && id !== '' ? id : WINDROSE_TRAVEL_INTERPRETER_ID;
}

interface WeatherProviderProps {
  /** Map id the zone resolver answers for */
  mapId: string;
  /** The ROOT map (sub-hex levels are reached through `subHexPath`) */
  rootMapData: MapData | null;
  /** '/'-joined sub-hex path of the level being shown; null = root */
  subHexPath: string | null;
  children: ComponentChildren;
}

const WeatherProvider = ({ mapId, rootMapData, subHexPath, children }: WeatherProviderProps): VNode => {
  const app = useApp();

  const coreRef = useRef<WeatherStoreCore | null>(null);
  coreRef.current ??= new WeatherStoreCore(app, { getTravelInterpreterId: readTravelInterpreterId });
  const core = coreRef.current;

  const [snapshot, setSnapshot] = useState(() => core.getSnapshot());
  useEffect(() => {
    const unsubscribe = core.subscribe(() => setSnapshot(core.getSnapshot()));
    const stop = core.start();
    setSnapshot(core.getSnapshot());
    // "Weather travel rules" changes re-cost open maps (saveSettings fires this)
    const onSettingsChanged = (): void => core.noteSettingsChanged();
    window.addEventListener('windrose-settings-changed', onSettingsChanged);
    return () => {
      window.removeEventListener('windrose-settings-changed', onSettingsChanged);
      unsubscribe();
      stop();
    };
  }, [core]);

  // Zone resolver backing: the root level, whatever level is shown. Only a
  // loaded map publishes: an empty snapshot would answer "no weather" for
  // a map whose data has not arrived (the read-only async path answers it)
  const rootLoaded = rootMapData != null;
  const rootRegions = rootMapData?.regions;
  const rootZoneId = rootMapData?.weatherZoneId;
  const zoneSnapshot = useMemo(
    () => (rootLoaded ? buildMapZoneSnapshot({ regions: rootRegions, weatherZoneId: rootZoneId }) : null),
    [rootLoaded, rootRegions, rootZoneId]
  );
  useEffect(() => {
    if (mapId === '' || zoneSnapshot == null) return undefined;
    return publishMapZones(mapId, zoneSnapshot);
  }, [mapId, zoneSnapshot]);

  // Areas of the shown level; kept by identity across edits that leave
  // weather alone, so consumers' memos do not churn on every brush stroke
  const path = useMemo(() => parseSubHexPath(subHexPath), [subHexPath]);
  const previousAreasRef = useRef<WeatherArea[]>([]);
  const areas = useMemo(() => {
    const next = resolveWeatherAreas(rootMapData, path);
    if (sameWeatherAreas(previousAreasRef.current, next)) return previousAreasRef.current;
    previousAreasRef.current = next;
    return next;
  }, [rootMapData, path]);
  const areaAt = useMemo(() => buildAreaLookup(areas), [areas]);
  const animate = useMemo(() => resolveWeatherAnimate(rootMapData, path), [rootMapData, path]);

  // Fog view of the shown level's active layer
  const level = useMemo(() => getMapAtSubHexPath(rootMapData, path), [rootMapData, path]);
  const activeLayer = level != null ? getActiveLayer(level) : null;
  const fogOfWar = activeLayer?.fogOfWar;
  const paintedCells = activeLayer?.cells;
  const mapType = level?.mapType === 'hex' ? 'hex' : 'grid';
  const orientation = level?.orientation ?? 'flat';
  const hexBounds = level?.hexBounds;
  const previousRevealedRef = useRef<WeatherArea[]>([]);
  const fogView = useMemo(() => {
    const view = buildWeatherFogView(areas, { fogOfWar, mapType, orientation, hexBounds, paintedCells });
    // Keep the revealed list by identity while it holds the same areas
    if (sameAreaList(previousRevealedRef.current, view.revealedAreas)) {
      return { ...view, revealedAreas: previousRevealedRef.current };
    }
    previousRevealedRef.current = view.revealedAreas;
    return view;
  }, [areas, fogOfWar, mapType, orientation, hexBounds, paintedCells]);

  // Stable members: the store's methods never change identity
  const methods = useMemo(() => ({
    setViewTime: (t: Parameters<WeatherStore['setViewTime']>[0]) => core.setViewTime(t),
    report: (zoneId: string, day: number, hour?: number | null) => core.report(zoneId, day, hour),
    range: (zoneId: string, from: number, to: number) => core.range(zoneId, from, to),
    classify: (report: WadjetReport) => core.classify(report),
    glyphSvg: (report: WadjetReport) => core.glyphSvg(report),
    formatDay: (day: number) => core.formatDay(day),
    describe: (report: WadjetReport) => core.describe(report),
    advance: (days: number) => core.advance(days),
    ground: (zoneId: string, day: number) => core.ground(zoneId, day),
    interpretTravel: (report: WadjetReport, ctx?: Record<string, unknown>) => core.interpretTravel(report, ctx),
  }), [core]);

  // Level-side inputs as one object: a new one whenever the areas or the
  // animation setting change, so the version can be derived without a
  // render-time counter (see levelSerial)
  const levelInputs = useMemo(() => ({ areas, animate }), [areas, animate]);
  const store = useMemo((): WeatherStore => {
    const viewDay = snapshot.today != null ? snapshot.today + snapshot.viewTime.dayOffset : null;
    return {
      available: snapshot.available,
      apiVersion: snapshot.apiVersion,
      zones: snapshot.zones,
      units: snapshot.units,
      today: snapshot.today,
      viewTime: snapshot.viewTime,
      setViewTime: methods.setViewTime,
      viewDay,
      areas,
      hasWeather: snapshot.available && areas.length > 0,
      animate,
      areaAt,
      report: methods.report,
      range: methods.range,
      classify: methods.classify,
      glyphSvg: methods.glyphSvg,
      formatDay: methods.formatDay,
      describe: methods.describe,
      canAdvance: snapshot.canAdvance,
      advance: methods.advance,
      ground: methods.ground,
      interpretTravel: methods.interpretTravel,
      // Both terms only ever grow, and any change grows one of them
      version: snapshot.version + levelSerial(levelInputs),
    };
  }, [snapshot, areas, animate, areaAt, methods, levelInputs]);

  return (
    <WeatherContext.Provider value={store}>
      <WeatherFogContext.Provider value={fogView}>{children}</WeatherFogContext.Provider>
    </WeatherContext.Provider>
  );
};

/**
 * A monotonic serial per level-input object: the first sight of an object
 * takes the next number, later sights return the same one (idempotent, so
 * a re-run render derives the same version).
 */
const levelSerials = new WeakMap<object, number>();
let lastLevelSerial = 0;
function levelSerial(key: object): number {
  let serial = levelSerials.get(key);
  if (serial === undefined) {
    serial = ++lastLevelSerial;
    levelSerials.set(key, serial);
  }
  return serial;
}

export { WeatherProvider, useWeatherStore };
