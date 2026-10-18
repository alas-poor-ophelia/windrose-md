/**
 * settingsReducer Unit Tests
 *
 * Tests for the settings modal reducer, focusing on:
 * - IMAGE_SELECTED action correctly handling grid vs hex maps
 * - Ensuring grid map image selection doesn't overwrite hex-specific state
 */

import { describe, it, expect } from "vitest";

import {
  Actions,
  settingsReducer,
  deriveBoundsFromRing,
  columnsForDensity,
  buildInitialState,
  GRID_DENSITY_PRESETS,
} from "../../../src/components/settings/settingsReducer";
import { calculateGridFromHexSize, measurementToHexSize, MEASUREMENT_CORNER } from "../../../src/geometry/core/hexMeasurements";
import type { PluginSettings } from "../../../types/settings/settings.types";
import type { SettingsModalState } from "../../../src/components/settings/settingsReducer";

// Minimal state shape for testing IMAGE_SELECTED
function createMockState(overrides: Partial<SettingsModalState> = {}): SettingsModalState {
  return {
    activeTab: 'appearance',
    useGlobalSettings: true,
    overrides: {
      gridLineColor: '#666666',
      gridLineWidth: 1,
      backgroundColor: '#1a1a1a',
      borderColor: '#8b6842',
      coordinateKeyColor: '#c4a57b',
      coordinateTextColor: '#ffffff',
      coordinateTextShadow: '#000000',
      canvasHeight: 600,
      canvasHeightMobile: 400,
      fogOfWarColor: '#000000',
      fogOfWarOpacity: 0.9,
      fogOfWarImage: null,
      fogOfWarBlurEnabled: false,
      fogOfWarBlurFactor: 0.99,
      alwaysShowControls: false,
    },
    preferences: {
      rememberPanZoom: true,
      rememberSidebarState: true,
      rememberExpandedState: false,
    },
    distanceSettings: {
      useGlobalDistance: true,
      distancePerCell: 5,
      distanceUnit: 'ft',
      gridDiagonalRule: 'alternating',
      displayFormat: 'units',
    },
    hexBounds: { maxCol: 26, maxRow: 20 },
    coordinateDisplayMode: 'rectangular',
    backgroundImagePath: null,
    backgroundImageDisplayName: '',
    imageDimensions: null,
    imageSearchResults: [],
    fogImageDisplayName: '',
    fogImageSearchResults: [],
    gridDensity: 'medium',
    customColumns: 24,
    boundsLocked: false,
    imageOpacity: 1,
    imageOffsetX: 0,
    imageOffsetY: 0,
    imageGridSize: 32,
    sizingMode: 'density',
    measurementMethod: 'corner',
    measurementSize: 86,
    fineTuneOffset: 0,
    activeColorPicker: null,
    showResizeConfirm: false,
    pendingBoundsChange: null,
    orphanInfo: { cells: 0, objects: 0 },
    boundsShape: 'rectangular',
    objectSetId: null,
    ladderEnabled: false,
    lod: null,
    weather: { weatherZoneId: '', weatherAnimate: true },
    ...overrides,
  };
}

