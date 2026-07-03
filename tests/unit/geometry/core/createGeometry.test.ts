/**
 * createGeometry Unit Tests
 *
 * Tests the shared geometry factory used by DungeonMapTracker and MapCanvas.
 */

import { describe, it, expect } from "vitest";

import { createGeometry } from "../../../../src/geometry/core/createGeometry";
import { GridGeometry } from "../../../../src/geometry/core/GridGeometry";
import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { DEFAULTS } from "../../../../src/core/dmtConstants";
import type { MapData } from "../../../../types/core/map.types";

// Base stub deliberately omits mapType and the shape fields (gridSize, hexSize,
// orientation, hexBounds) so tests can exercise createGeometry's DEFAULTS fallbacks
// when they are absent — the cast covers only those intentionally missing fields.
function mapDataWith(overrides: Partial<MapData>): MapData {
  return {
    schemaVersion: 2,
    activeLayerId: "layer-1",
    layerPanelVisible: false,
    layers: [],
    ...overrides,
  } as MapData;
}

describe("createGeometry", () => {
  describe("grid maps", () => {
    it("builds a GridGeometry with the map's gridSize", () => {
      const geometry = createGeometry(mapDataWith({ mapType: 'grid', gridSize: 48 }));
      expect(geometry).toBeInstanceOf(GridGeometry);
      expect((geometry as InstanceType<typeof GridGeometry>).cellSize).toBe(48);
    });

    it("falls back to DEFAULTS.gridSize when gridSize is missing", () => {
      const geometry = createGeometry(mapDataWith({ mapType: 'grid' }));
      expect((geometry as InstanceType<typeof GridGeometry>).cellSize).toBe(DEFAULTS.gridSize);
    });

    it("defaults to grid when mapType is missing", () => {
      const geometry = createGeometry(mapDataWith({ gridSize: 40 }));
      expect(geometry).toBeInstanceOf(GridGeometry);
      expect(geometry.type).toBe('grid');
    });
  });

  describe("hex maps", () => {
    it("builds a HexGeometry with the map's hex parameters", () => {
      const hexBounds = { maxCol: 15, maxRow: 15, maxRing: 7 };
      const geometry = createGeometry(mapDataWith({
        mapType: 'hex',
        hexSize: 60,
        orientation: 'pointy',
        hexBounds
      }));
      expect(geometry).toBeInstanceOf(HexGeometry);
      const hex = geometry as InstanceType<typeof HexGeometry>;
      expect(hex.hexSize).toBe(60);
      expect(hex.orientation).toBe('pointy');
      expect(hex.bounds).toEqual(hexBounds);
    });

    it("falls back to hex defaults and unbounded (null) bounds", () => {
      const geometry = createGeometry(mapDataWith({ mapType: 'hex' }));
      const hex = geometry as InstanceType<typeof HexGeometry>;
      expect(hex.hexSize).toBe(DEFAULTS.hexSize);
      expect(hex.orientation).toBe(DEFAULTS.hexOrientation);
      expect(hex.bounds).toBeNull();
    });
  });
});
