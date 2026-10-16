/**
 * Weather settings plumbing Unit Tests
 *
 * The plugin-wide "Weather travel rules" setting (default, DIRECT_KEYS
 * plumbing, options from the weather plugin's interpreter registry, hidden
 * without the plugin) and the per-map Weather tab state (reducer seed,
 * SET_WEATHER, and the root vs sub-hex save rule of buildWeatherSave).
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import type { SettingDefinitionControl, SettingDefinitionGroup, SettingDefinitionItem } from "obsidian";

import { buildSettingDefinitions, getSettingControlValue, setSettingControlValue } from "../../../src/settings/settingDefinitions";
import type { SettingsTabThis } from "../../../src/settings/tabs/settingsTabContext";
import { FALLBACK_SETTINGS, clearPlugin } from "../../../src/core/settingsAccessor";
import { Actions, buildInitialState, buildWeatherSave, settingsReducer } from "../../../src/components/settings/settingsReducer";
import { resolveWeatherAnimate } from "../../../src/weather/weatherAreas";
import type { MapData } from "#types/core/map.types";
import type { PluginSettings } from "#types/settings/settings.types";
import type { WadjetInterpreter } from "#types/integrations/wadjet.types";
import { createFakeApi, createFakeApiV1, createFakeApp } from "./fakeWadjet";

function makeTab(app: SettingsTabThis["app"], overrides: Partial<PluginSettings> = {}): SettingsTabThis {
  const settings = { ...structuredClone(FALLBACK_SETTINGS), ...overrides } as PluginSettings;
  return {
    app,
    plugin: { app, settings, saveSettings: vi.fn().mockResolvedValue(undefined) },
    settingsChanged: false,
    selectedMapType: "grid",
    refreshDomState: vi.fn(),
    update: vi.fn(),
    getObjectSettingsForMapType: () => ({ objectOverrides: {}, customObjects: [], customCategories: [] }),
    updateObjectSettingsForMapType: () => {},
  } as unknown as SettingsTabThis;
}

function flatten(items: SettingDefinitionItem[]): SettingDefinitionItem[] {
  return items.flatMap(item => ("items" in item && Array.isArray(item.items) ? [item, ...flatten(item.items as SettingDefinitionItem[])] : [item]));
}

function weatherGroup(tab: SettingsTabThis): SettingDefinitionGroup {
  const group = flatten(buildSettingDefinitions(tab)).find(item => "heading" in item && item.heading === "Weather");
  expect(group).toBeDefined();
  return group as SettingDefinitionGroup;
}

function travelRulesOptions(group: SettingDefinitionGroup): Record<string, string> {
  const control = (group.items ?? []).find((item): item is SettingDefinitionControl => "control" in item) as SettingDefinitionControl;
  return (control.control as { options: Record<string, string> }).options;
}

afterEach(() => clearPlugin());

describe("Weather travel rules setting", () => {
  it("defaults to Windrose's own interpreter", () => {
    expect(FALLBACK_SETTINGS.weatherTravelInterpreter).toBe("windrose.travel");
  });

  it("reads and writes through the direct-key plumbing", async () => {
    const tab = makeTab(createFakeApp().app);
    expect(getSettingControlValue(tab, "weatherTravelInterpreter")).toBe("windrose.travel");
    await setSettingControlValue(tab, "weatherTravelInterpreter", "pf2e.travel");
    expect(tab.plugin.settings.weatherTravelInterpreter).toBe("pf2e.travel");
  });

  it("is hidden without a usable weather plugin", () => {
    const fake = createFakeApp();
    const group = weatherGroup(makeTab(fake.app));
    const visible = group.visible as () => boolean;
    expect(visible()).toBe(false);
    fake.install(createFakeApi().api);
    expect(visible()).toBe(true);
  });

  it("offers only the built-in rules on a 0.3.x plugin", () => {
    const fake = createFakeApp();
    fake.install(createFakeApi().api);
    expect(travelRulesOptions(weatherGroup(makeTab(fake.app)))).toEqual({ "windrose.travel": "Built-in rules" });
  });

  it("lists every registered travel interpreter once, built-in first", () => {
    const fake = createFakeApp();
    const weather = createFakeApiV1();
    fake.install(weather.api);
    weather.interpreters.push(
      { id: "windrose.travel", label: "Windrose travel rules", facet: "travel", interpret: () => null } as WadjetInterpreter,
      { id: "pf2e.travel", label: "Pathfinder exploration", facet: "travel", interpret: () => null } as WadjetInterpreter,
      { id: "pf2e.hazard", label: "Hazards", facet: "hazard", interpret: () => null } as WadjetInterpreter,
    );
    expect(travelRulesOptions(weatherGroup(makeTab(fake.app)))).toEqual({
      "windrose.travel": "Built-in rules",
      "pf2e.travel": "Pathfinder exploration",
    });
  });

  it("keeps a saved choice that is no longer registered", () => {
    const fake = createFakeApp();
    fake.install(createFakeApiV1().api);
    const options = travelRulesOptions(weatherGroup(makeTab(fake.app, { weatherTravelInterpreter: "gone.travel" })));
    expect(options["gone.travel"]).toBe("gone.travel (not loaded)");
  });
});

describe("Weather tab state", () => {
  it("seeds from the map's fields: no zone = '', no stored animation = null", () => {
    const blank = buildInitialState({ mapType: "hex" }, FALLBACK_SETTINGS);
    expect(blank.weather).toEqual({ weatherZoneId: "", weatherAnimate: null });
    const set = buildInitialState({ mapType: "grid", currentWeather: { weatherZoneId: "coast", weatherAnimate: false } }, FALLBACK_SETTINGS);
    expect(set.weather).toEqual({ weatherZoneId: "coast", weatherAnimate: false });
    const on = buildInitialState({ mapType: "hex", currentWeather: { weatherAnimate: true } }, FALLBACK_SETTINGS);
    expect(on.weather.weatherAnimate).toBe(true);
  });

  it("updates through SET_WEATHER", () => {
    const state = buildInitialState({ mapType: "hex" }, FALLBACK_SETTINGS);
    const next = settingsReducer(state, { type: Actions.SET_WEATHER, payload: { weatherZoneId: "moor" } });
    expect(next.weather).toEqual({ weatherZoneId: "moor", weatherAnimate: null });
    expect(settingsReducer(next, { type: Actions.SET_WEATHER, payload: { weatherAnimate: false } }).weather)
      .toEqual({ weatherZoneId: "moor", weatherAnimate: false });
  });
});

function map(overrides: Partial<MapData> = {}): MapData {
  return { name: "m", mapType: "hex", layers: [], ...overrides } as unknown as MapData;
}

function withSub(parent: MapData, key: string, child: MapData): MapData {
  return { ...parent, subHexMaps: { [key]: { subdivisionRings: 7, mapData: child, lastModified: "" } } };
}

describe("Weather tab save", () => {
  it("a root map stores animation only when it is off", () => {
    expect(buildWeatherSave({ weatherZoneId: "", weatherAnimate: null }, false)).toEqual({});
    expect(buildWeatherSave({ weatherZoneId: "", weatherAnimate: true }, false)).toEqual({});
    expect(buildWeatherSave({ weatherZoneId: "coast", weatherAnimate: false }, false)).toEqual({ weatherZoneId: "coast", weatherAnimate: false });
  });

  it("a sub-hex level stores on and off explicitly and nothing to inherit", () => {
    expect(buildWeatherSave({ weatherZoneId: "", weatherAnimate: null }, true)).toEqual({});
    expect(buildWeatherSave({ weatherZoneId: "", weatherAnimate: true }, true)).toEqual({ weatherAnimate: true });
    expect(buildWeatherSave({ weatherZoneId: "", weatherAnimate: false }, true)).toEqual({ weatherAnimate: false });
  });

  it("a sub-hex level saved on turns the Sky back on under a parent that turned it off", () => {
    const child = map({});
    const root = withSub(map({ weatherAnimate: false }), "0,0", { ...child, ...buildWeatherSave({ weatherZoneId: "", weatherAnimate: true }, true) });
    expect(resolveWeatherAnimate(root, ["0,0"])).toBe(true);
    const inheriting = withSub(map({ weatherAnimate: false }), "0,0", { ...child, ...buildWeatherSave({ weatherZoneId: "", weatherAnimate: null }, true) });
    expect(resolveWeatherAnimate(inheriting, ["0,0"])).toBe(false);
  });
});
