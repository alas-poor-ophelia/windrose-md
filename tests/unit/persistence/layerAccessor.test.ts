/**
 * layerAccessor Unit Tests
 *
 * Tests layer management and fog of war operations.
 * All functions are pure and operate on immutable data structures.
 */

import { describe, it, expect } from "vitest";

import {
  generateLayerId,
  getActiveLayer,
  getLayersOrdered,
  getLayerById,
  getLayerIndex,
  getLayerBelow,
  updateLayer,
  updateActiveLayer,
  setActiveLayer,
  addLayer,
  cloneLayer,
  removeLayer,
  reorderLayers,
  isCellFogged,
  fogCell,
  revealCell,
  fogRectangle,
  revealRectangle,
  revealAll,
  toggleFogVisibility,
  setFogVisibility,
  hasFogData,
  getFogState,
} from "../../../src/persistence/layerAccessor";

import type { MapData, MapLayer } from "#types/core/map.types";

// Helper to create a basic layer
function createLayer(
  id: string,
  name: string,
  order: number,
  visible = true
): MapLayer {
  return {
    id,
    name,
    order,
    visible,
    cells: [],
    curves: [],
    edges: [],
    objects: [],
    textLabels: [],
    fogOfWar: null,
  } as MapLayer;
}

// Helper to create basic map data
function createMapData(layers: MapLayer[], activeLayerId: string): MapData {
  return {
    schemaVersion: 2,
    mapType: "grid",
    activeLayerId,
    layerPanelVisible: false,
    layers,
  };
}