describe("settingsReducer", () => {
  describe("IMAGE_SELECTED action", () => {
    describe("with bounds provided (hex maps)", () => {
      it("updates hexBounds when bounds is provided", () => {
        const state = createMockState({
          hexBounds: { maxCol: 10, maxRow: 10 },
        });

        const action = {
          type: Actions.IMAGE_SELECTED,
          payload: {
            path: 'images/hex-map.png',
            displayName: 'hex-map.png',
            dimensions: { width: 1920, height: 1080 },
            bounds: { maxCol: 30, maxRow: 25 },
          },
        };

        const newState = settingsReducer(state, action);

        expect(newState.backgroundImagePath).toBe('images/hex-map.png');
        expect(newState.backgroundImageDisplayName).toBe('hex-map.png');
        expect(newState.imageDimensions).toEqual({ width: 1920, height: 1080 });
        expect(newState.hexBounds).toEqual({ maxCol: 30, maxRow: 25 });
        expect(newState.boundsLocked).toBe(true);
      });

      it("sets boundsLocked to true when bounds is provided", () => {
        const state = createMockState({
          boundsLocked: false,
        });

        const action = {
          type: Actions.IMAGE_SELECTED,
          payload: {
            path: 'images/hex-map.png',
            displayName: 'hex-map.png',
            dimensions: { width: 1920, height: 1080 },
            bounds: { maxCol: 30, maxRow: 25 },
          },
        };

        const newState = settingsReducer(state, action);

        expect(newState.boundsLocked).toBe(true);
      });
    });

    describe("with bounds null (grid maps)", () => {
      it("does not overwrite hexBounds when bounds is null", () => {
        const originalHexBounds = { maxCol: 26, maxRow: 20 };
        const state = createMockState({
          hexBounds: originalHexBounds,
        });

        const action = {
          type: Actions.IMAGE_SELECTED,
          payload: {
            path: 'images/grid-map.png',
            displayName: 'grid-map.png',
            dimensions: { width: 1920, height: 1080 },
            bounds: null, // Grid maps pass null for bounds
          },
        };

        const newState = settingsReducer(state, action);

        expect(newState.backgroundImagePath).toBe('images/grid-map.png');
        expect(newState.backgroundImageDisplayName).toBe('grid-map.png');
        expect(newState.imageDimensions).toEqual({ width: 1920, height: 1080 });
        // hexBounds should remain unchanged
        expect(newState.hexBounds).toEqual(originalHexBounds);
      });

      it("does not change boundsLocked when bounds is null", () => {
        const state = createMockState({
          boundsLocked: false,
        });

        const action = {
          type: Actions.IMAGE_SELECTED,
          payload: {
            path: 'images/grid-map.png',
            displayName: 'grid-map.png',
            dimensions: { width: 1920, height: 1080 },
            bounds: null,
          },
        };

        const newState = settingsReducer(state, action);

        // boundsLocked should remain false for grid maps
        expect(newState.boundsLocked).toBe(false);
      });

      it("preserves existing boundsLocked state when bounds is null", () => {
        const state = createMockState({
          boundsLocked: true, // Previously set by hex map
        });

        const action = {
          type: Actions.IMAGE_SELECTED,
          payload: {
            path: 'images/grid-map.png',
            displayName: 'grid-map.png',
            dimensions: { width: 1920, height: 1080 },
            bounds: null,
          },
        };

        const newState = settingsReducer(state, action);

        // boundsLocked should remain unchanged (true)
        expect(newState.boundsLocked).toBe(true);
      });
    });

    describe("common behavior", () => {
      it("clears imageSearchResults on image selection", () => {
        const state = createMockState({
          imageSearchResults: ['image1.png', 'image2.png', 'image3.png'],
        });

        const action = {
          type: Actions.IMAGE_SELECTED,
          payload: {
            path: 'images/selected.png',
            displayName: 'selected.png',
            dimensions: { width: 800, height: 600 },
            bounds: null,
          },
        };

        const newState = settingsReducer(state, action);

        expect(newState.imageSearchResults).toEqual([]);
      });

      it("updates image path and display name", () => {
        const state = createMockState();

        const action = {
          type: Actions.IMAGE_SELECTED,
          payload: {
            path: 'Assets/Maps/dungeon.webp',
            displayName: 'dungeon.webp',
            dimensions: { width: 2048, height: 2048 },
            bounds: null,
          },
        };

        const newState = settingsReducer(state, action);

        expect(newState.backgroundImagePath).toBe('Assets/Maps/dungeon.webp');
        expect(newState.backgroundImageDisplayName).toBe('dungeon.webp');
      });

      it("stores image dimensions", () => {
        const state = createMockState();
        const dimensions = { width: 3840, height: 2160 };

        const action = {
          type: Actions.IMAGE_SELECTED,
          payload: {
            path: 'images/4k-map.png',
            displayName: '4k-map.png',
            dimensions,
            bounds: null,
          },
        };

        const newState = settingsReducer(state, action);

        expect(newState.imageDimensions).toEqual(dimensions);
      });
    });
  });
});

