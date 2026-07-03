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
} from "../../../src/components/settings/settingsReducer";
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
    isLoading: false,
    showResizeConfirm: false,
    pendingBoundsChange: null,
    orphanInfo: { cells: 0, objects: 0 },
    deleteOrphanedContent: false,
    boundsShape: 'rectangular',
    objectSetId: null,
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
