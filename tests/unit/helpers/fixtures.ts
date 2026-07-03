/**
 * Shared typed test fixtures for MapLayer / MapData shapes.
 */

import type { MapData, MapLayer } from "#types/core/map.types";

function makeLayer(overrides: Partial<MapLayer> = {}): MapLayer {
  return {
    id: "layer-1",
    name: "Layer 1",
    order: 0,
    visible: true,
    cells: [],
    curves: [],
    edges: [],
    objects: [],
    textLabels: [],
    fogOfWar: null,
    ...overrides,
  };
}

function makeMapData(overrides: Partial<MapData> = {}): MapData {
  return {
    schemaVersion: 2,
    mapType: "grid",
    activeLayerId: "layer-1",
    layerPanelVisible: false,
    layers: [],
    ...overrides,
  };
}

export { makeLayer, makeMapData };
