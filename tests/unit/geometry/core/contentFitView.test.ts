/**
 * contentFitView Unit Tests
 *
 * Pure fit-to-content calculation used by the recenter-view control.
 */

import { describe, it, expect } from "vitest";

import { calculateContentFitView } from "../../../../src/geometry/core/contentFitView";
import { GridGeometry } from "../../../../src/geometry/core/GridGeometry";
import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { DEFAULTS } from "../../../../src/core/dmtConstants";
import { makeLayer, makeMapData } from "../../helpers/fixtures";

describe("calculateContentFitView", () => {
  describe("grid maps", () => {
    it("fits and centers on painted cells", () => {
      const geometry = new GridGeometry(32);
      const layer = makeLayer({
        cells: [
          { x: 2, y: 2, color: "#fff" },
          { x: 5, y: 4, color: "#fff" }
        ]
      });
      const mapData = makeMapData({ mapType: "grid", layers: [layer] });

      const result = calculateContentFitView(mapData, geometry, 800, 900);

      expect(result).not.toBeNull();
      // Content spans cells [2,6) x [2,5) -> center (4, 3.5)
      expect(result?.center.x).toBeCloseTo(4);
      expect(result?.center.y).toBeCloseTo(3.5);
      expect(result?.zoom).toBeGreaterThan(0);
    });

    it("expands the bounding box for an object with a multi-cell size", () => {
      const geometry = new GridGeometry(32);
      const layer = makeLayer({
        objects: [
          {
            id: "obj-1",
            type: "some-type",
            position: { x: 0, y: 0 },
            size: { width: 3, height: 2 }
          } as never
        ]
      });
      const mapData = makeMapData({ mapType: "grid", layers: [layer] });

      const result = calculateContentFitView(mapData, geometry, 800, 900);

      expect(result).not.toBeNull();
      // Object spans [0,3) x [0,2) -> center (1.5, 1)
      expect(result?.center.x).toBeCloseTo(1.5);
      expect(result?.center.y).toBeCloseTo(1);
    });

    it("falls back to other visible layers when the active layer is empty", () => {
      const geometry = new GridGeometry(32);
      const activeLayer = makeLayer({ id: "layer-1", cells: [] });
      const otherLayer = makeLayer({
        id: "layer-2",
        visible: true,
        cells: [{ x: 10, y: 10, color: "#fff" }]
      });
      const mapData = makeMapData({
        mapType: "grid",
        activeLayerId: "layer-1",
        layers: [activeLayer, otherLayer]
      });

      const result = calculateContentFitView(mapData, geometry, 800, 900);

      expect(result).not.toBeNull();
      expect(result?.center.x).toBeCloseTo(10.5);
      expect(result?.center.y).toBeCloseTo(10.5);
    });

    it("ignores non-visible fallback layers and returns null when nothing is visible", () => {
      const geometry = new GridGeometry(32);
      const activeLayer = makeLayer({ id: "layer-1", cells: [] });
      const otherLayer = makeLayer({
        id: "layer-2",
        visible: false,
        cells: [{ x: 10, y: 10, color: "#fff" }]
      });
      const mapData = makeMapData({
        mapType: "grid",
        activeLayerId: "layer-1",
        layers: [activeLayer, otherLayer]
      });

      const result = calculateContentFitView(mapData, geometry, 800, 900);

      expect(result).toBeNull();
    });

    it("returns null when the map has no content anywhere", () => {
      const geometry = new GridGeometry(32);
      const layer = makeLayer();
      const mapData = makeMapData({ mapType: "grid", layers: [layer] });

      expect(calculateContentFitView(mapData, geometry, 800, 900)).toBeNull();
    });

    it("clamps zoom to DEFAULTS.maxZoom for a single tiny cell", () => {
      const geometry = new GridGeometry(32);
      const layer = makeLayer({ cells: [{ x: 0, y: 0, color: "#fff" }] });
      const mapData = makeMapData({ mapType: "grid", layers: [layer] });

      const result = calculateContentFitView(mapData, geometry, 800, 900);

      expect(result?.zoom).toBe(DEFAULTS.maxZoom);
    });

    it("clamps zoom to DEFAULTS.minZoom for very sprawling content", () => {
      const geometry = new GridGeometry(32);
      const layer = makeLayer({
        cells: [
          { x: 0, y: 0, color: "#fff" },
          { x: 10000, y: 10000, color: "#fff" }
        ]
      });
      const mapData = makeMapData({ mapType: "grid", layers: [layer] });

      const result = calculateContentFitView(mapData, geometry, 800, 900);

      expect(result?.zoom).toBe(DEFAULTS.minZoom);
    });
  });

  describe("hex maps", () => {
    it("fits and centers on painted hexes", () => {
      const geometry = new HexGeometry(40, "flat");
      const layer = makeLayer({
        cells: [
          { q: 0, r: 0, color: "#fff" },
          { q: 2, r: 0, color: "#fff" }
        ]
      });
      const mapData = makeMapData({ mapType: "hex", layers: [layer] });

      const result = calculateContentFitView(mapData, geometry, 800, 900);

      expect(result).not.toBeNull();
      const centerHex0 = geometry.hexToWorld(0, 0);
      const centerHex2 = geometry.hexToWorld(2, 0);
      const expectedCenterX = (centerHex0.worldX + centerHex2.worldX) / 2;
      expect(result?.center.x).toBeCloseTo(expectedCenterX);
      expect(result?.zoom).toBeGreaterThan(0);
    });

    it("falls back to other visible layers when the active layer is empty", () => {
      const geometry = new HexGeometry(40, "flat");
      const activeLayer = makeLayer({ id: "layer-1", cells: [] });
      const otherLayer = makeLayer({
        id: "layer-2",
        visible: true,
        cells: [{ q: 3, r: -1, color: "#fff" }]
      });
      const mapData = makeMapData({
        mapType: "hex",
        activeLayerId: "layer-1",
        layers: [activeLayer, otherLayer]
      });

      const result = calculateContentFitView(mapData, geometry, 800, 900);

      expect(result).not.toBeNull();
      const expectedCenter = geometry.hexToWorld(3, -1);
      expect(result?.center.x).toBeCloseTo(expectedCenter.worldX);
      expect(result?.center.y).toBeCloseTo(expectedCenter.worldY);
    });

    it("returns null when the map has no content anywhere", () => {
      const geometry = new HexGeometry(40, "flat");
      const layer = makeLayer();
      const mapData = makeMapData({ mapType: "hex", layers: [layer] });

      expect(calculateContentFitView(mapData, geometry, 800, 900)).toBeNull();
    });

    it("clamps zoom to DEFAULTS.maxZoom for a single hex", () => {
      const geometry = new HexGeometry(40, "flat");
      const layer = makeLayer({ cells: [{ q: 0, r: 0, color: "#fff" }] });
      const mapData = makeMapData({ mapType: "hex", layers: [layer] });

      const result = calculateContentFitView(mapData, geometry, 800, 900);

      expect(result?.zoom).toBe(DEFAULTS.maxZoom);
    });
  });
});
