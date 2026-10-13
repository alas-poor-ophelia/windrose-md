/**
 * Settings resolver (ABS-12): one merge order everywhere.
 *
 * fallback defaults < global user settings < per-map overrides, shared by
 * getEffectiveSettings / resolveTheme (render, export) and the map settings
 * modal's initial state (settingsReducer.buildInitialState).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  setPlugin, clearPlugin, mergeSettingsOverrides, getEffectiveSettings, resolveTheme, FALLBACK_SETTINGS,
} from "../../../src/core/settingsAccessor";
import { buildInitialState } from "../../../src/components/settings/settingsReducer";
import { THEME } from "../../../src/core/dmtConstants";

import type { App } from "obsidian";
import type { PluginSettings } from "#types/settings/settings.types";

function withGlobals(settings: Partial<PluginSettings>): void {
  setPlugin({ app: {} as App, dataFilePath: "data.json", settings });
}

describe("mergeSettingsOverrides", () => {
  it("layers fallback default < global user < per-map override", () => {
    const merged = mergeSettingsOverrides(
      { gridLineWidth: 3, borderColor: "#111111" },
      { borderColor: "#222222" },
    );
    expect(merged.fogOfWarBlurFactor).toBe(FALLBACK_SETTINGS.fogOfWarBlurFactor); // default
    expect(merged.gridLineWidth).toBe(3); // global
    expect(merged.borderColor).toBe("#222222"); // per-map
  });

  it("lets undefined override keys fall through but keeps explicit null", () => {
    const merged = mergeSettingsOverrides(
      { borderColor: "#111111", fogOfWarImage: "fog.png" },
      { borderColor: undefined, fogOfWarImage: null },
    );
    expect(merged.borderColor).toBe("#111111");
    expect(merged.fogOfWarImage).toBeNull();
  });
});

describe("getEffectiveSettings / resolveTheme", () => {
  // Display resolution checks the Obsidian light/dark body class.
  beforeEach(() => {
    vi.stubGlobal("activeDocument", { body: { classList: { contains: () => false } } });
  });
  afterEach(() => {
    clearPlugin();
    vi.unstubAllGlobals();
  });

  it("applies per-map overrides over global user settings", () => {
    withGlobals({ borderColor: "#111111", fogOfWarOpacity: 0.5 });
    const map = { useGlobalSettings: false, overrides: { borderColor: "#abcdef" } };
    expect(getEffectiveSettings(map).borderColor).toBe("#abcdef");
    expect(getEffectiveSettings(map).fogOfWarOpacity).toBe(0.5);
    expect(resolveTheme(map).cells.border).toBe("#abcdef");
    expect(resolveTheme(map).fogOfWar?.opacity).toBe(0.5);
  });

  it("ignores overrides while the map uses global settings", () => {
    withGlobals({ borderColor: "#111111" });
    const map = { useGlobalSettings: true, overrides: { borderColor: "#abcdef" } };
    expect(resolveTheme(map).cells.border).toBe("#111111");
  });

  it("falls back to theme defaults without a plugin", () => {
    expect(resolveTheme(null).cells.border).toBe(THEME.cells.border);
    expect(resolveTheme(null).fogOfWar?.blurFactor).toBe(THEME.fogOfWar.blurFactor);
  });
});

describe("buildInitialState seeds from the same merge", () => {
  it("uses map override, then global, then default", () => {
    const globals = { ...FALLBACK_SETTINGS, borderColor: "#111111", gridLineWidth: 4 };
    const state = buildInitialState({
      mapType: "grid",
      currentSettings: { useGlobalSettings: false, overrides: { borderColor: "#abcdef" } },
    }, globals);
    expect(state.overrides.borderColor).toBe("#abcdef");
    expect(state.overrides.gridLineWidth).toBe(4);
    expect(state.overrides.fogOfWarBlurFactor).toBe(THEME.fogOfWar.blurFactor);
    const merged = mergeSettingsOverrides(globals, { borderColor: "#abcdef" });
    for (const [key, value] of Object.entries(state.overrides)) {
      expect(value).toEqual(merged[key as keyof PluginSettings]);
    }
  });

  it("keeps a map's cleared fog image instead of re-seeding the global one", () => {
    const globals = { ...FALLBACK_SETTINGS, fogOfWarImage: "global-fog.png" };
    const state = buildInitialState({
      mapType: "grid",
      currentSettings: { useGlobalSettings: false, overrides: { fogOfWarImage: null } },
    }, globals);
    expect(state.overrides.fogOfWarImage).toBeNull();
  });

  it("resolves distance with the distance resolver (map type defaults)", () => {
    const hex = buildInitialState({ mapType: "hex" }, FALLBACK_SETTINGS);
    expect(hex.distanceSettings.distancePerCell).toBe(FALLBACK_SETTINGS.distancePerCellHex);
    expect(hex.distanceSettings.distanceUnit).toBe(FALLBACK_SETTINGS.distanceUnitHex);
    const grid = buildInitialState({
      mapType: "grid",
      currentDistanceSettings: { distancePerCell: 10 },
    }, FALLBACK_SETTINGS);
    expect(grid.distanceSettings.distancePerCell).toBe(10);
    expect(grid.distanceSettings.distanceUnit).toBe(FALLBACK_SETTINGS.distanceUnitGrid);
  });
});