describe("deriveBoundsFromRing", () => {
  it("derives a (2N+1)-hex square span from the max ring", () => {
    expect(deriveBoundsFromRing(7)).toEqual({ maxCol: 15, maxRow: 15, maxRing: 7 });
    expect(deriveBoundsFromRing(1)).toEqual({ maxCol: 3, maxRow: 3, maxRing: 1 });
  });

  it("handles ring 0 (single hex)", () => {
    expect(deriveBoundsFromRing(0)).toEqual({ maxCol: 1, maxRow: 1, maxRing: 0 });
  });

  it("matches SET_BOUNDS_SHAPE radial derivation", () => {
    const state = createMockState({ hexBounds: { maxCol: 26, maxRow: 20 } });
    const newState = settingsReducer(state, { type: Actions.SET_BOUNDS_SHAPE, payload: 'radial' });

    const expectedRing = Math.floor(Math.min(26, 20) / 2);
    expect(newState.hexBounds).toEqual(deriveBoundsFromRing(expectedRing));
    expect(newState.boundsShape).toBe('radial');
    expect(newState.coordinateDisplayMode).toBe('radial');
  });

  it("matches SET_HEX_BOUNDS auto-derivation when radial", () => {
    const state = createMockState({
      boundsShape: 'radial',
      hexBounds: { maxCol: 15, maxRow: 15, maxRing: 7 },
    });
    const newState = settingsReducer(state, {
      type: Actions.SET_HEX_BOUNDS,
      payload: { maxCol: 15, maxRow: 15, maxRing: 9 },
    });

    expect(newState.hexBounds).toEqual(deriveBoundsFromRing(9));
  });
});

describe("boundsShape stays consistent with hexBounds.maxRing", () => {
  const imagePayload = {
    path: 'images/hex-map.png',
    displayName: 'hex-map.png',
    dimensions: { width: 1920, height: 1080 },
    bounds: { maxCol: 30, maxRow: 25 },
  };

  it("IMAGE_SELECTED keeps maxRing while the shape is radial", () => {
    const state = createMockState({ boundsShape: 'radial', hexBounds: deriveBoundsFromRing(5) });
    const newState = settingsReducer(state, { type: Actions.IMAGE_SELECTED, payload: imagePayload });

    expect(newState.boundsShape).toBe('radial');
    expect(newState.hexBounds.maxRing).toBe(5);
  });

  it("IMAGE_SELECTED leaves rectangular bounds rectangular", () => {
    const state = createMockState({ boundsShape: 'rectangular', hexBounds: { maxCol: 10, maxRow: 10 } });
    const newState = settingsReducer(state, { type: Actions.IMAGE_SELECTED, payload: imagePayload });

    expect(newState.hexBounds).toEqual({ maxCol: 30, maxRow: 25 });
    expect(newState.hexBounds.maxRing).toBeUndefined();
  });

  it("a bounds recalculation (SET_DENSITY on a locked image) keeps maxRing while radial", () => {
    const state = createMockState({
      boundsShape: 'radial',
      hexBounds: deriveBoundsFromRing(4),
      imageDimensions: { width: 1920, height: 1080 },
      boundsLocked: true,
    });
    const newState = settingsReducer(state, {
      type: Actions.SET_DENSITY,
      payload: { density: 'sparse', orientation: 'flat' },
    });

    expect(newState.boundsShape).toBe('radial');
    expect(newState.hexBounds.maxRing).toBe(4);
  });
});

describe("SET_HEX_BOUND_AXIS (STRUCT-B-13)", () => {
  it("merges one axis into the CURRENT bounds", () => {
    const state = createMockState({ boundsShape: 'rectangular', hexBounds: { maxCol: 26, maxRow: 20 } });
    const s1 = settingsReducer(state, { type: Actions.SET_HEX_BOUND_AXIS, payload: { axis: 'maxCol', value: 30 } });
    // A second edit dispatched without re-reading state still sees the first one
    const s2 = settingsReducer(s1, { type: Actions.SET_HEX_BOUND_AXIS, payload: { axis: 'maxRow', value: 12 } });
    expect(s1.hexBounds).toEqual({ maxCol: 30, maxRow: 20 });
    expect(s2.hexBounds).toEqual({ maxCol: 30, maxRow: 12 });
  });

  it("matches SET_HEX_BOUNDS with the spread payload (radial derivation included)", () => {
    const state = createMockState({ boundsShape: 'radial', hexBounds: { maxCol: 15, maxRow: 15, maxRing: 7 } });
    const viaAxis = settingsReducer(state, { type: Actions.SET_HEX_BOUND_AXIS, payload: { axis: 'maxCol', value: 40 } });
    const viaFull = settingsReducer(state, { type: Actions.SET_HEX_BOUNDS, payload: { ...state.hexBounds, maxCol: 40 } });
    expect(viaAxis.hexBounds).toEqual(viaFull.hexBounds);
  });
});