describe("layerAccessor", () => {
  // ===========================================================================
  // generateLayerId
  // ===========================================================================

  describe("generateLayerId", () => {
    it("returns string starting with 'layer-'", () => {
      const id = generateLayerId();
      expect(id.startsWith("layer-")).toBe(true);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateLayerId());
      }
      expect(ids.size).toBe(100);
    });
  });

  // ===========================================================================
  // Layer Access Functions
  // ===========================================================================

  describe("getActiveLayer", () => {
    it("returns active layer", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const layer2 = createLayer("layer-2", "Layer 2", 1);
      const mapData = createMapData([layer1, layer2], "layer-2");

      const active = getActiveLayer(mapData);
      expect(active.id).toBe("layer-2");
    });

    it("returns first layer if active not found", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const mapData = createMapData([layer1], "nonexistent");

      const active = getActiveLayer(mapData);
      expect(active.id).toBe("layer-1");
    });

    it("returns legacy fallback for null mapData", () => {
      const active = getActiveLayer(null);
      expect(active.id).toBe("legacy");
      expect(active.name).toBe("1");
    });

    it("returns legacy fallback for undefined mapData", () => {
      const active = getActiveLayer(undefined);
      expect(active.id).toBe("legacy");
    });
  });

  describe("getLayersOrdered", () => {
    it("returns layers sorted by order", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 2);
      const layer2 = createLayer("layer-2", "Layer 2", 0);
      const layer3 = createLayer("layer-3", "Layer 3", 1);
      const mapData = createMapData([layer1, layer2, layer3], "layer-1");

      const ordered = getLayersOrdered(mapData);
      expect(ordered[0].id).toBe("layer-2"); // order 0
      expect(ordered[1].id).toBe("layer-3"); // order 1
      expect(ordered[2].id).toBe("layer-1"); // order 2
    });

    it("returns empty array for null mapData", () => {
      expect(getLayersOrdered(null)).toEqual([]);
    });
  });

  describe("getLayerById", () => {
    it("returns layer when found", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const mapData = createMapData([layer1], "layer-1");

      const found = getLayerById(mapData, "layer-1");
      expect(found?.id).toBe("layer-1");
    });

    it("returns null when not found", () => {
      const mapData = createMapData([], "layer-1");
      expect(getLayerById(mapData, "nonexistent")).toBeNull();
    });
  });

  describe("getLayerIndex", () => {
    it("returns correct index", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const layer2 = createLayer("layer-2", "Layer 2", 1);
      const mapData = createMapData([layer1, layer2], "layer-1");

      expect(getLayerIndex(mapData, "layer-1")).toBe(0);
      expect(getLayerIndex(mapData, "layer-2")).toBe(1);
    });

    it("returns -1 when not found", () => {
      const mapData = createMapData([], "layer-1");
      expect(getLayerIndex(mapData, "nonexistent")).toBe(-1);
    });
  });

  describe("getLayerBelow", () => {
    it("returns layer with next lower order", () => {
      const layer1 = createLayer("layer-1", "Floor 1", 0);
      const layer2 = createLayer("layer-2", "Floor 2", 1);
      const layer3 = createLayer("layer-3", "Floor 3", 2);
      const mapData = createMapData([layer1, layer2, layer3], "layer-3");

      const below = getLayerBelow(mapData, "layer-3");
      expect(below?.id).toBe("layer-2");
    });

    it("returns closest layer below even with gaps in order", () => {
      const layer1 = createLayer("layer-1", "Floor 1", 0);
      const layer2 = createLayer("layer-2", "Floor 2", 5);
      const layer3 = createLayer("layer-3", "Floor 3", 10);
      const mapData = createMapData([layer1, layer2, layer3], "layer-3");

      const below = getLayerBelow(mapData, "layer-3");
      expect(below?.id).toBe("layer-2");
    });

    it("returns null for bottom layer", () => {
      const layer1 = createLayer("layer-1", "Floor 1", 0);
      const layer2 = createLayer("layer-2", "Floor 2", 1);
      const mapData = createMapData([layer1, layer2], "layer-1");

      const below = getLayerBelow(mapData, "layer-1");
      expect(below).toBeNull();
    });

    it("returns null when layer not found", () => {
      const layer1 = createLayer("layer-1", "Floor 1", 0);
      const mapData = createMapData([layer1], "layer-1");

      const below = getLayerBelow(mapData, "nonexistent");
      expect(below).toBeNull();
    });

    it("returns null for null mapData", () => {
      expect(getLayerBelow(null, "layer-1")).toBeNull();
    });

    it("returns null for undefined mapData", () => {
      expect(getLayerBelow(undefined, "layer-1")).toBeNull();
    });

    it("returns null when no layers array", () => {
      const mapData = { schemaVersion: 2 } as MapData;
      expect(getLayerBelow(mapData, "layer-1")).toBeNull();
    });

    it("handles single layer correctly", () => {
      const layer1 = createLayer("layer-1", "Only Layer", 0);
      const mapData = createMapData([layer1], "layer-1");

      expect(getLayerBelow(mapData, "layer-1")).toBeNull();
    });

    it("works correctly with layers stored in different order than order property", () => {
      // Layers stored in array in different order than their order property
      const layer3 = createLayer("layer-3", "Floor 3", 2);
      const layer1 = createLayer("layer-1", "Floor 1", 0);
      const layer2 = createLayer("layer-2", "Floor 2", 1);
      const mapData = createMapData([layer3, layer1, layer2], "layer-2");

      const below = getLayerBelow(mapData, "layer-2");
      expect(below?.id).toBe("layer-1");
    });
  });

  // ===========================================================================
  // Layer Modification Functions
  // ===========================================================================

  describe("updateLayer", () => {
    it("updates layer properties immutably", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const mapData = createMapData([layer1], "layer-1");

      const updated = updateLayer(mapData, "layer-1", { name: "New Name" });

      expect(updated.layers[0].name).toBe("New Name");
      expect(mapData.layers[0].name).toBe("Layer 1"); // Original unchanged
    });

    it("only updates matching layer", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const layer2 = createLayer("layer-2", "Layer 2", 1);
      const mapData = createMapData([layer1, layer2], "layer-1");

      const updated = updateLayer(mapData, "layer-1", { visible: false });

      expect(updated.layers[0].visible).toBe(false);
      expect(updated.layers[1].visible).toBe(true); // Unchanged
    });
  });

  describe("updateActiveLayer", () => {
    it("updates the active layer", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const mapData = createMapData([layer1], "layer-1");

      const updated = updateActiveLayer(mapData, { name: "Updated" });
      expect(updated.layers[0].name).toBe("Updated");
    });
  });

  describe("setActiveLayer", () => {
    it("changes active layer", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const layer2 = createLayer("layer-2", "Layer 2", 1);
      const mapData = createMapData([layer1, layer2], "layer-1");

      const updated = setActiveLayer(mapData, "layer-2");
      expect(updated.activeLayerId).toBe("layer-2");
    });

    it("returns unchanged if layer not found", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const mapData = createMapData([layer1], "layer-1");

      const updated = setActiveLayer(mapData, "nonexistent");
      expect(updated.activeLayerId).toBe("layer-1");
    });
  });

  describe("addLayer", () => {
    it("adds new layer with incremented order", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const mapData = createMapData([layer1], "layer-1");

      const updated = addLayer(mapData);

      expect(updated.layers).toHaveLength(2);
      expect(updated.layers[1].order).toBe(1);
      expect(updated.layers[1].name).toBe("2");
    });

    it("auto-switches to new layer", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const mapData = createMapData([layer1], "layer-1");

      const updated = addLayer(mapData);
      expect(updated.activeLayerId).toBe(updated.layers[1].id);
    });

    it("accepts custom name", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const mapData = createMapData([layer1], "layer-1");

      const updated = addLayer(mapData, "Custom Name");
      expect(updated.layers[1].name).toBe("Custom Name");
    });
  });

  // ===========================================================================
  // cloneLayer
  // ===========================================================================

  describe("cloneLayer", () => {
    it("creates a clone with new id and 'Copy of' name", () => {
      const layer1 = createLayer("layer-1", "Base", 0);
      layer1.cells = [{ x: 0, y: 0, color: "#ff0000" }] as any;
      const mapData = createMapData([layer1], "layer-1");

      const updated = cloneLayer(mapData, "layer-1", "all");

      expect(updated.layers).toHaveLength(2);
      const clone = updated.layers.find((l) => l.id !== "layer-1")!;
      expect(clone.name).toBe("Copy of Base");
      expect(clone.id).not.toBe("layer-1");
      expect(clone.id.startsWith("layer-")).toBe(true);
    });

    it("sets cloned layer as active", () => {
      const layer1 = createLayer("layer-1", "Base", 0);
      const mapData = createMapData([layer1], "layer-1");

      const updated = cloneLayer(mapData, "layer-1", "all");

      expect(updated.activeLayerId).not.toBe("layer-1");
      const clone = updated.layers.find((l) => l.id !== "layer-1")!;
      expect(updated.activeLayerId).toBe(clone.id);
    });

    it("inserts clone directly above source layer (order + 1)", () => {
      const layer1 = createLayer("layer-1", "Bottom", 0);
      const layer2 = createLayer("layer-2", "Top", 1);
      const mapData = createMapData([layer1, layer2], "layer-1");

      const updated = cloneLayer(mapData, "layer-1", "all");

      const clone = updated.layers.find(
        (l) => l.id !== "layer-1" && l.id !== "layer-2"
      )!;
      expect(clone.order).toBe(1);
      // Top layer should have been shifted up
      const shiftedTop = updated.layers.find((l) => l.id === "layer-2")!;
      expect(shiftedTop.order).toBe(2);
    });

    it("mode 'all' copies cells, curves, edges, objects, textLabels, fogOfWar, tiles", () => {
      const layer1 = createLayer("layer-1", "Full", 0);
      layer1.cells = [{ x: 1, y: 2, color: "#aaa" }] as any;
      layer1.curves = [{ id: "c1", start: { x: 0, y: 0 }, segments: [] }] as any;
      layer1.edges = [{ x: 0, y: 0, side: "right", color: "#000" }];
      layer1.objects = [{ id: "obj1", type: "sword", position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }] as any;
      layer1.textLabels = [
        { id: "tl1", content: "hello", position: { x: 0, y: 0 }, fontSize: 12, fontFace: "sans", color: "#000" },
      ];
      layer1.fogOfWar = { enabled: true, foggedCells: [{ col: 0, row: 0 }], texture: null };
      layer1.tiles = [{ col: 0, row: 0, tilesetId: "ts1", tileIndex: 0 }] as any;
      const mapData = createMapData([layer1], "layer-1");

      const updated = cloneLayer(mapData, "layer-1", "all");

      const clone = updated.layers.find((l) => l.id !== "layer-1")!;
      expect(clone.cells).toEqual(layer1.cells);
      expect(clone.curves).toEqual(layer1.curves);
      expect(clone.edges).toEqual(layer1.edges);
      expect(clone.objects).toEqual(layer1.objects);
      expect(clone.textLabels).toEqual(layer1.textLabels);
      expect(clone.fogOfWar).toEqual(layer1.fogOfWar);
      expect(clone.tiles).toEqual(layer1.tiles);
    });

    it("mode 'mapOnly' copies cells, curves, edges, tiles but not objects, textLabels, fogOfWar", () => {
      const layer1 = createLayer("layer-1", "Full", 0);
      layer1.cells = [{ x: 1, y: 2, color: "#aaa" }] as any;
      layer1.curves = [{ id: "c1", start: { x: 0, y: 0 }, segments: [] }] as any;
      layer1.edges = [{ x: 0, y: 0, side: "right", color: "#000" }];
      layer1.objects = [{ id: "obj1", type: "sword", position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }] as any;
      layer1.textLabels = [
        { id: "tl1", content: "hello", position: { x: 0, y: 0 }, fontSize: 12, fontFace: "sans", color: "#000" },
      ];
      layer1.fogOfWar = { enabled: true, foggedCells: [{ col: 0, row: 0 }], texture: null };
      layer1.tiles = [{ col: 0, row: 0, tilesetId: "ts1", tileIndex: 0 }] as any;
      const mapData = createMapData([layer1], "layer-1");

      const updated = cloneLayer(mapData, "layer-1", "mapOnly");

      const clone = updated.layers.find((l) => l.id !== "layer-1")!;
      expect(clone.cells).toEqual(layer1.cells);
      expect(clone.curves).toEqual(layer1.curves);
      expect(clone.edges).toEqual(layer1.edges);
      expect(clone.tiles).toEqual(layer1.tiles);
      expect(clone.objects).toEqual([]);
      expect(clone.textLabels).toEqual([]);
      expect(clone.fogOfWar).toBeNull();
    });

    it("deep copies data (mutations don't affect source)", () => {
      const layer1 = createLayer("layer-1", "Base", 0);
      layer1.cells = [{ x: 0, y: 0, color: "#ff0000" }] as any;
      const mapData = createMapData([layer1], "layer-1");

      const updated = cloneLayer(mapData, "layer-1", "all");
      const clone = updated.layers.find((l) => l.id !== "layer-1")!;

      // Mutate clone data
      (clone.cells[0] as any).color = "#00ff00";
      // Source should be unchanged
      expect((layer1.cells[0] as any).color).toBe("#ff0000");
    });

    it("returns unchanged mapData when layer not found", () => {
      const layer1 = createLayer("layer-1", "Base", 0);
      const mapData = createMapData([layer1], "layer-1");

      const updated = cloneLayer(mapData, "nonexistent", "all");
      expect(updated).toBe(mapData);
    });

    it("mode 'all' copies icon, showLayerBelow, layerBelowOpacity", () => {
      const layer1 = createLayer("layer-1", "Styled", 0);
      layer1.icon = "ra-sword";
      layer1.showLayerBelow = true;
      layer1.layerBelowOpacity = 0.3;
      const mapData = createMapData([layer1], "layer-1");

      const updated = cloneLayer(mapData, "layer-1", "all");
      const clone = updated.layers.find((l) => l.id !== "layer-1")!;

      expect(clone.icon).toBe("ra-sword");
      expect(clone.showLayerBelow).toBe(true);
      expect(clone.layerBelowOpacity).toBe(0.3);
    });

    it("mode 'mapOnly' does not copy icon, showLayerBelow, layerBelowOpacity", () => {
      const layer1 = createLayer("layer-1", "Styled", 0);
      layer1.icon = "ra-sword";
      layer1.showLayerBelow = true;
      layer1.layerBelowOpacity = 0.3;
      const mapData = createMapData([layer1], "layer-1");

      const updated = cloneLayer(mapData, "layer-1", "mapOnly");
      const clone = updated.layers.find((l) => l.id !== "layer-1")!;

      expect(clone.icon).toBeUndefined();
      expect(clone.showLayerBelow).toBeUndefined();
      expect(clone.layerBelowOpacity).toBeUndefined();
    });

    it("uses layer number as fallback name when layer has no name", () => {
      const layer1: MapLayer = {
        id: "layer-1",
        name: "",
        order: 2,
        visible: true,
        cells: [],
        curves: [] as any,
        edges: [],
        objects: [],
        textLabels: [],
        fogOfWar: null,
      };
      const mapData = createMapData([layer1], "layer-1");

      const updated = cloneLayer(mapData, "layer-1", "all");
      const clone = updated.layers.find((l) => l.id !== "layer-1")!;
      expect(clone.name).toBe("Copy of 3");
    });
  });

  describe("removeLayer", () => {
    it("removes specified layer", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const layer2 = createLayer("layer-2", "Layer 2", 1);
      const mapData = createMapData([layer1, layer2], "layer-1");

      const updated = removeLayer(mapData, "layer-2");
      expect(updated.layers).toHaveLength(1);
      expect(updated.layers[0].id).toBe("layer-1");
    });

    it("prevents removing last layer", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const mapData = createMapData([layer1], "layer-1");

      const updated = removeLayer(mapData, "layer-1");
      expect(updated.layers).toHaveLength(1); // Still has one layer
    });

    it("switches active layer if removed", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const layer2 = createLayer("layer-2", "Layer 2", 1);
      const mapData = createMapData([layer1, layer2], "layer-1");

      const updated = removeLayer(mapData, "layer-1");
      expect(updated.activeLayerId).toBe("layer-2");
    });
  });

  describe("reorderLayers", () => {
    it("moves layer to new position", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const layer2 = createLayer("layer-2", "Layer 2", 1);
      const layer3 = createLayer("layer-3", "Layer 3", 2);
      const mapData = createMapData([layer1, layer2, layer3], "layer-1");

      // Move layer-1 (index 0) to index 2
      const updated = reorderLayers(mapData, "layer-1", 2);
      const ordered = getLayersOrdered(updated);

      expect(ordered[0].id).toBe("layer-2");
      expect(ordered[1].id).toBe("layer-3");
      expect(ordered[2].id).toBe("layer-1");
    });

    it("clamps index to valid range", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const layer2 = createLayer("layer-2", "Layer 2", 1);
      const mapData = createMapData([layer1, layer2], "layer-1");

      const updated = reorderLayers(mapData, "layer-1", 999);
      const ordered = getLayersOrdered(updated);

      expect(ordered[1].id).toBe("layer-1"); // Moved to end
    });

    it("returns unchanged if same position", () => {
      const layer1 = createLayer("layer-1", "Layer 1", 0);
      const mapData = createMapData([layer1], "layer-1");

      const updated = reorderLayers(mapData, "layer-1", 0);
      expect(updated).toBe(mapData);
    });
  });

  // ===========================================================================
  // Utility Functions
  // ===========================================================================

  // ===========================================================================
  // Fog of War Functions
  // ===========================================================================

  describe("isCellFogged", () => {
    it("returns true for fogged cell", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [{ col: 5, row: 3 }],
          texture: null,
        },
      };

      expect(isCellFogged(layer, 5, 3)).toBe(true);
    });

    it("returns false for non-fogged cell", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [{ col: 5, row: 3 }],
          texture: null,
        },
      };

      expect(isCellFogged(layer, 0, 0)).toBe(false);
    });

    it("returns false when fog disabled", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: false,
          foggedCells: [{ col: 5, row: 3 }],
          texture: null,
        },
      };

      expect(isCellFogged(layer, 5, 3)).toBe(false);
    });

    it("returns false when no fogOfWar", () => {
      const layer = createLayer("layer-1", "Layer 1", 0);
      expect(isCellFogged(layer, 5, 3)).toBe(false);
    });
  });

  describe("fogCell", () => {
    it("adds cell to foggedCells", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [],
          texture: null,
        },
      };

      const updated = fogCell(layer, 5, 3);
      expect(updated.fogOfWar!.foggedCells).toContainEqual({ col: 5, row: 3 });
    });

    it("does not duplicate existing fogged cell", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [{ col: 5, row: 3 }],
          texture: null,
        },
      };

      const updated = fogCell(layer, 5, 3);
      expect(updated.fogOfWar!.foggedCells).toHaveLength(1);
    });

    it("returns unchanged if no fogOfWar", () => {
      const layer = createLayer("layer-1", "Layer 1", 0);
      const updated = fogCell(layer, 5, 3);
      expect(updated).toBe(layer);
    });
  });

  describe("revealCell", () => {
    it("removes cell from foggedCells", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [
            { col: 5, row: 3 },
            { col: 6, row: 4 },
          ],
          texture: null,
        },
      };

      const updated = revealCell(layer, 5, 3);
      expect(updated.fogOfWar!.foggedCells).toHaveLength(1);
      expect(updated.fogOfWar!.foggedCells).not.toContainEqual({
        col: 5,
        row: 3,
      });
    });
  });

  describe("fogRectangle", () => {
    it("fogs rectangular area", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [],
          texture: null,
        },
      };

      const updated = fogRectangle(layer, 0, 0, 2, 2);
      expect(updated.fogOfWar!.foggedCells).toHaveLength(9); // 3x3
    });

    it("handles reversed coordinates", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [],
          texture: null,
        },
      };

      const updated = fogRectangle(layer, 2, 2, 0, 0);
      expect(updated.fogOfWar!.foggedCells).toHaveLength(9);
    });

    it("does not duplicate existing cells", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [{ col: 1, row: 1 }],
          texture: null,
        },
      };

      const updated = fogRectangle(layer, 0, 0, 2, 2);
      expect(updated.fogOfWar!.foggedCells).toHaveLength(9);
    });
  });

  describe("revealRectangle", () => {
    it("reveals rectangular area", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [
            { col: 0, row: 0 },
            { col: 1, row: 0 },
            { col: 0, row: 1 },
            { col: 1, row: 1 },
            { col: 5, row: 5 }, // Outside rectangle
          ],
          texture: null,
        },
      };

      const updated = revealRectangle(layer, 0, 0, 1, 1);
      expect(updated.fogOfWar!.foggedCells).toHaveLength(1);
      expect(updated.fogOfWar!.foggedCells[0]).toEqual({ col: 5, row: 5 });
    });
  });

  describe("revealAll", () => {
    it("clears all fogged cells", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [
            { col: 0, row: 0 },
            { col: 1, row: 1 },
          ],
          texture: null,
        },
      };

      const updated = revealAll(layer);
      expect(updated.fogOfWar!.foggedCells).toHaveLength(0);
    });
  });

  describe("toggleFogVisibility", () => {
    it("toggles enabled state", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [],
          texture: null,
        },
      };

      const toggled = toggleFogVisibility(layer);
      expect(toggled.fogOfWar!.enabled).toBe(false);

      const toggledAgain = toggleFogVisibility(toggled);
      expect(toggledAgain.fogOfWar!.enabled).toBe(true);
    });
  });

  describe("setFogVisibility", () => {
    it("sets enabled state explicitly", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [],
          texture: null,
        },
      };

      expect(setFogVisibility(layer, false).fogOfWar!.enabled).toBe(false);
      expect(setFogVisibility(layer, true).fogOfWar!.enabled).toBe(true);
    });
  });

  describe("hasFogData", () => {
    it("returns true when fogged cells exist", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [{ col: 0, row: 0 }],
          texture: null,
        },
      };

      expect(hasFogData(layer)).toBe(true);
    });

    it("returns false when no fogged cells", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [],
          texture: null,
        },
      };

      expect(hasFogData(layer)).toBe(false);
    });

    it("returns false when no fogOfWar", () => {
      const layer = createLayer("layer-1", "Layer 1", 0);
      expect(hasFogData(layer)).toBe(false);
    });
  });

  describe("getFogState", () => {
    it("returns initialized state with fog data", () => {
      const layer: MapLayer = {
        ...createLayer("layer-1", "Layer 1", 0),
        fogOfWar: {
          enabled: true,
          foggedCells: [{ col: 0, row: 0 }, { col: 1, row: 1 }],
          texture: null,
        },
      };

      const state = getFogState(layer);
      expect(state).toEqual({
        initialized: true,
        enabled: true,
        cellCount: 2,
      });
    });

    it("returns uninitialized state when no fog", () => {
      const layer = createLayer("layer-1", "Layer 1", 0);

      const state = getFogState(layer);
      expect(state).toEqual({
        initialized: false,
        enabled: false,
        cellCount: 0,
      });
    });
  });
});
