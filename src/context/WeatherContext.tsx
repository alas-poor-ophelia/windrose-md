/**
 * WeatherContext.tsx
 *
 * The per-map weather store. DungeonMapTracker mounts one WeatherProvider
 * per map instance; every weather consumer under it reads `useWeatherStore()`
 * instead of subscribing to the weather plugin itself. The provider also
 * publishes the ROOT map's zones for the weather plugin's zone resolver
 * (correct even while the view is drilled into a sub-hex).
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
import { useApp } from './AppContext';
import { getSettings } from '../core/settingsAccessor';
import { parseSubHexPath } from '../persistence/subHexPath';
import { WeatherStoreCore } from '../weather/weatherStore';
import { buildAreaLookup, resolveWeatherAreas, sameWeatherAreas } from '../weather/weatherAreas';
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
    return () => {
      unsubscribe();
      stop();
    };
  }, [core]);

  // Zone resolver backing: the root level, whatever level is shown
  const rootRegions = rootMapData?.regions;
  const rootZoneId = rootMapData?.weatherZoneId;
  const zoneSnapshot = useMemo(
    () => buildMapZoneSnapshot({ regions: rootRegions, weatherZoneId: rootZoneId }),
    [rootRegions, rootZoneId]
  );
  useEffect(() => {
    if (mapId === '') return undefined;
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

  const versionRef = useRef(0);
  const store = useMemo((): WeatherStore => {
    versionRef.current += 1;
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
      version: versionRef.current,
    };
  }, [snapshot, areas, areaAt, methods]);

  return <WeatherContext.Provider value={store}>{children}</WeatherContext.Provider>;
};

export { WeatherProvider, useWeatherStore, UNAVAILABLE_WEATHER_STORE };
