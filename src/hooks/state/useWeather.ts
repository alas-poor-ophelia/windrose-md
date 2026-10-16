/**
 * useWeather.ts
 *
 * Live view of the U+13080 Weather plugin for a component: whether it is
 * usable, the world's current day, the zone list, and per-zone reports.
 * The returned object changes identity only when the weather plugin
 * reports a change, so it is safe as a memo dependency.
 */

// Type-only imports
import type { App } from 'obsidian';
import type { WadjetWeatherReport, WadjetZoneSummary } from '#types/integrations/wadjet.types';

import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import {
  describeReport,
  getWadjetApi,
  getWeatherDay,
  getWeatherUnits,
  getZoneReport,
  listWeatherZones,
  subscribeToWeather,
} from '../../weather/wadjetBridge';

export interface WeatherView {
  /** False when the weather plugin is absent, disabled, not ready, or has no current date */
  available: boolean;
  /** The world's current day (null when unavailable) */
  dayOrdinal: number | null;
  units: 'metric' | 'imperial';
  zones: WadjetZoneSummary[];
  /**
   * A zone's report for the current day plus `dayOffset`. Null for a zone
   * the weather plugin does not have, or when it has become unavailable.
   */
  reportFor: (zoneId: string, dayOffset?: number) => WadjetWeatherReport | null;
  /** The weather plugin's own short wording for a report */
  describe: (report: WadjetWeatherReport) => string | null;
}

const UNAVAILABLE: WeatherView = {
  available: false,
  dayOrdinal: null,
  units: 'metric',
  zones: [],
  reportFor: () => null,
  describe: () => null,
};

function buildWeatherView(app: App): WeatherView {
  const api = getWadjetApi(app);
  const dayOrdinal = api != null ? getWeatherDay(api) : null;
  if (api == null || dayOrdinal == null) return UNAVAILABLE;

  // Reports are deterministic per (zone, day) until the next change event,
  // which builds a new view — so a per-view cache never goes stale
  const reports = new Map<string, WadjetWeatherReport | null>();

  return {
    available: true,
    dayOrdinal,
    units: getWeatherUnits(api),
    zones: listWeatherZones(api),
    reportFor: (zoneId: string, dayOffset: number = 0) => {
      // Re-resolve per call: the plugin signals nothing when it is disabled
      const live = getWadjetApi(app);
      if (live == null) return null;
      const day = dayOrdinal + dayOffset;
      const key = `${zoneId}@${day}`;
      let report = reports.get(key);
      if (report === undefined) {
        report = getZoneReport(live, zoneId, day);
        reports.set(key, report);
      }
      return report;
    },
    describe: (report: WadjetWeatherReport) => {
      const live = getWadjetApi(app);
      return live != null ? describeReport(live, report) : null;
    },
  };
}

function useWeather(): WeatherView {
  const app = useApp();
  const [view, setView] = useState<WeatherView>(() => buildWeatherView(app));

  useEffect(
    () => subscribeToWeather(app, reason => setView(previous => {
      // Reports are per day: a clock tick inside the same day changes nothing
      if (reason === 'time' && previous.available) {
        const api = getWadjetApi(app);
        if (api != null && getWeatherDay(api) === previous.dayOrdinal) return previous;
      }
      return buildWeatherView(app);
    })),
    [app]
  );

  // The weather plugin signals nothing when it is disabled, so a view built
  // while it was live is checked on every render and dropped once it is gone
  const stale = view.available && getWadjetApi(app) == null;
  useEffect(() => {
    if (stale) setView(UNAVAILABLE);
  }, [stale]);

  return stale ? UNAVAILABLE : view;
}

export { useWeather };