describe("hex sizing shares hexMeasurements (STRUCT-B-10)", () => {
  it("columnsForDensity maps presets and custom", () => {
    expect(columnsForDensity("medium", 99)).toBe(GRID_DENSITY_PRESETS.medium.columns);
    expect(columnsForDensity("custom", 37)).toBe(37);
  });

  it.each(["flat", "pointy"] as const)("SET_FINE_TUNE sizes bounds like the measurement path (%s)", (orientation) => {
    const state = createMockState({
      imageDimensions: { width: 1000, height: 700 },
      boundsLocked: true,
      sizingMode: "measurement",
      measurementMethod: MEASUREMENT_CORNER,
      measurementSize: 86,
    });
    const base = measurementToHexSize(86, MEASUREMENT_CORNER, orientation);
    const next = settingsReducer(state, {
      type: Actions.SET_FINE_TUNE,
      payload: { adjustedHexSize: base + 2, orientation },
    });
    const expected = calculateGridFromHexSize(1000, 700, base + 2, orientation);
    expect(next.hexBounds).toEqual({ maxCol: expected.columns, maxRow: expected.rows });
    expect(next.fineTuneOffset).toBeCloseTo(2);
  });
});

describe("G1: measurement size and fine-tune give the same columns x rows", () => {
  it.each([
    ["flat", "corner"], ["flat", "edge"], ["pointy", "corner"], ["pointy", "edge"],
  ] as const)("typing the fine-tuned size as a measurement matches the fine-tune bounds (%s, %s)", (orientation, method) => {
    for (const size of [40, 86, 120.5]) {
      const base = createMockState({
        imageDimensions: { width: 1000, height: 700 },
        boundsLocked: true,
        sizingMode: "measurement",
        measurementMethod: method,
        measurementSize: size,
      });
      const tunedHex = measurementToHexSize(size, method, orientation) + 3;
      const tuned = settingsReducer(base, { type: Actions.SET_FINE_TUNE, payload: { adjustedHexSize: tunedHex, orientation } });
      const typedSize = method === MEASUREMENT_CORNER ? tunedHex * 2 : tunedHex * Math.sqrt(3);
      const typed = settingsReducer(base, { type: Actions.SET_MEASUREMENT_SIZE, payload: { size: typedSize, orientation } });
      expect(typed.hexBounds).toEqual(tuned.hexBounds);
    }
  });
});

describe("G4: fresh map defaults match the previous release (f7442a18)", () => {
  // Literals copied from `git show f7442a18:src/components/settings/settingsReducer.ts` buildInitialState.
  const OLD = {
    gridLineColor: '#666666', gridLineWidth: 1, backgroundColor: '#1a1a1a', borderColor: '#8b6842',
    coordinateKeyColor: '#c4a57b', coordinateTextColor: '#ffffff', coordinateTextShadow: '#000000',
    canvasHeight: 600, canvasHeightMobile: 400, pictureFrameHeight: 400, pictureFrameHeightMobile: 300,
    fogOfWarColor: '#000000', fogOfWarOpacity: 0.9, fogOfWarImage: null,
    fogOfWarBlurEnabled: false, fogOfWarBlurFactor: 0.99, alwaysShowControls: false,
  };
  const noGlobals = {} as PluginSettings;

  it("initial colours, heights and fog values equal the old fallback literals", () => {
    const state = buildInitialState({ mapType: 'hex' }, noGlobals);
    expect(state.overrides).toMatchObject(OLD);
    expect(state.overrides.pictureFrameWidth).toBeUndefined();
  });

  it.each([
    ['hex', 6, 'mi'], ['grid', 5, 'ft'],
  ] as const)("%s map distance defaults are %s %s, alternating, both", (mapType, perCell, unit) => {
    const state = buildInitialState({ mapType }, noGlobals);
    expect(state.distanceSettings).toMatchObject({
      useGlobalDistance: true, distancePerCell: perCell, distanceUnit: unit,
      gridDiagonalRule: 'alternating', displayFormat: 'both',
    });
  });

  it("global settings and per-map overrides keep the old precedence", () => {
    const state = buildInitialState(
      {
        mapType: 'hex',
        currentSettings: { useGlobalSettings: false, overrides: { gridLineColor: '#123456' } },
        currentDistanceSettings: { useGlobalDistance: false, distancePerCell: 9 },
      },
      { gridLineColor: '#abcdef', canvasHeight: 777, distanceUnitHex: 'km' } as PluginSettings,
    );
    expect(state.overrides.gridLineColor).toBe('#123456');
    expect(state.overrides.canvasHeight).toBe(777);
    expect(state.distanceSettings.distancePerCell).toBe(9);
    expect(state.distanceSettings.distanceUnit).toBe('km');
  });
});
